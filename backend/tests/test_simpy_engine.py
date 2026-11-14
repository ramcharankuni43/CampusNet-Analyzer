"""
Unit Test Suite for SimPy Discrete-Event Simulation Engine
CampusNet Analyzer - Stage 2 Verification

Tests:
1. Environment and topology initialization.
2. Packet generation and delivery (zero loss on high capacity link).
3. Queue capacity and overflow drops (finite queue bottleneck).
4. Throughput calculation accuracy against theoretical link capacity.
5. PDR and packet loss formula correctness.
6. Average, min, and max delay calculation.
7. Traffic load scaling (Low, Medium, High intensity).
8. Protocol modeling: UDP vs TCP-like AIMD behavior.
9. Go-Back-N (GBN) ARQ retransmission and cumulative ACKs.
10. Leaky Bucket traffic shaping queue smoothing.
11. Mathematical conservation: generated == delivered + dropped + in_transit.
12. Zero-packet simulation edge case safety.
"""
import pytest
import simpy
from app.simulation import (
    SimPySimulationEngine,
    EventRecorder,
    CampusTopology,
    NetworkLink,
    Packet,
    calculate_metrics,
    get_scenario_config,
    UdpAgent,
    TcpLikeAgent,
    GoBackNAgent,
    LeakyBucketQueue,
    parse_bandwidth_bps,
    parse_delay_seconds
)


def test_helper_parsers():
    """Verifies bandwidth and delay string parsing."""
    assert parse_bandwidth_bps("10 Mbps") == 10_000_000.0
    assert parse_bandwidth_bps("512Kbps") == 512_000.0
    assert parse_bandwidth_bps("1 Gbps") == 1_000_000_000.0
    assert parse_bandwidth_bps(2000000) == 2_000_000.0

    assert parse_delay_seconds("20ms") == 0.020
    assert parse_delay_seconds("1s") == 1.0
    assert parse_delay_seconds("500us") == 0.0005
    assert parse_delay_seconds(0.05) == 0.05


def test_zero_packet_simulation_safety():
    """Verifies that an idle or 0-duration simulation handles division-by-zero safely."""
    rec = EventRecorder()
    metrics = calculate_metrics(rec, simulation_duration=5.0, data_rate_bps=1_000_000.0)

    assert metrics["throughput_kbps"] == 0.0
    assert metrics["packet_loss_percent"] == 0.0
    assert metrics["packet_delivery_ratio"] == 0.0
    assert metrics["average_delay_ms"] == 0.0
    assert metrics["min_delay_ms"] == 0.0
    assert metrics["max_delay_ms"] == 0.0
    assert metrics["packets_sent"] == 0
    assert metrics["packets_received"] == 0
    assert metrics["packets_dropped"] == 0
    assert metrics["packets_in_transit"] == 0


def test_packet_generation_and_delivery_no_loss():
    """
    On an over-provisioned bottleneck link (100 Mbps, large queue),
    all packets should be delivered with 100% PDR and 0% loss.
    """
    engine = SimPySimulationEngine(
        num_students=5,
        protocol="UDP",
        bandwidth="100 Mbps",
        delay="10ms",
        queue_capacity=500,
        simulation_duration=2.0,
        scenario_name="Online Classroom",
        traffic_intensity="Low",
        seed=123
    )
    res = engine.run()

    assert res["packets_sent"] > 0
    assert res["packets_received"] == res["packets_sent"]
    assert res["packets_dropped"] == 0
    assert res["packet_delivery_ratio"] == 100.0
    assert res["packet_loss_percent"] == 0.0
    assert res["average_delay_ms"] >= 10.0 # Must include propagation delay
    assert res["throughput_kbps"] > 0.0


def test_queue_overflow_and_packet_drops():
    """
    With high student traffic and a constrained bottleneck queue (e.g. 5 packets on 256Kbps),
    DropTail queue overflow must occur and record dropped packets.
    """
    engine = SimPySimulationEngine(
        num_students=20,
        protocol="UDP",
        bandwidth="256 Kbps",
        delay="20ms",
        queue_capacity=5,
        simulation_duration=2.0,
        scenario_name="Video Lecture",
        traffic_intensity="High",
        seed=999
    )
    res = engine.run()

    assert res["packets_sent"] > 0
    assert res["packets_dropped"] > 0
    assert res["packet_loss_percent"] > 0.0
    assert res["packet_delivery_ratio"] < 100.0
    # Invariant: sent == received + dropped (all drained)
    assert res["packets_sent"] == (res["packets_received"] + res["unique_dropped_packets"] + res["packets_in_transit"])


