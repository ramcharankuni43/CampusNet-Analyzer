import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, Base, engine, init_db
from app.services.seed_data import seed_database
from app.services.trace_parser import parse_ns2_trace_file

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()
    db = SessionLocal()
    seed_database(db, force=True)
    db.close()
    yield

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"

def test_dashboard_summary():
    response = client.get("/api/dashboard/summary")
    assert response.status_code == 200
    data = response.json()
    assert "kpis" in data
    assert data["kpis"]["total_experiments"] >= 8
    assert data["kpis"]["avg_throughput_kbps"] > 0
    assert "recent_experiments" in data
    assert "tcp_vs_udp" in data

def test_experiments_list():
    response = client.get("/api/experiments")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 8
    assert data[0]["exp_code"].startswith("EXP-")
    assert data[0]["result"] is not None

def test_experiments_compare():
    response = client.get("/api/experiments")
    exps = response.json()
    ids = [exps[0]["id"], exps[1]["id"]]
    
    comp_resp = client.post("/api/experiments/compare", json={"experiment_ids": ids})
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert len(comp_data["experiments"]) == 2
    assert "metrics_table" in comp_data
    assert "comparison_charts" in comp_data

def test_csv_report():
    response = client.get("/api/reports/1/csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    content = response.text
    assert "Throughput (Kbps)" in content
    assert "EXP-001" in content

def test_pdf_report():
    response = client.get("/api/reports/1/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 1000

def test_system_status():
    response = client.get("/api/system/status")
    assert response.status_code == 200
    data = response.json()
    assert "execution_mode" in data
    assert data["db_connected"] is True

def test_gbn_simulation():
    # Test calibrated demo execution
    response = client.post("/api/simulations/run-gbn", json={"window_size": 4, "loss_rate": 0.05, "simulation_time": 4.0, "force_demo": True})
    assert response.status_code == 200
    data = response.json()
    assert "packets_sent" in data
    assert "trace_points" in data
    assert data["window_size"] == 4

def test_gbn_simulation_live_or_diagnostic():
    # Calling live without force_demo should either succeed if NS-2 is installed or return 503 with helpful diagnostic
    response = client.post("/api/simulations/run-gbn", json={"window_size": 4, "loss_rate": 0.05, "simulation_time": 4.0, "force_demo": False})
    if response.status_code == 200:
        data = response.json()
        assert "packets_sent" in data
    else:
        assert response.status_code == 503
        data = response.json()
        assert "NS-2" in data["detail"] or "wsl" in data["detail"].lower()

def test_leaky_bucket_simulation():
    # Test calibrated demo execution
    response = client.post("/api/simulations/run-leaky-bucket", json={"bucket_size": 15, "leak_rate": "512Kbps", "simulation_time": 4.0, "force_demo": True})
    assert response.status_code == 200
    data = response.json()
    assert "shaped_throughput_kbps" in data
    assert "comparison_series" in data

def test_leaky_bucket_simulation_live_or_diagnostic():
    # Calling live without force_demo should either succeed if NS-2 is installed or return 503 with helpful diagnostic
    response = client.post("/api/simulations/run-leaky-bucket", json={"bucket_size": 15, "leak_rate": "512Kbps", "simulation_time": 4.0, "force_demo": False})
    if response.status_code == 200:
        data = response.json()
        assert "shaped_throughput_kbps" in data
    else:
        assert response.status_code == 503
        data = response.json()
        assert "NS-2" in data["detail"] or "wsl" in data["detail"].lower()

def test_simulation_config_alias_normalization():
    # Test that alternative parameter names (students, bandwidth, delay, duration, traffic_intensity, scenario) are accepted
    payload = {
        "students": 75,
        "bandwidth": "10Mbps",
        "delay": "15ms",
        "duration": 50,
        "protocol": "TCP",
        "traffic_intensity": "High",
        "scenario": "high_load",
        "force_demo": True
    }
    response = client.post("/api/experiments", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["users"] == 75
    assert data["data_rate"] in ["10Mbps", "10 Mbps"]
    assert data["delay"] == "15ms"
    assert data["simulation_time"] == 50.0
    assert data["traffic_level"] == "High"
    assert data["protocol"] == "TCP"

def test_simulation_validation_errors():
    # Invalid bandwidth format
    resp_bw = client.post("/api/experiments", json={"students": 50, "bandwidth": "unlimited", "protocol": "TCP"})
    assert resp_bw.status_code == 422

    # Invalid delay format (negative or missing unit)
    resp_delay = client.post("/api/experiments", json={"students": 50, "delay": "-5ms", "protocol": "TCP"})
    assert resp_delay.status_code == 422

    # Out-of-range students
    resp_students_zero = client.post("/api/experiments", json={"students": 0, "protocol": "TCP"})
    assert resp_students_zero.status_code == 422
    resp_students_high = client.post("/api/experiments", json={"students": 500, "protocol": "TCP"})
    assert resp_students_high.status_code == 422

    # Unsupported protocol
    resp_proto = client.post("/api/experiments", json={"students": 50, "protocol": "SCTP"})
    assert resp_proto.status_code == 422

def test_simulation_run_lifecycle_initialization():
    payload = {
        "students": 25,
        "bandwidth": "2Mbps",
        "delay": "10ms",
        "duration": 20,
        "protocol": "UDP",
        "traffic_intensity": "Medium",
        "force_demo": True
    }
    response = client.post("/api/simulations/run", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["pending", "preparing"]
    assert "exp_code" in data
    assert data["exp_code"].startswith("EXP-")
    exp_id = data["id"]

    # Verify status query endpoint
    status_resp = client.get(f"/api/simulations/{exp_id}/status")
    assert status_resp.status_code == 200
    sdata = status_resp.json()
    assert sdata["exp_code"] == data["exp_code"]

def test_unique_exp_code_generation():
    resp1 = client.post("/api/experiments", json={"students": 10, "protocol": "TCP", "force_demo": True})
    assert resp1.status_code == 200
    code1 = resp1.json()["exp_code"]

    resp2 = client.post("/api/experiments", json={"students": 10, "protocol": "TCP", "force_demo": True})
    assert resp2.status_code == 200
    code2 = resp2.json()["exp_code"]

    assert code1 != code2

