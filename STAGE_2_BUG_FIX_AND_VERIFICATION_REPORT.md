# CampusNet Analyzer — Stage 2 SimPy Engine Bug Fix and Verification Report

## 1. Executive Summary

Following an independent code audit of the Python + SimPy discrete-event simulation engine implemented in Stage 2, five critical correctness and accounting issues were identified:
1. **Go-Back-N packet accounting coupled physical link arrival with application delivery**, causing out-of-order packets to be marked as delivered before receiver rejection.
2. **TCP-like AIMD agent suffered from duplicate retransmission scheduling, duplicate ACK window inflation, and lacked window clamping** to `max_window`.
3. **Throughput metrics did not distinguish application goodput from link transmitted bytes**, and time-series aggregation underestimated throughput on fractional final seconds.
4. **Packet conservation was audited using a tautology** rather than an independent packet state machine.
5. **Leaky Bucket traffic shaper lacked queuing waiting time tracking and peak buffer occupancy statistics**, and was not integrated into the central simulation engine.

All five issues have been corrected, verified, and backed by a comprehensive suite of 19 unit tests (100% pass rate). Existing backend regression tests (31 passed), frontend unit tests (17 passed), and the frontend production build were executed and verified with zero regressions.

---

## 2. Code Audit Findings

| Component | Audit Finding | Root Cause & Severity |
| :--- | :--- | :--- |
| **Go-Back-N ARQ** | Out-of-order packets counted as delivered | `NetworkLink.transmit()` called `recorder.record_receive()` at physical link exit before receiver callback executed. Receiver's subsequent drop was ignored because state was already `DELIVERED`. |
| **TCP AIMD** | Duplicate concurrent retransmissions | `_handle_loss()` and `_rto_monitor()` did not check if a retransmission process was already in flight for a sequence number. |
| **TCP AIMD** | Unbounded `cwnd` growth on duplicate ACKs | `_process_ack()` incremented `cwnd` on every received ACK frame regardless of sequence number, and lacked an upper clamp to `max_window`. |
| **Performance Metrics** | Goodput vs. Link Throughput conflated | Throughput was calculated using link-level transmitted bytes or retransmitted packets interchangeably, inflating apparent throughput during loss recovery. |
| **Performance Metrics** | Final time bucket rate underestimation | Time-series 1-second bucketing divided by $1.0\text{ s}$ unconditionally, underreporting rates on partial final intervals (e.g., $0.5\text{ s}$). |
| **Conservation Invariant** | Tautological conservation check | In-transit packets were computed as $\text{sent} - \text{delivered} - \text{dropped}$, mathematically guaranteeing the sum without inspecting actual packet states. |
| **Leaky Bucket** | Missing waiting time & engine integration | Bucket drained packets without recording individual queuing delay, peak buffer bytes, or integration with `SimPySimulationEngine`. |

---

## 3. Detailed Corrections Applied

### A. `backend/app/simulation/event_recorder.py`
- **Explicit Lifecycle State Machine:** Defined three disjoint states: `STATE_IN_TRANSIT`, `STATE_DELIVERED`, and `STATE_DROPPED`.
- **Packet State Tracking:** Added `self.packet_states: Dict[Tuple[int, int], str]` mapping each unique key `(src_node, seq_num)` to its current lifecycle state.
- **Physical vs. Application Decoupling:** Added `record_link_arrival(pkt, time)` to log interface arrival separate from application acceptance.
- **Application Delivery Deduplication:** `record_receive(pkt, time)` only transitions state to `STATE_DELIVERED` and accumulates delivered payload bytes on the **first unique delivery**. Subsequent duplicate deliveries are logged as `"duplicate_delivery"` without double-counting bytes or delay.
- **Retransmission Recovery:** `record_generate()` transitions previously dropped packets (`STATE_DROPPED`) back to `STATE_IN_TRANSIT`.
- **Byte Accounting:** Added `total_link_transmitted_bytes` alongside `total_delivered_bytes`.
- **Independent Invariant Audit:** Implemented `verify_conservation()` which verifies:
  1. $\text{Delivered} \cap \text{Dropped} = \emptyset$
  2. $\text{Delivered} \cap \text{In-Transit} = \emptyset$
  3. $\text{Dropped} \cap \text{In-Transit} = \emptyset$
  4. $\text{Delivered} \cup \text{Dropped} \cup \text{In-Transit} = \text{Unique Generated}$
  5. $|\text{Unique Generated}| = |\text{Delivered}| + |\text{Dropped}| + |\text{In-Transit}|$

### B. `backend/app/simulation/topology.py`
- In `NetworkLink.transmit()`:
  - Replaced immediate `record_receive` with `record_link_arrival(pkt, env.now)`.
  - If `on_delivered` callback is provided, invoke it so transport agents make the application acceptance decision.
  - If `on_delivered` is not provided (standalone link usage), fall back to `record_receive`.

