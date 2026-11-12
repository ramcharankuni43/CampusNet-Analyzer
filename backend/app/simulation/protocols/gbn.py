"""
CampusNet Analyzer - Go-Back-N (GBN) ARQ Protocol Agent
Implements textbook Go-Back-N Sliding Window ARQ.

Textbook GBN Specifications:
- Sender Window: Fixed size N (e.g., 4 or 8 packets).
- Cumulative Acknowledgements: Receiver acknowledges the highest in-order sequence number received.
- Discard Out-of-Order: Receiver drops out-of-order packets and re-ACKs the last in-order packet.
- Retransmission on Timeout: If the timer for the oldest unacknowledged packet (base) expires,
  the sender "Goes Back N" and retransmits all packets from base to nextseqnum - 1.
- Retransmissions are flagged with is_retransmit=True and share the original packet unique key.
"""
import random
import simpy
from typing import Optional, Dict, TYPE_CHECKING
from .base import Packet
from ..topology import NetworkLink

if TYPE_CHECKING:
    from ..event_recorder import EventRecorder


class GoBackNAgent:
    """Textbook Go-Back-N ARQ Sender & Receiver State Machine."""

    def __init__(
        self,
        env: simpy.Environment,
        src_node: int,
        dst_node: int,
        forward_link: NetworkLink,
        return_link: NetworkLink,
        recorder: EventRecorder,
        packet_id_counter: list,
        simulation_duration: float = 10.0,
        window_size: int = 4,
        timeout_duration: float = 0.150, # 150ms timeout
        packet_size: int = 1024,
        total_packets_to_send: int = 100,
        rng: Optional[random.Random] = None
    ):
        self.env = env
        self.src_node = src_node
        self.dst_node = dst_node
        self.forward_link = forward_link
        self.return_link = return_link
        self.recorder = recorder
        self.packet_id_counter = packet_id_counter
        self.simulation_duration = max(0.1, float(simulation_duration))
        self.window_size = max(1, int(window_size))
        self.timeout_duration = max(0.010, float(timeout_duration))
        self.packet_size = max(64, int(packet_size))
        self.total_packets_to_send = max(1, int(total_packets_to_send))
        self.rng = rng or random.Random(src_node * 300 + 42)

        # GBN Sender State
        self.base: int = 1
        self.nextseqnum: int = 1
        # Buffer of created packets: seq_num -> Packet
        self.packet_buffer: Dict[int, Packet] = {}
        self.timer_process: Optional[simpy.Process] = None
        self.timer_start_time: float = 0.0

        # GBN Receiver State
        self.expectedseqnum: int = 1

        # Signaling events
        self.window_available = env.event()
        self.finished = env.event()

    def run(self):
        """GBN Sender Process."""
        env = self.env

        while (env.now < self.simulation_duration) and (self.base <= self.total_packets_to_send):
            # Check if window is full: [base, base + N - 1]
            while (self.nextseqnum < self.base + self.window_size) and (self.nextseqnum <= self.total_packets_to_send):
                self._send_next_packet(self.nextseqnum)
                if self.base == self.nextseqnum:
                    self._start_timer()
                self.nextseqnum += 1

            # Wait for ACK or Timeout
            self.window_available = env.event()
            yield self.window_available

        if not self.finished.triggered:
            self.finished.succeed()

    def _send_next_packet(self, seq_num: int):
        """Creates and transmits a new packet within the GBN window."""
        self.packet_id_counter[0] += 1
        pkt = Packet(
            packet_id=self.packet_id_counter[0],
            seq_num=seq_num,
            src_node=self.src_node,
            dst_node=self.dst_node,
            size_bytes=self.packet_size,
            gen_time=self.env.now,
            flow_id=f"gbn_flow_{self.src_node}",
            protocol="GBN",
            is_retransmit=False
        )
        self.packet_buffer[seq_num] = pkt
        self.recorder.record_generate(pkt, self.env.now, len(self.forward_link.tx_resource.queue))

        # Transmit packet to receiver
        self.env.process(self._forward_packet_process(pkt))

    def _forward_packet_process(self, pkt: Packet):
        """Handles forward link traversal and receiver acceptance logic."""
        env = self.env

        def on_delivered(p: Packet):
            # Receiver side: check if this is the expected in-order packet
            if p.seq_num == self.expectedseqnum:
                # In-order packet accepted
                self.expectedseqnum += 1
                # Send cumulative ACK for (expectedseqnum - 1)
                env.process(self._send_cumulative_ack(self.expectedseqnum - 1))
            else:
                # Out-of-order packet: Discard and re-ACK the last contiguous in-order packet
                if self.recorder:
                    self.recorder.record_drop(p, "gbn_out_of_order", env.now, len(self.forward_link.tx_resource.queue))
                # Re-send ACK for last acknowledged packet
                env.process(self._send_cumulative_ack(self.expectedseqnum - 1))

        def on_dropped(p: Packet, reason: str):
            # Dropped at bottleneck link (queue overflow or channel error)
            pass # GBN handles loss via timeout

        yield from self.forward_link.transmit(
            pkt,
            on_delivered=on_delivered,
            on_dropped=on_dropped
        )

    def _send_cumulative_ack(self, ack_seq: int):
        """Receiver transmits cumulative ACK to sender."""
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
            self._handle_cumulative_ack(ack_seq)

        yield from self.return_link.transmit(
            ack_pkt,
            on_delivered=on_ack_received
        )

    def _handle_cumulative_ack(self, ack_seq: int):
        """Sender processes cumulative ACK."""
        if ack_seq >= self.base:
            # Advance window base
            self.base = ack_seq + 1
            self.recorder.record_ack(ack_seq, self.dst_node, self.src_node, self.env.now)

            if self.base == self.nextseqnum:
                # No outstanding packets in flight: stop timer
                self._stop_timer()
            else:
                # Outstanding packets remain: restart timer for new base
                self._start_timer()

            # Signal window availability
            if not self.window_available.triggered:
                self.window_available.succeed()

    def _start_timer(self):
        """Starts or restarts the GBN retransmission timer."""
        self._stop_timer()
        self.timer_start_time = self.env.now
        self.timer_process = self.env.process(self._timer_countdown())

    def _stop_timer(self):
        """Stops the GBN retransmission timer if running in an external process."""
        if (
            self.timer_process
            and self.timer_process.is_alive
            and self.timer_process is not self.env.active_process
        ):
            self.timer_process.interrupt()
        self.timer_process = None

    def _timer_countdown(self):
        """Timer countdown process triggering GBN timeout upon expiration."""
        try:
            yield self.env.timeout(self.timeout_duration)
            # Timeout expired naturally; clear handle so _start_timer won't interrupt
            self.timer_process = None
            self._handle_timeout()
        except simpy.Interrupt:
            # Timer was stopped or restarted from outside
            pass

    def _handle_timeout(self):
        """GBN Timeout Handler: Retransmits all packets from base to nextseqnum - 1."""
        self._start_timer()

        # Retransmit all unacknowledged packets
        for seq in range(self.base, self.nextseqnum):
            if seq in self.packet_buffer:
                orig_pkt = self.packet_buffer[seq]
                self.packet_id_counter[0] += 1
                retx_pkt = Packet(
                    packet_id=self.packet_id_counter[0],
                    seq_num=orig_pkt.seq_num,
                    src_node=orig_pkt.src_node,
                    dst_node=orig_pkt.dst_node,
                    size_bytes=orig_pkt.size_bytes,
                    gen_time=orig_pkt.gen_time,
                    flow_id=orig_pkt.flow_id,
                    protocol="GBN",
                    is_retransmit=True
                )
                self.recorder.record_generate(retx_pkt, self.env.now, len(self.forward_link.tx_resource.queue))
                self.env.process(self._forward_packet_process(retx_pkt))

        if not self.window_available.triggered:
            self.window_available.succeed()