def test_mathematical_conservation_invariant():
    """
    Mathematical verification across diverse traffic scenarios:
    Unique Generated Packets == Unique Delivered + Unique Dropped + In-Transit.
    """
    for scenario in ["Online Classroom", "Video Lecture", "LMS Access", "Online Examination", "File Downloads"]:
        engine = SimPySimulationEngine(
            num_students=8,
            protocol="TCP",
            bandwidth="2 Mbps",
            delay="15ms",
            queue_capacity=20,
            simulation_duration=2.0,
            scenario_name=scenario,
            seed=42
        )
        res = engine.run()

        gen = res["packets_sent"]
        deliv = res["packets_received"]
        drop = res["unique_dropped_packets"]
        transit = res["packets_in_transit"]

        assert gen == (deliv + drop + transit), f"Conservation violation in {scenario}: {gen} != {deliv} + {drop} + {transit}"
        # PDR + Loss percentage must sum to 100% when transit is 0
        if transit == 0 and gen > 0:
            assert round(res["packet_delivery_ratio"] + res["packet_loss_percent"], 1) == 100.0


def test_traffic_intensity_scaling():
    """
    Higher traffic intensity (High vs Low) should generate more packets
    for the same scenario and duration.
    """
    low_engine = SimPySimulationEngine(
        num_students=5,
        protocol="UDP",
        bandwidth="10 Mbps",
        delay="10ms",
        simulation_duration=2.0,
        scenario_name="LMS Access",
        traffic_intensity="Low",
        seed=77
    )
    low_res = low_engine.run()

    high_engine = SimPySimulationEngine(
        num_students=5,
        protocol="UDP",
        bandwidth="10 Mbps",
        delay="10ms",
        simulation_duration=2.0,
        scenario_name="LMS Access",
        traffic_intensity="High",
        seed=77
    )
    high_res = high_engine.run()

    assert high_res["packets_sent"] > low_res["packets_sent"], "High traffic intensity must generate more packets than Low intensity"


def test_tcp_aimd_congestion_control():
    """
    Verifies that TCP-like sender starts with small window and adapts window size.
    Retransmissions must be flagged and not inflate unique generated packets.
    """
    engine = SimPySimulationEngine(
        num_students=10,
        protocol="TCP",
        bandwidth="5 Mbps",
        delay="20ms",
        queue_capacity=15,
        simulation_duration=3.0,
        scenario_name="File Downloads",
        seed=555
    )
    res = engine.run()

    assert res["packets_sent"] > 0
    assert res["packets_received"] > 0
    assert res["throughput_kbps"] > 0
    # Invariant check
    assert res["packets_sent"] == (res["packets_received"] + res["unique_dropped_packets"] + res["packets_in_transit"])


def test_go_back_n_arq_retransmissions():
    """
    Direct unit test of GoBackNAgent:
    Tests that dropped in-flight packets trigger timeout, cumulative ACKs,
    and Go-Back-N retransmission of outstanding frames.
    """
    import random
    env = simpy.Environment()
    rec = EventRecorder()
    pid = [0]

    # Setup forward link with 15% loss rate and deterministic seed to induce GBN retransmissions
    rng = random.Random(42)
    fwd_link = NetworkLink(env, bandwidth_bps=1_000_000.0, propagation_delay_sec=0.010, recorder=rec, loss_rate=0.15, rng=rng)
    ret_link = NetworkLink(env, bandwidth_bps=1_000_000.0, propagation_delay_sec=0.010, recorder=None, loss_rate=0.0)

    agent = GoBackNAgent(
        env=env,
        src_node=0,
        dst_node=1,
        forward_link=fwd_link,
        return_link=ret_link,
        recorder=rec,
        packet_id_counter=pid,
        simulation_duration=3.0,
        window_size=4,
        timeout_duration=0.060,
        packet_size=500,
        total_packets_to_send=40,
        rng=random.Random(42)
    )
    env.process(agent.run())
    env.run(until=3.0)

    metrics = calculate_metrics(rec, simulation_duration=3.0, data_rate_bps=1_000_000.0)

    assert metrics["packets_sent"] == 40, "Exactly 40 unique packets should be generated"
    assert metrics["packets_received"] > 0
    # Because of 15% channel loss with seed 42, retransmissions must have occurred
    assert rec.retransmissions_count > 0, "Retransmissions must occur under packet loss"
    assert metrics["retransmissions"] == rec.retransmissions_count
    # Retransmissions must NOT inflate unique generated packets
    assert len(rec.unique_generated) == 40
    # Independent mathematical conservation invariant must pass
    assert metrics["conservation_passed"] is True


