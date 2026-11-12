import os
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from sqlalchemy import text
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, Base, engine, init_db
from app.models import Experiment, Result
from app.services.seed_data import seed_database
from app.services.trace_parser import parse_ns2_trace_file
from app.services.simulation_service import run_simulation_task, check_ns2_installation

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

def test_parse_ns2_exact_formulas(tmp_path):
    # Tests exact math according to Phase 3 requirements:
    # Throughput = (Received Bytes * 8) / (Observation Duration * 1000)
    # Lost Packets = Sent Packets - Received Packets
    # Packet Loss % = (Lost Packets / Sent Packets) * 100
    # PDR = (Received Packets / Sent Packets) * 100
    # Average Delay = Total delivery delay / Successfully received packets
    # Retransmitted packets NOT counted as unique original packets for PDR

    trace_file = tmp_path / "test_trace.tr"
    lines = []
    # 10 packets sent from node 0 (0.0) to server 3 (3.0), duration = 10.0s
    for i in range(1, 11):
        lines.append(f"+ 0.{i:02d}0000 0 1 tcp 1024 ------- 1 0.0 3.0 {i} {i}")
        lines.append(f"- 0.{i:02d}1000 0 1 tcp 1024 ------- 1 0.0 3.0 {i} {i}")
        lines.append(f"r 0.{i:02d}5000 0 1 tcp 1024 ------- 1 0.0 3.0 {i} {i}")

        if i == 2:
            # Packet 2 drops on link 1->2
            lines.append(f"d 0.{i:02d}7000 1 2 tcp 1024 ------- 1 0.0 3.0 {i} {i}")
            # Packet 2 retransmitted as pkt_id 20 with same seq_num 2 at t=0.500
            lines.append(f"+ 0.500000 0 1 tcp 1024 ------- 1 0.0 3.0 2 20")
            lines.append(f"- 0.501000 0 1 tcp 1024 ------- 1 0.0 3.0 2 20")
            lines.append(f"r 0.505000 0 1 tcp 1024 ------- 1 0.0 3.0 2 20")
            lines.append(f"- 0.510000 1 2 tcp 1024 ------- 1 0.0 3.0 2 20")
            lines.append(f"r 0.530000 1 2 tcp 1024 ------- 1 0.0 3.0 2 20")
            lines.append(f"r 0.532000 2 3 tcp 1024 ------- 1 0.0 3.0 2 20")
        elif i == 5:
            # Packet 5 drops on link 1->2 and is NEVER retransmitted (lost packet)
            lines.append(f"d 0.{i:02d}7000 1 2 tcp 1024 ------- 1 0.0 3.0 {i} {i}")
        else:
            # Successfully delivered
            lines.append(f"- 0.{i:02d}6000 1 2 tcp 1024 ------- 1 0.0 3.0 {i} {i}")
            lines.append(f"r 0.{i:02d}8000 1 2 tcp 1024 ------- 1 0.0 3.0 {i} {i}")
            lines.append(f"r 0.{i:02d}8200 2 3 tcp 1024 ------- 1 0.0 3.0 {i} {i}")

    # Add reverse ACKs to verify flow filtering ignores ACKs
    lines.append("+ 0.150000 3 2 ack 40 ------- 1 3.0 0.0 1 30")
    lines.append("r 0.170000 1 0 ack 40 ------- 1 3.0 0.0 1 30")

    # Add duplicate packet delivery at destination for packet 3 (tests non-duplicate throughput accounting)
    lines.append("r 0.390000 2 3 tcp 1024 ------- 1 0.0 3.0 3 3")

    trace_file.write_text("\n".join(lines), encoding="utf-8")

    duration = 10.0
    res = parse_ns2_trace_file(str(trace_file), server_node_id=3, simulation_duration=duration)

    assert res["packets_sent"] == 10  # 10 unique original packets
    assert res["packets_received"] == 9  # 9 unique delivered (packet 5 lost, packet 2 delivered via retransmission)
    assert res["lost_packets"] == 1  # 10 - 9 = 1 lost packet
    assert res["packet_delivery_ratio"] == 90.0  # (9 / 10) * 100
    assert res["packet_loss_percent"] == 10.0  # (1 / 10) * 100
    assert res["packets_dropped"] == 2  # 2 drop events (packet 2 and packet 5)
    assert res["duplicate_deliveries"] == 1  # Exactly 1 duplicate delivery detected without inflating throughput

    # Received bytes = 9 delivered * 1024 = 9216 bytes (duplicate delivery does NOT add 1024 bytes)
    # Expected throughput = (9216 * 8) / (10.0 * 1000) = 73.728 -> 73.73 Kbps
    expected_tp = round((9 * 1024 * 8.0) / (duration * 1000.0), 2)
    assert res["throughput_kbps"] == expected_tp
    assert res["average_delay_ms"] > 0

