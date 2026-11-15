# CampusNet Analyzer — Stage 3: API Integration Assessment and Planning (Final Approval Blueprint)

## 1. Executive Summary

The objective of **Stage 3** is to integrate the verified **Python + SimPy discrete-event simulation engine** (`backend/app/simulation/`) with the existing **FastAPI backend**, **SQLite database**, and **React + TypeScript frontend**.

In **Stage 2**, the discrete-event simulation engine was developed, independently audited, mathematically corrected, and sealed:
- **Packet Invariant Verified**: $\text{Unique Generated} = \text{Unique Delivered} + \text{Unique Dropped} + \text{In-Transit}$ across all protocols and queue disciplines.
- **Physical Link Throughput Law Preserved**: Link serialization throughput never exceeds configured link bandwidth ($\text{Link Throughput} \le 10\text{ Mbps}$).
- **Regression Suite Passing**: 21 SimPy engine tests (`test_simpy_engine.py`), 31 backend API tests (`test_backend.py`), and 17 frontend tests (`verify_frontend.test.mjs`) passing with 100% success.
- **Official Online Classroom Benchmark Established & Verified**: The official benchmark is **Online Classroom** ($10\text{ students}$, $512\text{ B}$ avg packet size, TCP, $10\text{ Mbps}$ bandwidth, $20\text{ ms}$ delay, $50\text{-packet}$ queue capacity, $5.0\text{ s}$ duration, seed $42$). Live execution confirms: $\text{Goodput} = 9,733.29\text{ Kbps}$, $\text{Link Throughput} = 9,733.29\text{ Kbps}$, $11,998\text{ unique packets}$, $0\text{ terminal packet loss}$ ($100.0\%\text{ PDR}$), $93\text{ attempt drops}$ recovered by $93\text{ retransmissions}$, $\text{Average Delay} = 37.80\text{ ms}$, $\text{Active Elapsed Duration} = 5.049\text{ s}$.

This final approval document resolves all outstanding technical questions:
1. **Physical Transmission Accounting**: Formally defines all 8 packet and attempt concepts and provides exact mathematical and physical proofs for the $12,091 \rightarrow 11,998$ relation.
2. **Packet Conservation for Incomplete Simulations**: Guarantees that in-transit packets are never misclassified as terminal losses, detailing concrete examples for fully drained runs, runs with in-transit packets, and runs with permanent packet loss.
3. **Strict Backward Compatibility of `time_series_json`**: Enforces that `time_series_json` remains a plain JSON array of time-series points to prevent frontend charting crashes and Pydantic validation errors, preserving extended metadata without database schema changes.
4. **Deterministic Random Seed Handling**: Establishes seed 42 strictly for the official benchmark, user-supplied seeds for custom runs, and cryptographic `secrets.randbits(32)` for unseeded runs, defining full reproducibility conditions.
5. **Dynamic Simulator Readiness Verification**: Replaces static flags with a 2.73 ms micro smoke test cached during application startup in `lifespan`, decoupling API liveness from simulator readiness.

> [!IMPORTANT]
> In accordance with strict planning restrictions, **no project source files, database tables, or frontend components have been modified**. This document serves exclusively as an assessment and technical blueprint awaiting user approval.

---

## 2. Architecture Overview & Data Flow