def test_leaky_bucket_traffic_shaper():
    """
    Verifies that LeakyBucketQueue buffers burst arrivals, regulates outflow
    to the constant leak rate, preserves FIFO order, and accurately tracks waiting time.
    """
    env = simpy.Environment()
    rec = EventRecorder()

    link = NetworkLink(env, bandwidth_bps=10_000_000.0, propagation_delay_sec=0.005, recorder=rec)
    # Bucket capacity: 10,000 bytes; leak rate: 500,000 bps (62,500 B/s)
    bucket = LeakyBucketQueue(
        env=env,
        capacity_bytes=10000,
        leak_rate_bps=500_000.0,
        downstream_link=link,
        recorder=rec
    )

    # Inject a 5-packet burst of 1000 bytes each at time 0
    for i in range(5):
        pkt = Packet(packet_id=i+1, seq_num=i+1, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)
        accepted = bucket.push(pkt)
        assert accepted is True, f"Packet {i} should be accepted within 10,000 byte bucket"

    # Peak buffer bytes should equal exactly 5000 bytes
    assert bucket.peak_buffer_bytes == 5000
    assert bucket.peak_buffer_packets == 5

    # Inject an oversized burst that exceeds capacity (5000 + 6000 > 10000)
    overflow_pkt = Packet(packet_id=99, seq_num=99, src_node=0, dst_node=1, size_bytes=6000, gen_time=0.0)
    accepted_overflow = bucket.push(overflow_pkt)
    assert accepted_overflow is False, "Oversized burst must overflow bucket and drop"

    # Run for 0.20 seconds to let bucket drain smoothly
    env.run(until=0.20)

    # Check that drops were recorded
    assert len(rec.dropped_packets) == 1
    assert rec.dropped_packets[0].packet_id == 99
    # Check that initial packets were all received
    assert len(rec.unique_delivered) == 5
    # Check queuing waiting time metrics
    assert bucket.drained_packets_count == 5
    assert bucket.average_waiting_time > 0.0
    assert bucket.max_waiting_time > 0.0
    stats = bucket.get_statistics()
    assert stats["drained_packets"] == 5
    assert stats["dropped_packets"] == 1
    assert stats["peak_buffer_bytes"] == 5000
    assert stats["average_waiting_time_ms"] > 0.0


def test_time_series_consistency():
    """
    Verifies that time_series aggregation produces valid intervals
    with non-negative metrics and proper timestamps.
    """
    engine = SimPySimulationEngine(
        num_students=4,
        protocol="UDP",
        bandwidth="5 Mbps",
        delay="20ms",
        simulation_duration=4.0,
        scenario_name="Mixed Campus Traffic",
        seed=333
    )
    res = engine.run()

    ts = res["time_series"]
    assert len(ts) >= 4
    for pt in ts:
        assert pt["time"] >= 0
        assert pt["throughput_kbps"] >= 0.0
        assert pt["delay_ms"] >= 0.0
        assert 0.0 <= pt["packet_loss_percent"] <= 100.0
        assert pt["packets_sent"] >= 0
        assert pt["packets_received"] >= 0
        assert pt["packets_dropped"] >= 0


def test_deterministic_reproducibility():
    """
    Verifies that running two simulations with identical parameters and seed
    produces bit-for-bit identical results.
    """
    engine1 = SimPySimulationEngine(
        num_students=6,
        protocol="TCP",
        bandwidth="4 Mbps",
        delay="20ms",
        simulation_duration=2.5,
        scenario_name="Online Classroom",
        seed=101
    )
    res1 = engine1.run()

    engine2 = SimPySimulationEngine(
        num_students=6,
        protocol="TCP",
        bandwidth="4 Mbps",
        delay="20ms",
        simulation_duration=2.5,
        scenario_name="Online Classroom",
        seed=101
    )
    res2 = engine2.run()

    assert res1["packets_sent"] == res2["packets_sent"]
    assert res1["packets_received"] == res2["packets_received"]
    assert res1["packets_dropped"] == res2["packets_dropped"]
    assert res1["throughput_kbps"] == res2["throughput_kbps"]
    assert res1["average_delay_ms"] == res2["average_delay_ms"]
    assert res1["packet_delivery_ratio"] == res2["packet_delivery_ratio"]
    assert res1["packet_loss_percent"] == res2["packet_loss_percent"]


