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
    tp = None
    loss = None
    pdr = None
    delay_ms = None
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
        tp = exp.result.throughput_kbps
        loss = exp.result.packet_loss_percent
        pdr = exp.result.packet_delivery_ratio
        delay_ms = exp.result.average_delay_ms

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
        error_message=getattr(exp, "error_message", None),
        created_at=exp.created_at,
        result=res_resp,
        throughput_kbps=tp,
        packet_loss_percent=loss,
        packet_delivery_ratio=pdr,
        average_delay_ms=delay_ms
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

def perform_comparison(experiment_ids: List[int], db: Session) -> ComparisonResponse:
    if len(experiment_ids) < 2:
        raise HTTPException(status_code=400, detail="At least two experiments must be selected for comparison")

    experiments = db.query(Experiment).filter(Experiment.id.in_(experiment_ids)).all()
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

    # Rule-Based Analytical Interpretation (Phase 7)
    notes = []

    # Head-to-Head 2-experiment comparison analysis
    if len(metrics_table) == 2:
        m1, m2 = metrics_table[0], metrics_table[1]
        
        # User concurrency comparison
        if m2["users"] != m1["users"]:
            diff_u = m2["users"] - m1["users"]
            direction = "increased" if diff_u > 0 else "decreased"
            notes.append(f"Workload {direction} from {m1['users']} to {m2['users']} student nodes ({abs(diff_u):+d} users).")

        # Throughput comparison
        if m1["throughput_kbps"] > 0 and m2["throughput_kbps"] > 0:
            diff_tp = round(m2["throughput_kbps"] - m1["throughput_kbps"], 2)
            pct_tp = round((diff_tp / m1["throughput_kbps"]) * 100, 1)
            if diff_tp < -0.1:
                notes.append(f"Throughput decreased by {abs(diff_tp):.2f} Kbps ({pct_tp}%), dropping from {m1['throughput_kbps']:.2f} Kbps to {m2['throughput_kbps']:.2f} Kbps.")
            elif diff_tp > 0.1:
                notes.append(f"Throughput increased by {diff_tp:.2f} Kbps (+{pct_tp}%), rising from {m1['throughput_kbps']:.2f} Kbps to {m2['throughput_kbps']:.2f} Kbps.")
            else:
                notes.append(f"Throughput remained steady at approximately {m1['throughput_kbps']:.2f} Kbps.")

        # Packet Loss comparison
        diff_loss = round(m2["packet_loss_percent"] - m1["packet_loss_percent"], 2)
        if diff_loss > 0.1:
            notes.append(f"Packet loss increased from {m1['packet_loss_percent']:.2f}% to {m2['packet_loss_percent']:.2f}% (+{diff_loss:.2f}%) under higher traffic pressure.")
        elif diff_loss < -0.1:
            notes.append(f"Packet loss decreased from {m1['packet_loss_percent']:.2f}% to {m2['packet_loss_percent']:.2f}% ({diff_loss:.2f}%).")

        # Average Delay comparison
        diff_delay = round(m2["average_delay_ms"] - m1["average_delay_ms"], 2)
        if diff_delay > 0.5:
            notes.append(f"Average delay increased from {m1['average_delay_ms']:.2f} ms to {m2['average_delay_ms']:.2f} ms (+{diff_delay:.2f} ms) due to buffer queueing latency.")
        elif diff_delay < -0.5:
            notes.append(f"Average delay decreased from {m1['average_delay_ms']:.2f} ms to {m2['average_delay_ms']:.2f} ms ({diff_delay:.2f} ms).")

        # Packet Delivery Ratio (PDR) comparison
        diff_pdr = round(m2["pdr_percent"] - m1["pdr_percent"], 2)
        if diff_pdr < -0.1:
            notes.append(f"Packet delivery ratio decreased from {m1['pdr_percent']:.2f}% to {m2['pdr_percent']:.2f}% ({diff_pdr:.2f}%), indicating reduced delivery reliability.")
        elif diff_pdr > 0.1:
            notes.append(f"Packet delivery ratio improved from {m1['pdr_percent']:.2f}% to {m2['pdr_percent']:.2f}% (+{diff_pdr:.2f}%).")

        # Protocol comparison
        if m1["protocol"] != m2["protocol"]:
            notes.append(f"Protocol comparison ({m1['protocol']} vs {m2['protocol']}): {m1['protocol']} achieved {m1['pdr_percent']:.1f}% PDR with {m1['packet_loss_percent']:.1f}% loss, while {m2['protocol']} achieved {m2['pdr_percent']:.1f}% PDR with {m2['packet_loss_percent']:.1f}% loss.")

        # Traffic shaping (Leaky Bucket) observation
        types_str = f"{formatted_exps[0].experiment_type} {formatted_exps[1].experiment_type}".lower()
        if "leaky bucket" in types_str or "shaping" in types_str:
            notes.append("Traffic shaping with Leaky Bucket regulated the measured output rate to the bucket leak rate, mitigating bottleneck overflow.")

    else:
        # Multi-experiment observations
        tcp_runs = [m for m in metrics_table if m["protocol"] == "TCP"]
        udp_runs = [m for m in metrics_table if m["protocol"] == "UDP"]
        
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

@router.post("/compare", response_model=ComparisonResponse)
def compare_experiments(request: ComparisonRequest, db: Session = Depends(get_db)):
    return perform_comparison(request.experiment_ids, db)
