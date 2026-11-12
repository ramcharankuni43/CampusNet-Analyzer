"""
CampusNet Analyzer - Leaky Bucket Traffic Shaping Subsystem
Implements discrete-event traffic shaping and buffer regulation.

Algorithm & Operating Principles:
- Bucket Buffer: Has a finite maximum capacity B (bytes).
- Inflow: Bursty, irregular packet arrivals from student applications.
  - If buffer has space (current_bytes + pkt.size <= B): packet is accepted.
  - If buffer is full (current_bytes + pkt.size > B): packet is dropped (bucket overflow).
- Outflow (Leak Rate): Leaks packets at a constant maximum rate R (bps).
  - Converts bursty input traffic into a smooth, constant-rate output stream.
  - Prevents downstream network link congestion and bufferbloat.
"""
import simpy
from typing import Optional, List, TYPE_CHECKING
from .base import Packet
from ..topology import NetworkLink

if TYPE_CHECKING:
    from ..event_recorder import EventRecorder


class LeakyBucketQueue:
    """SimPy Leaky Bucket Traffic Shaper with constant drain rate."""

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

        # Start the constant-rate leaking background process
        self.drain_process = env.process(self._leak_worker())

    def push(self, pkt: Packet) -> bool:
        """Attempts to insert an arriving burst packet into the bucket buffer."""
        if self.current_bytes + pkt.size_bytes <= self.capacity_bytes:
            self.current_bytes += pkt.size_bytes
            self.buffer.append(pkt)
            if self.recorder:
                self.recorder.record_enqueue(pkt, self.env.now, len(self.buffer))

            # Signal leaking worker
            if not self.packet_arrived.triggered:
                self.packet_arrived.succeed()
            return True
        else:
            # Bucket overflow: Drop packet immediately
            if self.recorder:
                self.recorder.record_drop(pkt, "bucket_overflow", self.env.now, len(self.buffer))
            return False

    def _leak_worker(self):
        """Drains buffered packets at constant leak_rate_bps."""
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

                if self.recorder:
                    self.recorder.record_dequeue(pkt, env.now, len(self.buffer))

                # Transmit smoothed packet to downstream bottleneck link
                env.process(self.downstream_link.transmit(pkt))
