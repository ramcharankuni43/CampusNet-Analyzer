"""
CampusNet Analyzer - Phase 3A Integration and Verification Test Suite
Tests items 3 through 13 of the authorized Phase 3A scope:
3. Official Online Classroom benchmark through integrated service
4. Result persistence into a test SQLite database
5. Experiment status transition to completed
6. Correct packet accounting and conservation
7. Plain-array time_series_json compatibility
8. Failure handling
9. GBN service output
10. Leaky Bucket service output
11. TCP/UDP comparison service output
12. Full analysis pipeline
13. Simulator readiness smoke test
"""
import os
import sys
import json
import asyncio
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import Base
from app.models import Experiment, Result
from app.services.simulation_service import (
    check_simulation_engine,
    execute_simpy_simulation,
    run_simulation_task,
    run_gbn_simulation,
    run_leaky_bucket_simulation,
    run_tcp_udp_comparison_batch,
    run_full_analysis_pipeline,
    active_simulations
)

# In-memory test SQLite engine
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.mark.anyio
async def test_item_13_simulator_readiness_smoke_test():
    """Item 13: Dynamic simulator readiness smoke test."""
    readiness = check_simulation_engine(force_refresh=True)
    assert readiness["operational"] is True
    assert readiness["conservation_verified"] is True
    assert "SimPy" in readiness["engine"]
    assert readiness["smoke_test_latency_ms"] < 50.0  # Typically 2-5ms
    assert "verified" in readiness["diagnostic"].lower() or "passed" in readiness["diagnostic"].lower()


@pytest.mark.anyio
async def test_items_3_to_7_official_online_classroom_benchmark():
    """
    Items 3 to 7:
    3. Official Online Classroom benchmark execution
    4. Database persistence into SQLite
    5. Experiment status -> 'completed'
    6. Strict packet accounting and conservation
    7. Plain-array time_series_json compatibility
    """
    db = TestingSessionLocal()
    try:
        exp = Experiment(
            exp_code="EXP-OFFICIAL-001",
            name="Official Benchmark - Online Classroom",
            description="University Online Classroom: 10 students, 10 Mbps bottleneck, 20ms delay, 5s duration.",
            users=10,
            protocol="TCP",
            traffic_level="Medium",
            data_rate="10 Mbps",
            delay="20ms",
            simulation_time=5.0,
            experiment_type="Online Classroom",
            status="pending",
            is_demo=False
        )
        db.add(exp)
        db.commit()
        db.refresh(exp)
        exp_id = exp.id

        # Execute through run_simulation_task
        await run_simulation_task(exp_id, TestingSessionLocal, seed=42)

        # Query updated experiment and result
        db.expire_all()
        updated_exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        assert updated_exp is not None
        assert updated_exp.status == "completed", f"Status was {updated_exp.status}, error: {updated_exp.error_message}"
        assert updated_exp.result is not None

        res = updated_exp.result
        # Strict packet accounting
        assert res.packets_sent == 11998, f"Expected 11998 sent, got {res.packets_sent}"
        assert res.packets_received == 11998, f"Expected 11998 delivered, got {res.packets_received}"
        assert res.packets_dropped == 0, f"Expected 0 terminal lost packets, got {res.packets_dropped}"

        # Throughput & delay within verified tolerance
        assert abs(res.throughput_kbps - 9733.29) <= 5.0, f"Expected ~9733.29 Kbps, got {res.throughput_kbps}"
        assert abs(res.average_delay_ms - 37.80) <= 2.0, f"Expected ~37.80 ms, got {res.average_delay_ms}"
        assert res.packet_delivery_ratio == 100.0
        assert res.packet_loss_percent == 0.0

        # Mathematical conservation: generated = delivered + lost + in_transit (11998 = 11998 + 0 + 0)
        assert res.packets_sent == res.packets_received + res.packets_dropped

        # Plain-array time_series_json compatibility
        assert res.time_series_json is not None
        parsed_ts = json.loads(res.time_series_json)
        assert isinstance(parsed_ts, list), "time_series_json must remain a plain JSON array"
        assert len(parsed_ts) == 6, f"Expected 6 1-second buckets (0..5), got {len(parsed_ts)}"
        for pt in parsed_ts:
            assert "time" in pt
            assert "throughput_kbps" in pt
            assert "delay_ms" in pt
            assert "packets_dropped" in pt

        # Summary audit metadata
        assert "[Audit: seed=42" in res.summary_notes
        assert "physical_attempt_drops=93" in res.summary_notes
        assert "retransmissions=93" in res.summary_notes
        assert "conservation=passed" in res.summary_notes

        # Telemetry in-memory state
        assert exp_id in active_simulations
        assert active_simulations[exp_id]["status"] == "completed"
        assert active_simulations[exp_id]["progress"] == 100
        assert active_simulations[exp_id]["current_stage"] == "completed"

    finally:
        db.close()


