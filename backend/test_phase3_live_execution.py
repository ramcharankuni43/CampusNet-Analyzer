import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Experiment, Result
from app.services.simulation_service import run_simulation_task, check_ns2_installation

async def test_live_simulation_without_ns2():
    print("=== Phase 3: Live Simulation Integrity Verification ===")
    ns_info = check_ns2_installation()
    print(f"NS-2 check info: installed={ns_info['installed']}, mode={ns_info['mode']}")

    db = SessionLocal()
    test_exp = None
    try:
        # Create a test experiment requesting LIVE NS-2 (is_demo=False)
        test_exp = Experiment(
            exp_code="TEST-LIVE-P3",
            name="Live NS-2 Rejection Verification Test",
            description="Automated Phase 3 verification that live simulation without NS-2 fails cleanly",
            users=35,
            protocol="TCP Tahoe",
            data_rate="10 Mbps",
            delay="20ms",
            simulation_time=5.0,
            experiment_type="Normal Traffic",
            traffic_level="Medium",
            is_demo=False,
            status="pending"
        )
        db.add(test_exp)
        db.commit()
        db.refresh(test_exp)
        exp_id = test_exp.id
        print(f"Created test experiment id={exp_id}, exp_code={test_exp.exp_code}, is_demo={test_exp.is_demo}")

        # Execute run_simulation_task
        print("Invoking run_simulation_task()...")
        await run_simulation_task(exp_id, SessionLocal)

        # Refresh experiment from DB
        db.refresh(test_exp)
        print(f"Post-execution status: {test_exp.status}")
        print(f"Recorded error_message: {test_exp.error_message}")
        print(f"Recorded trace_file: {test_exp.trace_file}")

        # Check if any Result record was created
        result = db.query(Result).filter(Result.experiment_id == exp_id).first()
        print(f"Result row created in DB? {'YES (Violation!)' if result else 'NO (Correct: no synthetic results injected)'}")

        # Check if trace file exists on disk
        if test_exp.trace_file and os.path.exists(test_exp.trace_file):
            print(f"Trace file exists? YES: {test_exp.trace_file} (Violation!)")
        else:
            print("Trace file created? NO (Correct: execution halted before generating/parsing fake traces)")

        # Verify assertions
        assert test_exp.status == "failed", f"Expected status 'failed', got '{test_exp.status}'"
        assert "NS-2 discrete-event simulator is not available" in (test_exp.error_message or ""), "Expected NS-2 error message"
        assert result is None, "Result must be None for failed live simulation"
        print("SUCCESS: Live NS-2 rejection verified! Academic integrity preserved.")
    finally:
        # Clean up test experiment so baseline DB is clean
        if test_exp:
            # Delete any results if created
            db.query(Result).filter(Result.experiment_id == test_exp.id).delete()
            # Delete experiment
            db.delete(test_exp)
            db.commit()
            print("Test experiment cleaned up from SQLite database.")
        db.close()

if __name__ == "__main__":
    asyncio.run(test_live_simulation_without_ns2())
