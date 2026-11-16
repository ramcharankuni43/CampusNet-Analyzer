import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  Terminal,
  Activity,
  Zap,
  BookOpen
} from 'lucide-react';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';

export const SlidingWindow: React.FC = () => {
  const { mode, isDemo } = useSimulationMode();

  // Sliding Window Simulation State
  const totalPackets = 12;
  const [windowSize, setWindowSize] = useState<number>(4);
  const [base, setBase] = useState<number>(0);
  const [nextSeq, setNextSeq] = useState<number>(0);
  const [ackedPackets, setAckedPackets] = useState<number[]>([]);
  const [inFlightPackets, setInFlightPackets] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [simSpeedMs, setSimSpeedMs] = useState<number>(1200);
  const [rttProgress, setRttProgress] = useState<number>(0);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([
    'Sliding Window Engine initialized. Window size = 4 frames.',
  ]);

  // Handle Play Animation Loop
  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        handleStepForward();
      }, simSpeedMs);
    }
    return () => clearInterval(timer);
  }, [isPlaying, base, nextSeq, inFlightPackets, ackedPackets, windowSize, simSpeedMs, dropTarget]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  const handleStepForward = () => {
    // Check if finished
    if (ackedPackets.length >= totalPackets) {
      setIsPlaying(false);
      addLog('All packets successfully delivered and acknowledged!');
      return;
    }

    // Step 1: Can we transmit a new frame inside the window?
    if (nextSeq < base + windowSize && nextSeq < totalPackets) {
      const pkt = nextSeq;
      setNextSeq((prev) => prev + 1);
      setInFlightPackets((prev) => [...prev, pkt]);

      if (dropTarget === pkt) {
        addLog(`Frame #${pkt} injected into channel -> ❌ SIMULATED PACKET LOSS!`);
      } else {
        addLog(`Transmitted Frame #${pkt} [Seq: ${pkt}]. In-flight window [${base}..${base + windowSize - 1}].`);
      }
      return;
    }

    // Step 2: Receive ACK for the oldest in-flight frame
    if (inFlightPackets.length > 0) {
      const oldestInFlight = inFlightPackets[0];

      if (oldestInFlight === dropTarget) {
        addLog(`⏱️ RTO Timeout for Frame #${oldestInFlight}! Packet lost. Retransmitting from Frame #${oldestInFlight}...`);
        setNextSeq(oldestInFlight);
        setInFlightPackets([]);
        setDropTarget(null);
        return;
      }

      setInFlightPackets((prev) => prev.slice(1));
      setAckedPackets((prev) => (prev.includes(oldestInFlight) ? prev : [...prev, oldestInFlight]));
      setBase((prev) => prev + 1);
      addLog(`Received ACK for Frame #${oldestInFlight} -> Window slid to [${base + 1}..${base + 1 + windowSize - 1}].`);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setBase(0);
    setNextSeq(0);
    setAckedPackets([]);
    setInFlightPackets([]);
    setRttProgress(0);
    setLogs(['Sliding Window simulator reset. Ready for transmission.']);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Sliding Window Flow Control Simulator"
        description="Interactive visualization of pipelined transmission, sliding window frames, cumulative ACKs, and RTO timeouts"
        icon={Layers}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <Link
            to="/go-back-n"
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <span>Switch to Go-Back-N</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
          </Link>
        }
      />

      {/* Control Toolbar */}
      <Card
        title="Playback & Channel Controls"
        subtitle="Control transmission pacing, frame stepping, window sizing, and fault injection"
        icon={Activity}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors text-white ${
                isPlaying ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{isPlaying ? 'Pause Simulator' : 'Start Simulation'}</span>
            </button>

            <button
              onClick={handleStepForward}
              disabled={isPlaying || ackedPackets.length >= totalPackets}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-xl text-xs font-bold transition-colors"
            >
              <SkipForward className="w-4 h-4" />
              <span>Step Single Frame</span>
            </button>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>

          {/* Configuration Parameters */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Window Size:</span>
              <select
                value={windowSize}
                onChange={(e) => {
                  setWindowSize(Number(e.target.value));
                  handleReset();
                }}
                disabled={isPlaying}
                className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500"
              >
                <option value={2}>N = 2 Frames</option>
                <option value={4}>N = 4 Frames</option>
                <option value={6}>N = 6 Frames</option>
                <option value={8}>N = 8 Frames</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Fault Injection:</span>
              <select
                value={dropTarget === null ? 'none' : dropTarget}
                onChange={(e) => setDropTarget(e.target.value === 'none' ? null : Number(e.target.value))}
                className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold text-rose-600 focus:ring-2 focus:ring-rose-500"
              >
                <option value="none">No Loss (Reliable Link)</option>
                <option value={2}>Drop Frame #2</option>
                <option value={4}>Drop Frame #4</option>
                <option value={6}>Drop Frame #6</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Speed:</span>
              <select
                value={simSpeedMs}
                onChange={(e) => setSimSpeedMs(Number(e.target.value))}
                className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold focus:ring-2 focus:ring-blue-500"
              >
                <option value={1800}>0.5x Slow</option>
                <option value={1200}>1.0x Normal</option>
                <option value={600}>2.0x Fast</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Frame Sequence Buffer Visualization */}
      <Card
        title="Sender Frame Buffer & Window Sliding Plane"
        subtitle={`Active window boundary: [${base} .. ${Math.min(base + windowSize - 1, totalPackets - 1)}] | Capacity: ${windowSize} frames`}
        icon={Layers}
        action={
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-600 font-medium">ACKed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-600" />
              <span className="text-slate-600 font-medium">In-Flight</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-400" />
              <span className="text-slate-600 font-medium">Window Window</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-300" />
              <span className="text-slate-600 font-medium">Queued</span>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2.5 pt-2">
          {Array.from({ length: totalPackets }).map((_, idx) => {
            const isAcked = ackedPackets.includes(idx);
            const isInFlight = inFlightPackets.includes(idx);
            const isInsideWindow = idx >= base && idx < base + windowSize;

            let cardStyle = 'bg-slate-50 border-slate-200 text-slate-400';
            if (isAcked) cardStyle = 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold shadow-xs';
            else if (isInFlight) cardStyle = 'bg-blue-600 border-blue-700 text-white font-bold animate-pulse shadow-md shadow-blue-500/20';
            else if (isInsideWindow) cardStyle = 'bg-blue-50 border-blue-300 text-blue-700 font-bold';

            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border-2 text-center transition-all ${cardStyle}`}
              >
                <div className="text-[10px] uppercase font-mono tracking-wider opacity-80">Frame</div>
                <div className="text-base font-bold font-mono">#{idx}</div>
                <div className="text-[9px] mt-1 font-semibold truncate">
                  {isAcked ? 'ACKed' : isInFlight ? 'In-Flight' : isInsideWindow ? 'Eligible' : 'Queued'}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Interactive Communication Link Diagram */}
      <div className="p-6 bg-slate-900 rounded-2xl text-white shadow-lg space-y-4 border border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Bi-Directional Transmission Channel
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Delivered: {ackedPackets.length} / {totalPackets} Frames
          </span>
        </div>

        <div className="py-6 px-2">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6 relative z-10">
            {/* Sender Node */}
            <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-center w-full sm:w-44 shadow-md">
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">
                Sender Station
              </span>
              <div className="text-sm font-bold mt-1 text-slate-100">Student Host</div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">Base: {base} | Next: {nextSeq}</div>
            </div>

            {/* Flight Channel */}
            <div className="flex-1 w-full relative h-16 flex flex-col justify-center">
              <div className="h-1 bg-slate-800 w-full relative rounded-full">
                {inFlightPackets.map((pkt, i) => (
                  <div
                    key={pkt}
                    className="absolute -top-3.5 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-blue-500/50 animate-bounce font-mono"
                    style={{ left: `${20 + i * 20}%` }}
                  >
                    #{pkt}
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-3 font-mono">
                <span>Forward Data Plane (Frames)</span>
                <span>Reverse Return Plane (ACKs)</span>
              </div>
            </div>

            {/* Receiver Node */}
            <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-center w-full sm:w-44 shadow-md">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">
                Destination Server
              </span>
              <div className="text-sm font-bold mt-1 text-slate-100">LMS Gateway</div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">Expecting: #{base}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Telemetry Console */}
      <Card
        title="Protocol Event Trace Log"
        subtitle="Real-time chronological events including injections, acknowledgements, and timeouts"
        icon={Terminal}
      >
        <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs h-40 overflow-y-auto space-y-1.5 scroll-smooth border border-slate-800">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-emerald-500 select-none font-bold">&gt;</span>
              <span>{log}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default SlidingWindow;