@pytest.mark.anyio
async def test_item_8_failure_handling():
    """Item 8: Failure handling on non-existent or invalid experiment."""
    db = TestingSessionLocal()
    try:
        # Invalid experiment ID 999999
        await run_simulation_task(999999, TestingSessionLocal)
        # Should gracefully return without crashing
        assert True
    finally:
        db.close()


@pytest.mark.anyio
async def test_item_9_gbn_service_output():
    """Item 9: GBN discrete-event service execution and trace points."""
    result = await run_gbn_simulation(window_size=8, loss_rate=0.05, sim_time=5.0, force_demo=False, seed=42)
    assert result["window_size"] == 8
    assert result["loss_rate"] == 0.05
    assert result["packets_sent"] > 0
    assert result["packets_received"] > 0
    assert result["retransmissions"] > 0
    assert isinstance(result["trace_points"], list)
    assert len(result["trace_points"]) > 0
    for pt in result["trace_points"][:10]:
        assert "time" in pt
        assert "seq_num" in pt
        assert "event" in pt
        assert "is_retransmit" in pt
    assert result["is_demo"] is False


@pytest.mark.anyio
async def test_item_10_leaky_bucket_service_output():
    """Item 10: Leaky Bucket paired discrete-event execution and comparison series."""
    result = await run_leaky_bucket_simulation(bucket_size=20, leak_rate="512Kbps", sim_time=5.0, force_demo=False, seed=42)
    assert result["bucket_size"] == 20
    assert result["unshaped_throughput_kbps"] > 0
    assert result["shaped_throughput_kbps"] > 0
    assert isinstance(result["comparison_series"], list)
    assert len(result["comparison_series"]) > 0
    for pt in result["comparison_series"]:
        assert "time" in pt
        assert "unshaped_throughput" in pt
        assert "shaped_throughput" in pt
        assert "unshaped_drops" in pt
        assert "shaped_drops" in pt
    assert result["is_demo"] is False


@pytest.mark.anyio
async def test_item_11_tcp_udp_comparison_service_output():
    """Item 11: TCP vs UDP multi-rate comparison batch service."""
    results_table = await run_tcp_udp_comparison_batch(TestingSessionLocal)
    assert len(results_table) == 5, f"Expected 5 rate tiers, got {len(results_table)}"
    expected_rates = ["256 Kbps", "512 Kbps", "1 Mbps", "2 Mbps", "5 Mbps"]
    for i, row in enumerate(results_table):
        assert row["rate"] == expected_rates[i]
        assert row["tcp_throughput"] > 0
        assert row["udp_throughput"] > 0
        assert row["tcp_pdr"] > 0
        assert row["udp_pdr"] > 0


@pytest.mark.anyio
async def test_item_12_full_analysis_pipeline():
    """Item 12: Full academic analysis pipeline execution."""
    pipeline_res = await run_full_analysis_pipeline(TestingSessionLocal)
    assert "low_preset" in pipeline_res
    assert "med_preset" in pipeline_res
    assert "high_preset" in pipeline_res
    assert "tcp_udp_results" in pipeline_res
    assert "gbn_result" in pipeline_res
    assert "leaky_bucket_result" in pipeline_res

    assert pipeline_res["low_preset"]["throughput_kbps"] > 0
    assert pipeline_res["med_preset"]["throughput_kbps"] > 0
    assert pipeline_res["high_preset"]["throughput_kbps"] > 0
    assert len(pipeline_res["tcp_udp_results"]) == 5
    assert pipeline_res["gbn_result"]["packets_sent"] > 0
    assert pipeline_res["leaky_bucket_result"]["shaped_throughput_kbps"] > 0