def test_parse_ns2_zero_packets_and_malformed_lines(tmp_path):
    empty_trace = tmp_path / "empty.tr"
    empty_trace.write_text("", encoding="utf-8")
    res_empty = parse_ns2_trace_file(str(empty_trace), server_node_id=12, simulation_duration=60.0)
    assert res_empty["throughput_kbps"] == 0.0
    assert res_empty["packet_loss_percent"] == 0.0
    assert res_empty["packet_delivery_ratio"] == 0.0
    assert res_empty["average_delay_ms"] == 0.0
    assert res_empty["packets_sent"] == 0
    assert res_empty["packets_received"] == 0

    malformed_trace = tmp_path / "malformed.tr"
    malformed_trace.write_text("random garbage\n+ 0.1\n+ invalid float 0 1\n", encoding="utf-8")
    res_malformed = parse_ns2_trace_file(str(malformed_trace), server_node_id=12, simulation_duration=60.0)
    assert res_malformed["packets_sent"] == 0
    assert res_malformed["throughput_kbps"] == 0.0

def test_parse_ns2_cross_check_experiment_1():
    trace_path = "simulation/traces/experiment_1.tr"
    if os.path.exists(trace_path):
        res = parse_ns2_trace_file(trace_path, server_node_id=12, simulation_duration=60.0)
        assert res["packets_sent"] > 0
        assert res["packets_received"] == res["packets_sent"]
        assert res["packet_delivery_ratio"] == 100.0
        assert res["packet_loss_percent"] == 0.0
        assert res["throughput_kbps"] > 0
        assert res["average_delay_ms"] > 0

def test_simulations_list_and_get_by_id():
    # Test GET /api/simulations
    response = client.get("/api/simulations")
    assert response.status_code == 200
    sims = response.json()
    assert isinstance(sims, list)
    assert len(sims) >= 8

    # Test GET /api/simulations/{id}
    first_id = sims[0]["id"]
    single_resp = client.get(f"/api/simulations/{first_id}")
    assert single_resp.status_code == 200
    single_data = single_resp.json()
    assert single_data["id"] == first_id
    assert single_data["exp_code"] == sims[0]["exp_code"]
    assert "throughput_kbps" in single_data
    assert "packet_loss_percent" in single_data

    # Test GET /api/simulations/999999 (not found)
    nf_resp = client.get("/api/simulations/999999")
    assert nf_resp.status_code == 404

def test_simulations_compare_get_and_post():
    response = client.get("/api/simulations")
    sims = response.json()
    id1, id2 = sims[0]["id"], sims[1]["id"]

    # Test GET /api/simulations/compare?ids=id1,id2
    get_comp = client.get(f"/api/simulations/compare?ids={id1},{id2}")
    assert get_comp.status_code == 200
    comp_data = get_comp.json()
    assert len(comp_data["experiments"]) == 2
    assert "metrics_table" in comp_data
    assert "comparison_charts" in comp_data
    assert "analysis_summary" in comp_data

    # Test POST /api/simulations/compare
    post_comp = client.post("/api/simulations/compare", json={"experiment_ids": [id1, id2]})
    assert post_comp.status_code == 200
    assert len(post_comp.json()["experiments"]) == 2

    # Test validation: < 2 IDs
    bad_comp = client.get(f"/api/simulations/compare?ids={id1}")
    assert bad_comp.status_code == 400