```mermaid
flowchart TD
    subgraph Frontend["React + TypeScript Frontend (Vite)"]
        UI_New["New Simulation Page<br/>(SimulationConfig)"]
        UI_Mon["Simulation Monitor<br/>(WebSocket / Polling)"]
        UI_Dash["Dashboard & KPIs<br/>(Charts & Summaries)"]
        UI_Spec["Specialized Pages<br/>(GoBackN, LeakyBucket, TcpUdp)"]
    end

    subgraph FastAPI["FastAPI Backend Application"]
        Router_Sim["/api/simulations<br/>(Run, Status, Results, GBN, LeakyBucket)"]
        Router_Dash["/api/dashboard<br/>(Summary, Trends)"]
        Router_Sys["/api/system<br/>(Status, Health)"]
        Router_Rep["/api/reports<br/>(CSV, PDF Exports)"]
        WS_Mgr["ConnectionManager<br/>(WebSocket Telemetry)"]
    end

    subgraph ServiceLayer["Simulation Service Layer (simulation_service.py)"]
        Task_Worker["run_simulation_task()<br/>(FastAPI BackgroundTasks)"]
        SimPy_Runner["execute_simpy_simulation()<br/>(Threadpool offload via asyncio.to_thread)"]
        GBN_Runner["run_gbn_simulation()<br/>(GoBackNAgent discrete-event execution)"]
        LB_Runner["run_leaky_bucket_simulation()<br/>(Dual SimPy runs: unshaped vs shaped)"]
        Progress_Tracker["active_simulations[exp_id]<br/>(6-Stage Telemetry: 10% -> 100%)"]
    end

    subgraph SimPyEngine["SimPy Discrete-Event Simulation Engine (backend/app/simulation/)"]
        Engine_Core["SimPySimulationEngine"]
        Topo["CampusTopology & NetworkLink"]
        Protocols["Protocols: TcpLikeAgent, UdpAgent, GoBackNAgent"]
        Shaper["LeakyBucketQueue (Buffer & Drain Worker)"]
        Recorder["EventRecorder (Discrete-Event Accounting)"]
        Metrics["calculate_metrics() (Academic Indicators)"]
    end

    subgraph Storage["SQLite Database (CampusNet.db)"]
        Model_Exp["Experiment Table<br/>(status, config, metadata)"]
        Model_Res["Result Table<br/>(throughput, loss, delay, PDR, time_series_json)"]
    end

    UI_New -->|POST /api/simulations/run| Router_Sim
    Router_Sim -->|Enqueues Task| Task_Worker
    Task_Worker -->|Offloads execution| SimPy_Runner
    SimPy_Runner --> Engine_Core
    Engine_Core --> Topo
    Engine_Core --> Protocols
    Engine_Core --> Shaper
    Engine_Core --> Recorder
    Recorder --> Metrics
    Metrics -->|Verified Results| SimPy_Runner
    SimPy_Runner -->|Write Result & Status| Model_Res
    SimPy_Runner -->|Update Status = completed| Model_Exp
    SimPy_Runner -->|Broadcast Progress| WS_Mgr
    WS_Mgr -->|JSON Progress Frames| UI_Mon
    Router_Sim -->|GET /{id}/status| UI_Mon
    Router_Sim -->|GET /{id}/results| UI_Dash
    Router_Dash -->|Read Aggregates| Model_Res
    Router_Dash --> UI_Dash
    UI_Spec -->|POST /run-gbn, /run-leaky-bucket| Router_Sim
    Router_Sim --> GBN_Runner
    Router_Sim --> LB_Runner
    GBN_Runner --> Protocols
    LB_Runner --> Shaper
```

---

## 3. Physical Transmission Accounting Verification

Inspection of `backend/app/simulation/metrics.py`, `event_recorder.py`, `topology.py`, and `protocols/tcp_like.py` establishes the exact mathematical accounting framework:

### 3.1 Formal Definitions of Packet and Attempt Concepts

| Concept | Code-Level Definition & Location | Value in Official Benchmark | Meaning |
| :--- | :--- | :--- | :--- |
| **Unique Packets Generated** | `len(recorder.unique_generated)`<br/>(`event_recorder.py:64-69`) | **11,998 unique packets** | Distinct datagram keys `(src_node, seq_num)` created for the first time (`is_retransmit=False`). |
| **Original Transmission Attempts** | `sum(1 for e in events if e.event_type == 'generate')`<br/>(`event_recorder.py:80`) | **11,998 attempts** | Initial transmission processes dispatched across the access network. |
| **Queue-Rejected Attempts** | `len(recorder.dropped_packets)`<br/>(`topology.py:69-75`) | **93 attempt drops** | Packets that arrived when `queue_len >= queue_capacity`. Rejected at queue threshold; **never acquired channel resource, never serialized, and transmitted 0 bytes**. |
| **Retransmission Attempts** | `recorder.retransmissions_count`<br/>(`tcp_like.py:204-230`, `event_recorder.py:71`) | **93 retransmissions** | Dispatched retry datagrams (`is_retransmit=True`) after drop detection or timeout. |
| **Total Transmission Attempts** | `recorder.total_transmissions`<br/>(`event_recorder.py:76`) | **12,091 total attempts** | Sum of original attempts ($11,998$) plus retransmission attempts ($93$). |
| **Successfully Serialized Packets** | Cumulative calls to `record_dequeue`<br/>(`topology.py:91`, `event_recorder.py:107-109`) | **11,998 packets** | Packets that acquired `tx_resource`, underwent physical serialization delay ($\frac{\text{size} \times 8}{\text{bw}}$), and dequeued onto the physical link wire. |
| **Unique Packets Delivered** | `len(recorder.unique_delivered)`<br/>(`event_recorder.py:149-156`) | **11,998 unique packets** | Distinct datagram keys accepted by LMS server application layer (`STATE_DELIVERED`). |
| **Terminally Lost Packets** | `len(recorder.unique_dropped)`<br/>(`event_recorder.py:186-188, 238`) | **0 packets** | Unique datagram keys ending simulation in `STATE_DROPPED` without successful delivery. |
| **Packets Remaining in Transit** | `len(recorder.unique_in_transit)`<br/>(`event_recorder.py:241`) | **0 packets** | Unique datagram keys in `STATE_IN_TRANSIT` (in queue buffer or wire propagation) at completion. |

