"""
CampusNet Analyzer - Phase 3D Stabilization Test Suite
Verifies:
1. End-to-end SimPy simulation execution, database persistence, and page refresh retrieval.
2. WebSocket connection, message handling, and ping/pong heartbeats.
3. Concurrency isolation and independent seed execution across multiple runs.
4. Malformed/missing data resilience (corrupted JSON, missing results, edge comparisons).
5. Explicit failure state persistence and honest error reporting.
6. System readiness, SimPy operational reporting, and NS-2 decoupling.
"""

import os
import sys
import time
import json
import asyncio
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.app.database import get_db, SessionLocal, engine, Base
from backend.app.models import Experiment, Result
from backend.app.simulation.engine import SimPySimulationEngine
from backend.app.services.simulation_service import (
    active_simulations,
    ws_manager,
    execute_simpy_simulation,
    check_simulation_engine
)
from backend.app.api.experiments import format_experiment_response, perform_comparison

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_db_clean():
    """Ensure database tables exist before each test."""
    Base.metadata.create_all(bind=engine)
    yield


def test_phase_3d_system_readiness_and_engine_status():
    """Verify that SimPy is operational and NS-2 is honestly reported."""
    resp = client.get("/api/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["simulator_operational"] is True
    assert "SimPy" in data["simulator_engine"]
    assert data["ns2_installed"] is False
    assert data["conservation_verified"] is True

    health_resp = client.get("/api/health")
    assert health_resp.status_code == 200
    health_data = health_resp.json()
    assert health_data["status"] == "online"
    assert health_data["simulator"]["operational"] is True
    assert "SimPy" in health_data["simulator"]["engine"]


@pytest.mark.anyio
async def test_phase_3d_e2e_simulation_persistence_and_refresh():
    """
    Simulate full execution of the official benchmark, verify SQLite persistence,
    and verify retrieval simulating a frontend page refresh.
    """
    db: Session = SessionLocal()
    try:
        # Create experiment in DB
        exp = Experiment(
            exp_code=f"EXP-3D-{int(time.time() * 1000) % 100000}",
            name="Phase 3D Persistence Test",
            description="Testing full SimPy persistence and page refresh retrieval",
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

        # Execute SimPy simulation with seed=42
        metrics = await execute_simpy_simulation(exp_id, SessionLocal, seed=42)

        assert metrics["packets_sent"] == 11998
        assert metrics["packets_received"] == 11998
        assert metrics["lost_packets"] == 0
        assert metrics["throughput_kbps"] == 9733.29
        assert metrics["average_delay_ms"] == 37.8

        # --- Simulate Frontend Refresh: Query GET /api/simulations/{id}/status ---
        status_resp = client.get(f"/api/simulations/{exp_id}/status")
        assert status_resp.status_code == 200
        st = status_resp.json()
        assert st["status"] == "completed"
        assert st["progress_percent"] == 100
        assert st["result"] is not None
        assert st["result"]["throughput_kbps"] == 9733.29
        assert st["result"]["packets_sent"] == 11998
        assert st["result"]["packets_received"] == 11998
        assert st["result"]["packets_dropped"] == 0
        assert len(st["result"]["time_series"]) == 6

        # --- Simulate Frontend Refresh: Query GET /api/simulations/{id} ---
        exp_resp = client.get(f"/api/simulations/{exp_id}")
        assert exp_resp.status_code == 200
        e_data = exp_resp.json()
        assert e_data["id"] == exp_id
        assert e_data["status"] == "completed"
        assert e_data["users"] == 10
        assert e_data["protocol"] == "TCP"
        assert "Seed: 42" in e_data["description"]
        assert e_data["result"]["packets_sent"] == 11998
        assert e_data["result"]["packets_received"] == 11998
        assert e_data["result"]["packets_dropped"] == 0

    finally:
        db.close()


def test_phase_3d_websocket_endpoints():
    """Verify WebSocket connection, message streaming, and ping/pong handling."""
    # Test simulation WebSocket
    with client.websocket_connect("/api/simulations/ws/99999") as ws:
        # Send heartbeat ping
        ws.send_text("ping")
        data = ws.receive_text()
        assert data == "pong"

    # Test global telemetry WebSocket
    with client.websocket_connect("/api/simulations/ws/global/telemetry") as ws:
        ws.send_text("ping")
        data = ws.receive_text()
        assert data == "pong"


@pytest.mark.anyio
async def test_phase_3d_concurrency_and_seed_isolation():
    """
    Verify that concurrent SimPy simulations with different seeds execute
    without sharing mutable state or corrupting sessions.
    """
    db: Session = SessionLocal()
    try:
        exp1 = Experiment(
            exp_code=f"EXP-CONC1-{int(time.time() * 1000) % 100000}",
            name="Concurrent Run 1",
            users=5,
            protocol="UDP",
            traffic_level="Low",
            data_rate="5 Mbps",
            delay="15ms",
            simulation_time=3.0,
            experiment_type="Normal Traffic",
            status="pending",
            is_demo=False
        )
        exp2 = Experiment(
            exp_code=f"EXP-CONC2-{int(time.time() * 1000) % 100000 + 1}",
            name="Concurrent Run 2",
            users=5,
            protocol="UDP",
            traffic_level="Low",
            data_rate="5 Mbps",
            delay="15ms",
            simulation_time=3.0,
            experiment_type="Normal Traffic",
            status="pending",
            is_demo=False
        )
        db.add(exp1)
        db.add(exp2)
        db.commit()
        db.refresh(exp1)
        db.refresh(exp2)

        # Run both concurrently with different seeds
        t1 = execute_simpy_simulation(exp1.id, SessionLocal, seed=101)
        t2 = execute_simpy_simulation(exp2.id, SessionLocal, seed=202)
        m1, m2 = await asyncio.gather(t1, t2)

        assert m1["packets_sent"] > 0
        assert m2["packets_sent"] > 0
        assert m1["packets_received"] > 0
        assert m2["packets_received"] > 0

        # Verify DB results for both
        db.refresh(exp1)
        db.refresh(exp2)
        assert exp1.status == "completed"
        assert exp2.status == "completed"
        assert exp1.result is not None
        assert exp2.result is not None
        assert "Seed: 101" in exp1.description
        assert "Seed: 202" in exp2.description

    finally:
        db.close()


def test_phase_3d_resilience_to_malformed_json_and_edge_comparison():
    """
    Verify backend does not crash on malformed time_series_json,
    and comparison handles missing results cleanly.
    """
    db: Session = SessionLocal()
    try:
        # Create experiment with invalid JSON in time_series_json
        exp = Experiment(
            exp_code=f"EXP-MALF-{int(time.time() * 1000) % 100000}",
            name="Malformed JSON Test",
            users=10,
            protocol="TCP",
            traffic_level="Medium",
            data_rate="10 Mbps",
            delay="20ms",
            simulation_time=5.0,
            experiment_type="Normal",
            status="completed",
            is_demo=False
        )
        db.add(exp)
        db.commit()
        db.refresh(exp)

        bad_result = Result(
            experiment_id=exp.id,
            throughput_kbps=100.0,
            packet_loss_percent=0.0,
            packet_delivery_ratio=100.0,
            average_delay_ms=20.0,
            packets_sent=100,
            packets_received=100,
            packets_dropped=0,
            data_rate_kbps=1000.0,
            time_series_json="INVALID_NON_JSON_STRING{{{",
            summary_notes="Test notes"
        )
        db.add(bad_result)
        db.commit()

        # format_experiment_response should safely return [] for time_series
        resp_obj = format_experiment_response(exp)
        assert resp_obj.result is not None
        assert resp_obj.result.time_series == []

        # get_simulation_status should also return safely
        st_resp = client.get(f"/api/simulations/{exp.id}/status")
        assert st_resp.status_code == 200
        assert st_resp.json()["result"]["time_series"] == []

        # Create a second experiment without a result
        exp2 = Experiment(
            exp_code=f"EXP-NORES-{int(time.time() * 1000) % 100000 + 1}",
            name="No Result Test",
            users=10,
            protocol="UDP",
            traffic_level="Medium",
            data_rate="10 Mbps",
            delay="20ms",
            simulation_time=5.0,
            experiment_type="Normal",
            status="failed",
            error_message="Simulation interrupted",
            is_demo=False
        )
        db.add(exp2)
        db.commit()
        db.refresh(exp2)

        # Comparison between exp and exp2 (one has no result)
        comp_resp = client.get(f"/api/simulations/compare?ids={exp.id},{exp2.id}")
        assert comp_resp.status_code == 200
        comp_data = comp_resp.json()
        assert len(comp_data["experiments"]) == 2
        assert len(comp_data["metrics_table"]) == 2

    finally:
        db.close()


@pytest.mark.anyio
async def test_phase_3d_failure_state_persistence_and_no_mock_results():
    """
    Verify that an aborted or invalid simulation execution marks experiment as FAILED,
    stores error_message, never fabricates results, and status endpoint reports the error.
    """
    db: Session = SessionLocal()
    try:
        exp = Experiment(
            exp_code=f"EXP-FAIL-{int(time.time() * 1000) % 100000}",
            name="Failure Handling Test",
            users=10,
            protocol="TCP",
            traffic_level="Medium",
            data_rate="10 Mbps",
            delay="20ms",
            simulation_time=5.0,
            experiment_type="Normal",
            status="pending",
            is_demo=False
        )
        db.add(exp)
        db.commit()
        db.refresh(exp)
        exp_id = exp.id

        # Simulate unexpected engine runtime failure
        with patch.object(SimPySimulationEngine, "run", side_effect=RuntimeError("Simulated engine failure")):
            with pytest.raises(RuntimeError):
                await execute_simpy_simulation(exp_id, SessionLocal)

        # Verify DB status is 'failed' and error_message is saved
        db.refresh(exp)
        assert exp.status == "failed"
        assert exp.error_message is not None
        assert "SimPy Simulation Failed" in exp.error_message
        assert exp.result is None

        # Verify API reports failed status honestly
        status_resp = client.get(f"/api/simulations/{exp_id}/status")
        assert status_resp.status_code == 200
        st = status_resp.json()
        assert st["status"] == "failed"
        assert st["progress_percent"] == 0
        assert st["error"] is not None
        assert st["result"] is None

    finally:
        db.close()
