"""
CampusNet Analyzer - Simplified TCP-like Protocol Agent
Implements Pedagogical Sliding Window Flow Control and AIMD Congestion Control.

Educational Model Assumptions & Deliberate Simplifications:
- cwnd is measured in whole packets (segments) rather than raw byte counts.
- Additive Increase: cwnd increases by 1.0 packet per RTT in congestion avoidance
  (approximated by +1/cwnd per in-order ACK).
- Multiplicative Decrease: Upon detected loss, ssthresh is set to max(2, cwnd / 2)
  and cwnd drops to 1 packet (Slow Start Restart).
- Bounded Window: cwnd is strictly clamped to max_window to emulate receiver advertised window (rwnd).
- Retransmissions preserve the original unique key (src_node, seq_num) with is_retransmit=True.
- Simplification Note: This model is designed for educational discrete-event demonstration of
  AIMD principles. It does not implement full RFC 793/5681 complexities (such as Karn-Partridge
  RTT filtering, Jacobson-Karels dynamic RTO variance, Selective ACK (SACK), or ECN marking).
"""
import random
import simpy
from typing import Optional, Dict, Set, TYPE_CHECKING
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
        # Guard set against duplicate concurrent retransmissions
        self.retransmitting: Set[int] = set()
        # Cumulative ACK tracker to ignore duplicate/stale ACKs for cwnd growth
        self.last_ack: int = 0

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
            # Destination LMS server accepts packet at application layer
            if self.recorder:
                self.recorder.record_receive(p, env.now, len(self.forward_link.tx_resource.queue))
            # Destination LMS server emits an ACK back to sender
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
        self.retransmitting.discard(ack_seq)

        self.recorder.record_ack(ack_seq, self.dst_node, self.src_node, self.env.now)

        # Only update cwnd on NEW cumulative/in-order ACKs (prevent duplicate ACK window inflation)
        if ack_seq > self.last_ack:
            self.last_ack = ack_seq
            # AIMD Congestion Control Update
            if self.cwnd < self.ssthresh:
                # Slow Start: Exponential growth (+1 per ACK)
                self.cwnd += 1.0
            else:
                # Congestion Avoidance: Linear growth (+1 / cwnd per ACK)
                self.cwnd += (1.0 / max(1.0, self.cwnd))

            # Strictly clamp cwnd to maximum configured window size
            self.cwnd = min(self.cwnd, float(self.max_window))

        # Notify waiting sender process that window opened
        if not self.window_opened.triggered:
            self.window_opened.succeed()

    def _handle_loss(self, dropped_seq: int):
        """Multiplicative decrease upon drop notification or timeout."""
        # Halve ssthresh (multiplicative decrease)
        self.ssthresh = max(2.0, self.cwnd / 2.0)
        # Drop cwnd to 1 (Slow Start Restart)
        self.cwnd = 1.0

        if dropped_seq in self.in_flight and dropped_seq not in self.retransmitting:
            self.retransmitting.add(dropped_seq)
            orig_pkt = self.in_flight[dropped_seq]
            # Schedule retransmission
            self.env.process(self._retransmit_packet(orig_pkt))

    def _retransmit_packet(self, orig_pkt: Packet):
        """Retransmits an unacknowledged packet with is_retransmit=True."""
        yield self.env.timeout(0.010) # Short backoff before retransmit

        seq = orig_pkt.seq_num
        # If packet was acknowledged during backoff, abort retransmission
        if seq not in self.in_flight:
            self.retransmitting.discard(seq)
            return

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
        self.retransmitting.discard(seq)
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
                if (now - send_t) > self.rto_timeout and seq not in self.retransmitting
            ]
            for seq in timed_out:
                self._handle_loss(seq)