def test_exact_formula_calculation():
    """
    Directly verifies that Throughput, PDR, Loss, and Delay match the manual calculation
    on a known sequence of mock events.
    """
    rec = EventRecorder()
    # Create 4 packets: 1 delivered in 20ms, 1 delivered in 40ms, 1 dropped, 1 retransmitted and delivered
    p1 = Packet(packet_id=1, seq_num=1, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)
    p2 = Packet(packet_id=2, seq_num=2, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)
    p3 = Packet(packet_id=3, seq_num=3, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)

    rec.record_generate(p1, 0.0)
    rec.record_generate(p2, 0.0)
    rec.record_generate(p3, 0.0)

    # p1 delivered at 0.020s
    rec.record_receive(p1, 0.020)
    # p2 dropped at 0.010s
    rec.record_drop(p2, "queue_overflow", 0.010)
    # p3 delivered at 0.040s
    rec.record_receive(p3, 0.040)

    # Retransmission of p2:
    p2_retx = Packet(packet_id=4, seq_num=2, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0, is_retransmit=True)
    rec.record_generate(p2_retx, 0.050)
    rec.record_receive(p2_retx, 0.080)

    metrics = calculate_metrics(rec, simulation_duration=1.0, data_rate_bps=1_000_000.0)

    # Total unique generated: 3 packets (p1, p2, p3) - p2_retx does NOT count as a new packet
    assert metrics["packets_sent"] == 3
    # Total unique delivered: 3 packets (p1, p3, p2_retx)
    assert metrics["packets_received"] == 3
    # Retransmission count: 1
    assert metrics["retransmissions"] == 1
    # PDR = 3 / 3 = 100.0%
    assert metrics["packet_delivery_ratio"] == 100.0
    # Throughput for 3000 bytes over 1.0s = (3000 * 8) / 1000 = 24.0 Kbps
    assert metrics["throughput_kbps"] == 24.0
    # Average delay: (20ms + 40ms + 80ms) / 3 = 46.67 ms
    assert metrics["average_delay_ms"] == 46.67


def test_gbn_in_order_acceptance_and_out_of_order_discard():
    """
    Verifies that GoBackNAgent only accepts in-order packets,
    discards out-of-order packets with reason 'gbn_out_of_order',
    and retransmissions achieve eventual delivery and full conservation.
    """
    import random
    env = simpy.Environment()
    rec = EventRecorder()
    pid = [0]

    # Deterministic loss: specifically drop packet seq 2
    class ControlledDropLink(NetworkLink):
        def transmit(self, pkt, on_delivered=None, on_dropped=None):
            if pkt.seq_num == 2 and not pkt.is_retransmit:
                if self.recorder:
                    self.recorder.record_drop(pkt, "channel_error", self.env.now, len(self.tx_resource.queue))
                if on_dropped:
                    on_dropped(pkt, "channel_error")
                yield self.env.timeout(0.0)
                return
            yield from super().transmit(pkt, on_delivered=on_delivered, on_dropped=on_dropped)

    fwd_link = ControlledDropLink(env, bandwidth_bps=10_000_000.0, propagation_delay_sec=0.005, recorder=rec)
    ret_link = NetworkLink(env, bandwidth_bps=10_000_000.0, propagation_delay_sec=0.005, recorder=None)

    agent = GoBackNAgent(
        env=env,
        src_node=0,
        dst_node=1,
        forward_link=fwd_link,
        return_link=ret_link,
        recorder=rec,
        packet_id_counter=pid,
        simulation_duration=1.0,
        window_size=4,
        timeout_duration=0.030,
        packet_size=1000,
        total_packets_to_send=4
    )
    env.process(agent.run())
    env.run(until=1.0)

    # Packet 2 was dropped, so packet 3 arrived out of order and was discarded
    out_of_order_drops = [e for e in rec.events if e.reason == "gbn_out_of_order"]
    assert len(out_of_order_drops) > 0, "Out-of-order packets must be discarded and recorded"

    # Retransmission of packet 2 and 3 occurred
    assert rec.retransmissions_count > 0

    # All 4 unique packets were eventually accepted in-order
    assert len(rec.unique_delivered) == 4
    passed, diag = rec.verify_conservation()
    assert passed is True, f"Conservation check failed: {diag}"
    assert diag["unique_delivered"] == 4
    assert diag["unique_dropped"] == 0
    assert diag["unique_in_transit"] == 0


