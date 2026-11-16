import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Clock,
  Terminal,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Cpu,
  FileCode,
  BarChart3,
  Network,
  RotateCcw,
  Sliders,
  Check
} from 'lucide-react';
import { api } from '../services/api';
import { subscribeSimulationStream } from '../services/websocket';
import { SimulationStatusResponse, Experiment } from '../types';
import { useSimulationMode } from '../context/SimulationModeContext';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { ProtocolBadge, StatusBadge } from '../components/Badge';

const STAGES = [
  { key: 'preparing', label: 'Preparing Run', icon: Cpu, desc: 'Initialize SimPy environment' },
  { key: 'generating', label: 'Topology Gen', icon: Network, desc: 'Setup R1, R2 & LMS nodes' },
  { key: 'running', label: 'Discrete Sim', icon: FileCode, desc: 'Execute event scheduler' },
  { key: 'processing', label: 'Trace Processing', icon: Activity, desc: 'Parse packet log events' },
  { key: 'calculating', label: 'Metric Audit', icon: BarChart3, desc: 'Conservation & rate check' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, desc: 'Persisted to SQLite DB' },
];

const normalizeStage = (stage: string = ''): string => {
  const s = stage.toLowerCase();
  if (s.includes('prep')) return 'preparing';
  if (s.includes('gen') || s.includes('topol')) return 'generating';
  if (s.includes('run') || s.includes('sim') || s.includes('start')) return 'running';
  if (s.includes('proc') || s.includes('trace') || s.includes('log')) return 'processing';
  if (s.includes('calc') || s.includes('metric')) return 'calculating';
  if (s.includes('comp')) return 'completed';
  if (s.includes('fail')) return 'failed';
  return s;
};

