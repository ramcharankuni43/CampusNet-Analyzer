import os
import json
from typing import Dict, Any, List, Optional, Tuple, Set

def parse_ns2_trace_file(
    trace_path: str,
    server_node_id: Optional[int] = None,
    simulation_duration: float = 60.0
) -> Dict[str, Any]:
    """
    Parses a standard NS-2 wired trace file (.tr) and calculates authentic academic network performance metrics.

    Standard NS-2 Wired Trace Event Format (12 fields):
    [0] event: '+' (enqueue), '-' (dequeue), 'r' (receive), 'd' (drop)
    [1] time: float (seconds)
    [2] from_node: int
    [3] to_node: int
    [4] pkt_type: str (e.g. 'tcp', 'cbr', 'udp', 'ack')
    [5] pkt_size: int (bytes)
    [6] flags: str (e.g. '-------')
    [7] fid: int (flow id)
    [8] src_addr: str ('node.port', e.g. '0.0')
    [9] dst_addr: str ('node.port', e.g. '12.0')
    [10] seq_num: int
    [11] pkt_id: int (unique simulator packet instance id)

    Academic & Standard Metric Definitions:
    1. Throughput (Kbps):
       Throughput = (Received Bytes * 8) / (Observation Duration * 1000)
    2. Packet Loss:
       Lost Packets = Sent Packets - Received Packets
       Packet Loss Percentage = (Lost Packets / Sent Packets) * 100
    3. Packet Delivery Ratio (PDR):
       PDR = (Received Packets / Sent Packets) * 100
       (Retransmitted packets are NOT counted as unique original packets)
    4. Average End-to-End Delay (ms):
       Average Delay = (Total Delivery Delay / Successfully Received Packets) * 1000
    """
    if not os.path.exists(trace_path):
        raise FileNotFoundError(f"Trace file not found at {trace_path}")

    # Handle zero-packet / empty scenarios safely without crashing
    if os.path.getsize(trace_path) == 0:
        return {
            "throughput_kbps": 0.0,
            "packet_loss_percent": 0.0,
            "packet_delivery_ratio": 0.0,
            "average_delay_ms": 0.0,
            "packets_sent": 0,
            "packets_received": 0,
            "packets_dropped": 0,
            "lost_packets": 0,
            "retransmissions": 0,
            "total_transmissions": 0,
            "data_rate_kbps": 0.0,
            "time_series": []
        }

    unique_sent_keys: Set[Tuple[str, int]] = set()
    unique_received_keys: Set[Tuple[str, int]] = set()
    packet_first_send_times: Dict[Tuple[str, int], float] = {}
    packet_delays: List[float] = []

    total_received_bytes = 0
    dropped_packet_events = 0
    total_transmissions_sent = 0
    retransmissions_count = 0

    target_dest: Optional[int] = server_node_id if (server_node_id is not None and server_node_id >= 0) else None

    # Time series aggregation per 1-second buckets
    max_sec = max(int(simulation_duration) + 2, 2)
    time_series_data = [
        {
            "time": sec,
            "bytes_received": 0,
            "packets_received": 0,
            "delay_sum": 0.0,
            "packets_dropped": 0,
            "packets_sent": 0
        }
        for sec in range(max_sec)
    ]

    with open(trace_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 12:
                continue

            event = parts[0]
            try:
                time_sec = float(parts[1])
                from_node = int(parts[2])
                to_node = int(parts[3])
                pkt_type = parts[4].lower()
                pkt_size = int(parts[5])
                src_addr = parts[8]
                dst_addr = parts[9]
                seq_num = int(parts[10])
                pkt_id = int(parts[11])
            except (ValueError, IndexError):
                continue

            # Filter flows and protocols correctly:
            # Skip pure ACKs and routing protocol control overhead for application data accounting
            if pkt_type in ("ack", "tcp_ack", "rtproto", "message"):
                continue

            try:
                src_node = int(src_addr.split('.')[0]) if '.' in src_addr else int(src_addr)
            except (ValueError, TypeError):
                src_node = from_node

            try:
                dst_node = int(dst_addr.split('.')[0]) if '.' in dst_addr else int(dst_addr)
            except (ValueError, TypeError):
                dst_node = to_node

            if target_dest is None:
                target_dest = dst_node

            # Consistent packet identification: (source_address, sequence_number)
            # If sequence number is missing/negative, fallback to packet ID
            pkt_key = (src_addr, seq_num) if seq_num >= 0 else (src_addr, pkt_id)
            sec_bucket = max(0, min(int(time_sec), max_sec - 1))

            # 1. Packet sent by source (origination at student client node)
            if (event == "+" and from_node == src_node) or (event == "-" and from_node == src_node and pkt_key not in unique_sent_keys):
                total_transmissions_sent += 1
                time_series_data[sec_bucket]["packets_sent"] += 1

                if pkt_key not in unique_sent_keys:
                    unique_sent_keys.add(pkt_key)
                    packet_first_send_times[pkt_key] = time_sec
                else:
                    retransmissions_count += 1

            # 2. Packet arrival at destination LMS server
            elif event == "r" and (to_node == target_dest or to_node == dst_node):
                total_received_bytes += pkt_size
                time_series_data[sec_bucket]["bytes_received"] += pkt_size

                # Avoid duplicate packet counting: only record the first delivery of unique packet
                if pkt_key not in unique_received_keys:
                    unique_received_keys.add(pkt_key)
                    time_series_data[sec_bucket]["packets_received"] += 1

                    # End-to-end delay calculation from initial generation time
                    if pkt_key in packet_first_send_times:
                        delay = time_sec - packet_first_send_times[pkt_key]
                        if delay >= 0:
                            packet_delays.append(delay)
                            time_series_data[sec_bucket]["delay_sum"] += delay

            # 3. Packet dropped at intermediate queue or error model
            elif event == "d":
                dropped_packet_events += 1
                time_series_data[sec_bucket]["packets_dropped"] += 1

    # Unique original packets sent and successfully received
    sent_packets = len(unique_sent_keys)
    received_packets = len(unique_received_keys)
    lost_packets = max(0, sent_packets - received_packets)

    effective_duration = max(float(simulation_duration), 1.0)

    # 1. Throughput in Kbps = (Received Bytes * 8) / (Observation Duration * 1000)
    throughput_kbps = round((total_received_bytes * 8.0) / (effective_duration * 1000.0), 2)

    # 2. Packet Loss Percentage = (Lost Packets / Sent Packets) * 100
    # 3. Packet Delivery Ratio (PDR) = (Received Packets / Sent Packets) * 100
    if sent_packets > 0:
        pdr_percent = round((received_packets / sent_packets) * 100.0, 2)
        packet_loss_percent = round((lost_packets / sent_packets) * 100.0, 2)
    else:
        pdr_percent = 0.0
        packet_loss_percent = 0.0

    # 4. Average Delay (ms) = (Total delivery delay / Successfully received packets) * 1000
    if packet_delays:
        avg_delay_ms = round((sum(packet_delays) / len(packet_delays)) * 1000.0, 2)
    else:
        avg_delay_ms = 0.0

    # Format time-series data for dashboard charts
    final_time_series = []
    for bucket in time_series_data:
        if bucket["time"] > simulation_duration:
            continue
        tp_sec = round((bucket["bytes_received"] * 8.0) / 1000.0, 2)
        avg_d_sec = (
            round((bucket["delay_sum"] / bucket["packets_received"]) * 1000.0, 2)
            if bucket["packets_received"] > 0
            else 0.0
        )
        final_time_series.append({
            "time": bucket["time"],
            "throughput_kbps": tp_sec,
            "delay_ms": avg_d_sec,
            "packets_dropped": bucket["packets_dropped"]
        })

    return {
        "throughput_kbps": throughput_kbps,
        "packet_loss_percent": packet_loss_percent,
        "packet_delivery_ratio": pdr_percent,
        "average_delay_ms": avg_delay_ms,
        "packets_sent": sent_packets,
        "packets_received": received_packets,
        "packets_dropped": dropped_packet_events,
        "lost_packets": lost_packets,
        "retransmissions": retransmissions_count,
        "total_transmissions": total_transmissions_sent,
        "data_rate_kbps": throughput_kbps,
        "time_series": final_time_series
    }


def parse_gbn_sequence_trace(
    trace_path: str,
    sender_node_id: int = 0,
    dest_node_id: Optional[int] = None,
    max_points: int = 350
) -> Dict[str, Any]:
    """
    Parses NS-2 wired trace file (.tr) specifically for Go-Back-N analysis.
    Extracts packet sequence number progressions, drops, and retransmissions.
    """
    if not os.path.exists(trace_path):
        raise FileNotFoundError(f"Trace file not found at {trace_path}")

    if os.path.getsize(trace_path) == 0:
        return {
            "packets_sent": 0,
            "packets_received": 0,
            "packets_dropped": 0,
            "retransmissions": 0,
            "trace_points": []
        }

    trace_points = []
    seen_seqs = set()
    unique_received = set()
    retransmission_count = 0
    total_transmissions = 0
    packets_dropped = 0
    target_dest = dest_node_id

    with open(trace_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 12:
                continue

            event = parts[0]
            try:
                time_sec = float(parts[1])
                from_node = int(parts[2])
                to_node = int(parts[3])
                pkt_type = parts[4].lower()
                dst_addr = parts[9]
                seq_num = int(parts[10])
            except (ValueError, IndexError):
                continue

            # Skip pure ACKs
            if pkt_type == "ack":
                continue

            try:
                dst_node = int(dst_addr.split('.')[0]) if '.' in dst_addr else int(dst_addr)
            except (ValueError, TypeError):
                dst_node = 3

            if target_dest is None:
                target_dest = dst_node

            # Transmission at sender
            if event == "+" and from_node == sender_node_id:
                total_transmissions += 1
                is_retrans = seq_num in seen_seqs
                if is_retrans:
                    retransmission_count += 1
                    evt_name = "retransmit"
                else:
                    seen_seqs.add(seq_num)
                    evt_name = "send"

                if len(trace_points) < max_points:
                    trace_points.append({
                        "time": round(time_sec, 4),
                        "seq_num": seq_num,
                        "event": evt_name,
                        "is_retransmit": is_retrans
                    })

            # Drops on intermediate links
            elif event == "d":
                packets_dropped += 1
                if len(trace_points) < max_points:
                    trace_points.append({
                        "time": round(time_sec, 4),
                        "seq_num": seq_num,
                        "event": "drop",
                        "is_retransmit": False
                    })

            # Receive at destination
            elif event == "r" and (to_node == target_dest or to_node == dst_node):
                unique_received.add(seq_num)

    unique_sent = len(seen_seqs)
    unique_recv = len(unique_received)

    return {
        "packets_sent": unique_sent,
        "total_transmissions": total_transmissions,
        "packets_received": unique_recv,
        "packets_dropped": packets_dropped,
        "retransmissions": retransmission_count,
        "trace_points": trace_points
    }


def parse_leaky_bucket_comparison(
    unshaped_trace_path: str,
    shaped_trace_path: str,
    server_node_id: Optional[int] = None,
    simulation_duration: float = 10.0
) -> Dict[str, Any]:
    """
    Parses paired NS-2 traces for unshaped bursty traffic vs Leaky Bucket shaped traffic.
    """
    unshaped = parse_ns2_trace_file(unshaped_trace_path, server_node_id=server_node_id, simulation_duration=simulation_duration)
    shaped = parse_ns2_trace_file(shaped_trace_path, server_node_id=server_node_id, simulation_duration=simulation_duration)

    unshaped_ts = {p["time"]: p for p in unshaped.get("time_series", [])}
    shaped_ts = {p["time"]: p for p in shaped.get("time_series", [])}

    all_times = sorted(list(set(list(unshaped_ts.keys()) + list(shaped_ts.keys()))))
    comparison_series = []
    for t in all_times:
        u_p = unshaped_ts.get(t, {"throughput_kbps": 0.0, "packets_dropped": 0})
        s_p = shaped_ts.get(t, {"throughput_kbps": 0.0, "packets_dropped": 0})
        comparison_series.append({
            "time": t,
            "unshaped_throughput": u_p.get("throughput_kbps", 0.0),
            "shaped_throughput": s_p.get("throughput_kbps", 0.0),
            "unshaped_drops": u_p.get("packets_dropped", 0),
            "shaped_drops": s_p.get("packets_dropped", 0)
        })

    return {
        "unshaped_throughput_kbps": unshaped.get("throughput_kbps", 0.0),
        "shaped_throughput_kbps": shaped.get("throughput_kbps", 0.0),
        "unshaped_loss_percent": unshaped.get("packet_loss_percent", 0.0),
        "shaped_loss_percent": shaped.get("packet_loss_percent", 0.0),
        "comparison_series": comparison_series
    }
