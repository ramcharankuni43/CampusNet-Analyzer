"""
CampusNet Analyzer - Network Topology Subsystem
Models the university e-learning network:
N Student Nodes -> Edge Access Switch -> Access Router R1 -> Bottleneck Link -> Core Router R2 -> LMS Server

Features:
- Finite DropTail queue capacity modeling buffer overflow
- Physical link bandwidth serialization delay: T_tx = (Packet Size * 8) / Bandwidth
- Physical link propagation delay: D_prop
- Optional link error model (stochastic loss rate for ARQ evaluation)
"""
import random
import simpy
from typing import Optional, Callable, TYPE_CHECKING
from .protocols.base import Packet

if TYPE_CHECKING:
    from .event_recorder import EventRecorder


class NetworkLink:
    """
    Simulates a directional network link with serialization delay,
    propagation delay, and a finite DropTail queue.
    """

    def __init__(
        self,
        env: simpy.Environment,
        bandwidth_bps: float,
        propagation_delay_sec: float,
        queue_capacity: int = 50,
        recorder: Optional[EventRecorder] = None,
        loss_rate: float = 0.0,
        rng: Optional[random.Random] = None
    ):
        self.env = env
        self.bandwidth_bps = max(1000.0, float(bandwidth_bps))
        self.propagation_delay_sec = max(0.0, float(propagation_delay_sec))
        self.queue_capacity = max(1, int(queue_capacity))
        self.recorder = recorder
        self.loss_rate = max(0.0, min(1.0, float(loss_rate)))
        self.rng = rng or random.Random(42)

        # Transmission resource (single-channel serialization)
        self.tx_resource = simpy.Resource(env, capacity=1)
        self.current_queue_len = 0

    def transmit(
        self,
        pkt: Packet,
        on_delivered: Optional[Callable[[Packet], None]] = None,
        on_dropped: Optional[Callable[[Packet, str], None]] = None
    ):
        """
        SimPy process generator transmitting a packet through the link.
        """
        env = self.env
        queue_len = len(self.tx_resource.queue)

        # 1. Stochastic channel loss model (if configured)
        if self.loss_rate > 0.0 and self.rng.random() < self.loss_rate:
            if self.recorder:
                self.recorder.record_drop(pkt, "channel_error", env.now, queue_len)
            if on_dropped:
                on_dropped(pkt, "channel_error")
            return False

        # 2. Queue capacity check (DropTail overflow)
        if queue_len >= self.queue_capacity:
            if self.recorder:
                self.recorder.record_drop(pkt, "queue_overflow", env.now, queue_len)
            if on_dropped:
                on_dropped(pkt, "queue_overflow")
            return False

        # 3. Enqueue
        if self.recorder:
            self.recorder.record_enqueue(pkt, env.now, queue_len + 1)

        # 4. Wait for transmission channel resource
        with self.tx_resource.request() as req:
            yield req

            # 5. Serialization delay on physical medium
            tx_duration = (pkt.size_bytes * 8.0) / self.bandwidth_bps
            pkt.tx_time = env.now
            yield env.timeout(tx_duration)

            if self.recorder:
                self.recorder.record_dequeue(pkt, env.now, len(self.tx_resource.queue))

        # 6. Propagation delay across the link distance
        yield env.timeout(self.propagation_delay_sec)

        # 7. Arrival at destination physical interface (decoupled from application acceptance)
        if self.recorder:
            self.recorder.record_link_arrival(pkt, env.now, len(self.tx_resource.queue))

        if on_delivered:
            # Protocol agent decides whether to accept (in-order) or discard (out-of-order)
            on_delivered(pkt)
        elif self.recorder:
            # Fallback for direct link usage where no protocol agent manages delivery acceptance
            self.recorder.record_receive(pkt, env.now, len(self.tx_resource.queue))

        return True


class CampusTopology:
    """
    Constructs the end-to-end CampusNet e-learning topology.
    Connects N student nodes through a shared core bottleneck link to the LMS Server.
    """

    def __init__(
        self,
        env: simpy.Environment,
        num_students: int,
        bottleneck_bw_bps: float,
        bottleneck_delay_sec: float,
        queue_capacity: int = 50,
        recorder: Optional[EventRecorder] = None,
        loss_rate: float = 0.0,
        rng: Optional[random.Random] = None
    ):
        self.env = env
        self.num_students = max(1, int(num_students))
        self.server_node_id = self.num_students + 2 # R1, R2, Server

        # The primary shared bottleneck link (Access Router R1 -> Core Router R2)
        self.bottleneck_link = NetworkLink(
            env=env,
            bandwidth_bps=bottleneck_bw_bps,
            propagation_delay_sec=bottleneck_delay_sec,
            queue_capacity=queue_capacity,
            recorder=recorder,
            loss_rate=loss_rate,
            rng=rng
        )

        # Return link for acknowledgements (Core Router R2 -> Access Router R1)
        # ACKs are small (40 bytes), link has equal or higher capacity
        self.ack_link = NetworkLink(
            env=env,
            bandwidth_bps=bottleneck_bw_bps * 2.0, # High capacity reverse path
            propagation_delay_sec=bottleneck_delay_sec,
            queue_capacity=queue_capacity * 2,
            recorder=None,
            loss_rate=0.0,
            rng=rng
        )