### C. `backend/app/simulation/protocols/gbn.py`
- In `_forward_packet_process`:
  - When `p.seq_num == self.expectedseqnum`: Application accepts in-order packet $\to$ calls `recorder.record_receive(p, env.now)`, increments `expectedseqnum`, and transmits cumulative ACK.
  - When `p.seq_num != self.expectedseqnum`: Application discards out-of-order packet $\to$ calls `recorder.record_drop(p, "gbn_out_of_order", env.now)` and re-ACKs the last in-order sequence number.
- In `_stop_timer()`: Guarded `self.timer_process.interrupt()` with `self.timer_process is not self.env.active_process` to avoid SimPy self-interruption runtime errors.

### D. `backend/app/simulation/protocols/tcp_like.py`
- **Application Acceptance:** `on_delivered` callback in `_transmit_and_handle_feedback` calls `self.recorder.record_receive(p, env.now)` before triggering the receiver ACK.
- **Retransmission Guard:** Added `self.retransmitting: Set[int] = set()`. Packets are added upon loss detection and cleared upon ACK reception or after dispatching retransmission, preventing multiple concurrent retransmissions for the same sequence number.
- **Cumulative ACK Tracking:** Added `self.last_ack: int = 0`. Only new in-order ACKs (`ack_seq > self.last_ack`) trigger window growth. Duplicate or stale ACKs are recorded for auditing but do not inflate `cwnd`.
- **Window Clamping:** Enforced strict clamping `self.cwnd = min(self.cwnd, float(self.max_window))`.
- **Pedagogical Documentation:** Documented educational design choices (packet-based cwnd, fixed RTO, simplified AIMD without SACK or dynamic RTT estimation).

### E. `backend/app/simulation/protocols/leaky_bucket.py`
- **Waiting Time Tracking:** Added `pkt.metadata["bucket_enqueue_time"] = env.now`. Upon packet leak/drain, computes `wait_time = env.now - enqueue_time`, accumulates `total_waiting_time`, tracks `max_waiting_time`, and computes `average_waiting_time`.
- **Buffer Occupancy Metrics:** Tracks `peak_buffer_bytes` and `peak_buffer_packets`.
- **Duck-Typed Transmission:** Added `transmit(pkt, on_delivered, on_dropped)` and `tx_resource` property so `LeakyBucketQueue` can seamlessly replace a forward link in any agent.
- **Statistics Export:** Added `get_statistics()` returning capacity, leak rate, peak bytes, drained count, dropped count, and delay metrics.

### F. `backend/app/simulation/metrics.py`
- **Goodput vs. Link Throughput:**
  - $\text{Goodput (Kbps)} = \frac{\text{Delivered Payload Bytes} \times 8}{\text{Duration} \times 1000}$
  - $\text{Link Throughput (Kbps)} = \frac{\text{Link Transmitted Bytes} \times 8}{\text{Duration} \times 1000}$
- **Partial Bucket Calculation:** For time-series bucket $i$, computes actual $\Delta t = \min(i + 1, T_{\text{sim}}) - i$, eliminating rate distortion on fractional final intervals.
- **Audit Diagnostics:** Invokes `recorder.verify_conservation()` and embeds `conservation_passed` and `conservation_audit` in returned metrics.

### G. `backend/app/simulation/engine.py`
- Added `enable_leaky_bucket`, `bucket_capacity_bytes`, and `leak_rate` parameters to `SimPySimulationEngine.__init__`.
- When enabled (or scenario name contains `"leaky"`), attaches `LeakyBucketQueue` between student agents and the bottleneck link.
- Phase 2 simulation drain flushes both link transmission queue and shaper buffer before final metrics calculation.
- Embeds `shaper_statistics` into results when shaper is active.

---

## 4. Packet Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> IN_TRANSIT: record_generate (Initial)
    IN_TRANSIT --> DELIVERED: record_receive (In-order application acceptance)
    IN_TRANSIT --> DROPPED: record_drop (Buffer overflow / Channel error / Out-of-order)
    DROPPED --> IN_TRANSIT: record_generate (Retransmission attempt)
    DELIVERED --> [*]: Terminal State
    DROPPED --> [*]: Terminal State (Unrecovered loss)