def test_simulation_results_endpoint():
    response = client.get("/api/simulations")
    sims = response.json()
    completed_sim = next((s for s in sims if s.get("result") is not None), None)
    assert completed_sim is not None, "At least one completed simulation with results should exist"
    first_id = completed_sim["id"]

    res_resp = client.get(f"/api/simulations/{first_id}/results")
    assert res_resp.status_code == 200
    data = res_resp.json()
    assert data["id"] == first_id
    assert data["result"] is not None
    assert data["result"]["throughput_kbps"] > 0

def test_app_startup_metadata():
    assert app.title == "CampusNet-Analyzer API"
    paths = app.openapi()["paths"]
    assert "/api/health" in paths
    assert "/api/dashboard/summary" in paths
    assert "/api/experiments" in paths
    assert "/api/simulations/run" in paths
    assert "/api/system/status" in paths

def test_simulation_invalid_configurations_comprehensive():
    # 1. Zero or negative duration
    r_dur_zero = client.post("/api/experiments", json={"duration": 0, "protocol": "TCP"})
    assert r_dur_zero.status_code == 422
    r_dur_neg = client.post("/api/experiments", json={"duration": -15, "protocol": "TCP"})
    assert r_dur_neg.status_code == 422

    # 2. Invalid protocol
    r_proto = client.post("/api/experiments", json={"protocol": "QUIC"})
    assert r_proto.status_code == 422

    # 3. Non-numeric bandwidth string
    r_bw = client.post("/api/experiments", json={"bandwidth": "unlimited-speed", "protocol": "TCP"})
    assert r_bw.status_code == 422

    # 4. Non-numeric delay string
    r_delay = client.post("/api/experiments", json={"delay": "immediate", "protocol": "TCP"})
    assert r_delay.status_code == 422

    # 5. Out of bounds users
    r_low_users = client.post("/api/experiments", json={"students": -2})
    assert r_low_users.status_code == 422
    r_high_users = client.post("/api/experiments", json={"students": 300})
    assert r_high_users.status_code == 422

def test_database_initialization_and_migration():
    # Calling init_db should be idempotent and ensure schema has error_message
    init_db()
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(experiments)")).fetchall()
        column_names = [row[1] for row in res]
        assert "id" in column_names
        assert "exp_code" in column_names
        assert "error_message" in column_names
        assert "status" in column_names
        assert "users" in column_names

def test_simulation_execution_success_task():
    db = SessionLocal()
    try:
        exp = Experiment(
            exp_code=f"EXP-SUCCESS-{os.getpid()}",
            name="Success Verification Test",
            users=15,
            protocol="TCP",
            traffic_level="Low",
            data_rate="1Mb",
            delay="15ms",
            simulation_time=5.0,
            experiment_type="Normal Traffic",
            status="pending",
            is_demo=True
        )
        db.add(exp)
        db.commit()
        db.refresh(exp)
        exp_id = exp.id

        # Run worker task directly
        asyncio.run(run_simulation_task(exp_id, SessionLocal))

        db.expire_all()
        updated_exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        assert updated_exp.status == "completed"
        assert updated_exp.result is not None
        assert updated_exp.result.throughput_kbps > 0
        assert updated_exp.result.packet_delivery_ratio > 0
        assert updated_exp.trace_file is not None
        assert os.path.exists(updated_exp.trace_file)
    finally:
        db.close()

