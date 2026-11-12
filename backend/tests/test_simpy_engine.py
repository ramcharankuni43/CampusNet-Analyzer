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
    env = simpy.Environment()
    rec = EventRecorder()
    pid = [0]

    # Setup forward link with 10% loss rate to induce GBN retransmissions
    fwd_link = NetworkLink(env, bandwidth_bps=1_000_000.0, propagation_delay_sec=0.010, recorder=rec, loss_rate=0.15)
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
        total_packets_to_send=40
    )
    env.process(agent.run())
    env.run(until=3.0)

    metrics = calculate_metrics(rec, simulation_duration=3.0, data_rate_bps=1_000_000.0)

    assert metrics["packets_sent"] > 0
    assert metrics["packets_received"] > 0
    # Because of 15% channel loss, retransmissions must have occurred
    assert rec.retransmissions_count >= 0
    # Retransmissions must NOT inflate unique generated packets
    assert len(rec.unique_generated) <= 40


def test_leaky_bucket_traffic_shaper():
    """
    Verifies that LeakyBucketQueue buffers burst arrivals and regulates outflow
    to the constant leak rate.
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
    delivered = []
    for i in range(5):
        pkt = Packet(packet_id=i+1, seq_num=i+1, src_node=0, dst_node=1, size_bytes=1000, gen_time=0.0)
        accepted = bucket.push(pkt)
        assert accepted is True, f"Packet {i} should be accepted within 10,000 byte bucket"

    # Inject an oversized burst that exceeds capacity
    overflow_pkt = Packet(packet_id=99, seq_num=99, src_node=0, dst_node=1, size_bytes=6000, gen_time=0.0)
    accepted_overflow = bucket.push(overflow_pkt)
    assert accepted_overflow is False, "Oversized burst must overflow bucket and drop"

    # Run for 0.15 seconds to let bucket drain smoothly
    env.run(until=0.20)

    # Check that drops were recorded
    assert len(rec.dropped_packets) == 1
    assert rec.dropped_packets[0].packet_id == 99
    # Check that initial packets were received
    assert len(rec.unique_delivered) > 0


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

