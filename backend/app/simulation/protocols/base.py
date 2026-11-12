"""
CampusNet Analyzer - SimPy Discrete-Event Simulation Framework
Base Models: Packet, SimulationEvent, and Protocol Interface

Assumptions & Documentation:
- Time is tracked in seconds (float) according to the SimPy environment clock.
- Packet size is tracked in bytes.
- Bandwidth is modeled in bits per second (bps).
- End-to-end delay is measured from initial packet creation (gen_time)
  until arrival at the final destination application.
"""
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Tuple


@dataclass
class Packet:
    """Represents a simulated network packet traversing the campus topology."""
    packet_id: int               # Unique sequential simulator instance identifier
    seq_num: int                 # Sequence number within its flow / protocol
    src_node: int                # Originating student node index (0 .. N-1)
    dst_node: int                # Destination LMS server node index
    size_bytes: int              # Payload + header size in bytes
    gen_time: float              # Creation timestamp in SimPy simulation seconds
    flow_id: str = "flow_0"      # Logical application flow identifier
    protocol: str = "UDP"        # Protocol model ("UDP", "TCP", "GBN")
    is_retransmit: bool = False  # True if this packet is a retransmission attempt
    tx_time: float = 0.0         # Link transmission start time
    rx_time: float = 0.0         # Destination delivery timestamp
    status: str = "created"      # "created", "enqueued", "delivered", "dropped"
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def unique_key(self) -> Tuple[int, int]:
        """
        Unique key identifying the original distinct packet payload.
        Retransmissions share the same unique_key (src_node, seq_num)
        so that retransmissions are NEVER counted as newly generated packets.
        """
        return (self.src_node, self.seq_num)


@dataclass
class SimulationEvent:
    """Structured discrete-event record for auditing and time-series analysis."""
    time: float                  # Event timestamp in SimPy seconds
    event_type: str              # "generate", "enqueue", "dequeue", "receive", "drop", "ack", "retransmit"
    packet_id: int               # Simulated instance ID
    seq_num: int                 # Sequence number
    src_node: int                # Source node ID
    dst_node: int                # Destination node ID
    size_bytes: int              # Size in bytes
    protocol: str                # Protocol name
    reason: Optional[str] = None # E.g., "queue_overflow", "normal_delivery", "timeout"
    delay: Optional[float] = None # Calculated end-to-end delay (seconds)
    queue_len: int = 0           # Buffer length at event time