### 3.2 Mathematical Proof: Why 12,091 Attempts Result in 11,998 Serialized & Delivered Packets

In `topology.py` (`NetworkLink.transmit`, lines 69–91):
1. An incoming attempt first encounters the DropTail queue buffer check:
   ```python
   if queue_len >= self.queue_capacity:
       if self.recorder:
           self.recorder.record_drop(pkt, "queue_overflow", env.now, queue_len)
       if on_dropped:
           on_dropped(pkt, "queue_overflow")
       return False
   ```
2. When the queue is full ($50\text{ packets}$), `return False` terminates the transmission process **before** `tx_resource.request()` is reached. No serialization delay occurs, and `record_dequeue` is **not** called.
3. Therefore:
   $$\text{Successfully Serialized Packets} = \text{Total Attempts} - \text{Queue-Rejected Attempts}$$
   $$\text{Successfully Serialized Packets} = 12,091 - 93 = 11,998\text{ packets}$$
4. Every one of the 11,998 packets that passed into `tx_resource` dequeued onto the physical link wire and reached the server interface ($0\%$ channel wire bit errors).
5. At the application layer, each of the 11,998 unique packets was received and acknowledged.
6. **Byte Accounting Verification**:
   - $\text{Total Delivered Bytes} = 11,998 \times 512\text{ bytes} = 6,142,976\text{ bytes}$.
   - $\text{Total Link Transmitted Bytes} = 11,998 \times 512\text{ bytes} = 6,142,976\text{ bytes}$.
   - Formula in `metrics.py` lines 43 & 47:
     $$\text{Goodput} = \frac{6,142,976\text{ bytes} \times 8.0}{5.0490\text{ s} \times 1000} = 9,733.29\text{ Kbps}$$
     $$\text{Link Throughput} = \frac{6,142,976\text{ bytes} \times 8.0}{5.0490\text{ s} \times 1000} = 9,733.29\text{ Kbps}$$
   - Both metrics equal $9,733.29\text{ Kbps}$ because every byte that physically crossed the channel wire was delivered to the LMS server.

---

## 4. Packet Conservation for Incomplete Simulations

### 4.1 The Complete Conservation Equation
The fundamental discrete-event conservation law implemented in `backend/app/simulation/event_recorder.py` (lines 244–272) is:
$$\text{unique\_generated} = \text{unique\_delivered} + \text{unique\_dropped} + \text{unique\_in\_transit}$$

It is mathematically invalid to assume this always reduces to $\text{Sent} = \text{Received} + \text{Dropped}$. If a simulation terminates before queues and links have fully drained, packets remain in flight.

### 4.2 Handling In-Transit Packets
**Rule**: In-transit packets (`STATE_IN_TRANSIT`) must **never** be classified as terminal dropped packets. They were not rejected by a queue or corrupted on a wire; they are simply pending in buffers or physical transit when the simulation clock halted.

### 4.3 Three Concrete Scenarios & Mapping Guide

