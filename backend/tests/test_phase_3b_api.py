"""
CampusNet Analyzer - Phase 3B FastAPI Integration Test Suite
Validates the complete integration of the Stage 3A SimPy discrete-event simulation
service with the FastAPI application layer:
1. Application startup readiness check & pre-warm caching
2. Decoupled /api/health endpoint reporting honest simulator readiness
3. Honest /api/system/status endpoint with SimPy metadata
4. POST /api/simulations/run submission with custom seed & background SimPy execution
5. GET /api/simulations/{id}/status tracking and completion
6. GET /api/simulations/{id}/results verification against SimPy metric contracts
7. GET /api/simulations/{id} and GET /api/simulations list & filtering
8. Preservation of force_demo flag behavior
9. Request validation errors (HTTP 422)
10. Non-existent simulation handling (HTTP 404)
11. Execution failure handling and error propagation
"""
import os
import sys
import json
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.database import SessionLocal, init_db
from app.models import Experiment, Result
from app.services.seed_data import seed_database
from app.services.simulation_service import (
    check_simulation_engine,
    check_ns2_installation,
    active_simulations
)

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_test_environment():
    """Ensure database schema is initialized and seeded before running API tests."""
    init_db()
    db = SessionLocal()
    try:
        if db.query(Experiment).count() == 0:
            seed_database(db, force=False)
    finally:
        db.close()
    yield


def test_startup_readiness_and_caching():
    """Verify check_simulation_engine returns operational status and caches cleanly."""
    readiness1 = check_simulation_engine(force_refresh=True)
    assert readiness1["operational"] is True
    assert readiness1["conservation_verified"] is True
    assert "SimPy" in readiness1["engine"]
    assert readiness1["smoke_test_latency_ms"] < 50.0

    # Second call should use cache
    readiness2 = check_simulation_engine(force_refresh=False)
    assert readiness2["operational"] is True
    assert readiness2["smoke_test_latency_ms"] == readiness1["smoke_test_latency_ms"]


def test_health_endpoint_simpy_readiness():
    """
    Verify GET /api/health reports honest SimPy simulator readiness,
    engine version, and keeps API liveness decoupled from simulator state.
    """
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "online"
    assert data["service"] == "CampusNet-Analyzer API"
    assert data["database"]["connected"] is True
    assert data["database"]["engine"] == "sqlite"

    sim = data["simulator"]
    assert sim["operational"] is True
    assert "SimPy" in sim["engine"]
    import simpy
    assert sim["version"] == getattr(simpy, "__version__", "4.1.2")
    assert sim["conservation_verified"] is True
    assert sim["smoke_test_latency_ms"] > 0
    assert "diagnostic" in sim
    # NS-2 reported honestly without falsification
    ns_info = check_ns2_installation()
    assert sim["ns2_installed"] == ns_info["installed"]
    assert sim["execution_mode"] == "SimPy Discrete-Event Engine"


def test_health_endpoint_liveness_decoupling():
    """Verify API remains 'online' even if the simulation engine reports an issue."""
    mock_unready = {
        "operational": False,
        "engine": "SimPy Discrete-Event Simulation Engine",
        "version": "4.1.1",
        "smoke_test_latency_ms": 12.34,
        "conservation_verified": False,
        "diagnostic": "Simulated engine degraded state for test."
    }
    with patch("app.main.check_simulation_engine", return_value=mock_unready):
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        # API liveness is decoupled: status remains "online" because database is healthy
        assert data["status"] == "online"
        assert data["simulator"]["operational"] is False
        assert data["simulator"]["diagnostic"] == "Simulated engine degraded state for test."


def test_system_status_endpoint():
    """Verify GET /api/system/status returns SimPy engine metadata and accurate environment info."""
    response = client.get("/api/system/status")
    assert response.status_code == 200
    data = response.json()

    assert data["db_connected"] is True
    assert data["total_experiments"] >= 0
    assert data["python_version"] is not None
    assert data["simulator_operational"] is True
    assert "SimPy" in data["simulator_engine"]
    import simpy
    assert data["simulator_version"] == getattr(simpy, "__version__", "4.1.2")
    assert data["execution_mode"] == "SimPy Discrete-Event Simulation Engine"
    # ns2_installed matches reality
    ns_info = check_ns2_installation()
    assert data["ns2_installed"] == ns_info["installed"]


