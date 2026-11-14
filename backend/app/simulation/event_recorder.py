"""
CampusNet Analyzer - Event Recording Subsystem
Captures, verifies, and audits discrete events in the SimPy environment.

State Machine & Conservation Principles:
- Every unique packet key (src_node, seq_num) is tracked in an explicit state:
  * STATE_IN_TRANSIT: Packet created/retransmitted and currently in flight.
  * STATE_DELIVERED: Packet reached destination application and was accepted. Terminal state.
  * STATE_DROPPED: Packet was dropped (buffer overflow, channel error, or rejected out-of-order)
                   and has not yet been delivered by a successful retransmission.
- Retransmissions are tracked separately and NEVER counted as new unique generated packets.
- Conservation Invariant (Independently Verified):
  Total Unique Generated == Unique Delivered + Unique Dropped + Unique In-Transit
"""
from typing import List, Set, Dict, Tuple, Optional, Any
from .protocols.base import Packet, SimulationEvent

# Packet Lifecycle States
STATE_IN_TRANSIT = "IN_TRANSIT"
STATE_DELIVERED = "DELIVERED"
STATE_DROPPED = "DROPPED"


class EventRecorder:
    """
    Chronological event recorder maintaining strict academic accounting:
    1. Tracks each unique packet's explicit state machine independently.
    2. Tracks link arrival separately from application acceptance.
    3. Distinguishes initial generation from retransmission attempts.
    4. Audits mathematical conservation with independent disjoint set checks.
    """

    def __init__(self):
        self.events: List[SimulationEvent] = []

        # Independent packet lifecycle state tracker: (src_node, seq_num) -> STATE
        self.packet_states: Dict[Tuple[int, int], str] = {}

        # Tracking sets of unique payload keys: (src_node, seq_num)
        self.unique_generated: Set[Tuple[int, int]] = set()

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
        self.total_offered_bytes: int = 0
        self.total_link_transmitted_bytes: int = 0

        # Delay tracking (seconds) for unique delivered packets
        self.packet_delays: List[float] = []

    def record_generate(self, pkt: Packet, time: float, queue_len: int = 0):
        """Records initial packet creation or a retransmission attempt."""
        key = pkt.unique_key

        if not pkt.is_retransmit:
            if key not in self.unique_generated:
                self.unique_generated.add(key)
                self.total_generated_bytes += pkt.size_bytes
                # Set initial state to IN_TRANSIT
                self.packet_states[key] = STATE_IN_TRANSIT
        else:
            self.retransmissions_count += 1
            # If packet was previously dropped, retransmission moves it back to IN_TRANSIT
            if key in self.packet_states and self.packet_states[key] == STATE_DROPPED:
                self.packet_states[key] = STATE_IN_TRANSIT

        self.total_transmissions += 1
        self.total_offered_bytes += pkt.size_bytes

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
        """Records packet entry into a link or shaper queue."""
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
        """Records packet exit from queue to enter physical serialization."""
        self.total_link_transmitted_bytes += pkt.size_bytes
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

    def record_link_arrival(self, pkt: Packet, time: float, queue_len: int = 0):
        """Records arrival at destination physical link interface (before application acceptance)."""
        self.events.append(SimulationEvent(
            time=time,
            event_type="link_arrival",
            packet_id=pkt.packet_id,
            seq_num=pkt.seq_num,
            src_node=pkt.src_node,
            dst_node=pkt.dst_node,
            size_bytes=pkt.size_bytes,
            protocol=pkt.protocol,
            reason="reached_destination_interface",
            queue_len=queue_len
        ))

    def record_receive(self, pkt: Packet, time: float, queue_len: int = 0):
        """
        Records successful APPLICATION-LEVEL packet delivery and acceptance.
        Deduplicates deliveries: duplicate deliveries are audited but do not
        inflate delivered bytes or distort delay.
        """
        key = pkt.unique_key
        pkt.rx_time = time
        pkt.status = "delivered"
        delay = max(0.0, time - pkt.gen_time)

        is_first_delivery = (key in self.packet_states and self.packet_states[key] != STATE_DELIVERED) or (key not in self.packet_states)

        if is_first_delivery:
            self.packet_states[key] = STATE_DELIVERED
            self.delivered_packets.append(pkt)
            self.total_delivered_bytes += pkt.size_bytes
            self.packet_delays.append(delay)
            event_reason = "delivered_to_lms"
        else:
            event_reason = "duplicate_delivery"

        self.events.append(SimulationEvent(
            time=time,
            event_type="receive",
            packet_id=pkt.packet_id,
            seq_num=pkt.seq_num,
            src_node=pkt.src_node,
            dst_node=pkt.dst_node,
            size_bytes=pkt.size_bytes,
            protocol=pkt.protocol,
            reason=event_reason,
            delay=delay,
            queue_len=queue_len
        ))

    def record_drop(self, pkt: Packet, reason: str, time: float, queue_len: int = 0):
        """
        Records a packet drop event (queue overflow, channel error, or out-of-order discard).
        Updates state to DROPPED only if the packet was not already successfully delivered.
        """
        key = pkt.unique_key
        pkt.status = "dropped"
        self.dropped_packets.append(pkt)
        self.total_dropped_bytes += pkt.size_bytes

        # Only transition to STATE_DROPPED if not already delivered
        if key in self.packet_states:
            if self.packet_states[key] != STATE_DELIVERED:
                self.packet_states[key] = STATE_DROPPED

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
        """Records an acknowledgement frame event."""
        self.events.append(SimulationEvent(
            time=time,
            event_type="ack",
            packet_id=-1,
            seq_num=seq_num,
            src_node=src_node,
            dst_node=dst_node,
            size_bytes=40,
            protocol="ACK",
            reason="acknowledgement",
            queue_len=queue_len
        ))

    @property
    def unique_delivered(self) -> Set[Tuple[int, int]]:
        """Returns set of unique packet keys in STATE_DELIVERED."""
        return self.get_delivered_keys()

    @property
    def unique_dropped(self) -> Set[Tuple[int, int]]:
        """Returns set of unique packet keys in STATE_DROPPED."""
        return self.get_dropped_keys()

    @property
    def unique_in_transit(self) -> Set[Tuple[int, int]]:
        """Returns set of unique packet keys in STATE_IN_TRANSIT."""
        return self.get_in_transit_keys()

    def get_delivered_keys(self) -> Set[Tuple[int, int]]:
        """Returns set of unique packet keys in STATE_DELIVERED."""
        return {k for k, s in self.packet_states.items() if s == STATE_DELIVERED}

    def get_dropped_keys(self) -> Set[Tuple[int, int]]:
        """Returns set of unique packet keys in STATE_DROPPED."""
        return {k for k, s in self.packet_states.items() if s == STATE_DROPPED}

    def get_in_transit_keys(self) -> Set[Tuple[int, int]]:
        """Returns set of unique packet keys in STATE_IN_TRANSIT."""
        return {k for k, s in self.packet_states.items() if s == STATE_IN_TRANSIT}

    def verify_conservation(self) -> Tuple[bool, Dict[str, Any]]:
        """
        Independently verifies packet conservation by inspecting actual packet states.
        
        Checks:
        1. Every unique packet is in exactly ONE disjoint state (DELIVERED, DROPPED, IN_TRANSIT).
        2. No overlap exists between the three state sets.
        3. len(Generated) == len(Delivered) + len(Dropped) + len(InTransit).
        """
        delivered = self.get_delivered_keys()
        dropped = self.get_dropped_keys()
        in_transit = self.get_in_transit_keys()
        total_gen = set(self.packet_states.keys())

        # Disjointness checks
        deliv_drop_overlap = delivered & dropped
        deliv_transit_overlap = delivered & in_transit
        drop_transit_overlap = dropped & in_transit

        is_disjoint = (
            len(deliv_drop_overlap) == 0 and
            len(deliv_transit_overlap) == 0 and
            len(drop_transit_overlap) == 0
        )
        is_complete = (delivered | dropped | in_transit) == total_gen
        is_sum_equal = len(total_gen) == (len(delivered) + len(dropped) + len(in_transit))

        passed = is_disjoint and is_complete and is_sum_equal

        diagnostic = {
            "passed": passed,
            "total_unique_generated": len(total_gen),
            "unique_delivered": len(delivered),
            "unique_dropped": len(dropped),
            "unique_in_transit": len(in_transit),
            "deliv_drop_overlap": list(deliv_drop_overlap),
            "deliv_transit_overlap": list(deliv_transit_overlap),
            "drop_transit_overlap": list(drop_transit_overlap),
            "missing_from_union": list(total_gen - (delivered | dropped | in_transit))
        }

        return passed, diagnostic