```
+-------------------------------------------------------------------------------------------------------------------------+
| Scenario                           | Invariant Breakdown                        | Database / API Mapping                |
+-------------------------------------------------------------------------------------------------------------------------+
| 1. Fully Drained Simulation        | Generated: 11,998                          | Result.packets_sent     = 11,998      |
|    (Official Online Classroom)     | Delivered: 11,998                          | Result.packets_received = 11,998      |
|                                    | Terminally Dropped: 0                      | Result.packets_dropped  = 0           |
|                                    | In-Transit: 0                              | packets_in_transit      = 0           |
|                                    | 11,998 = 11,998 + 0 + 0 (100% PDR, 0% Loss)| PDR: 100.0%, Loss: 0.0%               |
+-------------------------------------------------------------------------------------------------------------------------+
| 2. Simulation with In-Transit      | Generated: 1,000                           | Result.packets_sent     = 1,000       |
|    Packets (Abrupt stop / no drain)| Delivered: 920                             | Result.packets_received = 920         |
|                                    | Terminally Dropped: 30                     | Result.packets_dropped  = 30          |
|                                    | In-Transit: 50                             | packets_in_transit      = 50          |
|                                    | 1,000 = 920 + 30 + 50                      | PDR: 92.0%, Loss: 3.0%, In-Transit: 5%|
|                                    | (In-transit packets are NOT dropped)       | Identity: Sent = Recv + Drop + Transit|
+-------------------------------------------------------------------------------------------------------------------------+
| 3. Simulation with Permanent Loss  | Generated: 5,000                           | Result.packets_sent     = 5,000       |
|    (UDP CBR queue overflow)        | Delivered: 4,200                           | Result.packets_received = 4,200       |
|                                    | Terminally Dropped: 800                    | Result.packets_dropped  = 800         |
|                                    | In-Transit: 0 (after drain)                | packets_in_transit      = 0           |
|                                    | 5,000 = 4,200 + 800 + 0                    | PDR: 84.0%, Loss: 16.0%               |
|                                    | (All dropped packets permanently lost)     | Identity: Sent = Recv + Drop          |
+-------------------------------------------------------------------------------------------------------------------------+
```

### 4.4 Mapping Recommendation
- `Result.packets_sent` = `metrics["packets_sent"]` (Unique datagrams generated).
- `Result.packets_received` = `metrics["packets_received"]` (Unique datagrams delivered).
- `Result.packets_dropped` = `metrics["lost_packets"]` (Terminal unrecovered datagram losses).
- `packets_in_transit` = `metrics["packets_in_transit"]` (Recorded in `Result.summary_notes` and as an optional additive field in `ResultResponse`).
- In `Result.summary_notes`:
  If $\text{packets\_in\_transit} > 0$, explicitly state:
  `"... Finished with 50 packets in transit (uncompleted deliveries). Terminal loss: 30 packets."`

---

## 5. Strict Backward Compatibility of `time_series_json`

### 5.1 Inspection of Codebase Contracts
1. **Frontend Contract** (`frontend/src/pages/ExperimentResults.tsx:190, 392, 425`):
   - `const timeSeries = res?.time_series || [];`
   - `<AreaChart data={timeSeries}>` and `<LineChart data={timeSeries}>`.
   - Recharts requires `data` to be a **JavaScript Array of bucket objects** (`[{time, throughput_kbps, delay_ms, packets_dropped}, ...]`).
2. **FastAPI Pydantic Contract** (`backend/app/schemas.py:68`):
   - `time_series: Optional[List[Dict[str, Any]]] = None`.
   - Pydantic enforces that `time_series` is a `list`.
3. **API Deserialization Contract** (`backend/app/api/experiments.py:23`):
   - `ts = json.loads(exp.result.time_series_json) if exp.result.time_series_json else []`.
   - `ResultResponse(..., time_series=ts)`.

### 5.2 Architectural Ruling: No Dictionary Wrapping
**`Result.time_series_json` MUST remain a plain JSON array of `TimeSeriesPoint` bucket dictionaries.**
Wrapping it in `{"time_series": [...], "metadata": {...}}` would immediately cause:
- Pydantic `ValidationError: Input should be a valid list` in `experiments.py`.
- Frontend Recharts charting failure (`timeSeries.length` / array iteration errors).

### 5.3 Backward-Compatible Metadata Preservation
Extended metadata (`seed`, `physical_attempt_drops`, `retransmissions`, `total_transmissions`, `packets_in_transit`, `conservation_passed`) will be preserved through:
1. **Human-Readable & Machine-Parseable Header in `Result.summary_notes`**:
   `"[Audit: seed=42, attempt_drops=93, retransmissions=93, in_transit=0, conservation=passed] SimPy simulation completed. Delivered 11998/11998 unique packets (100.0% PDR, 0.0% loss)."`
2. **Non-Breaking Additive Fields on `ResultResponse` (Optional)**:
   In `backend/app/schemas.py`, add optional top-level fields with default `None`:
   ```python
   retransmissions: Optional[int] = None
   physical_attempt_drops: Optional[int] = None
   packets_in_transit: Optional[int] = None
   seed: Optional[int] = None
   conservation_passed: Optional[bool] = None
   ```
   These fields are populated dynamically in `format_experiment_response` from the result object without altering the SQLite schema.