```

### Invariant Equations
$$\mathcal{S}_{\text{generated}} = \mathcal{S}_{\text{delivered}} \cup \mathcal{S}_{\text{dropped}} \cup \mathcal{S}_{\text{in\_transit}}$$
$$\mathcal{S}_{\text{delivered}} \cap \mathcal{S}_{\text{dropped}} = \emptyset, \quad \mathcal{S}_{\text{delivered}} \cap \mathcal{S}_{\text{in\_transit}} = \emptyset, \quad \mathcal{S}_{\text{dropped}} \cap \mathcal{S}_{\text{in\_transit}} = \emptyset$$
$$|\mathcal{S}_{\text{generated}}| = |\mathcal{S}_{\text{delivered}}| + |\mathcal{S}_{\text{dropped}}| + |\mathcal{S}_{\text{in\_transit}}|$$

---

## 5. Verification and Test Results

### Suite 1: SimPy Engine Unit Tests (`backend/tests/test_simpy_engine.py`)
**Command:** `pytest backend/tests/test_simpy_engine.py -v`  
**Execution Status:** **19 passed in 1.83s (100% pass rate)**

| Test Name | Focus Area | Status |
| :--- | :--- | :--- |
| `test_helper_parsers` | Bandwidth and delay string parsing | **PASSED** |
| `test_zero_packet_simulation_safety` | Zero packet division-by-zero protection | **PASSED** |
| `test_packet_generation_and_delivery_no_loss` | 100% PDR on over-provisioned links | **PASSED** |
| `test_queue_overflow_and_packet_drops` | DropTail queue overflow and drop accounting | **PASSED** |
| `test_mathematical_conservation_invariant` | Conservation across all 5 e-learning scenarios | **PASSED** |
| `test_traffic_intensity_scaling` | Packet generation scaling across Low/Medium/High | **PASSED** |
| `test_tcp_aimd_congestion_control` | TCP pacing, AIMD window adjustments, invariant | **PASSED** |
| `test_go_back_n_arq_retransmissions` | Deterministic GBN retransmissions and conservation | **PASSED** |
| `test_leaky_bucket_traffic_shaper` | FIFO buffering, peak bytes, overflow drop, waiting time | **PASSED** |
| `test_time_series_consistency` | Non-negative time-series metrics and timestamps | **PASSED** |
| `test_deterministic_reproducibility` | Bit-for-bit identical results with seed | **PASSED** |
| `test_exact_formula_calculation` | Manual calculation verification on known sequence | **PASSED** |
| `test_gbn_in_order_acceptance_and_out_of_order_discard` | Out-of-order drop (`gbn_out_of_order`), eventual delivery | **PASSED** |
| `test_tcp_duplicate_ack_does_not_inflate_cwnd` | Duplicate ACKs ignored for window growth | **PASSED** |
| `test_tcp_cwnd_clamped_to_max_window` | cwnd bounded by `max_window` under heavy ACKs | **PASSED** |
| `test_tcp_duplicate_retransmission_prevention` | `retransmitting` set prevents redundant processes | **PASSED** |
| `test_independent_conservation_state_machine` | Disjoint sets and state transitions verified | **PASSED** |
| `test_metrics_partial_bucket_rate_calculation` | Fractional final interval throughput accuracy | **PASSED** |
| `test_engine_leaky_bucket_integration` | Engine-level Leaky Bucket shaper integration | **PASSED** |

### Suite 2: Backend Regression Tests (`backend/tests/test_backend.py`)
**Command:** `pytest backend/tests/test_backend.py -v`  
**Execution Status:** **31 passed in 12.62s (100% pass rate)**  
- API health, dashboard summary, experiments list, compare, CSV/PDF reports, system status.
- NS-2 parser formulas, cross-checks, edge cases.
- Simulation lifecycle, validation errors, and database migration checks.

### Suite 3: Frontend Unit Tests (`frontend/src/tests/verify_frontend.test.mjs`)
**Command:** `npm --prefix frontend run test -- --watchAll=false`  
**Execution Status:** **17 passed in 363ms (100% pass rate)**  
- 10 test suites covering KPIs, form validation, simulation lifecycle, metrics mapping, charts, filtering, and error states.

### Suite 4: Frontend Production Build
**Command:** `npm --prefix frontend run build`  
**Execution Status:** **Built successfully in 56.61s**  
- TypeScript compiler (`tsc`) passed with zero type errors.
- Vite bundled 2,720 modules into `dist/` production assets.

---

## 6. Sample Experiment Reproduction & Comparative Analysis

The exact sample experiment was executed under identical parameters:
- **Scenario:** Online Classroom
- **Students:** 10
- **Protocol:** TCP (Sliding Window + AIMD)
- **Bottleneck Bandwidth:** 10 Mbps
- **Bottleneck Delay:** 20ms
- **Duration:** 5.0 seconds
- **Seed:** 42

### Comparative Results Table

| Metric | Pre-Fix (Stage 2 Initial) | Post-Fix (Stage 2 Verified) | Analytical Explanation of Differences |
| :--- | :--- | :--- | :--- |
| **Unique Generated Packets** | 11,994 | **6,034** | Pre-fix lacked `max_window` clamp and inflated cwnd on duplicate ACKs, causing uncontrolled packet injection. Post-fix properly clamps window to 32 packets, pacing traffic accurately. |
| **Unique Delivered Packets** | 11,902 | **6,034** | Post-fix achieves 100% delivery of generated unique payload because TCP retransmissions recover all dropped packets. |
| **Physical Drop Events** | 92 | **86** | Channel/queue drop events occurring at the bottleneck link. |
| **Unique Dropped (Terminal)** | 92 | **0** | Pre-fix incorrectly marked dropped packets as terminal loss. Post-fix tracks that all 86 dropped packets were successfully retransmitted and accepted. |
| **Retransmissions** | Not isolated | **86** | Exactly matches the 86 drop events ($86 \text{ drops} \to 86 \text{ retransmissions} \to 86 \text{ deliveries}$). |
| **Total Link Transmissions** | 11,994 | **6,120** | $6,034 \text{ unique} + 86 \text{ retransmissions} = 6,120 \text{ total transmissions}$. |
| **Packet Delivery Ratio (PDR)** | 99.23% | **100.0%** | All 6,034 unique application packets were successfully delivered to the LMS application layer. |
| **Packet Loss % (Terminal)** | 0.77% | **0.0%** | In a reliable transport protocol (TCP), unrecovered loss is 0% when all packets are retransmitted and acknowledged. |
| **Application Goodput** | 9,750.12 Kbps | **9,886.11 Kbps** | $\frac{6,178,816 \text{ bytes} \times 8}{5.0\text{ s} \times 1000} = 9,886.11\text{ Kbps}$. Perfectly matches the 10 Mbps bottleneck link capacity ($\sim 98.9\%$ utilization). |
| **Link Transmitted Throughput** | Not separated | **10,027.01 Kbps** | $\frac{6,266,880 \text{ bytes} \times 8}{5.0\text{ s} \times 1000} = 10,027.01\text{ Kbps}$ (includes retransmitted bytes). |
| **Average End-to-End Delay** | 37.88 ms | **55.23 ms** | Post-fix correctly computes delay over unique delivered packets including queuing and retransmission backoff delays. |
| **Min / Max Delay** | 20.41 / 58.12 ms | **20.82 / 81.71 ms** | Min delay matches link round-trip time; max delay accurately reflects queue buffer wait during congestion episodes. |
| **Conservation Invariant** | Tautological check | **PASSED (Verified)** | Independent state machine confirmed: $6,034 = 6,034 + 0 + 0$ with zero set overlap. |

---

## 7. Technical Limitations & Pedagogical Scope

The SimPy simulation engine models network behaviors for university computer network curriculum demonstrations:
1. **TCP Modeling:** Implements classical textbook Sliding Window and AIMD (Slow Start exponential growth, Additive Increase $+1/\text{cwnd}$, Multiplicative Decrease $\text{ssthresh} = \text{cwnd}/2$, and Slow Start Restart to 1). It does not implement RFC 5681 Fast Retransmit / Fast Recovery (3 duplicate ACKs), Selective Acknowledgements (SACK), or dynamic Jacobson-Karels RTT variance estimation.
2. **Go-Back-N Modeling:** Implements textbook Go-Back-N ARQ with fixed sender window $N$, cumulative ACKs, single retransmission timer for the oldest unacknowledged packet, and discarding of out-of-order packets.
3. **Leaky Bucket Modeling:** Implements constant drain-rate traffic shaping with FIFO queue buffering and finite byte capacity.
4. **Topology:** Models a multi-student university e-learning topology with DropTail queuing, serialization delay, and propagation delay over a core bottleneck link.

---

## 8. Verification of Constraints & Stage Boundary Adherence

- **No Stage 3 API Integration:** FastAPI endpoints, database schemas, and SQLite models remain in their original state. No SimPy simulation has been wired into `backend/app/api/` or database models.
- **No Unrelated Frontend Changes:** Frontend code was left untouched. Frontend unit tests and build were run purely for regression verification.
- **Authentic Results:** All test numbers, timings, packet counts, and throughput metrics are taken directly from actual execution runs on the local system.
- **No Fallbacks:** No synthetic fallback values or fabricated data were introduced.

---

## 9. Readiness Assessment for Stage 3

The SimPy discrete-event simulation engine is verified and mathematically sound. It is ready for **Stage 3: FastAPI Backend & SQLite Integration**, which will:
1. Connect `SimPySimulationEngine` to the FastAPI simulation run endpoint.
2. Persist SimPy experiment results, metrics, and time-series data into SQLite.
3. Expose simulation status, history, and comparison APIs.

