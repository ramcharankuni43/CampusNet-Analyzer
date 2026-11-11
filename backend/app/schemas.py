import re
from typing import List, Optional, Any, Dict, Union
import datetime
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator

def validate_bandwidth_string(bw_raw: str) -> str:
    """Validates and standardizes bandwidth string into e.g. '10 Mbps' or '512 Kbps'."""
    bw = str(bw_raw).strip()
    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)\s*(k|kb|kbps|m|mb|mbps|g|gb|gbps)?$", bw, re.IGNORECASE)
    if not match:
        raise ValueError(f"Invalid bandwidth format '{bw_raw}'. Expected e.g. '512Kbps', '1Mbps', '10Mb'.")
    val = float(match.group(1))
    unit = (match.group(2) or "mb").lower()
    if val <= 0:
        raise ValueError(f"Bandwidth must be greater than 0, got '{bw_raw}'")
    if unit.startswith("k"):
        if val > 1000000:
            raise ValueError(f"Bandwidth exceeds maximum 1000 Mbps: '{bw_raw}'")
        return f"{int(val) if val.is_integer() else val} Kbps"
    elif unit.startswith("m"):
        if val > 1000:
            raise ValueError(f"Bandwidth exceeds maximum 1000 Mbps: '{bw_raw}'")
        return f"{int(val) if val.is_integer() else val} Mbps"
    elif unit.startswith("g"):
        if val > 1.0:
            raise ValueError(f"Bandwidth exceeds maximum 1 Gbps: '{bw_raw}'")
        return f"{int(val * 1000)} Mbps"
    return f"{val} Mbps"

def validate_delay_string(delay_raw: str) -> str:
    """Validates and standardizes delay string into e.g. '20ms'."""
    delay = str(delay_raw).strip()
    match = re.match(r"^([0-9]+(?:\.[0-9]+)?)\s*(ms|s|us)?$", delay, re.IGNORECASE)
    if not match:
        raise ValueError(f"Invalid delay format '{delay_raw}'. Expected e.g. '5ms', '10ms', '20ms'.")
    val = float(match.group(1))
    unit = (match.group(2) or "ms").lower()
    if val < 0:
        raise ValueError(f"Delay cannot be negative, got '{delay_raw}'")
    if unit == "s":
        ms_val = val * 1000.0
    elif unit == "us":
        ms_val = val / 1000.0
    else:
        ms_val = val
    if ms_val > 5000:
        raise ValueError(f"Delay exceeds maximum supported 5000ms: '{delay_raw}'")
    return f"{int(ms_val) if ms_val.is_integer() else round(ms_val, 2)}ms"

class TimeSeriesPoint(BaseModel):
    time: float
    throughput_kbps: float
    delay_ms: float
    packets_dropped: int

class ResultBase(BaseModel):
    throughput_kbps: float
    packet_loss_percent: float
    packet_delivery_ratio: float
    average_delay_ms: float
    packets_sent: int
    packets_received: int
    packets_dropped: int
    data_rate_kbps: float
    summary_notes: Optional[str] = None

class ResultResponse(ResultBase):
    id: int
    experiment_id: int
    time_series: Optional[List[Dict[str, Any]]] = None

    model_config = ConfigDict(from_attributes=True)

