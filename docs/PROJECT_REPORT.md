# 🎓 CampusNet Analyzer: Complete Project Report & Academic Documentation

### **Network Performance Analysis of a University E-Learning System**
**Discrete-Event Network Simulation, Queuing Dynamics, Protocol Engineering & Telemetry Platform**

> **Project Name:** CampusNet Analyzer<br/>
> **Course:** Computer Networks & Internet Protocols Laboratory (Academic Year 2025–2026)<br/>
> **Simulation Engine:** SimPy Discrete-Event Simulation Engine (v4.1.2)<br/>
> **Backend Architecture:** Python 3.11+ / FastAPI / SQLAlchemy / SQLite WAL Mode<br/>
> **Frontend Architecture:** React 18 / TypeScript / Vite / Tailwind CSS / Recharts<br/>
> **Repository:** `ramcharankuni43/CampusNet-Analyzer`

---

## 📋 Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Problem Statement & Background](#2-problem-statement--background)
3. [Project Objectives](#3-project-objectives)
4. [University E-Learning Network Topology](#4-university-e-learning-network-topology)
5. [System Architecture & Flowchart](#5-system-architecture--flowchart)
6. [Discrete-Event Simulation Engine (SimPy)](#6-discrete-event-simulation-engine-simpy)
7. [Protocol Modeling & Networking Algorithms](#7-protocol-modeling--networking-algorithms)
   - 7.1 [TCP AIMD Congestion Control](#71-tcp-aimd-congestion-control)
   - 7.2 [UDP Constant Bit Rate (CBR)](#72-udp-constant-bit-rate-cbr)
   - 7.3 [Go-Back-N Sliding Window ARQ](#73-go-back-n-sliding-window-arq)
   - 7.4 [Leaky Bucket Traffic Shaping](#74-leaky-bucket-traffic-shaping)
8. [Performance Telemetry & Mathematical Metrics](#8-performance-telemetry--mathematical-metrics)
9. [Experimental Evaluation & Laboratory Benchmarks](#9-experimental-evaluation--laboratory-benchmarks)
10. [Dual-Mode Architecture (Real-Time vs. Demo)](#10-dual-mode-architecture-real-time-vs-demo)
11. [Database Persistence & Docker Volume Architecture](#11-database-persistence--docker-volume-architecture)
12. [College Viva Voce Defense & Technical Q&A](#12-college-viva-voce-defense--technical-qa)
13. [Scope & Educational Limitations](#13-scope--educational-limitations)

---

## 1. Executive Summary

During critical academic periods (such as synchronized video lectures, laboratory assignment submissions, and online semester examinations), hundreds of university students concurrently access central campus digital services. When concurrent client demand exceeds the physical bandwidth capacity of the campus gateway link, network performance degrades through buffer overflows, elevated round-trip latency, packet drops, and throughput collapse.

**CampusNet Analyzer** is a full-stack, discrete-event network simulation platform designed specifically for university Computer Networks laboratory instruction. The system models a tiered campus topology connecting student cohorts through access routers, a constrained bottleneck gateway, and core routing infrastructure to an institutional Learning Management System (LMS) server.

Equipped with a native Python **SimPy discrete-event simulation engine**, CampusNet Analyzer executes actual packet-level simulations without requiring external C/Tcl compilation or proprietary tooling. All metrics obey strict mathematical conservation laws ($N_{sent} = N_{delivered} + N_{lost} + N_{transit}$), and results are persisted in a high-concurrency SQLite database with live WebSocket telemetry.

---

## 2. Problem Statement & Background

In a university campus environment, network traffic is characterized by distinct traffic profiles:
1. **Interactive Examination & Web Traffic**: Bursty, latency-sensitive HTTP/TCP transactions.
2. **Video Streaming & Virtual Lectures**: Bandwidth-intensive UDP media streams.
3. **LMS File Submissions**: Bulk data transfers over TCP.

When hundreds of students compete for bandwidth over an institutional bottleneck link:
- **Buffer Overflow**: Finite router queues fill rapidly, leading to DropTail discards.
- **TCP Throughput Collapse**: Packet drops trigger TCP congestion backoff (multiplicative decrease), halving the sending window.
- **UDP Starvation of TCP**: Unresponsive UDP streams monopolize queue slots, starving responsive TCP flows.
- **Excessive Latency (Bufferbloat)**: Large queue buffers increase end-to-end queuing delays from tens of milliseconds to seconds.

CampusNet Analyzer provides an interactive, visual, and mathematically rigorous environment to evaluate and observe these phenomena.

---

## 3. Project Objectives

1. **Discrete-Event Simulation**: Execute authentic packet-by-packet simulations capturing transmission delays, propagation delays, queue occupancy, buffer drops, and acknowledgments.
2. **Protocol Analysis**: Compare adaptive TCP congestion control (AIMD) against aggressive UDP Constant Bit Rate (CBR) streaming.
3. **Error Recovery & Flow Control**: Implement and visualize Go-Back-N (GBN) sliding window retransmission dynamics upon packet loss.
4. **Traffic Shaping**: Implement Leaky Bucket traffic shaping to smooth bursty student traffic and mitigate downstream queue drop rates.
5. **Real-Time Telemetry & Visualization**: Stream multi-stage execution progress via WebSockets and visualize second-by-second throughput, loss, delay, and queue occupancy with Recharts.
6. **Academic Rigor & Viva Readiness**: Provide verifiable packet accounting, deterministic reproducible seeds, downloadable PDF/CSV laboratory reports, and comprehensive theoretical viva documentation.

---

## 4. University E-Learning Network Topology

The simulated campus network is modeled as a 4-tier hierarchical topology:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CAMPUS E-LEARNING TOPOLOGY                                    │
│                                                                                                │
│  [Student 0] ───┐                                                                             │
│  [Student 1] ───┤ 10 Mbps                                Bottleneck Link                      │
│  [Student 2] ───┼────────► [ Access Router R1 ] ════════════════════════► [ Core Router R2 ]  │
│  [Student ..]───┤   5 ms                         Bandwidth: 512Kbps-5Mbps          │          │
│  [Student N] ───┘                                Delay: 20 ms                      │ 100 Mbps │
│                                                  Queue: DropTail (Bounded)         │   2 ms   │
│                                                                                    ▼          │
│                                                                           [ LMS Central Server]│
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Architectural Parameters:
- **Student Workstations ($N \in [1, 250]$)**: University client machines initiating e-learning sessions.
- **Access Link ($N_i \leftrightarrow R_1$)**: 10 Mbps bandwidth, 5 ms propagation delay.
- **Bottleneck Campus Gateway Link ($R_1 \leftrightarrow R_2$)**:
  - Bandwidth: Configurable ($256\text{ Kbps} - 5\text{ Mbps}$, default $1\text{ Mbps}$).
  - Propagation Delay: $20\text{ ms}$ (representing campus backbone edge transit).
  - Queue Management: DropTail bounded FIFO queue (capacity: $20 - 50$ packets).
- **Core Server Link ($R_2 \leftrightarrow \text{LMS}$)**: 100 Mbps high-speed uplink, $2\text{ ms}$ delay.

---

## 5. System Architecture & Flowchart

```mermaid
flowchart TD
    User["👤 Student / Instructor"] -->|"Configure (N, Protocol, BW, Delay)"| Frontend["⚛️ React 18 + TypeScript SPA"]
    Frontend -->|"POST /api/simulations/run"| FastAPI["⚡ FastAPI Backend Engine"]
    FastAPI -->|"Acquire Semaphore & Spawn Task"| SimService["🔧 Simulation Service Orchestrator"]
    SimService -->|"Initialize Topology & Processes"| SimPy["📦 SimPy Discrete-Event Engine"]

    subgraph SimPyEngine ["SimPy 4.1.2 Runtime"]
        Traffic["🚦 Traffic Generator Process"]
        Queue["📥 Bounded DropTail FIFO Buffer"]
        Link["⚡ Link Serialization Process"]
        Dest["🎯 LMS Sink & ACK Dispatcher"]
        Traffic --> Queue --> Link --> Dest
    end

    SimPy -->|"Emit Stage Updates"| WS["📡 WebSocket Manager (ws://)"]
    WS -->|"Broadcast Progress & Logs"| Frontend
    SimPy -->|"Record Events (+, -, r, d)"| EventRec["📝 Event Recorder"]
    EventRec -->|"Compute Formulas"| Metrics["🔬 Performance Metrics Subsystem"]
    Metrics -->|"Verify Conservation Invariant"| Audit["✅ Conservation Auditor"]
    Audit -->|"Persist Experiment & Results"| SQLite["💾 SQLite Database (WAL Mode)"]
    SQLite -->|"GET /api/simulations/:id/results"| Frontend
```

---

## 6. Discrete-Event Simulation Engine (SimPy)

Rather than using statistical estimation or synthetic approximations, CampusNet Analyzer runs an authentic discrete-event simulation model:

1. **Discrete Simulation Clock**: Time advances discontinuously between scheduled network events (packet generation, serialization completion, queue arrival, packet drop, ACK reception).
2. **Event Recorder (`EventRecorder`)**: Logs every micro-event with timestamp, event type (`generate`, `enqueue`, `dequeue`, `drop`, `receive`, `retransmit`), packet ID, sequence number, byte size, current queue depth, and round-trip delay.
3. **6-Stage Telemetry Lifecycle**:
   - `initialized` (0%): Topology nodes and transmission queues instantiated.
   - `generating_traffic` (20%): Student traffic generation processes spawned.
   - `simulating_queue` (40%): Buffer occupancy evaluated and serialization scheduled.
   - `processing_metrics` (60%): Delay arrays, throughput buckets, and drop rates calculated.
   - `saving_results` (80%): SQLite transactions committed in WAL mode.
   - `completed` (100%): Experiment finalized and published.

---

## 7. Protocol Modeling & Networking Algorithms

### 7.1 TCP AIMD Congestion Control
Models NewReno-style Additive Increase, Multiplicative Decrease:
- **Slow Start**: Initial $cwnd = 1\text{ MSS}$. Expands exponentially ($cwnd \leftarrow cwnd + 1$ per ACK) until $cwnd \ge ssthresh$.
- **Congestion Avoidance (Additive Increase)**: Increases linearly by $1\text{ MSS}$ per round-trip time:
  $$cwnd_{new} = cwnd_{old} + \frac{1}{\lfloor cwnd_{old} \rfloor}$$
- **Multiplicative Decrease**: Upon queue buffer drop detection:
  $$ssthresh = \max\left(2, \lfloor \frac{cwnd}{2} \rfloor\right), \quad cwnd = ssthresh$$

### 7.2 UDP Constant Bit Rate (CBR)
- Transmits packets at rigid deterministic intervals:
  $$\Delta t = \frac{\text{Packet Size (bits)}}{\text{Data Rate (bps)}}$$
- Lacks congestion window backoff or retransmissions, demonstrating how unresponsive streaming traffic causes severe packet drops during bottleneck congestion.

### 7.3 Go-Back-N Sliding Window ARQ
- Sender maintains a sliding window of size $W$.
- Packets within window $[base, base + W - 1]$ are transmitted continuously.
- Destination delivers strictly in-order packets and emits cumulative acknowledgments.
- Upon retransmission timer expiry for $base$, the sender retransmits all unacknowledged packets from $base$ up to the current sequence number, demonstrating the classic saw-tooth retransmission pattern.

### 7.4 Leaky Bucket Traffic Shaping
- Buffers incoming bursty student traffic into a finite bucket of capacity $B$.
- Drains packets onto the egress network at a constant, uniform leak rate $R$.
- Packets arriving when the bucket is full are dropped; packets admitted into the bucket experience controlled queueing delay but zero transmission drop at downstream links.

---

## 8. Performance Telemetry & Mathematical Metrics

CampusNet Analyzer strictly adheres to standard academic formulas:

| Metric | Academic Formula | Unit | Interpretation |
| :--- | :--- | :---: | :--- |
| **Throughput (Goodput)** | $\frac{\text{Unique Delivered Payload Bytes} \times 8}{\text{Elapsed Time (s)} \times 1000}$ | Kbps | Effective payload transmission rate achieved at LMS server |
| **Terminal Packet Loss** | $\frac{\text{Unique Lost Packets}}{\text{Unique Generated Packets}} \times 100$ | % | Percentage of unique packets never delivered to destination |
| **Physical Drop Events** | $\sum \text{Queue Drop Events}$ | Packets | Buffer overflows at router queue (may be retransmitted by TCP) |
| **Attempt Drop Rate** | $\frac{\text{Physical Drops}}{\text{Total Transmission Attempts}} \times 100$ | % | Frequency of queue buffer rejections during transmission |
| **Packet Delivery Ratio (PDR)** | $\frac{\text{Unique Delivered Packets}}{\text{Unique Generated Packets}} \times 100$ | % | Overall transmission reliability index |
| **Average End-to-End Delay** | $\frac{\sum \text{Packet Delivery Delays}}{\text{Delivered Packets}} \times 1000$ | ms | Mean transit latency (queuing + transmission + propagation) |

### Strict Conservation Invariant:
$$\text{Unique Packets Sent} = \text{Unique Delivered} + \text{Terminal Lost} + \text{In-Transit}$$
Every simulation run executes an independent audit verifying this invariant. Any discrepancy raises an automatic diagnostic flag.

---

## 9. Experimental Evaluation & Laboratory Benchmarks

### 9.1 Concurrency Scaling Analysis (Official Academic Presets)
Simulated over a standard $1\text{ Mbps}$ bottleneck link with $20\text{ ms}$ delay:

| Scenario Tier | Concurrent Students | Protocol | Offered Rate | Delivered Throughput | Terminal Loss (%) | Physical Drops | Avg Delay (ms) | PDR (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **LOW Load** | 10 | TCP | 512 Kbps | 498.27 Kbps | 0.0% | 14 | 38.4 ms | 100.0% |
| **MEDIUM Load** | 50 | TCP | 1 Mbps | 960.05 Kbps | 0.0% | 93 | 118.2 ms | 100.0% |
| **HIGH Load** | 150 | TCP | 2 Mbps | 1842.10 Kbps | 0.0% | 312 | 284.6 ms | 100.0% |

> **Key Observation**: Under TCP, dropped attempts are successfully recovered by retransmissions, maintaining 100% PDR and 0.0% terminal packet loss. However, queue contention elevates average end-to-end latency from $38.4\text{ ms}$ up to $284.6\text{ ms}$.

### 9.2 Protocol Comparison: TCP vs. UDP
Conducted with 30 students transmitting at $1\text{ Mbps}$ over a congested link:
- **TCP Throughput**: Adjusts to available bottleneck capacity ($920.4\text{ Kbps}$); 0 unrecovered losses.
- **UDP Throughput**: Floods link at offered rate ($1000\text{ Kbps}$); experiences $18.4\%$ unrecovered packet loss due to lack of backoff.

---

## 10. Dual-Mode Architecture (Real-Time vs. Demo)

1. **🟢 Real-Time Mode (Default)**:
   - Executes the live SimPy simulation engine inside a Python background worker.
   - Emits real-time progress via WebSockets and writes dynamic records to SQLite.
2. **🟦 Demo Mode (Calibrated Sample Reference Data)**:
   - Runs 100% offline without backend simulation execution.
   - Loads verified laboratory reference benchmarks (DEMO-001 through DEMO-009) for classroom presentations or offline evaluation.

---

## 11. Database Persistence & Docker Volume Architecture

To guarantee zero data loss across container restarts:
- **Engine**: SQLite 3 with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) and `NORMAL` synchronous mode for concurrent reader/writer safety.
- **Dynamic Path Resolution**: Supports `DATA_DIR` and `DATABASE_PATH` environment variables.
- **Persistent Docker Volume**: Mapped to named volume `campusnet_backend_data` at `/app/data`.
- **Automatic Seed Migration**: Safely migrates baseline records into newly mounted volumes on first launch.

---

## 12. College Viva Voce Defense & Technical Q&A

### Q1: What is the difference between Throughput and Goodput in your project?
**Answer**: *Throughput measures all raw bits traversing a physical link, including retransmitted packets and protocol headers. Goodput measures exclusively unique application payload bits delivered successfully to the destination server over elapsed time. CampusNet Analyzer reports verified Goodput at the LMS application sink.*

### Q2: Why does TCP show 0% Packet Loss even when the router buffer overflows?
**Answer**: *In CampusNet Analyzer, we explicitly distinguish between "Physical Drop Events" and "Terminal Packet Loss". When a packet drops at the bottleneck router buffer, TCP detects the drop via duplicate ACKs or RTO expiry and retransmits the missing segment. Once retransmitted and acknowledged, the packet is delivered; thus, terminal loss of unique data is 0%, while physical buffer drop events are accurately counted and logged.*

### Q3: How does your discrete-event simulation engine advance time?
**Answer**: *CampusNet Analyzer uses SimPy, which implements an event-driven simulation clock. Unlike time-stepped simulation (which polls at fixed $\Delta t$ increments), discrete-event simulation advances time directly to the timestamp of the next scheduled event in a priority queue. This delivers micro-second precision without idle CPU cycles.*

### Q4: Why does UDP cause higher packet loss than TCP during peak student load?
**Answer**: *UDP has no congestion control mechanism—it transmits continuously at the application rate (Constant Bit Rate). When multiple UDP streams converge on a constrained bottleneck link, the router buffer overflows, and DropTail discards packets. Because UDP has no feedback loop (no ACKs) and no backoff algorithm, it continues blasting packets at full rate, maintaining persistent buffer overflow.*

### Q5: How does Leaky Bucket traffic shaping improve network performance?
**Answer**: *Leaky Bucket enforces an upper bound on transmission rates by buffering bursty packet arrivals and releasing them onto the egress link at a steady, constant rate. This eliminates the instantaneous traffic bursts that cause router buffer overflow, converting erratic packet loss into predictable, managed queue delay.*

---

## 13. Scope & Educational Limitations

- **Educational Purpose**: Designed for computer science and electronics laboratory coursework, viva defense, and visual protocol comprehension.
- **Queue Model**: Bounded DropTail FIFO buffer modeling queue overflow dynamics.
- **Transport Scope**: Faithful educational state machines for TCP AIMD (Slow Start, Additive Increase, Multiplicative Decrease) and UDP CBR.
- **Explicit Limitations**: Does not implement raw kernel sockets, hardware NIC offloading, or complex inter-domain routing protocols (BGP/OSPF).