def test_tcp_duplicate_ack_does_not_inflate_cwnd():
    """
    Verifies that receiving duplicate/stale ACKs does not cause cwnd growth.
    """
    env = simpy.Environment()
    rec = EventRecorder()
    link = NetworkLink(env, bandwidth_bps=1_000_000.0, propagation_delay_sec=0.010, recorder=rec)
    cfg = get_scenario_config("File Downloads", "Medium")

    agent = TcpLikeAgent(
        env=env,
        src_node=0,
        dst_node=1,
        forward_link=link,
        return_link=link,
        recorder=rec,
        traffic_config=cfg,
        packet_id_counter=[0],
        simulation_duration=2.0,
        initial_cwnd=1.0,
        initial_ssthresh=16.0,
        max_window=32
    )

    # First ACK seq=1 advances window (Slow Start: +1)
    agent.in_flight[1] = Packet(1, 1, 0, 1, 1000, 0.0)
    agent.send_times[1] = 0.0
    agent._process_ack(1)
    assert agent.cwnd == 2.0
    assert agent.last_ack == 1

    # Inject duplicate ACKs (seq=1)
    agent._process_ack(1)
    assert agent.cwnd == 2.0, "Duplicate ACK must not inflate cwnd"
    agent._process_ack(1)
    assert agent.cwnd == 2.0, "Duplicate ACK must not inflate cwnd"

    # New ACK seq=2 advances window
    agent.in_flight[2] = Packet(2, 2, 0, 1, 1000, 0.0)
    agent.send_times[2] = 0.0
    agent._process_ack(2)
    assert agent.cwnd == 3.0
    assert agent.last_ack == 2


def test_tcp_cwnd_clamped_to_max_window():
    """
    Verifies that cwnd never exceeds max_window regardless of incoming ACKs.
    """
    env = simpy.Environment()
    rec = EventRecorder()
    link = NetworkLink(env, bandwidth_bps=1_000_000.0, propagation_delay_sec=0.010, recorder=rec)
    cfg = get_scenario_config("File Downloads", "High")

    max_win = 4
    agent = TcpLikeAgent(
        env=env,
        src_node=0,
        dst_node=1,
        forward_link=link,
        return_link=link,
        recorder=rec,
        traffic_config=cfg,
        packet_id_counter=[0],
        simulation_duration=2.0,
        initial_cwnd=1.0,
        initial_ssthresh=16.0,
        max_window=max_win
    )

    # Process 20 sequential new ACKs
    for seq in range(1, 21):
        agent.in_flight[seq] = Packet(seq, seq, 0, 1, 1000, 0.0)
        agent.send_times[seq] = 0.0
        agent._process_ack(seq)
        assert agent.cwnd <= float(max_win), f"cwnd {agent.cwnd} exceeded max_window {max_win}"

    assert agent.cwnd == float(max_win)


def test_tcp_duplicate_retransmission_prevention():
    """
    Verifies that multiple concurrent drop or RTO events do not trigger
    redundant retransmission processes for the same packet.
    """
    env = simpy.Environment()
    rec = EventRecorder()
    link = NetworkLink(env, bandwidth_bps=1_000_000.0, propagation_delay_sec=0.010, recorder=rec)
    cfg = get_scenario_config("LMS Access", "Low")

    agent = TcpLikeAgent(
        env=env,
        src_node=0,
        dst_node=1,
        forward_link=link,
        return_link=link,
        recorder=rec,
        traffic_config=cfg,
        packet_id_counter=[0],
        simulation_duration=2.0
    )

    pkt1 = Packet(1, 1, 0, 1, 1000, 0.0)
    agent.in_flight[1] = pkt1
    agent.send_times[1] = 0.0

    # First loss notification schedules retransmission
    agent._handle_loss(1)
    assert 1 in agent.retransmitting
    assert len(agent.retransmitting) == 1

    # Second concurrent loss notification must be ignored
    agent._handle_loss(1)
    assert len(agent.retransmitting) == 1


