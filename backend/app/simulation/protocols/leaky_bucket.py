"""
CampusNet Analyzer - Leaky Bucket Traffic Shaping Subsystem
Implements discrete-event traffic shaping and buffer regulation.

Algorithm & Operating Principles:
- Bucket Buffer: Finite maximum capacity B (bytes) operating in First-In-First-Out (FIFO) discipline.
- Inflow: Bursty, irregular packet arrivals from student applications.
  - If buffer has space (current_bytes + pkt.size <= B): packet is accepted and timestamped.
  - If buffer is full (current_bytes + pkt.size > B): packet is dropped (bucket overflow).
- Outflow (Leak Rate): Leaks packets at a constant maximum rate R (bps).
  - Converts bursty input traffic into a smooth, constant-rate output stream.
  - Tracks individual packet queuing waiting time in the bucket.
  - Protects downstream bottleneck links from sudden micro-bursts and bufferbloat.
"""
import simpy
from typing import Optional, List, Dict, Any, Callable, TYPE_CHECKING
from .base import Packet
from ..topology import NetworkLink

if TYPE_CHECKING:
    from ..event_recorder import EventRecorder


class LeakyBucketQueue:
    """SimPy Leaky Bucket Traffic Shaper with constant drain rate and FIFO buffering."""

    def __init__(
        self,
        env: simpy.Environment,
        capacity_bytes: int,
        leak_rate_bps: float,
        downstream_link: NetworkLink,
        recorder: Optional[EventRecorder] = None
    ):
        self.env = env
        self.capacity_bytes = max(1024, int(capacity_bytes))
        self.leak_rate_bps = max(1000.0, float(leak_rate_bps))
        self.downstream_link = downstream_link
        self.recorder = recorder

        self.current_bytes: int = 0
        self.buffer: List[Packet] = []
        self.packet_arrived = env.event()

        # Queuing and occupancy statistics
        self.peak_buffer_bytes: int = 0
        self.peak_buffer_packets: int = 0
        self.total_waiting_time: float = 0.0
        self.max_waiting_time: float = 0.0
        self.drained_packets_count: int = 0
        self.dropped_packets_count: int = 0

        # Start the constant-rate leaking background worker process
        self.drain_process = env.process(self._leak_worker())

    @property
    def average_waiting_time(self) -> float:
        """Returns average queuing delay inside the bucket in seconds."""
        if self.drained_packets_count > 0:
            return self.total_waiting_time / self.drained_packets_count
        return 0.0

    def push(
        self,
        pkt: Packet,
        on_delivered: Optional[Callable[[Packet], None]] = None,
        on_dropped: Optional[Callable[[Packet, str], None]] = None
    ) -> bool:
        """Attempts to insert an arriving burst packet into the bucket buffer."""
        if self.current_bytes + pkt.size_bytes <= self.capacity_bytes:
            self.current_bytes += pkt.size_bytes
            pkt.metadata["bucket_enqueue_time"] = self.env.now
            if on_delivered:
                pkt.metadata["on_delivered"] = on_delivered
            if on_dropped:
                pkt.metadata["on_dropped"] = on_dropped

            self.buffer.append(pkt)
            self.peak_buffer_bytes = max(self.peak_buffer_bytes, self.current_bytes)
            self.peak_buffer_packets = max(self.peak_buffer_packets, len(self.buffer))

            if self.recorder:
                self.recorder.record_enqueue(pkt, self.env.now, len(self.buffer))

            # Signal leaking worker
            if not self.packet_arrived.triggered:
                self.packet_arrived.succeed()
            return True
        else:
            # Bucket overflow: Drop packet immediately
            self.dropped_packets_count += 1
            if self.recorder:
                self.recorder.record_drop(pkt, "bucket_overflow", self.env.now, len(self.buffer))
            if on_dropped:
                on_dropped(pkt, "bucket_overflow")
            return False

    def _leak_worker(self):
        """Drains buffered packets in strict FIFO order at constant leak_rate_bps."""
        env = self.env
        while True:
            # Wait until at least one packet is in the bucket
            if not self.buffer:
                self.packet_arrived = env.event()
                yield self.packet_arrived

            if self.buffer:
                pkt = self.buffer.pop(0)
                self.current_bytes = max(0, self.current_bytes - pkt.size_bytes)

                # Leak duration: T = (pkt.size * 8) / leak_rate
                drain_time = (pkt.size_bytes * 8.0) / self.leak_rate_bps
                yield env.timeout(drain_time)

                # Queue waiting time tracking
                enqueue_t = pkt.metadata.get("bucket_enqueue_time", env.now)
                waiting_time = max(0.0, env.now - enqueue_t)
                self.total_waiting_time += waiting_time
                self.max_waiting_time = max(self.max_waiting_time, waiting_time)
                self.drained_packets_count += 1

                if self.recorder:
                    self.recorder.record_dequeue(pkt, env.now, len(self.buffer))

                # Transmit smoothed packet to downstream bottleneck link with original callbacks
                on_deliv = pkt.metadata.get("on_delivered")
                on_drop = pkt.metadata.get("on_dropped")
                env.process(self.downstream_link.transmit(pkt, on_delivered=on_deliv, on_dropped=on_drop))

    @property
    def tx_resource(self):
        """Allows agents to query downstream link resource transparently."""
        return self.downstream_link.tx_resource

    def transmit(
        self,
        pkt: Packet,
        on_delivered: Optional[Callable[[Packet], None]] = None,
        on_dropped: Optional[Callable[[Packet, str], None]] = None
    ):
        """Duck-typed generator enabling LeakyBucketQueue to sit in place of forward_link."""
        self.push(pkt, on_delivered=on_delivered, on_dropped=on_dropped)
        yield self.env.timeout(0.0)

    def get_statistics(self) -> Dict[str, Any]:
        """Returns structured shaping statistics for analysis."""
        return {
            "capacity_bytes": self.capacity_bytes,
            "leak_rate_bps": self.leak_rate_bps,
            "peak_buffer_bytes": self.peak_buffer_bytes,
            "peak_buffer_packets": self.peak_buffer_packets,
            "drained_packets": self.drained_packets_count,
            "dropped_packets": self.dropped_packets_count,
            "average_waiting_time_ms": round(self.average_waiting_time * 1000.0, 2),
            "max_waiting_time_ms": round(self.max_waiting_time * 1000.0, 2)
        }
