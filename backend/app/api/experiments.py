import os
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Experiment, Result
from ..schemas import (
    ExperimentResponse, ResultResponse, SimulationConfigCreate,
    ComparisonRequest, ComparisonResponse
)

router = APIRouter(prefix="/experiments", tags=["Experiments"])

def format_experiment_response(exp: Experiment) -> ExperimentResponse:
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
    return ExperimentResponse(
        id=exp.id,
        exp_code=exp.exp_code,
        name=exp.name,
        description=exp.description,
        users=exp.users,
        protocol=exp.protocol,
        traffic_level=exp.traffic_level,
        data_rate=exp.data_rate,
        delay=exp.delay or "20ms",
        simulation_time=exp.simulation_time,
        experiment_type=exp.experiment_type,
        status=exp.status,
        is_demo=exp.is_demo,
        trace_file=exp.trace_file,
        output_dir=exp.output_dir,
        created_at=exp.created_at,
        result=res_resp
    )

@router.get("", response_model=List[ExperimentResponse])
def get_experiments(
    protocol: Optional[str] = None,
    experiment_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    mode: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(Experiment)

    if mode:
        m = mode.lower()
        if m in ("realtime", "live"):
            query = query.filter(Experiment.is_demo == False)
        elif m == "demo":
            query = query.filter(Experiment.is_demo == True)

    if protocol:
        query = query.filter(Experiment.protocol == protocol.upper())
    if experiment_type:
        query = query.filter(Experiment.experiment_type == experiment_type)
    if status:
        query = query.filter(Experiment.status == status.upper())
    if search:
        query = query.filter(
            (Experiment.name.ilike(f"%{search}%")) |
            (Experiment.exp_code.ilike(f"%{search}%")) |
            (Experiment.description.ilike(f"%{search}%"))
        )

    experiments = query.order_by(Experiment.created_at.desc()).limit(limit).all()
    return [format_experiment_response(exp) for exp in experiments]

@router.get("/{id}", response_model=ExperimentResponse)
def get_experiment_by_id(id: int, mode: Optional[str] = None, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == id).first()
    if not exp:
        raise HTTPException(status_code=404, detail=f"Experiment with ID {id} not found")

    if mode:
        m = mode.lower()
        if m in ("realtime", "live") and exp.is_demo:
            raise HTTPException(status_code=404, detail=f"Experiment #{id} is not a real-time experiment")
        elif m == "demo" and not exp.is_demo:
            raise HTTPException(status_code=404, detail=f"Experiment #{id} is not a demo experiment")

    return format_experiment_response(exp)

@router.post("", response_model=ExperimentResponse)
def create_experiment(config: SimulationConfigCreate, db: Session = Depends(get_db)):
    counter = db.query(Experiment).count() + 1
    exp_code = f"EXP-{counter:03d}"
    while db.query(Experiment).filter(Experiment.exp_code == exp_code).first():
        counter += 1
        exp_code = f"EXP-{counter:03d}"

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
        is_demo=bool(config.force_demo)
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return format_experiment_response(exp)

@router.delete("/{id}")
def delete_experiment(id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == id).first()
    if not exp:
        raise HTTPException(status_code=404, detail=f"Experiment with ID {id} not found")

    from ..services.simulation_service import SIMULATION_DIR
    sim_base_path = os.path.abspath(SIMULATION_DIR)

    # Clean up output directory if present and strictly inside SIMULATION_DIR
    if exp.output_dir:
        abs_out = os.path.abspath(exp.output_dir)
        if abs_out.startswith(sim_base_path) and os.path.exists(abs_out):
            try:
                import shutil
                shutil.rmtree(abs_out, ignore_errors=True)
            except OSError:
                pass

    # Clean up associated trace file if present and strictly inside SIMULATION_DIR
    if exp.trace_file:
        abs_tf = os.path.abspath(exp.trace_file)
        if abs_tf.startswith(sim_base_path) and os.path.exists(abs_tf):
            try:
                os.remove(abs_tf)
            except OSError:
                pass

    db.delete(exp)
    db.commit()
    return {"message": f"Experiment {exp.exp_code} deleted successfully", "id": id}

@router.post("/compare", response_model=ComparisonResponse)
def compare_experiments(request: ComparisonRequest, db: Session = Depends(get_db)):
    if len(request.experiment_ids) < 2:
        raise HTTPException(status_code=400, detail="At least two experiments must be selected for comparison")

    experiments = db.query(Experiment).filter(Experiment.id.in_(request.experiment_ids)).all()
    if len(experiments) < 2:
        raise HTTPException(status_code=404, detail="One or more requested experiments were not found")

    formatted_exps = [format_experiment_response(e) for e in experiments]

    metrics_table = []
    chart_throughput = []
    chart_loss = []
    chart_delay = []
    chart_pdr = []

    for e in formatted_exps:
        r = e.result
        tp = r.throughput_kbps if r else 0.0
        loss = r.packet_loss_percent if r else 0.0
        pdr = r.packet_delivery_ratio if r else 0.0
        delay = r.average_delay_ms if r else 0.0
        sent = r.packets_sent if r else 0
        recv = r.packets_received if r else 0
        dropped = r.packets_dropped if r else 0

        metrics_table.append({
            "id": e.id,
            "exp_code": e.exp_code,
            "name": e.name,
            "protocol": e.protocol,
            "users": e.users,
            "traffic_level": e.traffic_level,
            "throughput_kbps": tp,
            "packet_loss_percent": loss,
            "pdr_percent": pdr,
            "average_delay_ms": delay,
            "packets_sent": sent,
            "packets_received": recv,
            "packets_dropped": dropped
        })

        chart_throughput.append({"name": f"{e.exp_code} ({e.protocol})", "throughput": tp, "users": e.users})
        chart_loss.append({"name": f"{e.exp_code} ({e.protocol})", "loss": loss, "users": e.users})
        chart_delay.append({"name": f"{e.exp_code} ({e.protocol})", "delay": delay, "users": e.users})
        chart_pdr.append({"name": f"{e.exp_code} ({e.protocol})", "pdr": pdr, "users": e.users})

    # Generate analytical observation
    tcp_runs = [m for m in metrics_table if m["protocol"] == "TCP"]
    udp_runs = [m for m in metrics_table if m["protocol"] == "UDP"]
    
    notes = []
    if tcp_runs and udp_runs:
        avg_tcp_pdr = sum(m["pdr_percent"] for m in tcp_runs) / len(tcp_runs)
        avg_udp_pdr = sum(m["pdr_percent"] for m in udp_runs) / len(udp_runs)
        notes.append(f"TCP maintained higher reliability ({avg_tcp_pdr:.1f}% PDR) compared to UDP ({avg_udp_pdr:.1f}% PDR) due to retransmission.")
    
    high_user_runs = [m for m in metrics_table if m["users"] >= 50]
    low_user_runs = [m for m in metrics_table if m["users"] < 50]
    if high_user_runs and low_user_runs:
        avg_high_loss = sum(m["packet_loss_percent"] for m in high_user_runs) / len(high_user_runs)
        avg_low_loss = sum(m["packet_loss_percent"] for m in low_user_runs) / len(low_user_runs)
        notes.append(f"Heavy student concurrency (>=50 users) increased queue drops from {avg_low_loss:.1f}% to {avg_high_loss:.1f}%.")

    summary_text = " ".join(notes) if notes else "Comparative analysis illustrates throughput vs loss trade-offs across configurations."

    return ComparisonResponse(
        experiments=formatted_exps,
        metrics_table=metrics_table,
        comparison_charts={
            "throughput": chart_throughput,
            "loss": chart_loss,
            "delay": chart_delay,
            "pdr": chart_pdr
        },
        analysis_summary=summary_text
    )