3. **Schema Impact**: **NEITHER** database schema change nor frontend breaking change is required.

---

## 6. Deterministic Random Seed Handling & Reproducibility

### 6.1 Three-Tier Seed Assignment Logic
1. **Explicit Official Benchmark**:
   - Fixed seed: **`seed = 42`**.
   - Applied **only** when explicitly designated as the official benchmark (e.g. `is_official_benchmark=True` or `seed=42` explicitly requested).
2. **User-Specified Custom Simulation**:
   - `SimulationConfigCreate` accepts `seed: Optional[int] = None`.
   - If the user provides a seed (e.g. `seed=12345`), the engine uses that seed directly.
   - **No silent forcing**: Selecting scenario "Online Classroom" for a custom simulation will **not** force seed 42 unless explicitly requested.
3. **Unseeded Custom Simulation**:
   - If `seed is None`, a cryptographically sound random 32-bit integer is generated using Python's `secrets` module:
     ```python
     import secrets
     seed = secrets.randbits(32)
     ```
   - This prevents timestamp collisions across rapid concurrent simulation triggers.

### 6.2 Conditions Required for Bit-for-Bit Reproducibility
An experiment rerun will yield bit-for-bit identical results if and only if:
1. The identical 32-bit `seed` integer is used.
2. The identical scenario parameters (`scenario_name`, `num_students`, `protocol`, `bandwidth`, `delay`, `queue_capacity`, `simulation_duration`, `traffic_intensity`, `window_size`) are applied.
3. The identical SimPy engine version (`SimPy 4.1.1`) and CPython PRNG implementation are used.
4. Discrete events are processed in deterministic timestamp-priority sequence.

---

## 7. Dynamic Simulator Readiness Verification

### 7.1 Dry Instantiation vs. Genuine Execution
Inspection of `SimPySimulationEngine.__init__` revealed that it constructs the topology and recorder, but **does not instantiate or start protocol agents** (`_setup_agents()` is only invoked inside `run()`). Therefore, dry instantiation alone cannot detect agent generator bugs or event loop failures.

### 7.2 The 2.73 ms Micro Smoke Test
A genuine operational check requires running a micro discrete-event simulation:
```python
engine = SimPySimulationEngine(
    num_students=1,
    simulation_duration=0.05,
    bandwidth="10 Mbps",
    delay="1ms",
    seed=1
)
metrics = engine.run()
assert metrics["conservation_passed"] is True
```
- **Live Test Execution**: Executed directly with `backend\venv\Scripts\python.exe`.
- **Result**: Successfully delivered 4 packets, verified mathematical conservation, and completed in **2.73 milliseconds**.

### 7.3 Cached Startup Verification in Lifespan
To avoid adding 2.73 ms to every incoming HTTP `/api/health` request:
1. Run `check_simulation_engine()` **once during FastAPI startup** in `lifespan(app)` (`backend/app/main.py`).
2. Cache the result in a module-level dictionary: `_CACHED_SIMULATOR_STATUS`.
3. Subsequent calls to `/api/health` and `/api/system/status` return the cached status in $O(1)$ time ($< 0.05\text{ ms}$).
4. Provide a refresh parameter (e.g., `POST /api/system/verify-engine`) if manual re-testing is requested.

### 7.4 Decoupling Application Liveness from Simulator Readiness
- **Application Liveness (`/api/health`)**:
  - `status: "online"` if FastAPI is responding and SQLite executes `SELECT 1`.
- **Simulator Readiness (`/api/health` $\rightarrow$ `simulator`)**:
  - `operational: true`, `engine: "SimPy Discrete-Event Simulation Engine"`, `version: "4.1.1"`.
  - If SimPy fails the smoke test, liveness remains `"online"` (API is healthy), while `simulator.operational` reports `false` with the specific diagnostic.

---

## 8. Verified Backend Integration Interfaces

Every interface below has been inspected directly in the Stage 2 source code:

1. **`SimPySimulationEngine`** (`backend/app/simulation/engine.py:62-90`):
   ```python
   class SimPySimulationEngine:
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
           enable_leaky_bucket: bool = False,
           bucket_capacity_bytes: int = 50000,
           leak_rate: Any = None,
           seed: Optional[int] = 42
       ) -> None: ...
       def run(self) -> Dict[str, Any]: ...
   ```
