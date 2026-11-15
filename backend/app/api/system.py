import sys
import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db, DB_PATH
from ..models import Experiment
from ..schemas import SystemStatusResponse
from ..services.simulation_service import check_ns2_installation, check_wsl_status, check_simulation_engine
from ..services.seed_data import seed_database

router = APIRouter(prefix="/system", tags=["System"])

@router.get("/status", response_model=SystemStatusResponse)
def get_system_status(db: Session = Depends(get_db)):
    ns_info = check_ns2_installation()
    wsl_info = check_wsl_status()
    sim_readiness = check_simulation_engine()
    total_exps = db.query(Experiment).count()

    if sim_readiness.get("operational"):
        mode = "SimPy Discrete-Event Simulation Engine"
    elif ns_info.get("installed"):
        mode = "NS-2 LIVE SIMULATION"
    else:
        mode = "DEMO MODE — Sample Data"

    return SystemStatusResponse(
        ns2_installed=ns_info["installed"],
        ns2_path=ns_info["path"],
        execution_mode=mode,
        wsl_detected=wsl_info["wsl_installed"],
        wsl_distro=ns_info.get("distro") or (wsl_info["distros"][0] if wsl_info["distros"] else None),
        python_version=sys.version.split()[0],
        db_connected=True,
        database_path=DB_PATH,
        total_experiments=total_exps,
        simulator_operational=sim_readiness.get("operational", False),
        simulator_engine=sim_readiness.get("engine", "SimPy Discrete-Event Simulation Engine"),
        simulator_version=sim_readiness.get("version", "4.1.1"),
        simulator_diagnostic=sim_readiness.get("diagnostic", ""),
        smoke_test_latency_ms=sim_readiness.get("smoke_test_latency_ms"),
        conservation_verified=sim_readiness.get("conservation_verified")
    )

@router.post("/seed")
def seed_system_data(force: bool = False, db: Session = Depends(get_db)):
    seed_database(db, force=force)
    total = db.query(Experiment).count()
    return {"message": "Database successfully seeded with academic baseline experiments", "total_experiments": total}
