import asyncio
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import Experiment, Result
from ..schemas import (
    SimulationConfigCreate, SimulationStatusResponse, ResultResponse, ExperimentResponse,
    ComparisonRequest, ComparisonResponse,
    GbnSimulationRequest, GbnSimulationResponse, LeakyBucketRequest, LeakyBucketResponse
)
from ..services.simulation_service import (
    active_simulations, run_simulation_task, check_ns2_installation, ws_manager,
    run_gbn_simulation, run_leaky_bucket_simulation, run_tcp_udp_comparison_batch,
    run_full_analysis_pipeline, latest_gbn_result, latest_leaky_bucket_result
)
from .experiments import (
    format_experiment_response, get_experiments, get_experiment_by_id, perform_comparison
)


router = APIRouter(prefix="/simulations", tags=["Simulations"])

@router.post("/run", response_model=SimulationStatusResponse)
def trigger_simulation(
    config: SimulationConfigCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    # Ensure unique exp_code even after deletions
    counter = db.query(Experiment).count() + 1
    exp_code = f"EXP-{counter:03d}"
    while db.query(Experiment).filter(Experiment.exp_code == exp_code).first():
        counter += 1
        exp_code = f"EXP-{counter:03d}"

    # If user explicitly selected demo mode, set is_demo=True, otherwise keep False for Live NS-2 run
    is_demo = bool(config.force_demo)

    exp = Experiment(
        exp_code=exp_code,
        name=config.name,
        description=config.description,
        users=config.users,
        protocol=config.protocol.upper(),
        traffic_level=config.traffic_level,
        data_rate=config.data_rate,
        delay=config.delay,
        simulation_time=config.simulation_time,
        experiment_type=config.experiment_type,
        status="pending",
        is_demo=is_demo
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    # Initialize in-memory status
    active_simulations[exp.id] = {
        "status": "pending",
        "progress": 5,
        "progress_percent": 5,
        "current_stage": "pending",
        "message": f"Simulation queued: {exp.exp_code}",
        "stage_message": "Simulation Pending",
        "logs": [f"Created experiment record {exp.exp_code}"],
        "error": None
    }

    # Dispatch asynchronous background task
    background_tasks.add_task(run_simulation_task, exp.id, SessionLocal)

    return SimulationStatusResponse(
        id=exp.id,
        exp_code=exp.exp_code,
        experiment_id=exp.exp_code,
        status="pending",
        progress=5,
        progress_percent=5,
        current_stage="pending",
        message=f"Simulation queued: {exp.exp_code}",
        stage_message="Simulation Pending",
        logs=active_simulations[exp.id]["logs"],
        error=None,
        error_message=None,
        result=None
    )

@router.get("", response_model=List[ExperimentResponse])
def list_simulations(
    protocol: Optional[str] = None,
    experiment_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    mode: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Retrieve list of executed and queued simulations with optional filtering."""
    return get_experiments(
        protocol=protocol,
        experiment_type=experiment_type,
        status=status,
        search=search,
        mode=mode,
        limit=limit,
        db=db
    )

@router.get("/compare", response_model=ComparisonResponse)
def compare_simulations_get(
    ids: Optional[str] = Query(None, description="Comma-separated simulation IDs e.g. ?ids=1,2,3"),
    id: Optional[List[int]] = Query(None, description="Repeated ID query params e.g. ?id=1&id=2"),
    db: Session = Depends(get_db)
):
    """Compare performance metrics across two or more simulations via GET query parameters."""
    selected_ids: List[int] = []
    if id:
        selected_ids.extend(id)
    if ids:
        for part in ids.split(","):
            part_s = part.strip()
            if part_s.isdigit():
                selected_ids.append(int(part_s))

    deduped = list(dict.fromkeys(selected_ids))
    if len(deduped) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least two simulation IDs must be provided for comparison (e.g. ?ids=1,2)"
        )
    return perform_comparison(deduped, db)

@router.post("/compare", response_model=ComparisonResponse)
def compare_simulations_post(request: ComparisonRequest, db: Session = Depends(get_db)):
    """Compare performance metrics across two or more simulations via JSON POST request."""
    return perform_comparison(request.experiment_ids, db)

@router.post("/run-full-analysis")
async def trigger_full_analysis():
    """Executes the complete academic suite of NS-2 simulations across all presets and protocols."""
    try:
        results = await run_full_analysis_pipeline(SessionLocal)
        return {"message": "Full NS-2 analysis suite completed successfully", "results": results}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@router.post("/run-gbn", response_model=GbnSimulationResponse)
async def trigger_gbn_simulation(config: GbnSimulationRequest):
    """Runs a live NS-2 Go-Back-N simulation (Agent/TCP Tahoe) with packet drops and retransmissions."""
    try:
        res = await run_gbn_simulation(
            window_size=config.window_size,
            loss_rate=config.loss_rate,
            sim_time=config.simulation_time,
            force_demo=bool(config.force_demo)
        )
        return GbnSimulationResponse(**res)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@router.get("/gbn-latest", response_model=Optional[GbnSimulationResponse])
def get_latest_gbn():
    if not latest_gbn_result:
        return None
    return GbnSimulationResponse(**latest_gbn_result)

@router.post("/run-leaky-bucket", response_model=LeakyBucketResponse)
async def trigger_leaky_bucket_simulation(config: LeakyBucketRequest):
    """Runs paired live NS-2 simulations for bursty traffic with and without Leaky Bucket shaping."""
    try:
        res = await run_leaky_bucket_simulation(
            bucket_size=config.bucket_size,
            leak_rate=config.leak_rate,
            sim_time=config.simulation_time,
            force_demo=bool(config.force_demo)
        )
        return LeakyBucketResponse(**res)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@router.get("/leaky-bucket-latest", response_model=Optional[LeakyBucketResponse])
def get_latest_leaky_bucket():
    if not latest_leaky_bucket_result:
        return None
    return LeakyBucketResponse(**latest_leaky_bucket_result)

@router.post("/run-tcp-udp-batch")
async def trigger_tcp_udp_batch():
    """Runs live NS-2 multi-rate benchmarks (256K, 512K, 1M, 2M, 5M) for TCP vs UDP."""
    try:
        table = await run_tcp_udp_comparison_batch(SessionLocal)
        return {"message": "TCP vs UDP multi-rate benchmarks completed successfully", "data": table}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@router.get("/{id}", response_model=ExperimentResponse)
def get_simulation_by_id(id: int, mode: Optional[str] = None, db: Session = Depends(get_db)):
    """Retrieve details, status, and metrics for a specific simulation by ID."""
    return get_experiment_by_id(id=id, mode=mode, db=db)

@router.get("/{id}/status", response_model=SimulationStatusResponse)
def get_simulation_status(id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == id).first()
    if not exp:
        raise HTTPException(status_code=404, detail=f"Simulation with ID {id} not found")

    res_resp = None
    if exp.result:
        ts = json.loads(exp.result.time_series_json) if exp.result.time_series_json else []
        res_resp = ResultResponse(
            id=exp.result.id,
            experiment_id=exp.result.experiment_id,
            throughput_kbps=exp.result.throughput_kbps,
            packet_loss_percent=exp.result.packet_loss_percent,
            packet_delivery_ratio=exp.result.packet_delivery_ratio,
            average_delay_ms=exp.result.average_delay_ms,
            packets_sent=exp.result.packets_sent,
            packets_received=exp.result.packets_received,
            packets_dropped=exp.result.packets_dropped,
            data_rate_kbps=exp.result.data_rate_kbps,
            summary_notes=exp.result.summary_notes,
            time_series=ts
        )

    # Check active memory status
    state = active_simulations.get(id)
    if state:
        err = state.get("error") or getattr(exp, "error_message", None)
        return SimulationStatusResponse(
            id=exp.id,
            exp_code=exp.exp_code,
            experiment_id=exp.exp_code,
            status=state["status"],
            progress=state.get("progress", state["progress_percent"]),
            progress_percent=state["progress_percent"],
            current_stage=state["current_stage"],
            message=state.get("message", state["stage_message"]),
            stage_message=state["stage_message"],
            logs=state["logs"],
            error=err,
            error_message=err,
            result=res_resp
        )

    # If completed/failed and not in active memory
    progress = 100 if exp.status in ["COMPLETED", "completed"] else 0
    err = getattr(exp, "error_message", None)
    return SimulationStatusResponse(
        id=exp.id,
        exp_code=exp.exp_code,
        experiment_id=exp.exp_code,
        status=exp.status.lower(),
        progress=progress,
        progress_percent=progress,
        current_stage="completed" if progress == 100 else exp.status.lower(),
        message="Simulation completed." if progress == 100 else (err or f"Status: {exp.status}"),
        stage_message="Completed" if progress == 100 else f"Status: {exp.status}",
        logs=[f"Simulation {exp.exp_code} status: {exp.status}"],
        error=err,
        error_message=err,
        result=res_resp
    )

@router.get("/{id}/results", response_model=ExperimentResponse)
def get_simulation_results(id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == id).first()
    if not exp:
        raise HTTPException(status_code=404, detail=f"Simulation with ID {id} not found")
    return format_experiment_response(exp)

@router.websocket("/ws/{id}")
async def simulation_websocket_endpoint(websocket: WebSocket, id: int):
    """Real-time streaming of simulation stages and console logs via WebSocket."""
    await ws_manager.connect_sim(id, websocket)
    try:
        # Immediately send current state if available
        if id in active_simulations:
            await websocket.send_json(active_simulations[id])
        else:
            # Check database for status
            db = SessionLocal()
            try:
                exp = db.query(Experiment).filter(Experiment.id == id).first()
                if exp:
                    await websocket.send_json({
                        "status": exp.status,
                        "progress_percent": 100 if exp.status == "COMPLETED" else 0,
                        "current_stage": exp.status,
                        "stage_message": f"Simulation status: {exp.status}",
                        "logs": [f"Simulation {exp.exp_code} status: {exp.status}"]
                    })
            finally:
                db.close()

        # Keep connection open and handle client ping/heartbeat
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_sim(id, websocket)
    except Exception:
        ws_manager.disconnect_sim(id, websocket)

@router.websocket("/ws/global/telemetry")
async def telemetry_websocket_endpoint(websocket: WebSocket):
    """Global telemetry broadcaster for live completed simulations and aggregate stats."""
    await ws_manager.connect_global(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect_global(websocket)
    except Exception:
        ws_manager.disconnect_global(websocket)
