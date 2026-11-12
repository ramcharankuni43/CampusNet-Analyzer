"""
CampusNet Analyzer - Traffic Scenario Generators
Implements authentic academic traffic profiles for university e-learning workloads:
1. Online Classroom (Audio stream + slide burst)
2. Video Lecture Streaming (Continuous high-definition CBR/VBR video)
3. LMS Access (On-Off web browsing / quiz interaction)
4. Online Examination (Periodic heartbeats + synchronized submission bursts)
5. File Downloads (Greedy bulk courseware download)
6. Mixed Campus Traffic (Blended student activities)
"""
import random
from typing import Dict, Any, Callable, Generator, List, Tuple


class TrafficScenarioConfig:
    """Parameters defining a traffic generation pattern for a student client."""
    def __init__(
        self,
        name: str,
        avg_packet_size: int,
        base_arrival_interval: float,
        burst_probability: float = 0.0,
        burst_size_range: Tuple[int, int] = (1, 1),
        burst_interval: float = 5.0,
        idle_time_mean: float = 0.0
    ):
        self.name = name
        self.avg_packet_size = max(64, int(avg_packet_size))
        self.base_arrival_interval = max(0.001, float(base_arrival_interval))
        self.burst_probability = burst_probability
        self.burst_size_range = burst_size_range
        self.burst_interval = burst_interval
        self.idle_time_mean = idle_time_mean


def get_scenario_config(scenario_name: str, traffic_intensity: str = "Medium") -> TrafficScenarioConfig:
    """Returns the calibrated parameters for a chosen scenario and traffic level."""
    # Scale arrival rate based on traffic intensity
    intensity_mult = {
        "low": 1.5,     # Longer inter-arrival interval (lower traffic)
        "medium": 1.0,  # Baseline
        "high": 0.5     # Shorter inter-arrival interval (higher traffic)
    }.get(traffic_intensity.lower(), 1.0)

    name_lower = scenario_name.lower().replace("-", " ").replace("_", " ")

    if "video" in name_lower or "lecture" in name_lower:
        # High-definition video stream: ~50-80 pkts/sec, 1460 bytes
        return TrafficScenarioConfig(
            name="Video Lecture Streaming",
            avg_packet_size=1460,
            base_arrival_interval=0.018 * intensity_mult,
            burst_probability=0.05,
            burst_size_range=(2, 4)
        )
    elif "classroom" in name_lower:
        # Audio frames (250B every 20ms) + periodic slide burst (1024B)
        return TrafficScenarioConfig(
            name="Online Classroom",
            avg_packet_size=512,
            base_arrival_interval=0.035 * intensity_mult,
            burst_probability=0.15,
            burst_size_range=(3, 6),
            burst_interval=4.0
        )
    elif "lms" in name_lower or "quiz" in name_lower:
        # On-off browsing pattern: think time followed by page request burst
        return TrafficScenarioConfig(
            name="LMS Access",
            avg_packet_size=800,
            base_arrival_interval=0.12 * intensity_mult,
            burst_probability=0.30,
            burst_size_range=(4, 8),
            idle_time_mean=2.5 * intensity_mult
        )
    elif "exam" in name_lower:
        # Lightweight telemetry heartbeats + periodic test question submissions
        return TrafficScenarioConfig(
            name="Online Examination",
            avg_packet_size=256,
            base_arrival_interval=0.08 * intensity_mult,
            burst_probability=0.10,
            burst_size_range=(2, 5),
            burst_interval=6.0
        )
    elif "download" in name_lower or "file" in name_lower:
        # Greedy bulk courseware download (seeks link saturation)
        return TrafficScenarioConfig(
            name="File Downloads",
            avg_packet_size=1460,
            base_arrival_interval=0.008 * intensity_mult,
            burst_probability=0.25,
            burst_size_range=(5, 10)
        )
    elif "mixed" in name_lower or "campus" in name_lower:
        return TrafficScenarioConfig(
            name="Mixed Campus Traffic",
            avg_packet_size=850,
            base_arrival_interval=0.030 * intensity_mult,
            burst_probability=0.20,
            burst_size_range=(2, 6)
        )
    else:
        # Default / Normal Traffic
        return TrafficScenarioConfig(
            name="Normal Traffic",
            avg_packet_size=1024,
            base_arrival_interval=0.05 * intensity_mult,
            burst_probability=0.10,
            burst_size_range=(2, 4)
        )
