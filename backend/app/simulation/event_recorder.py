"""
CampusNet Analyzer - Event Recording Subsystem
Captures, verifies, and audits discrete events in the SimPy environment.
"""
from typing import List, Set, Dict, Tuple, Optional
from .protocols.base import Packet, SimulationEvent


class EventRecorder:
    """
    Chronological event recorder maintaining strict academic accounting:
    1. Tracks unique original generated packets (excluding retransmissions).
    2. Tracks unique successfully delivered packets.
    3. Tracks unique unrecovered dropped packets.
    4. Separately audits retransmissions without inflating the generation total.
    """

    def __init__(self):
        self.events: List[SimulationEvent] = []
        # Sets of unique payload keys: (src_node, seq_num)
        self.unique_generated: Set[Tuple[int, int]] = set()
        self.unique_delivered: Set[Tuple[int, int]] = set()
        self.unique_dropped: Set[Tuple[int, int]] = set()

        # Instances tracking
        self.delivered_packets: List[Packet] = []
        self.dropped_packets: List[Packet] = []

        # Retransmission metrics
        self.retransmissions_count: int = 0
        self.total_transmissions: int = 0

        # Byte tracking
        self.total_generated_bytes: int = 0
        self.total_delivered_bytes: int = 0
        self.total_dropped_bytes: int = 0

        # Delay tracking (seconds)
        self.packet_delays: List[float] = []

    def record_generate(self, pkt: Packet, time: float, queue_len: int = 0):
        key = pkt.unique_key
        if not pkt.is_retransmit:
            if key not in self.unique_generated:
                self.unique_generated.add(key)
                self.total_generated_bytes += pkt.size_bytes
        else:
            self.retransmissions_count += 1

        self.total_transmissions += 1
        self.events.append(SimulationEvent(
            time=time,
            event_type="retransmit" if pkt.is_retransmit else "generate",
            packet_id=pkt.packet_id,
            seq_num=pkt.seq_num,
            src_node=pkt.src_node,
            dst_node=pkt.dst_node,
            size_bytes=pkt.size_bytes,
            protocol=pkt.protocol,
            reason="retransmit_attempt" if pkt.is_retransmit else "initial_generation",
            queue_len=queue_len
        ))

    def record_enqueue(self, pkt: Packet, time: float, queue_len: int):
        self.events.append(SimulationEvent(
            time=time,
            event_type="enqueue",
            packet_id=pkt.packet_id,
            seq_num=pkt.seq_num,
            src_node=pkt.src_node,
            dst_node=pkt.dst_node,
            size_bytes=pkt.size_bytes,
            protocol=pkt.protocol,
            reason="queue_accepted",
            queue_len=queue_len
        ))

    def record_dequeue(self, pkt: Packet, time: float, queue_len: int):
        self.events.append(SimulationEvent(
            time=time,
            event_type="dequeue",
            packet_id=pkt.packet_id,
            seq_num=pkt.seq_num,
            src_node=pkt.src_node,
            dst_node=pkt.dst_node,
            size_bytes=pkt.size_bytes,
            protocol=pkt.protocol,
            reason="transmission_start",
            queue_len=queue_len
        ))

    def record_receive(self, pkt: Packet, time: float, queue_len: int = 0):
        key = pkt.unique_key
        pkt.rx_time = time
        pkt.status = "delivered"
        delay = max(0.0, time - pkt.gen_time)

        # Deduplication check: only count first delivery of unique packet
        if key not in self.unique_delivered:
            self.unique_delivered.add(key)
            self.delivered_packets.append(pkt)
            self.total_delivered_bytes += pkt.size_bytes
            self.packet_delays.append(delay)
            # If it was previously marked dropped but got retransmitted and delivered, remove from lost
            if key in self.unique_dropped:
                self.unique_dropped.remove(key)

        self.events.append(SimulationEvent(
            time=time,
            event_type="receive",
            packet_id=pkt.packet_id,
            seq_num=pkt.seq_num,
            src_node=pkt.src_node,
            dst_node=pkt.dst_node,
            size_bytes=pkt.size_bytes,
            protocol=pkt.protocol,
            reason="delivered_to_lms",
            delay=delay,
            queue_len=queue_len
        ))

    def record_drop(self, pkt: Packet, reason: str, time: float, queue_len: int = 0):
        key = pkt.unique_key
        pkt.status = "dropped"
        self.dropped_packets.append(pkt)
        self.total_dropped_bytes += pkt.size_bytes

        # Only mark as lost if it hasn't already been delivered
        if key not in self.unique_delivered:
            self.unique_dropped.add(key)

        self.events.append(SimulationEvent(
            time=time,
            event_type="drop",
            packet_id=pkt.packet_id,
            seq_num=pkt.seq_num,
            src_node=pkt.src_node,
            dst_node=pkt.dst_node,
            size_bytes=pkt.size_bytes,
            protocol=pkt.protocol,
            reason=reason,
            queue_len=queue_len
        ))

    def record_ack(self, seq_num: int, src_node: int, dst_node: int, time: float, queue_len: int = 0):
        self.events.append(SimulationEvent(
            time=time,
            event_type="ack",
            packet_id=-1,
            seq_num=seq_num,
            src_node=src_node,
            dst_node=dst_node,
            size_bytes=40, # Typical TCP/IP ACK size
            protocol="ACK",
            reason="acknowledgement",
            queue_len=queue_len
        ))

    def verify_conservation(self, in_transit_count: int = 0) -> bool:
        """
        Mathematical verification:
        Unique Generated = Unique Delivered + Unique Dropped (unrecovered) + In-Transit
        """
        gen = len(self.unique_generated)
        deliv = len(self.unique_delivered)
        drop = len(self.unique_dropped)
        return gen == (deliv + drop + in_transit_count)