2. **`calculate_metrics()`** (`backend/app/simulation/metrics.py:21-31`):
   `calculate_metrics(recorder, simulation_duration, data_rate_bps, actual_duration) -> Dict[str, Any]`.
3. **`GoBackNAgent`** (`backend/app/simulation/protocols/gbn.py:24-55`):
   `GoBackNAgent(env, src_node, dst_node, forward_link, return_link, recorder, packet_id_counter, simulation_duration, window_size, timeout_duration, packet_size, total_packets_to_send, rng)`.
4. **`LeakyBucketQueue`** (`backend/app/simulation/protocols/leaky_bucket.py:24-39`):
   `LeakyBucketQueue(env, capacity_bytes, leak_rate_bps, downstream_link, recorder)`.
5. **`NetworkLink`** (`backend/app/simulation/topology.py:21-44`):
   `NetworkLink(env, bandwidth_bps, propagation_delay_sec, queue_capacity, recorder, loss_rate, rng)`.
6. **`run_simulation_task`** (`backend/app/services/simulation_service.py:560`):
   `async def run_simulation_task(experiment_id: int, db_factory: Callable[[], Session]) -> None`.

---

## 9. Threading, Concurrency, and Database Safety

1. **Non-Blocking Execution via `asyncio.to_thread()`**:
   - `metrics = await asyncio.to_thread(engine.run)` executes CPU-bound SimPy simulation in Python's default threadpool.
   - The main asyncio event loop continues servicing WebSocket heartbeats and HTTP requests with zero latency.
2. **Thread Safety**:
   - `SimPySimulationEngine` creates zero shared global state; each simulation run has its own isolated `simpy.Environment`, `CampusTopology`, `EventRecorder`, and PRNG instance.
3. **Database Session Lifecycle**:
   - `trigger_simulation()` passes `SessionLocal`.
   - `run_simulation_task` creates an independent session (`db = db_factory()`), commits results upon success, and guarantees closure in a `finally` block.
4. **Concurrency Limiting**:
   - An `asyncio.Semaphore(value=3)` throttles simultaneous simulations to prevent CPU starvation.
   - Batch suites retain `analysis_lock = asyncio.Lock()`.

---

## 10. Frontend Compatibility Verification

| Frontend Interface / Component | Expected TypeScript Definition | SimPy / Backend Integration Source | Compatibility Status |
| :--- | :--- | :--- | :--- |
| **`TimeSeriesPoint`** (`types/index.ts:1-6`) | `time`, `throughput_kbps`, `delay_ms`, `packets_dropped` | SimPy 1-second interval bucket dictionaries. | **100% Exact Match** |
| **`Result`** (`types/index.ts:8-21`) | 10 metric fields including `throughput_kbps`, `packet_loss_percent`, `packet_delivery_ratio`, `average_delay_ms`, `packets_sent`, `packets_received`, `packets_dropped` | `Result` SQLite model and `ResultResponse` schema. | **100% Exact Match** |
| **`Experiment`** (`types/index.ts:23-48`) | All metadata, status, and nested result fields | `Experiment` SQLite model and `ExperimentResponse` schema. | **100% Exact Match** |
| **`SimulationStatusResponse`** (`types/index.ts:173-187`) | All stage progress, logs, and status fields | `active_simulations[id]` and Pydantic model. | **100% Exact Match** |
| **`GbnTracePoint`** (`types/index.ts:75-80`) | `time`, `seq_num`, `event`, `is_retransmit` | `GoBackNAgent` event logs mapped from `EventRecorder`. | **100% Exact Match** |
| **`LeakyBucketComparisonPoint`** (`types/index.ts:93-99`) | `time`, `unshaped_throughput`, `shaped_throughput`, `unshaped_drops`, `shaped_drops` | Paired SimPy simulation series. | **100% Exact Match** |
| **`SimulationMonitor.tsx` Stages** (`lines 21-40`) | `preparing`, `generating`, `running`, `processing`, `calculating`, `completed` | Telemetry stages match regex normalizer. | **100% Exact Match** |

---

## 11. Updated Phase 3A Implementation Scope

### File to Modify
- `backend/app/services/simulation_service.py`

