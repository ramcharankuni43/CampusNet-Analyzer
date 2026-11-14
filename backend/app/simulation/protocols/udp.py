"""
CampusNet Analyzer - UDP Protocol Agent
Simulates an unreliable connectionless transport sender.

Behavior:
- Emits packets at regular or bursty intervals according to the traffic scenario.
- No acknowledgements or flow control.
- Packets dropped at intermediate queues are never retransmitted.
- Fully transparent educational model of UDP transport.
"""
import random
import simpy
from typing import Optional, TYPE_CHECKING
from .base import Packet
from ..topology import NetworkLink
from ..traffic import TrafficScenarioConfig

if TYPE_CHECKING:
    from ..event_recorder import EventRecorder


class UdpAgent:
    """UDP sender process for a student client node."""

    def __init__(
        self,
        env: simpy.Environment,
        src_node: int,
        dst_node: int,
        link: NetworkLink,
        recorder: EventRecorder,
        traffic_config: TrafficScenarioConfig,
        packet_id_counter: list, # shared [int] counter for unique ID assignment
        simulation_duration: float = 10.0,
        rng: Optional[random.Random] = None
    ):
        self.env = env
        self.src_node = src_node
        self.dst_node = dst_node
        self.link = link
        self.recorder = recorder
        self.config = traffic_config
        self.packet_id_counter = packet_id_counter
        self.simulation_duration = max(0.1, float(simulation_duration))
        self.rng = rng or random.Random(src_node * 100 + 7)

        self.seq_num = 0
        self.flow_id = f"udp_flow_{src_node}"

    def run(self):
        """SimPy process generating and dispatching UDP datagrams."""
        env = self.env
        cfg = self.config

        while env.now < self.simulation_duration:
            # 1. Check for on-off idle period (e.g. LMS web think time)
            if cfg.idle_time_mean > 0.0 and self.rng.random() < 0.20:
                idle = self.rng.expovariate(1.0 / cfg.idle_time_mean)
                yield env.timeout(idle)

            # 2. Determine batch size (single packet or burst)
            if cfg.burst_probability > 0.0 and self.rng.random() < cfg.burst_probability:
                count = self.rng.randint(cfg.burst_size_range[0], cfg.burst_size_range[1])
            else:
                count = 1

            for _ in range(count):
                self.seq_num += 1
                self.packet_id_counter[0] += 1
                pkt_id = self.packet_id_counter[0]

                # Slight packet size jitter around average
                jitter_pct = self.rng.uniform(-0.10, 0.10)
                pkt_size = max(64, int(cfg.avg_packet_size * (1.0 + jitter_pct)))

                pkt = Packet(
                    packet_id=pkt_id,
                    seq_num=self.seq_num,
                    src_node=self.src_node,
                    dst_node=self.dst_node,
                    size_bytes=pkt_size,
                    gen_time=env.now,
                    flow_id=self.flow_id,
                    protocol="UDP",
                    is_retransmit=False
                )

                self.recorder.record_generate(pkt, env.now, len(self.link.tx_resource.queue))

                def on_udp_delivered(p: Packet):
                    self.recorder.record_receive(p, env.now, len(self.link.tx_resource.queue))

                # Transmit over bottleneck link (concurrent process)
                env.process(self.link.transmit(pkt, on_delivered=on_udp_delivered))

            # 3. Inter-packet arrival interval
            # Jittered around base arrival interval
            interval = max(0.001, self.rng.expovariate(1.0 / cfg.base_arrival_interval))
            yield env.timeout(interval)