def test_simulation_submission_official_benchmark():
    """
    Submit the official Online Classroom benchmark via POST /api/simulations/run
    with deterministic seed=42 and verify full SimPy execution and result integrity.
    """
    payload = {
        "name": "API Phase 3B Benchmark Run",
        "description": "SimPy 10-student classroom over 10 Mbps bottleneck with seed 42",
        "users": 10,
        "protocol": "TCP",
        "traffic_level": "Medium",
        "data_rate": "10 Mbps",
        "delay": "20ms",
        "simulation_time": 5.0,
        "seed": 42,
        "experiment_type": "Online Classroom"
    }
    response = client.post("/api/simulations/run", json=payload)
    assert response.status_code == 200
    submit_data = response.json()

    exp_id = submit_data["id"]
    exp_code = submit_data["exp_code"]
    assert exp_code.startswith("EXP-")
    assert submit_data["experiment_id"] == exp_code

    # TestClient automatically completes background tasks before response returns.
    # Verify GET /api/simulations/{id}/status
    status_resp = client.get(f"/api/simulations/{exp_id}/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["id"] == exp_id
    assert status_data["status"] == "completed"
    assert status_data["progress_percent"] == 100
    assert status_data["current_stage"] == "completed"
    assert status_data["error"] is None
    assert len(status_data["logs"]) >= 5

    # Verify result inside status response
    res = status_data["result"]
    assert res is not None
    assert res["experiment_id"] == exp_id
    assert res["packets_sent"] == 11998
    assert res["packets_received"] == 11998
    assert res["packets_dropped"] == 0
    assert res["packet_loss_percent"] == 0.0
    assert res["packet_delivery_ratio"] == 100.0
    assert abs(res["throughput_kbps"] - 9733.29) <= 5.0
    assert abs(res["average_delay_ms"] - 37.80) <= 2.0
    assert res["data_rate_kbps"] == 10000.0
    assert len(res["time_series"]) == 6

    # Verify GET /api/simulations/{id}/results
    res_resp = client.get(f"/api/simulations/{exp_id}/results")
    assert res_resp.status_code == 200
    res_data = res_resp.json()
    assert res_data["id"] == exp_id
    assert res_data["exp_code"] == exp_code
    assert res_data["status"] == "completed"
    assert abs(res_data["throughput_kbps"] - 9733.29) <= 5.0
    assert res_data["packet_loss_percent"] == 0.0
    assert res_data["packet_delivery_ratio"] == 100.0
    assert abs(res_data["average_delay_ms"] - 37.80) <= 2.0
    assert res_data["result"]["packets_sent"] == 11998
    assert res_data["result"]["packets_received"] == 11998

    # Verify GET /api/simulations/{id}
    detail_resp = client.get(f"/api/simulations/{exp_id}")
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["id"] == exp_id
    assert detail_data["name"] == payload["name"]
    assert detail_data["users"] == 10
    assert detail_data["protocol"] == "TCP"


def test_simulation_submission_random_seed_udp():
    """Verify simulation submission with UDP and random seed (seed omitted)."""
    payload = {
        "name": "Live UDP Random Seed Test",
        "users": 5,
        "protocol": "UDP",
        "data_rate": "1 Mbps",
        "delay": "10ms",
        "simulation_time": 2.0
    }
    response = client.post("/api/simulations/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    exp_id = data["id"]

    status_resp = client.get(f"/api/simulations/{exp_id}/status")
    assert status_resp.status_code == 200
    st_data = status_resp.json()
    assert st_data["status"] == "completed"
    assert st_data["progress_percent"] == 100
    assert st_data["result"]["packets_received"] > 0
    assert st_data["result"]["throughput_kbps"] > 0


def test_simulation_force_demo_flag():
    """Verify force_demo flag is preserved when requested."""
    payload = {
        "name": "Explicit Demo Mode Run",
        "users": 10,
        "protocol": "TCP",
        "data_rate": "1 Mbps",
        "simulation_time": 5.0,
        "force_demo": True
    }
    response = client.post("/api/simulations/run", json=payload)
    assert response.status_code == 200
    exp_id = response.json()["id"]

    db = SessionLocal()
    try:
        exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        assert exp is not None
        assert exp.is_demo is True
    finally:
        db.close()


def test_simulation_validation_errors():
    """Verify request validation rejects invalid inputs with HTTP 422."""
    # 1. Invalid protocol
    res1 = client.post("/api/simulations/run", json={"protocol": "UNKNOWN_PROTO", "users": 10})
    assert res1.status_code == 422
    assert "validation" in res1.json()["error"].lower()

    # 2. Users exceeding maximum allowed (le=250)
    res2 = client.post("/api/simulations/run", json={"users": 500, "protocol": "TCP"})
    assert res2.status_code == 422

    # 3. Users below minimum allowed (ge=1)
    res3 = client.post("/api/simulations/run", json={"users": 0, "protocol": "TCP"})
    assert res3.status_code == 422

    # 4. Simulation time below minimum (ge=1.0)
    res4 = client.post("/api/simulations/run", json={"simulation_time": 0.1, "protocol": "TCP"})
    assert res4.status_code == 422

    # 5. Simulation time above maximum (le=300.0)
    res5 = client.post("/api/simulations/run", json={"simulation_time": 500.0, "protocol": "TCP"})
    assert res5.status_code == 422


def test_nonexistent_simulation_404():
    """Verify GET requests for non-existent IDs return HTTP 404."""
    fake_id = 999999
    res_status = client.get(f"/api/simulations/{fake_id}/status")
    assert res_status.status_code == 404
    assert f"Simulation with ID {fake_id} not found" in res_status.json()["detail"]

    res_results = client.get(f"/api/simulations/{fake_id}/results")
    assert res_results.status_code == 404
    assert f"Simulation with ID {fake_id} not found" in res_results.json()["detail"]

    res_detail = client.get(f"/api/simulations/{fake_id}")
    assert res_detail.status_code == 404


def test_simulations_list_and_filter():
    """Verify GET /api/simulations lists experiments and respects query parameters."""
    res = client.get("/api/simulations?limit=20")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    # Filter by protocol TCP
    res_tcp = client.get("/api/simulations?protocol=TCP&limit=10")
    assert res_tcp.status_code == 200
    for item in res_tcp.json():
        assert item["protocol"] == "TCP"


def test_simulation_failure_handling():
    """Verify that an internal execution exception marks experiment as failed and stores error detail."""
    db = SessionLocal()
    try:
        exp = Experiment(
            exp_code=f"EXP-FAIL-{db.query(Experiment).count() + 1:03d}",
            name="Simulated Failure Test",
            users=10,
            protocol="TCP",
            traffic_level="Low",
            data_rate="1 Mbps",
            delay="20ms",
            simulation_time=5.0,
            experiment_type="Normal Traffic",
            status="pending",
            is_demo=False
        )
        db.add(exp)
        db.commit()
        db.refresh(exp)
        exp_id = exp.id
    finally:
        db.close()

    # Emulate failure by passing an invalid state that causes execute_simpy_simulation to raise
    with patch("app.services.simulation_service.SimPySimulationEngine.run", side_effect=RuntimeError("Simulated engine computation crash")):
        from app.services.simulation_service import run_simulation_task
        import asyncio
        asyncio.run(run_simulation_task(exp_id, SessionLocal))

    # Query status via API
    res = client.get(f"/api/simulations/{exp_id}/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "failed"
    assert data["current_stage"] == "failed"
    assert "Simulated engine computation crash" in data["error_message"]
