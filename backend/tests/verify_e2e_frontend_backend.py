"""
CampusNet Analyzer - End-to-End Local Live Verification Script
Simulates full client interaction with live FastAPI server:
1. Boots test server or connects to live FastAPI instance
2. Verifies GET /api/health and /api/system/status
3. Submits real SimPy simulation (Online Classroom benchmark) via POST /api/simulations/run
4. Polls GET /api/simulations/{id}/status until completion
5. Retrieves GET /api/simulations/{id}/results
6. Asserts exact mathematical conservation and metric values
"""
import os
import sys
import time
import json
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.database import SessionLocal, init_db
from app.models import Experiment, Result
from app.services.seed_data import seed_database

def run_e2e_verification():
    print("[E2E] Initializing database...")
    init_db()
    db = SessionLocal()
    try:
        if db.query(Experiment).count() == 0:
            seed_database(db, force=False)
    finally:
        db.close()

    client = TestClient(app)

    print("[E2E] Step 1: Probing GET /api/health...")
    health_resp = client.get("/api/health")
    assert health_resp.status_code == 200, f"Health probe failed: {health_resp.status_code}"
    health = health_resp.json()
    assert health["status"] == "online"
    assert health["simulator"]["operational"] is True
    print(f"[E2E] API Health: {health['status']} | Simulator: {health['simulator']['engine']} (v{health['simulator']['version']})")

    print("[E2E] Step 2: Probing GET /api/system/status...")
    sys_resp = client.get("/api/system/status")
    assert sys_resp.status_code == 200
    sys_data = sys_resp.json()
    assert sys_data["simulator_operational"] is True
    print(f"[E2E] System Status Mode: {sys_data['execution_mode']} | DB Connected: {sys_data['db_connected']}")

    print("[E2E] Step 3: Submitting Online Classroom Benchmark via POST /api/simulations/run...")
    payload = {
        "name": "E2E Live Benchmark Run",
        "description": "End-to-End verified run of 10 students over 10 Mbps bottleneck with seed 42",
        "users": 10,
        "protocol": "TCP",
        "traffic_level": "Medium",
        "data_rate": "10 Mbps",
        "delay": "20ms",
        "simulation_time": 5.0,
        "seed": 42,
        "experiment_type": "Online Classroom",
        "packet_size": 512,
        "window_size": 32,
        "queue_capacity": 50
    }
    run_resp = client.post("/api/simulations/run", json=payload)
    assert run_resp.status_code == 200, f"Submit failed: {run_resp.text}"
    submit_info = run_resp.json()
    exp_id = submit_info["id"]
    exp_code = submit_info["exp_code"]
    print(f"[E2E] Experiment queued: ID={exp_id}, Code={exp_code}")

    print(f"[E2E] Step 4: Polling status for Experiment #{exp_id}...")
    status_resp = client.get(f"/api/simulations/{exp_id}/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    print(f"[E2E] Status: {status_data['status']} | Progress: {status_data['progress_percent']}% | Stage: {status_data['current_stage']}")
    assert status_data["status"] == "completed"
    assert status_data["progress_percent"] == 100

    print(f"[E2E] Step 5: Retrieving results via GET /api/simulations/{exp_id}/results...")
    results_resp = client.get(f"/api/simulations/{exp_id}/results")
    assert results_resp.status_code == 200
    res_data = results_resp.json()
    res = res_data["result"]
    assert res is not None

    print("\n[E2E] --- FINAL BENCHMARK METRIC VERIFICATION ---")
    print(f"  • Packets Sent (Generated):    {res['packets_sent']}")
    print(f"  • Packets Received (Delivered): {res['packets_received']}")
    print(f"  • Packets Dropped (Lost):       {res['packets_dropped']}")
    print(f"  • Packet Delivery Ratio:        {res['packet_delivery_ratio']}%")
    print(f"  • Packet Loss Percent:          {res['packet_loss_percent']}%")
    print(f"  • Throughput:                   {res['throughput_kbps']} Kbps")
    print(f"  • Average Delay:                {res['average_delay_ms']} ms")
    print(f"  • Time Series Buckets:          {len(res['time_series'])} intervals")

    assert res["packets_sent"] == 11998, f"Expected 11998 sent, got {res['packets_sent']}"
    assert res["packets_received"] == 11998, f"Expected 11998 delivered, got {res['packets_received']}"
    assert res["packets_dropped"] == 0, f"Expected 0 dropped, got {res['packets_dropped']}"
    assert res["packet_delivery_ratio"] == 100.0
    assert res["packet_loss_percent"] == 0.0
    assert abs(res["throughput_kbps"] - 9733.29) <= 5.0
    assert abs(res["average_delay_ms"] - 37.80) <= 2.0
    assert len(res["time_series"]) == 6

    print("\n[E2E] SUCCESS: Full end-to-end integration verified without discrepancies!")

if __name__ == "__main__":
    run_e2e_verification()
