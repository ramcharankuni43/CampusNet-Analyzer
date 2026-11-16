import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Terminal,
  Activity,
  Layers,
  Repeat,
  PlayCircle,
  RefreshCw,
  TrendingDown,
  Zap,
  BookOpen
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { api } from '../services/api';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { CustomTooltip } from '../components/CustomTooltip';

export const GoBackN: React.FC = () => {
  const { mode, isDemo } = useSimulationMode();

  // Frontend Interactive Animation State
  const windowSize = 4;
  const totalFrames = 10;
  const [base, setBase] = useState<number>(0);
  const [nextSeq, setNextSeq] = useState<number>(0);
  const [lostTarget, setLostTarget] = useState<number>(2);
  const [retransmissionsCount, setRetransmissionsCount] = useState<number>(0);
  const [discardedCount, setDiscardedCount] = useState<number>(0);
  const [ackedFrames, setAckedFrames] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [simSpeedMs, setSimSpeedMs] = useState<number>(1200);

  const [logs, setLogs] = useState<string[]>([
    'Go-Back-N ARQ Engine initialized. Window size N=4. Drop target set to Frame #2.',
  ]);

  // Simulation Runner State
  const [ns2Window, setNs2Window] = useState<number>(8);
  const [ns2LossRate, setNs2LossRate] = useState<number>(0.05);
  const [ns2Result, setNs2Result] = useState<any>(null);
  const [isRunningNs2, setIsRunningNs2] = useState<boolean>(false);
  const [ns2Error, setNs2Error] = useState<string | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  useEffect(() => {
    // Load latest GBN run if present
    api.getGbnLatest().then((res) => {
      if (res && res.trace_points && res.trace_points.length > 0) {
        setNs2Result(res);
      }
    }).catch(() => null);
  }, []);

  const handleRunNs2 = async () => {
    setIsRunningNs2(true);
    setNs2Error(null);
    try {
      const res = await api.runGbnSimulation({
        window_size: ns2Window,
        loss_rate: ns2LossRate,
        simulation_time: 10.0,
      });
      setNs2Result(res);
    } catch (err: any) {
      setNs2Error(err.message || 'Failed to execute Go-Back-N simulation');
    } finally {
      setIsRunningNs2(false);
    }
  };

  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        handleStep();
      }, simSpeedMs);
    }
    return () => clearInterval(timer);
  }, [isPlaying, base, nextSeq, ackedFrames, lostTarget, retransmissionsCount, simSpeedMs]);

  const handleStep = () => {
    if (ackedFrames.length >= totalFrames) {
      setIsPlaying(false);
      addLog('All 10 frames successfully acknowledged by LMS receiver.');
      return;
    }

    if (nextSeq < base + windowSize && nextSeq < totalFrames) {
      const pkt = nextSeq;
      setNextSeq((prev) => prev + 1);

      if (pkt === lostTarget) {
        addLog(`Frame #${pkt} DROPPED in bottleneck queue! (Lost in transit)`);
      } else if (pkt > lostTarget && !ackedFrames.includes(lostTarget)) {
        setDiscardedCount((prev) => prev + 1);
        addLog(`Receiver rejected Frame #${pkt}: Out-of-order! (Receiver expecting Frame #${lostTarget}). Discarded.`);
      } else {
        addLog(`Sender transmitted Frame #${pkt} [Seq #${pkt}].`);
      }
      return;
    }

    if (!ackedFrames.includes(lostTarget) && nextSeq >= lostTarget + 1) {
      addLog(`Timer Expired for unacknowledged Frame #${lostTarget}!`);
      addLog(`GO-BACK-N INITIATED: Rewinding sender from #${nextSeq - 1} back to Frame #${lostTarget}...`);
      setRetransmissionsCount((prev) => prev + (nextSeq - lostTarget));
      setNextSeq(lostTarget);
      setLostTarget(-1);
      return;
    }

    if (nextSeq > base && !ackedFrames.includes(base)) {
      const acked = base;
      setAckedFrames((prev) => [...prev, acked]);
      setBase((prev) => prev + 1);
      addLog(`Receiver accepted Frame #${acked} -> Sent ACK #${acked + 1}. Window slides forward.`);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setBase(0);
    setNextSeq(0);
    setAckedFrames([]);
    setRetransmissionsCount(0);
    setDiscardedCount(0);
    setLostTarget(2);
    setLogs(['Go-Back-N simulator reset. Drop target set to Frame #2. Ready to transmit.']);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Go-Back-N ARQ Protocol Simulation"
        description="Discrete-event evaluation of pipelined transmission, cumulative ACKs, window rewinding, and out-of-order discard behavior"
        icon={Repeat}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <Link
            to="/sliding-window"
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <span>Sliding Window Visualizer</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
          </Link>
        }
      />

      {/* Discrete-Event ARQ Simulation Engine */}
      <Card
        title="Go-Back-N Discrete-Event ARQ Simulation Engine"
        subtitle="Simulates sender window rewinding upon timeout under stochastic channel packet drop"
        icon={Layers}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Window (N):</span>
              <select
                value={ns2Window}
                onChange={(e) => setNs2Window(Number(e.target.value))}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-mono font-bold bg-white"
              >
                <option value={4}>4 packets</option>
                <option value={8}>8 packets</option>
                <option value={16}>16 packets</option>
                <option value={32}>32 packets</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Loss Rate:</span>
              <select
                value={ns2LossRate}
                onChange={(e) => setNs2LossRate(Number(e.target.value))}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-mono font-bold bg-white text-rose-600"
              >
                <option value={0.02}>2% Loss</option>
                <option value={0.05}>5% Loss</option>
                <option value={0.10}>10% Loss</option>
                <option value={0.15}>15% Loss</option>
              </select>
            </div>

            <button
              onClick={handleRunNs2}
              disabled={isRunningNs2 || isDemo}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors ${
                isRunningNs2
                  ? 'bg-blue-400 text-white cursor-wait'
                  : isDemo
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isRunningNs2 ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              <span>{isRunningNs2 ? 'Simulating...' : 'Run GBN Simulation'}</span>
            </button>
          </div>
        }
      >
        {ns2Error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl mb-4">
            {ns2Error}
          </div>
        )}

        {/* Real Metrics Cards */}
        {ns2Result ? (
          <div className="space-y-4">
            {ns2Result.protocol_model && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    Model: {ns2Result.protocol_model}
                  </span>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-blue-800 border border-blue-200">
                    {ns2Result.is_demo ? 'DEMO BENCHMARK' : 'DISCRETE-EVENT ENGINE'}
                  </span>
                </div>
                {ns2Result.model_description && (
                  <p className="text-[11px] text-blue-800/90 leading-relaxed">
                    {ns2Result.model_description}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Packets Sent</span>
                <div className="text-xl font-bold font-mono text-slate-900 mt-1">{ns2Result.packets_sent}</div>
              </div>
              <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block tracking-wider">Received</span>
                <div className="text-xl font-bold font-mono text-emerald-900 mt-1">{ns2Result.packets_received}</div>
              </div>
              <div className="p-3.5 bg-rose-50/70 rounded-xl border border-rose-200">
                <span className="text-[10px] uppercase font-bold text-rose-800 block tracking-wider">Channel Drops</span>
                <div className="text-xl font-bold font-mono text-rose-900 mt-1">{ns2Result.packets_dropped}</div>
              </div>
              <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200">
                <span className="text-[10px] uppercase font-bold text-amber-800 block tracking-wider">Retransmissions</span>
                <div className="text-xl font-bold font-mono text-amber-900 mt-1">{ns2Result.retransmissions}</div>
              </div>
              <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200">
                <span className="text-[10px] uppercase font-bold text-blue-800 block tracking-wider">PDR</span>
                <div className="text-xl font-bold font-mono text-blue-900 mt-1">
                  {Math.round((ns2Result.packets_received / (ns2Result.packets_sent || 1)) * 1000) / 10}%
                </div>
              </div>
            </div>

            {/* Sequence vs Time Trace Chart */}
            {ns2Result.trace_points && ns2Result.trace_points.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Transmission Sequence Trace vs Simulated Time
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500">
                    {ns2Result.trace_points.length} Trace Points
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ns2Result.trace_points} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} unit="s" />
                      <YAxis dataKey="seq_num" tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip unit="Seq" />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="seq_num"
                        name="Sequence Number"
                        stroke="#2563EB"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 bg-slate-50/60 rounded-xl text-center text-xs text-slate-500 border border-slate-200">
            No Go-Back-N trace loaded yet. Click &ldquo;Run GBN Simulation&rdquo; above to execute.
          </div>
        )}
      </Card>

      {/* SECTION 2: Interactive Frame Window & Cumulative ACK Visualizer */}
      <Card
        title="Interactive Frame Window & Pipelining Visualizer"
        subtitle="Observe sender frame rewinding upon unacknowledged timeout"
        icon={Activity}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors text-white ${
                isPlaying ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              onClick={handleStep}
              disabled={isPlaying || ackedFrames.length >= totalFrames}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Step</span>
            </button>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Frame Sequence Buffer Grid */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2.5">
            {Array.from({ length: totalFrames }).map((_, idx) => {
              const isAcked = ackedFrames.includes(idx);
              const isNext = idx === nextSeq;
              const isInsideWindow = idx >= base && idx < base + windowSize;
              const isDropTarget = idx === lostTarget;

              let style = 'bg-slate-50 border-slate-200 text-slate-400';
              if (isAcked) style = 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold';
              else if (isDropTarget) style = 'bg-rose-50 border-rose-400 text-rose-800 font-bold';
              else if (isInsideWindow) style = 'bg-blue-50 border-blue-400 text-blue-800 font-bold';

              return (
                <div key={idx} className={`p-3 rounded-xl border-2 text-center transition-all ${style}`}>
                  <div className="text-[10px] font-mono uppercase opacity-75">Frame</div>
                  <div className="text-base font-bold font-mono">#{idx}</div>
                  <div className="text-[9px] mt-1 font-semibold truncate">
                    {isAcked ? 'ACKed' : isDropTarget ? 'Drop Plan' : isInsideWindow ? 'In Window' : 'Queued'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Statistics Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Window Base</span>
              <strong className="text-slate-900 font-mono text-sm">Frame #{base}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Next Sequence</span>
              <strong className="text-slate-900 font-mono text-sm">Frame #{nextSeq}</strong>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-rose-700 block text-[10px] uppercase font-bold">Rewound Frames</span>
              <strong className="text-rose-900 font-mono text-sm">{retransmissionsCount} retransmits</strong>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-amber-700 block text-[10px] uppercase font-bold">Out-Of-Order Discarded</span>
              <strong className="text-amber-900 font-mono text-sm">{discardedCount} rejected</strong>
            </div>
          </div>

          {/* Console Log Terminal */}
          <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs h-36 overflow-y-auto space-y-1.5 scroll-smooth border border-slate-800">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold select-none">&gt;</span>
                <span>{log}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default GoBackN;
