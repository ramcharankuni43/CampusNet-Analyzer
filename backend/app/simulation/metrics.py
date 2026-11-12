"""
CampusNet Analyzer - Performance Metrics Calculation Subsystem
Computes verified academic performance indicators from SimPy event logs.

Documented Formulas & Units:
1. Throughput (Kbps):
   Throughput = (Total Delivered Bytes * 8) / (Observation Duration * 1000)
2. Packet Delivery Ratio (PDR %):
   PDR = (Unique Delivered Packets / Unique Generated Packets) * 100
3. Packet Loss Percentage (%):
   Packet Loss = (Unique Lost Packets / Unique Generated Packets) * 100
4. Average End-to-End Delay (ms):
   Average Delay = (Sum of All Delivery Delays / Successfully Delivered Packets) * 1000
5. Mathematical Invariant:
   Generated Packets = Delivered Packets + Lost Packets (for terminal states)
"""
from typing import Dict, Any, List, Optional
from .event_recorder import EventRecorder


def calculate_metrics(
    recorder: EventRecorder,
    simulation_duration: float,
    data_rate_bps: float = 1_000_000.0,
    experiment_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Calculates verified academic network performance indicators from an EventRecorder.
    Handles edge conditions (e.g., zero packets) cleanly without division by zero.
    """
    sim_time = max(float(simulation_duration), 0.001)

    sent_unique = len(recorder.unique_generated)
    delivered_unique = len(recorder.unique_delivered)
    dropped_unique = len(recorder.unique_dropped)
    in_transit_unique = max(0, sent_unique - delivered_unique - dropped_unique)
    total_drop_events = len(recorder.dropped_packets)

    # 1. Throughput in Kbps
    # (Bytes * 8 bits/byte) / (seconds * 1000 bits/Kb)
    throughput_kbps = round((recorder.total_delivered_bytes * 8.0) / (sim_time * 1000.0), 2)

    # 2. Packet Delivery Ratio (PDR %) and Packet Loss (%)
    # Calculated against unique generated packets
    if sent_unique > 0:
        pdr_percent = round((delivered_unique / sent_unique) * 100.0, 2)
        packet_loss_percent = round((dropped_unique / sent_unique) * 100.0, 2)
    else:
        pdr_percent = 0.0
        packet_loss_percent = 0.0

    # 3. Delay metrics (convert SimPy seconds to milliseconds)
    if recorder.packet_delays:
        avg_delay_ms = round((sum(recorder.packet_delays) / len(recorder.packet_delays)) * 1000.0, 2)
        min_delay_ms = round(min(recorder.packet_delays) * 1000.0, 2)
        max_delay_ms = round(max(recorder.packet_delays) * 1000.0, 2)
    else:
        avg_delay_ms = 0.0
        min_delay_ms = 0.0
        max_delay_ms = 0.0

    # 4. Link utilization / Data rate in Kbps
    data_rate_kbps = round(data_rate_bps / 1000.0, 2)

    # 5. Build time series (1-second aggregation buckets)
    num_buckets = max(int(sim_time) + 1, 1)
    bucket_stats: List[Dict[str, Any]] = [
        {
            "time": sec,
            "bytes_received": 0,
            "packets_received": 0,
            "packets_sent": 0,
            "packets_dropped": 0,
            "delay_sum": 0.0,
            "queue_len_samples": []
        }
        for sec in range(num_buckets)
    ]

    for ev in recorder.events:
        sec = min(int(ev.time), num_buckets - 1)
        if sec < 0:
            continue
        if ev.event_type in ("generate", "retransmit"):
            bucket_stats[sec]["packets_sent"] += 1
        elif ev.event_type == "receive":
            bucket_stats[sec]["bytes_received"] += ev.size_bytes
            bucket_stats[sec]["packets_received"] += 1
            if ev.delay is not None:
                bucket_stats[sec]["delay_sum"] += ev.delay
        elif ev.event_type == "drop":
            bucket_stats[sec]["packets_dropped"] += 1

        if ev.queue_len >= 0:
            bucket_stats[sec]["queue_len_samples"].append(ev.queue_len)

    time_series = []
    for b in bucket_stats:
        sec_bytes = b["bytes_received"]
        sec_tp = round((sec_bytes * 8.0) / 1000.0, 2)
        rec_count = b["packets_received"]
        sec_delay = round((b["delay_sum"] / rec_count) * 1000.0, 2) if rec_count > 0 else 0.0
        s_count = b["packets_sent"]
        d_count = b["packets_dropped"]
        sec_loss = round((d_count / max(1, s_count + d_count)) * 100.0, 2) if (s_count + d_count) > 0 else 0.0
        q_samples = b["queue_len_samples"]
        avg_q = round(sum(q_samples) / len(q_samples), 1) if q_samples else 0

        time_series.append({
            "time": b["time"],
            "throughput_kbps": sec_tp,
            "delay_ms": sec_delay,
            "packet_loss_percent": sec_loss,
            "packets_sent": s_count,
            "packets_received": rec_count,
            "packets_dropped": d_count,
            "queue_occupancy": avg_q
        })

    return {
        "throughput_kbps": throughput_kbps,
        "packet_loss_percent": packet_loss_percent,
        "packet_delivery_ratio": pdr_percent,
        "average_delay_ms": avg_delay_ms,
        "min_delay_ms": min_delay_ms,
        "max_delay_ms": max_delay_ms,
        "packets_sent": sent_unique,
        "packets_received": delivered_unique,
        "packets_dropped": total_drop_events,
        "unique_dropped_packets": dropped_unique,
        "packets_in_transit": in_transit_unique,
        "lost_packets": dropped_unique,
        "retransmissions": recorder.retransmissions_count,
        "total_transmissions": recorder.total_transmissions,
        "data_rate_kbps": data_rate_kbps,
        "simulation_duration": sim_time,
        "time_series": time_series,
        "summary_notes": (
            f"SimPy discrete-event simulation completed. Delivered {delivered_unique}/{sent_unique} unique packets "
            f"({pdr_percent}% PDR, {packet_loss_percent}% loss) with average end-to-end delay of {avg_delay_ms} ms."
        )
    }
