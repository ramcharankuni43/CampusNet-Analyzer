"""
CampusNet Analyzer - SimPy Discrete-Event Simulation Engine
Central orchestrator managing environment, topology, traffic, protocols, and metrics.
"""
import re
import random
from typing import Dict, Any, Optional, Callable
import simpy

from .event_recorder import EventRecorder
from .topology import CampusTopology
from .traffic import get_scenario_config
from .protocols.udp import UdpAgent
from .protocols.tcp_like import TcpLikeAgent
from .protocols.gbn import GoBackNAgent
from .metrics import calculate_metrics


def parse_bandwidth_bps(bw_input: Any) -> float:
    """Parses bandwidth string (e.g., '10 Mbps', '512Kbps', '2M') or number to bits per second."""
    if isinstance(bw_input, (int, float)):
        return max(1000.0, float(bw_input))
    s = str(bw_input).strip().lower().replace(" ", "")
    m = re.match(r"^([0-9]+(?:\.[0-9]+)?)(k|m|g)?(b|bps)?$", s)
    if not m:
        return 1_000_000.0 # Default 1 Mbps
    val = float(m.group(1))
    unit = m.group(2) or "m"
    if unit == "k":
        return val * 1_000.0
    elif unit == "m":
        return val * 1_000_000.0
    elif unit == "g":
        return val * 1_000_000_000.0
    return val * 1_000_000.0


def parse_delay_seconds(delay_input: Any) -> float:
    """Parses delay string (e.g., '20ms', '0.05s', '500us') or number to seconds."""
    if isinstance(delay_input, (int, float)):
        return max(0.0, float(delay_input))
    s = str(delay_input).strip().lower().replace(" ", "")
    m = re.match(r"^([0-9]+(?:\.[0-9]+)?)(ms|s|us)?$", s)
    if not m:
        return 0.020 # Default 20ms
    val = float(m.group(1))
    unit = m.group(2) or "ms"
    if unit == "s":
        return val
    elif unit == "us":
        return val / 1_000_000.0
    return val / 1000.0 # ms to s


class SimPySimulationEngine:
    """
    Modular discrete-event simulation engine for CampusNet Analyzer.
    Coordinates SimPy processes, topology transmission, and metric evaluation.
    """

    def __init__(
        self,
        num_students: int = 10,
        protocol: str = "TCP",
        bandwidth: Any = "1 Mbps",
        delay: Any = "20ms",
        queue_capacity: int = 50,
        simulation_duration: float = 10.0,
        scenario_name: str = "Normal Traffic",
        traffic_intensity: str = "Medium",
        loss_rate: float = 0.0,
        window_size: int = 32,
        seed: Optional[int] = 42
    ):
        self.num_students = max(1, min(int(num_students), 250))
        self.protocol = protocol.upper()
        self.bandwidth_bps = parse_bandwidth_bps(bandwidth)
        self.delay_sec = parse_delay_seconds(delay)
        self.queue_capacity = max(1, int(queue_capacity))
        self.simulation_duration = max(0.1, float(simulation_duration))
        self.scenario_name = scenario_name
        self.traffic_intensity = traffic_intensity
        self.loss_rate = max(0.0, min(1.0, float(loss_rate)))
        self.window_size = max(1, min(int(window_size), 256))
        self.seed = seed

        # SimPy core environment
        self.env = simpy.Environment()
        self.recorder = EventRecorder()
        self.rng = random.Random(self.seed) if self.seed is not None else random.Random()
        self.packet_id_counter = [0]

        # Build campus topology
        self.topology = CampusTopology(
            env=self.env,
            num_students=self.num_students,
            bottleneck_bw_bps=self.bandwidth_bps,
            bottleneck_delay_sec=self.delay_sec,
            queue_capacity=self.queue_capacity,
            recorder=self.recorder,
            loss_rate=self.loss_rate,
            rng=self.rng
        )

        self.agents = []

    def _setup_agents(self):
        """Initializes and attaches protocol sender agents for each student node."""
        cfg = get_scenario_config(self.scenario_name, self.traffic_intensity)

        for student_id in range(self.num_students):
            student_rng = random.Random(self.seed + student_id if self.seed else None)

            if "UDP" in self.protocol:
                agent = UdpAgent(
                    env=self.env,
                    src_node=student_id,
                    dst_node=self.topology.server_node_id,
                    link=self.topology.bottleneck_link,
                    recorder=self.recorder,
                    traffic_config=cfg,
                    packet_id_counter=self.packet_id_counter,
                    simulation_duration=self.simulation_duration,
                    rng=student_rng
                )
            elif "GBN" in self.protocol:
                agent = GoBackNAgent(
                    env=self.env,
                    src_node=student_id,
                    dst_node=self.topology.server_node_id,
                    forward_link=self.topology.bottleneck_link,
                    return_link=self.topology.ack_link,
                    recorder=self.recorder,
                    packet_id_counter=self.packet_id_counter,
                    simulation_duration=self.simulation_duration,
                    window_size=min(self.window_size, 8),
                    timeout_duration=max(0.050, self.delay_sec * 4.0),
                    packet_size=cfg.avg_packet_size,
                    total_packets_to_send=max(10, int(self.simulation_duration * 10)),
                    rng=student_rng
                )
            else:
                # Default: TCP-like Sliding Window + AIMD
                agent = TcpLikeAgent(
                    env=self.env,
                    src_node=student_id,
                    dst_node=self.topology.server_node_id,
                    forward_link=self.topology.bottleneck_link,
                    return_link=self.topology.ack_link,
                    recorder=self.recorder,
                    traffic_config=cfg,
                    packet_id_counter=self.packet_id_counter,
                    simulation_duration=self.simulation_duration,
                    max_window=self.window_size,
                    initial_cwnd=1.0,
                    initial_ssthresh=max(4.0, float(self.window_size // 2)),
                    rto_timeout=max(0.080, self.delay_sec * 4.0),
                    rng=student_rng
                )

            self.agents.append(agent)
            self.env.process(agent.run())

    def run(self) -> Dict[str, Any]:
        """
        Executes the SimPy discrete-event simulation.
        Traffic generators produce events up to simulation_duration.
        A controlled flush and propagation drain period allows in-flight packets
        to reach their terminal state (delivered or dropped).
        Returns verified performance metrics.
        """
        self._setup_agents()

        # Phase 1: Run traffic generation up to simulation_duration
        self.env.run(until=self.simulation_duration)

        # Phase 2: Controlled drain of active transmission queue
        drain_limit = self.simulation_duration + max(0.5, self.delay_sec * 20.0)
        link = self.topology.bottleneck_link
        while (len(link.tx_resource.queue) > 0 or link.tx_resource.count > 0) and self.env.now < drain_limit:
            try:
                self.env.step()
            except simpy.core.EmptySchedule:
                break

        # Phase 3: Allow final link propagation traversal to complete delivery
        propagation_slack = self.delay_sec + 0.010
        try:
            self.env.run(until=self.env.now + propagation_slack)
        except simpy.core.EmptySchedule:
            pass

        metrics = calculate_metrics(
            recorder=self.recorder,
            simulation_duration=self.simulation_duration,
            data_rate_bps=self.bandwidth_bps
        )

        return metrics