export const SimulationMonitor: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setMode } = useSimulationMode();
  const queryId = searchParams.get('id');

  const [simId, setSimId] = useState<number | null>(queryId ? parseInt(queryId, 10) : null);
  const [statusData, setStatusData] = useState<SimulationStatusResponse | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [activeExp, setActiveExp] = useState<Experiment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isLiveWs, setIsLiveWs] = useState<boolean>(false);
  const wsConnectedRef = React.useRef<boolean>(false);
  const logContainerRef = React.useRef<HTMLDivElement>(null);

  // If no simulation ID in query params, load experiments to select one
  useEffect(() => {
    if (!simId) {
      api.getExperiments({ limit: 10 }).then((exps) => {
        setExperiments(exps);
        if (exps.length > 0) {
          setSimId(exps[0].id);
        }
      }).catch(() => null);
    }
  }, [simId]);

  // Load active experiment configuration record
  useEffect(() => {
    if (!simId) return;
    api.getExperimentById(simId).then(setActiveExp).catch(() => null);
  }, [simId]);

  // Real-time WebSocket subscription with polling fallback
  useEffect(() => {
    if (!simId) return;

    // Initial HTTP fetch to prime state
    api.getSimulationStatus(simId).then(setStatusData).catch(() => null);

    // Subscribe to WebSocket
    const unsubscribe = subscribeSimulationStream(simId, {
      onOpen: () => {
        wsConnectedRef.current = true;
        setIsLiveWs(true);
      },
      onClose: () => {
        wsConnectedRef.current = false;
        setIsLiveWs(false);
      },
      onError: () => {
        wsConnectedRef.current = false;
        setIsLiveWs(false);
      },
      onMessage: (data) => {
        setStatusData((prev) => ({
          ...prev,
          ...data,
          id: simId,
          exp_code: data.exp_code || prev?.exp_code || `EXP-${simId}`,
          logs: data.logs || prev?.logs || [],
        }));
      },
    });

    // Fallback periodic poll in case WS disconnects
    const fallbackPoll = setInterval(() => {
      if (!wsConnectedRef.current && simId) {
        api.getSimulationStatus(simId).then((data) => {
          setStatusData(data);
          const st = (data.status || '').toLowerCase();
          if (st === 'completed' || st === 'failed') {
            clearInterval(fallbackPoll);
          }
        }).catch(() => null);
      }
    }, 1500);

    return () => {
      unsubscribe();
      clearInterval(fallbackPoll);
    };
  }, [simId]);

  // Auto-scroll logs to bottom as lines stream in
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [statusData?.logs]);

  const normStage = normalizeStage(statusData?.current_stage || statusData?.status || '');
  const currentStageIndex = STAGES.findIndex((s) => s.key === normStage);
  const isFailed = statusData?.status?.toLowerCase() === 'failed';
  const isCompleted = statusData?.status?.toLowerCase() === 'completed';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Header Banner */}
      <PageHeader
        title="Real-Time Simulation Monitor"
        subtitle="Live telemetry stream observing SimPy discrete-event execution, queue states, and trace parsing"
        icon={Activity}
        badge={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              {activeExp?.exp_code || statusData?.exp_code || (simId ? `EXP-${simId}` : 'No Run Selected')}
            </span>
            <StatusBadge status={statusData?.status || activeExp?.status || 'PENDING'} />
          </div>
        }
        actions={
          experiments.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Switch Run:</span>
              <select
                value={simId || ''}
                onChange={(e) => setSimId(parseInt(e.target.value, 10))}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-blue-500 shadow-xs"
              >
                {experiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.exp_code} - {exp.name} ({exp.status})
                  </option>
                ))}
              </select>
            </div>
          )
        }
      />

      {/* Failure Notification Card */}
      {isFailed && (
        <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5 font-bold text-rose-950 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Simulation Execution Terminated with Failure</span>
          </div>
          <p className="font-mono text-rose-800 leading-relaxed">
            {statusData?.error || 'The simulation encountered an unrecoverable error during discrete-event processing.'}
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <Link
              to="/simulate"
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Configure New Simulation</span>
            </Link>
            <Link
              to="/settings"
              className="px-4 py-2 bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 font-bold rounded-xl text-xs transition shadow-xs"
            >
              Engine Diagnostics
            </Link>
          </div>
        </div>
      )}

      {/* Completion Notification Card */}
      {isCompleted && (
        <div className="p-5 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/15 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-950">
                Simulation Completed Successfully!
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                Full packet traces parsed, conservation laws audited, and analytics persisted to SQLite database.
              </p>
            </div>
          </div>
          <Link
            to={`/experiments/${simId}`}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-xs shrink-0"
          >
            <span>View Full Analytics</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Target Configuration Overview */}
      <Card
        title="Execution Parameters"
        subtitle={activeExp?.name || 'Simulation Parameters Overview'}
        icon={Cpu}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Nodes</span>
            <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">{activeExp?.users ?? '—'}</span>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Protocol</span>
            <div className="mt-1">
              <ProtocolBadge protocol={activeExp?.protocol || 'TCP'} />
            </div>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Bandwidth</span>
            <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">{activeExp?.data_rate ?? '—'}</span>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Link Delay</span>
            <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">{activeExp?.delay || '20ms'}</span>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Duration</span>
            <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">{activeExp?.simulation_time ? `${activeExp.simulation_time}s` : '—'}</span>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Scenario</span>
            <span className="font-bold text-slate-800 text-xs mt-1 block truncate" title={activeExp?.experiment_type}>
              {activeExp?.experiment_type ?? 'Normal'}
            </span>
          </div>
        </div>
      </Card>

      {/* Progress & 6-Stage Stepper Card */}
      <Card
        title="Simulation Execution Pipeline"
        subtitle={statusData?.stage_message || 'Initializing simulation lifecycle stages...'}
        icon={Activity}
        actions={
          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-blue-600">
              {statusData?.progress_percent ?? 0}%
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Progress</div>
          </div>
        }
      >
        {/* Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-6">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out shadow-xs"
            style={{ width: `${statusData?.progress_percent ?? 0}%` }}
          />
        </div>

        {/* 6 Stage Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const isStageDone = currentStageIndex > idx || statusData?.status === 'COMPLETED';
            const isStageCurrent = currentStageIndex === idx && statusData?.status !== 'COMPLETED';

            return (
              <div
                key={stage.key}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center min-h-[90px] relative ${
                  isStageDone
                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 shadow-xs'
                    : isStageCurrent
                    ? 'bg-blue-50/80 border-blue-400 text-blue-900 shadow-md ring-2 ring-blue-300/60'
                    : 'bg-slate-50/60 border-slate-200 text-slate-400'
                }`}
              >
                <div className="mb-1.5">
                  {isStageDone ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <Icon className={`w-5 h-5 ${isStageCurrent ? 'text-blue-600 animate-bounce' : 'text-slate-400'}`} />
                  )}
                </div>
                <div className="text-[11px] font-bold tracking-tight leading-tight">
                  {stage.label}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-full">
                  {stage.desc}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Real-time Console Log Terminal */}
      <div className="bg-slate-900 text-slate-200 rounded-2xl border border-slate-800 shadow-xl overflow-hidden font-mono text-xs">
        <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold text-slate-300">
              Discrete-Event Engine Event Stream
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isLiveWs ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
            <span className="text-[10px] text-slate-400">
              {isLiveWs ? 'WebSocket Connected' : 'Polling Sync Mode'}
            </span>
          </div>
        </div>
        <div ref={logContainerRef} className="p-4 h-64 overflow-y-auto space-y-1.5 scroll-smooth text-xs leading-relaxed">
          {statusData?.logs && statusData.logs.length > 0 ? (
            statusData.logs.map((log, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold select-none">&gt;</span>
                <span className="text-slate-200 break-words">{log}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-500 italic py-4">Waiting for discrete-event engine output...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimulationMonitor;