### Specific Scope of Phase 3A
1. **Module Imports**: Import Stage 2 engine components (`SimPySimulationEngine`, `GoBackNAgent`, `LeakyBucketQueue`, `NetworkLink`).
2. **`execute_simpy_simulation(experiment_id, db_factory)`**:
   - Query `Experiment` by ID.
   - Emit 6 telemetry stages (`preparing` 10%, `generating` 25%, `running` 50%, `processing` 75%, `calculating` 90%, `completed` 100%).
   - Offload CPU simulation to worker threadpool via `await asyncio.to_thread(engine.run)`.
   - Map parameters: seed resolution (42 for official benchmark, user seed if provided, `secrets.randbits(32)` if unseeded).
   - Persist `Result` row in SQLite with plain-array `time_series_json`, terminal drop mapping, and audit metadata in `summary_notes`.
   - Update `Experiment.status = "completed"`.
3. **Replace `run_simulation_task`**: Wire directly to `execute_simpy_simulation`.
4. **Implement Specialized SimPy Runners**:
   - `run_gbn_simulation()`: Executes `GoBackNAgent` across forward/return links and returns `trace_points: List[GbnTracePoint]`.
   - `run_leaky_bucket_simulation()`: Executes paired unshaped vs shaped runs and returns `comparison_series: List[LeakyBucketComparisonPoint]`.
   - `run_tcp_udp_comparison_batch()`: Executes SimPy runs across 256K, 512K, 1M, 2M, 5M rates.
   - `run_full_analysis_pipeline()`: Executes sequential preset benchmarks.
5. **Dynamic Readiness Function `check_simulation_engine()`**:
   - Implements the 3-tier check with 2.73 ms smoke test and startup caching.

---

## 12. Acceptance Criteria & Test Plan for Phase 3A

To accept Phase 3A as complete, the following tests must be executed and pass:
1. **Existing Unit Test Suite**: `backend\venv\Scripts\python -m pytest backend/tests/test_simpy_engine.py` (21/21 PASS).
2. **Phase 3A Integration Test Script**:
   - Execute `run_simulation_task` for the official Online Classroom benchmark on a test SQLite database:
     - Verify status transitions to `"completed"`.
     - Verify `Result.packets_sent == 11998`, `Result.packets_received == 11998`, `Result.packets_dropped == 0`.
     - Verify `Result.throughput_kbps == 9733.29` ($\pm 5.0$).
     - Verify `json.loads(Result.time_series_json)` is a plain `list` of bucket objects.
     - Verify `summary_notes` contains audit metadata.
   - Execute `run_gbn_simulation()` and verify returned `trace_points` format.
   - Execute `run_leaky_bucket_simulation()` and verify returned `comparison_series` format.
   - Execute `check_simulation_engine()` and verify `operational == True`.
3. **Backend Regression Test Suite**: `backend\venv\Scripts\python -m pytest backend/tests/test_backend.py` (31/31 PASS).

---

## 13. Categorization: Facts, Recommendations & Limitations

### 13.1 Verified Facts
- Dropped queue attempts transmit 0 bytes on the wire; successfully serialized retransmissions transmit bytes; Goodput = Link Throughput = $9,733.29\text{ Kbps}$ in the official benchmark is mathematically verified.
- The 2.73 ms micro smoke test successfully executes environment scheduling, link transmission, agent feedback, and conservation audit.
- Recharts and Pydantic require `time_series_json` to be a plain list.

### 13.2 Technical Recommendations
- Map `Result.packets_dropped` to terminal unrecovered losses ($0$) and preserve attempt drops ($93$) in `summary_notes`.
- Use `secrets.randbits(32)` for unseeded custom runs; reserve seed 42 strictly for the official benchmark.
- Cache simulator readiness during application startup in `lifespan`.

### 13.3 Remaining Limitations
- Single-machine CPython GIL limits threadpool execution to asynchronous non-blocking concurrency rather than multi-core scaling. For campus simulations ($N \le 250$), this is sufficient ($< 1.5\text{ s}$ per run).
- Frontend banner in `Dashboard.tsx` checks `!liveSummary?.is_ns2_available`. In Phase 3D, we can evaluate updating this to check `!liveSummary?.simulator_operational` if the user approves frontend modifications.

---

## 14. Readiness Decision

**DECISION: READY FOR PHASE 3A IMPLEMENTATION.**

All technical questions have been verified against source code. Architectural contracts, physical transmission accounting, packet conservation, backward compatibility, and readiness verification are mathematically consistent and frozen.

*Awaiting your explicit approval to begin Phase 3A implementation.*