def test_simulation_execution_failure_handling():
    db = SessionLocal()
    try:
        exp = Experiment(
            exp_code=f"EXP-FAIL-{os.getpid()}",
            name="Failure Handling Test",
            users=10,
            protocol="TCP",
            traffic_level="Low",
            data_rate="1Mb",
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

        # Mock NS-2 execution failure (proc returns non-zero exit code 1)
        mock_proc = AsyncMock()
        mock_proc.returncode = 1
        mock_proc.communicate = AsyncMock(return_value=(b"", b"syntax error in Tcl script: invalid command name 'node'"))

        with patch("app.services.simulation_service.check_ns2_installation", return_value={"installed": True, "mode": "native", "cmd": ["ns"]}):
            with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
                asyncio.run(run_simulation_task(exp_id, SessionLocal))

        db.expire_all()
        updated_exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        assert updated_exp.status == "failed"
        assert updated_exp.error_message is not None
        assert "NS-2 returned exit code 1" in updated_exp.error_message
    finally:
        db.close()

def test_subprocess_timeout_handling():
    db = SessionLocal()
    try:
        exp = Experiment(
            exp_code=f"EXP-TIMEOUT-{os.getpid()}",
            name="Timeout Handling Test",
            users=10,
            protocol="TCP",
            traffic_level="High",
            data_rate="1Mb",
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

        mock_proc = AsyncMock()
        mock_proc.returncode = None

        with patch("app.services.simulation_service.check_ns2_installation", return_value={"installed": True, "mode": "native", "cmd": ["ns"]}):
            with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
                with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError("NS-2 process timed out after 90 seconds")):
                    asyncio.run(run_simulation_task(exp_id, SessionLocal))

        db.expire_all()
        updated_exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        assert updated_exp.status == "failed"
        assert updated_exp.error_message is not None
        assert "timed out" in updated_exp.error_message.lower() or "exception" in updated_exp.error_message.lower()
    finally:
        db.close()

def test_missing_ns2_dependency_behavior():
    db = SessionLocal()
    try:
        exp = Experiment(
            exp_code=f"EXP-NONS2-{os.getpid()}",
            name="Missing Dependency Test",
            users=10,
            protocol="TCP",
            traffic_level="Low",
            data_rate="1Mb",
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

        with patch("app.services.simulation_service.check_ns2_installation", return_value={"installed": False, "mode": "none", "diagnostic": "ns not found on PATH"}):
            asyncio.run(run_simulation_task(exp_id, SessionLocal))

        db.expire_all()
        updated_exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        assert updated_exp.status == "failed"
        assert updated_exp.error_message is not None
        assert "not available on this system" in updated_exp.error_message
    finally:
        db.close()

def test_trace_file_missing_or_empty_failure(tmp_path):
    db = SessionLocal()
    try:
        exp = Experiment(
            exp_code=f"EXP-NOTRACE-{os.getpid()}",
            name="Trace Missing Test",
            users=10,
            protocol="TCP",
            traffic_level="Low",
            data_rate="1Mb",
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

        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"Simulation complete", b""))

        # In this test, the subprocess runs successfully, but no trace file is created
        with patch("app.services.simulation_service.check_ns2_installation", return_value={"installed": True, "mode": "native", "cmd": ["ns"]}):
            with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
                asyncio.run(run_simulation_task(exp_id, SessionLocal))

        db.expire_all()
        updated_exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
        assert updated_exp.status == "failed"
        assert updated_exp.error_message is not None
        assert "Trace Validation Failed" in updated_exp.error_message
    finally:
        db.close()

def test_simulation_history_ordering_and_fields():
    response = client.get("/api/simulations")
    assert response.status_code == 200
    sims = response.json()
    assert len(sims) >= 8

    # Verify fields in every record
    required_fields = ["id", "exp_code", "users", "protocol", "traffic_level", "data_rate", "delay", "simulation_time", "status"]
    for s in sims[:5]:
        for f in required_fields:
            assert f in s, f"Field '{f}' missing from simulation record"

    # Verify descending chronological ordering (newest ID or timestamp first)
    ids = [s["id"] for s in sims]
    assert ids == sorted(ids, reverse=True), "Simulations must be ordered newest first"

def test_experiment_comparison_rule_based_interpretation():
    response = client.get("/api/simulations")
    sims = response.json()
    completed_sims = [s for s in sims if s.get("result") is not None]
    assert len(completed_sims) >= 2

    # Pick two simulations (e.g. low load and high load)
    id1 = completed_sims[-1]["id"]
    id2 = completed_sims[0]["id"]

    comp_resp = client.get(f"/api/simulations/compare?ids={id1},{id2}")
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert "analysis_summary" in comp_data
    summary = comp_data["analysis_summary"]
    assert isinstance(summary, str)
    assert len(summary) > 20
    # Rule-based observations should discuss throughput, users, or protocols
    assert any(term in summary.lower() for term in ["throughput", "packet", "pdr", "loss", "delay", "workload"])