class SimulationConfigCreate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=128)
    description: Optional[str] = Field(default="")
    users: Optional[int] = Field(default=None, ge=1, le=250)
    students: Optional[int] = Field(default=None, ge=1, le=250)
    protocol: str = Field(default="TCP")
    traffic_level: Optional[str] = None
    traffic_intensity: Optional[str] = None
    scenario: Optional[str] = None
    data_rate: Optional[str] = None
    bandwidth: Optional[str] = None
    delay: Optional[str] = "20ms"
    bottleneck_delay: Optional[str] = None
    simulation_time: Optional[float] = Field(default=None, ge=1.0, le=300.0)
    duration: Optional[float] = Field(default=None, ge=1.0, le=300.0)
    experiment_type: Optional[str] = None
    window_size: Optional[int] = Field(default=32, ge=1, le=256)
    packet_size: Optional[int] = Field(default=1024, ge=64, le=65535)
    force_demo: Optional[bool] = False

    @model_validator(mode="before")
    @classmethod
    def normalize_and_validate(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        # 1. Alias: students -> users
        if "students" in data and ("users" not in data or data["users"] is None):
            data["users"] = data["students"]

        # 2. Alias: bandwidth -> data_rate
        if "bandwidth" in data and ("data_rate" not in data or data["data_rate"] is None):
            data["data_rate"] = data["bandwidth"]

        # 3. Alias: bottleneck_delay -> delay
        if "bottleneck_delay" in data and ("delay" not in data or data["delay"] is None):
            data["delay"] = data["bottleneck_delay"]

        # 4. Alias: duration -> simulation_time
        if "duration" in data and ("simulation_time" not in data or data["simulation_time"] is None):
            data["simulation_time"] = float(data["duration"])

        # 5. Alias: traffic_intensity -> traffic_level
        if "traffic_intensity" in data and ("traffic_level" not in data or data["traffic_level"] is None):
            data["traffic_level"] = data["traffic_intensity"]

        # 6. Normalize protocol
        proto = str(data.get("protocol", "TCP")).strip().upper()
        if proto not in ("TCP", "UDP"):
            raise ValueError(f"Unsupported protocol '{proto}'. Topology supports 'TCP' or 'UDP'.")
        data["protocol"] = proto

        # 7. Scenario mapping
        scenario = data.get("scenario")
        if scenario:
            sc_clean = str(scenario).strip().lower().replace(" ", "_").replace("-", "_")
            if sc_clean in ("low_load", "low"):
                if not data.get("traffic_level"): data["traffic_level"] = "Low"
                if not data.get("users"): data["users"] = 10
                if not data.get("data_rate"): data["data_rate"] = "512 Kbps"
                if not data.get("experiment_type"): data["experiment_type"] = "Normal Traffic"
            elif sc_clean in ("medium_load", "medium"):
                if not data.get("traffic_level"): data["traffic_level"] = "Medium"
                if not data.get("users"): data["users"] = 50
                if not data.get("data_rate"): data["data_rate"] = "1 Mbps"
                if not data.get("experiment_type"): data["experiment_type"] = "Normal Traffic"
            elif sc_clean in ("high_load", "high"):
                if not data.get("traffic_level"): data["traffic_level"] = "High"
                if not data.get("users"): data["users"] = 150
                if not data.get("data_rate"): data["data_rate"] = "2 Mbps"
                if not data.get("experiment_type"): data["experiment_type"] = "High Traffic"
            elif sc_clean in ("tcp_vs_udp", "udp_stream", "cbr"):
                if not data.get("experiment_type"): data["experiment_type"] = "TCP vs UDP"
            elif sc_clean in ("leaky_bucket", "shaper", "traffic_shaping"):
                if not data.get("experiment_type"): data["experiment_type"] = "Leaky Bucket"
            elif sc_clean in ("sliding_window", "flow_control"):
                if not data.get("experiment_type"): data["experiment_type"] = "Sliding Window"
            elif sc_clean in ("go_back_n", "gbn", "arq"):
                if not data.get("experiment_type"): data["experiment_type"] = "Go-Back-N"

        # Defaults for remaining fields
        if not data.get("users"):
            data["users"] = 10
        if not data.get("traffic_level"):
            u = data["users"]
            if u <= 20: data["traffic_level"] = "Low"
            elif u <= 75: data["traffic_level"] = "Medium"
            elif u <= 175: data["traffic_level"] = "High"
            else: data["traffic_level"] = "Custom"
        if not data.get("data_rate"):
            tl = str(data["traffic_level"]).lower()
            if tl == "low": data["data_rate"] = "512 Kbps"
            elif tl == "medium": data["data_rate"] = "1 Mbps"
            elif tl == "high": data["data_rate"] = "2 Mbps"
            else: data["data_rate"] = "1 Mbps"
        if not data.get("delay"):
            data["delay"] = "20ms"
        if not data.get("simulation_time"):
            data["simulation_time"] = 60.0
        if not data.get("experiment_type"):
            data["experiment_type"] = "Normal Traffic"

        # Validate bandwidth and delay formats
        data["data_rate"] = validate_bandwidth_string(str(data["data_rate"]))
        data["delay"] = validate_delay_string(str(data["delay"]))

        # Generate default name if absent
        if not data.get("name") or not str(data["name"]).strip():
            data["name"] = f"Simulation ({data['users']} Students, {data['protocol']}, {data['data_rate']})"

        return data

class ExperimentResponse(BaseModel):
    id: int
    exp_code: str
    name: str
    description: Optional[str] = None
    users: int
    protocol: str
    traffic_level: str
    data_rate: str
    delay: Optional[str] = "20ms"
    simulation_time: float
    experiment_type: str
    status: str
    is_demo: bool
    trace_file: Optional[str] = None
    output_dir: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime.datetime
    result: Optional[ResultResponse] = None

    # Flattened top-level metrics for direct access
    throughput_kbps: Optional[float] = None
    packet_loss_percent: Optional[float] = None
    packet_delivery_ratio: Optional[float] = None
    average_delay_ms: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

class DashboardKPIs(BaseModel):
    total_experiments: int
    avg_throughput_kbps: float
    avg_packet_loss_percent: float
    avg_delay_ms: float
    avg_pdr_percent: float

class DashboardSummary(BaseModel):
    kpis: DashboardKPIs
    recent_experiments: List[ExperimentResponse]
    throughput_vs_users: List[Dict[str, Any]]
    loss_vs_users: List[Dict[str, Any]]
    delay_vs_users: List[Dict[str, Any]]
    pdr_vs_users: Optional[List[Dict[str, Any]]] = None
    traffic_load_data: Optional[List[Dict[str, Any]]] = None
    tcp_udp_rates: Optional[List[Dict[str, Any]]] = None
    leaky_bucket_comparison: Optional[Dict[str, Any]] = None
    gbn_trace_data: Optional[List[Dict[str, Any]]] = None
    tcp_vs_udp: Dict[str, Any]
    system_mode: str
    is_ns2_available: bool

class ComparisonRequest(BaseModel):
    experiment_ids: List[int]

class ComparisonResponse(BaseModel):
    experiments: List[ExperimentResponse]
    metrics_table: List[Dict[str, Any]]
    comparison_charts: Dict[str, Any]
    analysis_summary: str

class SimulationStatusResponse(BaseModel):
    id: int
    exp_code: str
    experiment_id: Optional[str] = None
    status: str
    progress: Optional[int] = None
    progress_percent: int
    current_stage: str
    message: Optional[str] = None
    stage_message: str
    logs: List[str]
    error: Optional[str] = None
    error_message: Optional[str] = None
    result: Optional[ResultResponse] = None

class SystemStatusResponse(BaseModel):
    ns2_installed: bool
    ns2_path: Optional[str] = None
    execution_mode: str # "NS-2 LIVE SIMULATION" or "DEMO MODE — Sample Data"
    wsl_detected: bool
    wsl_distro: Optional[str] = None
    python_version: str
    db_connected: bool
    database_path: str
    total_experiments: int

class GbnSimulationRequest(BaseModel):
    window_size: int = Field(default=8, ge=1, le=64)
    loss_rate: float = Field(default=0.05, ge=0.0, le=0.5)
    simulation_time: float = Field(default=10.0, ge=3.0, le=60.0)
    force_demo: Optional[bool] = False

class GbnSimulationResponse(BaseModel):
    window_size: int
    loss_rate: float
    packets_sent: int
    packets_received: int
    packets_dropped: int
    retransmissions: int
    trace_points: List[Dict[str, Any]]
    summary: str
    is_demo: Optional[bool] = False

class LeakyBucketRequest(BaseModel):
    bucket_size: int = Field(default=20, ge=5, le=100)
    leak_rate: str = Field(default="512Kbps")
    simulation_time: float = Field(default=10.0, ge=3.0, le=60.0)
    force_demo: Optional[bool] = False

class LeakyBucketResponse(BaseModel):
    bucket_size: int
    leak_rate: str
    unshaped_throughput_kbps: float
    shaped_throughput_kbps: float
    unshaped_loss_percent: float
    shaped_loss_percent: float
    comparison_series: List[Dict[str, Any]]
    summary: str
    is_demo: Optional[bool] = False