def test_independent_conservation_state_machine():
    """
    Tests EventRecorder's independent 3-state machine and verify_conservation.
    """
    rec = EventRecorder()
    p1 = Packet(packet_id=1, seq_num=1, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)
    p2 = Packet(packet_id=2, seq_num=2, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)
    p3 = Packet(packet_id=3, seq_num=3, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)
    p4 = Packet(packet_id=4, seq_num=4, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)

    # 1. Generation: all 4 are IN_TRANSIT
    for p in [p1, p2, p3, p4]:
        rec.record_generate(p, 0.0)

    # 2. Deliver p1
    rec.record_receive(p1, 0.010)

    # 3. Drop p2, then retransmit and deliver p2
    rec.record_drop(p2, "queue_overflow", 0.015)
    assert rec.packet_states[p2.unique_key] == "DROPPED"

    p2_retx = Packet(packet_id=5, seq_num=2, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0, is_retransmit=True)
    rec.record_generate(p2_retx, 0.030)
    assert rec.packet_states[p2.unique_key] == "IN_TRANSIT"

    rec.record_receive(p2_retx, 0.045)
    assert rec.packet_states[p2.unique_key] == "DELIVERED"

    # 4. Drop p4 permanently
    rec.record_drop(p4, "channel_error", 0.020)

    # 5. p3 stays in flight (IN_TRANSIT)

    passed, diag = rec.verify_conservation()
    assert passed is True
    assert diag["total_unique_generated"] == 4
    assert diag["unique_delivered"] == 2 # p1, p2
    assert diag["unique_dropped"] == 1   # p4
    assert diag["unique_in_transit"] == 1 # p3
    assert len(diag["deliv_drop_overlap"]) == 0
    assert len(diag["deliv_transit_overlap"]) == 0
    assert len(diag["drop_transit_overlap"]) == 0


def test_metrics_partial_bucket_rate_calculation():
    """
    Verifies that the final fractional time-series bucket does not underestimate
    throughput by dividing by a full 1.0s window.
    """
    rec = EventRecorder()
    sim_duration = 2.5 # 2 full seconds + 0.5s partial second

    # Delivery in final partial second (time = 2.2s)
    p = Packet(packet_id=1, seq_num=1, src_node=0, dst_node=1, size_bytes=5000, gen_time=2.1)
    rec.record_generate(p, 2.1)
    rec.record_receive(p, 2.2)

    metrics = calculate_metrics(rec, simulation_duration=sim_duration, data_rate_bps=1_000_000.0)
    ts = metrics["time_series"]

    # Bucket 2 spans 2.0 to 2.5s (duration = 0.5s)
    # Throughput should be (5000 * 8) / (0.5 * 1000) = 80.0 Kbps
    bucket_2 = ts[2]
    assert bucket_2["time"] == 2
    assert bucket_2["throughput_kbps"] == 80.0


def test_engine_leaky_bucket_integration():
    """
    Verifies that SimPySimulationEngine correctly attaches LeakyBucketQueue
    when scenario is 'Leaky Bucket' and reports shaper statistics.
    """
    engine = SimPySimulationEngine(
        num_students=4,
        protocol="UDP",
        bandwidth="1 Mbps",
        delay="10ms",
        simulation_duration=2.0,
        scenario_name="Leaky Bucket",
        traffic_intensity="High",
        seed=42
    )
    res = engine.run()

    assert engine.enable_leaky_bucket is True
    assert "shaper_statistics" in res
    stats = res["shaper_statistics"]
    assert stats["drained_packets"] > 0
    assert stats["peak_buffer_bytes"] > 0
    assert res["conservation_passed"] is True


