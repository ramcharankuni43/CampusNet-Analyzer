"""
CampusNet Analyzer - Simplified TCP-like Protocol Agent
Implements Sliding Window Flow Control and AIMD Congestion Control.

Educational Model Assumptions & Design:
- Maintains a Congestion Window (cwnd) measured in whole packets.
- Slow Start: cwnd increases by 1 for every ACK received while cwnd < ssthresh.
- Congestion Avoidance (Additive Increase): cwnd increases by (1 / cwnd) per ACK.
- Multiplicative Decrease: Upon packet loss / drop, ssthresh is set to max(2, cwnd // 2),
  and cwnd is reduced to 1 packet (or ssthresh in fast recovery).
- Transmission limit: Number of unacknowledged in-flight packets cannot exceed min(cwnd, max_window).
- Retransmissions are flagged with is_retransmit=True and share the original (src_node, seq_num)
  unique key so they are not double-counted as newly generated data.
"""
import random
import simpy
from typing import Optional, Dict, TYPE_CHECKING
from .base import Packet
from ..topology import NetworkLink
from ..traffic import TrafficScenarioConfig

if TYPE_CHECKING:
    from ..event_recorder import EventRecorder


class TcpLikeAgent:
    """Sliding Window + AIMD Congestion Control Sender Agent."""

    def __init__(
        self,
        env: simpy.Environment,
        src_node: int,
        dst_node: int,
        forward_link: NetworkLink,
        return_link: NetworkLink,
        recorder: EventRecorder,
        traffic_config: TrafficScenarioConfig,
        packet_id_counter: list,
        simulation_duration: float = 10.0,
        max_window: int = 32,
        initial_cwnd: float = 1.0,
        initial_ssthresh: float = 16.0,
        rto_timeout: float = 0.200, # Retransmission timeout (200ms)
        rng: Optional[random.Random] = None
    ):
        self.env = env
        self.src_node = src_node
        self.dst_node = dst_node
        self.forward_link = forward_link
        self.return_link = return_link
        self.recorder = recorder
        self.config = traffic_config
        self.packet_id_counter = packet_id_counter
        self.simulation_duration = max(0.1, float(simulation_duration))
        self.max_window = max(1, int(max_window))
        self.rto_timeout = max(0.010, float(rto_timeout))
        self.rng = rng or random.Random(src_node * 200 + 13)

        # Congestion control state
        self.cwnd: float = float(initial_cwnd)
        self.ssthresh: float = float(initial_ssthresh)
        self.seq_num: int = 0
        self.flow_id: str = f"tcp_flow_{src_node}"

        # In-flight packets awaiting acknowledgement: seq_num -> Packet
        self.in_flight: Dict[int, Packet] = {}
        # Send times for RTO tracking
        self.send_times: Dict[int, float] = {}

        # SimPy notification event when ACKs arrive or window opens
        self.window_opened = env.event()

    def run(self):
        """Main sender loop sending packets within congestion window limits."""
        env = self.env
        cfg = self.config

        # Start background timer process checking for RTO timeouts
        env.process(self._rto_monitor())

        while env.now < self.simulation_duration:
            # 1. Wait until window allows new packet transmission
            while len(self.in_flight) >= int(min(self.cwnd, self.max_window)):
                self.window_opened = env.event()
                yield self.window_opened

            # 2. Prepare new packet
            self.seq_num += 1
            self.packet_id_counter[0] += 1
            pkt_id = self.packet_id_counter[0]

            pkt = Packet(
                packet_id=pkt_id,
                seq_num=self.seq_num,
                src_node=self.src_node,
                dst_node=self.dst_node,
                size_bytes=cfg.avg_packet_size,
                gen_time=env.now,
                flow_id=self.flow_id,
                protocol="TCP",
                is_retransmit=False
            )

            self.in_flight[self.seq_num] = pkt
            self.send_times[self.seq_num] = env.now
            self.recorder.record_generate(pkt, env.now, len(self.forward_link.tx_resource.queue))

            # Dispatch forward transmission process
            env.process(self._transmit_and_handle_feedback(pkt))

            # Pacing inter-arrival
            pacing_delay = max(0.0005, cfg.base_arrival_interval / max(1.0, self.cwnd))
            yield env.timeout(pacing_delay)

    def _transmit_and_handle_feedback(self, pkt: Packet):
        """Transmits packet and coordinates destination receiver feedback."""
        env = self.env

        def on_delivered(p: Packet):
            # Destination LMS server receives packet and emits an ACK
            env.process(self._send_ack(p.seq_num))

        def on_dropped(p: Packet, reason: str):
            # Packet dropped at bottleneck link
            self._handle_loss(p.seq_num)

        yield from self.forward_link.transmit(
            pkt,
            on_delivered=on_delivered,
            on_dropped=on_dropped
        )

    def _send_ack(self, ack_seq: int):
        """Simulates return path traversal of receiver acknowledgement."""
        env = self.env
        ack_pkt = Packet(
            packet_id=-1,
            seq_num=ack_seq,
            src_node=self.dst_node,
            dst_node=self.src_node,
            size_bytes=40,
            gen_time=env.now,
            protocol="ACK"
        )

        def on_ack_received(p: Packet):
            self._process_ack(ack_seq)

        yield from self.return_link.transmit(
            ack_pkt,
            on_delivered=on_ack_received
        )

    def _process_ack(self, ack_seq: int):
        """Updates cwnd according to Slow Start or Congestion Avoidance."""
        if ack_seq in self.in_flight:
            del self.in_flight[ack_seq]
        if ack_seq in self.send_times:
            del self.send_times[ack_seq]

        self.recorder.record_ack(ack_seq, self.dst_node, self.src_node, self.env.now)

        # AIMD Congestion Control Update
        if self.cwnd < self.ssthresh:
            # Slow Start: Exponential growth (+1 per ACK)
            self.cwnd += 1.0
        else:
            # Congestion Avoidance: Linear growth (+1 / cwnd per ACK)
            self.cwnd += (1.0 / max(1.0, self.cwnd))

        # Notify waiting sender process that window opened
        if not self.window_opened.triggered:
            self.window_opened.succeed()

    def _handle_loss(self, dropped_seq: int):
        """Multiplicative decrease upon drop notification or timeout."""
        # Halve ssthresh (multiplicative decrease)
        self.ssthresh = max(2.0, self.cwnd / 2.0)
        # Drop cwnd to 1 (Slow Start Restart)
        self.cwnd = 1.0

        if dropped_seq in self.in_flight:
            orig_pkt = self.in_flight[dropped_seq]
            # Schedule retransmission
            self.env.process(self._retransmit_packet(orig_pkt))

    def _retransmit_packet(self, orig_pkt: Packet):
        """Retransmits an unacknowledged packet with is_retransmit=True."""
        yield self.env.timeout(0.010) # Short backoff before retransmit

        self.packet_id_counter[0] += 1
        retx_pkt = Packet(
            packet_id=self.packet_id_counter[0],
            seq_num=orig_pkt.seq_num,
            src_node=orig_pkt.src_node,
            dst_node=orig_pkt.dst_node,
            size_bytes=orig_pkt.size_bytes,
            gen_time=orig_pkt.gen_time,
            flow_id=orig_pkt.flow_id,
            protocol="TCP",
            is_retransmit=True
        )

        self.send_times[orig_pkt.seq_num] = self.env.now
        self.recorder.record_generate(retx_pkt, self.env.now, len(self.forward_link.tx_resource.queue))
        yield from self._transmit_and_handle_feedback(retx_pkt)

    def _rto_monitor(self):
        """Background process checking for unacknowledged packets exceeding RTO."""
        env = self.env
        while True:
            yield env.timeout(self.rto_timeout / 2.0)
            now = env.now
            timed_out = [
                seq for seq, send_t in self.send_times.items()
                if (now - send_t) > self.rto_timeout
            ]
            for seq in timed_out:
                self._handle_loss(seq)