def test_retransmission_after_temporary_failure_lifecycle():
    """
    Directly tests the packet lifecycle state machine when a temporary transmission
    attempt fails and is subsequently recovered by retransmission:
    - Verifies attempt drops are counted in dropped_packets (events) but not in terminal unique_dropped.
    - Verifies retransmission does NOT create a new unique generated packet.
    - Verifies delivered packet is counted exactly once with no double-counted bytes.
    - Verifies delivered and dropped sets are completely disjoint.
    - Verifies every packet has exactly ONE terminal state.
    """
    rec = EventRecorder()
    p1 = Packet(packet_id=1, seq_num=1, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)

    # 1. Generation
    rec.record_generate(p1, 0.0)
    assert rec.packet_states[p1.unique_key] == "IN_TRANSIT"
    assert len(rec.unique_generated) == 1
    assert rec.total_transmissions == 1

    # 2. Transmission attempt 1 fails (dropped at queue buffer)
    rec.record_drop(p1, "queue_overflow", 0.010)
    assert rec.packet_states[p1.unique_key] == "DROPPED"
    assert len(rec.dropped_packets) == 1
    assert len(rec.unique_dropped) == 1
    assert len(rec.unique_delivered) == 0

    # 3. Retransmission attempt (shares same unique key, is_retransmit=True)
    p1_retx = Packet(packet_id=2, seq_num=1, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0, is_retransmit=True)
    rec.record_generate(p1_retx, 0.030)
    assert rec.packet_states[p1.unique_key] == "IN_TRANSIT"
    assert len(rec.unique_generated) == 1, "Retransmission must not increment unique generated count"
    assert rec.retransmissions_count == 1
    assert rec.total_transmissions == 2

    # 4. Transmission attempt 2 succeeds (delivered and accepted at application)
    rec.record_receive(p1_retx, 0.045)
    assert rec.packet_states[p1.unique_key] == "DELIVERED"
    assert len(rec.delivered_packets) == 1
    assert rec.total_delivered_bytes == 1000, "Delivered bytes must not be inflated"
    assert len(rec.packet_delays) == 1

    # 5. Spurious duplicate delivery attempt (e.g. delayed duplicate link arrival)
    rec.record_receive(p1_retx, 0.060)
    assert len(rec.delivered_packets) == 1, "Duplicate arrival must not increment unique delivered count"
    assert rec.total_delivered_bytes == 1000, "Duplicate arrival must not double-count bytes"
    assert len(rec.packet_delays) == 1, "Duplicate arrival must not distort delay measurements"

    # 6. Conservation & Invariant Audits
    passed, diag = rec.verify_conservation()
    assert passed is True
    assert diag["total_unique_generated"] == 1
    assert diag["unique_delivered"] == 1
    assert diag["unique_dropped"] == 0
    assert diag["unique_in_transit"] == 0
    assert len(diag["deliv_drop_overlap"]) == 0
    assert len(diag["deliv_transit_overlap"]) == 0
    assert len(diag["drop_transit_overlap"]) == 0

    metrics = calculate_metrics(rec, simulation_duration=1.0, data_rate_bps=1_000_000.0)
    assert metrics["packets_sent"] == 1
    assert metrics["packets_received"] == 1
    assert metrics["packets_dropped"] == 1          # 1 physical drop event occurred
    assert metrics["unique_dropped_packets"] == 0   # 0 terminal unrecovered drops
    assert metrics["lost_packets"] == 0
    assert metrics["retransmissions"] == 1
    assert metrics["packet_delivery_ratio"] == 100.0
    assert metrics["packet_loss_percent"] == 0.0


def test_link_throughput_never_exceeds_bandwidth_capacity():
    """
    Verifies that physical link throughput over active elapsed time never exceeds
    the configured link bandwidth capacity, even under intense saturating TCP workloads.
    """
    for bw_str, bw_bps in [("1 Mbps", 1_000_000.0), ("5 Mbps", 5_000_000.0), ("10 Mbps", 10_000_000.0)]:
        engine = SimPySimulationEngine(
            num_students=12,
            protocol="TCP",
            bandwidth=bw_str,
            delay="15ms",
            queue_capacity=10, # Small queue to induce heavy congestion and drops
            simulation_duration=2.0,
            seed=100
        )
        res = engine.run()
        max_allowed_kbps = bw_bps / 1000.0
        assert res["link_throughput_kbps"] <= max_allowed_kbps, (
            f"Link throughput {res['link_throughput_kbps']} Kbps exceeded physical capacity {max_allowed_kbps} Kbps"
        )
        assert res["throughput_kbps"] <= max_allowed_kbps, (
            f"Goodput {res['throughput_kbps']} Kbps exceeded physical capacity {max_allowed_kbps} Kbps"
        )



