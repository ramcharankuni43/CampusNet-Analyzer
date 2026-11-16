import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Gauge,
  Play,
  Pause,
  RotateCcw,
  Zap,
  TrendingDown,
  Info,
  Sliders,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  BookOpen,
  Activity
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { api } from '../services/api';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { CustomTooltip } from '../components/CustomTooltip';

export const LeakyBucket: React.FC = () => {
  const { mode, isDemo } = useSimulationMode();

  // Frontend Interactive Water Tank Simulation State
  const [bucketCapacity, setBucketCapacity] = useState<number>(40);
  const [leakRate, setLeakRate] = useState<number>(8);
  const [burstRate, setBurstRate] = useState<number>(14);
  const [currentBuffer, setCurrentBuffer] = useState<number>(12);
  const [totalInflow, setTotalInflow] = useState<number>(0);
  const [totalOutflow, setTotalOutflow] = useState<number>(0);
  const [droppedCount, setDroppedCount] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(true);

  const [history, setHistory] = useState<
    { time: number; inflow: number; outflow: number; buffer: number }[]
  >([]);

  // Discrete-Event Simulation Runner State
  const [ns2BucketSize, setNs2BucketSize] = useState<number>(25);
  const [ns2LeakRate, setNs2LeakRate] = useState<string>('512Kbps');
  const [ns2Result, setNs2Result] = useState<any>(null);
  const [isRunningNs2, setIsRunningNs2] = useState<boolean>(false);
  const [ns2Error, setNs2Error] = useState<string | null>(null);

  useEffect(() => {
    // Load latest Leaky Bucket run if available
    api.getLeakyBucketLatest().then((res) => {
      if (res && res.comparison_series && res.comparison_series.length > 0) {
        setNs2Result(res);
      }
    }).catch(() => null);
  }, []);

  const handleRunNs2 = async () => {
    setIsRunningNs2(true);
    setNs2Error(null);
    try {
      const res = await api.runLeakyBucketSimulation({
        bucket_size: ns2BucketSize,
        leak_rate: ns2LeakRate,
        simulation_time: 10.0,
      });
      setNs2Result(res);
    } catch (err: any) {
      setNs2Error(err.message || 'Failed to execute Leaky Bucket simulation');
    } finally {
      setIsRunningNs2(false);
    }
  };

  // Simulation tick loop for interactive visualizer
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        const isBurst = Math.random() > 0.65;
        const incoming = isBurst ? Math.floor(burstRate * (0.8 + Math.random() * 0.5)) : Math.floor(burstRate * 0.3);

        setCurrentBuffer((prev) => {
          const newTotal = prev + incoming;
          let dropped = 0;
          let stored = newTotal;

          if (newTotal > bucketCapacity) {
            dropped = newTotal - bucketCapacity;
            stored = bucketCapacity;
          }

          const processed = Math.min(stored, leakRate);
          const remaining = stored - processed;

          setTotalInflow((t) => t + incoming);
          setTotalOutflow((t) => t + processed);
          if (dropped > 0) {
            setDroppedCount((d) => d + dropped);
          }

          setHistory((hist) => {
            const nextTime = hist.length > 0 ? hist[hist.length - 1].time + 1 : 1;
            const entry = {
              time: nextTime,
              inflow: incoming,
              outflow: processed,
              buffer: remaining,
            };
            return [...hist.slice(-25), entry];
          });

          return remaining;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, bucketCapacity, leakRate, burstRate]);

  const handleTriggerBurst = () => {
    setCurrentBuffer((prev) => {
      const burstSize = 25;
      const potential = prev + burstSize;
      let dropped = 0;
      let stored = potential;
      if (potential > bucketCapacity) {
        dropped = potential - bucketCapacity;
        stored = bucketCapacity;
        setDroppedCount((d) => d + dropped);
      }
      setTotalInflow((t) => t + burstSize);
      return stored;
    });
  };

  const handleReset = () => {
    setCurrentBuffer(10);
    setTotalInflow(0);
    setTotalOutflow(0);
    setDroppedCount(0);
    setHistory([]);
  };

  const bufferPercentage = Math.min(100, Math.round((currentBuffer / bucketCapacity) * 100));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Leaky Bucket Traffic Shaping & Queue Regulation"
        description="Discrete-event evaluation of leaky bucket token smoothing, burst buffering, and constant-rate packet departure"
        icon={Gauge}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/simulate"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <span>New Simulation</span>
            </Link>
          </div>
        }
      />

      {/* SECTION 1: Discrete-Event Leaky Bucket Simulation */}
      <Card
        title="Discrete-Event Traffic Shaping Engine"
        subtitle="Simulates queue smoothing: comparing unshaped bursty traffic against constant-rate departure"
        icon={Layers}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Bucket Size:</span>
              <select
                value={ns2BucketSize}
                onChange={(e) => setNs2BucketSize(Number(e.target.value))}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-mono font-bold bg-white"
              >
                <option value={15}>15 packets</option>
                <option value={25}>25 packets</option>
                <option value={50}>50 packets</option>
                <option value={100}>100 packets</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Leak Rate:</span>
              <select
                value={ns2LeakRate}
                onChange={(e) => setNs2LeakRate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs font-mono font-bold bg-white text-blue-700"
              >
                <option value="256Kbps">256 Kbps</option>
                <option value="512Kbps">512 Kbps</option>
                <option value="1Mbps">1 Mbps</option>
                <option value="2Mbps">2 Mbps</option>
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
              <span>{isRunningNs2 ? 'Simulating...' : 'Run Leaky Bucket'}</span>
            </button>
          </div>
        }
      >
        {ns2Error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl mb-4">
            {ns2Error}
          </div>
        )}

        {ns2Result ? (
          <div className="space-y-4">
            {ns2Result.queue_type && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    Queue Discipline: {ns2Result.queue_type}
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                title="Unshaped Throughput"
                value={ns2Result.unshaped_throughput_kbps}
                unit="Kbps"
                icon={Zap}
                subtitle="Bursty raw departure"
                color="slate"
              />
              <StatCard
                title="Shaped Throughput"
                value={ns2Result.shaped_throughput_kbps}
                unit="Kbps"
                icon={TrendingUp}
                subtitle="Smooth regulated rate"
                color="blue"
              />
              <StatCard
                title="Unshaped Drop Rate"
                value={ns2Result.unshaped_loss_percent}
                unit="%"
                icon={TrendingDown}
                subtitle="Peak buffer overflow"
                color="rose"
              />
              <StatCard
                title="Shaped Drop Rate"
                value={ns2Result.shaped_loss_percent}
                unit="%"
                icon={CheckCircle2}
                subtitle="Regulated buffer loss"
                color="emerald"
              />
            </div>

            {/* Comparison Charts */}
            {ns2Result.comparison_series && ns2Result.comparison_series.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                <Card
                  title="Throughput Smoothing Dynamics"
                  subtitle="Unshaped bursty peaks vs smoothed constant-rate output (Kbps)"
                  icon={TrendingUp}
                >
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ns2Result.comparison_series} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} unit="s" />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip unit="Kbps" />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="unshaped_throughput"
                          name="Unshaped (Bursty)"
                          stroke="#E11D48"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="shaped_throughput"
                          name="Shaped (Leaky Bucket)"
                          stroke="#2563EB"
                          strokeWidth={2.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card
                  title="Packet Discard Mitigation"
                  subtitle="Buffer overflow drops: unshaped bursts vs regulated queue"
                  icon={TrendingDown}
                >
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ns2Result.comparison_series} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="time" tick={{ fontSize: 11 }} unit="s" />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip content={<CustomTooltip unit="pkts" />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="unshaped_drops"
                          name="Unshaped Drops"
                          fill="#F43F5E"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="shaped_drops"
                          name="Shaped Drops"
                          fill="#10B981"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 bg-slate-50/60 rounded-xl text-center text-xs text-slate-500 border border-slate-200">
            No Leaky Bucket simulation loaded yet. Click &ldquo;Run Leaky Bucket&rdquo; above to execute.
          </div>
        )}
      </Card>

      {/* SECTION 2: Interactive Water Tank Buffer Visualizer */}
      <Card
        title="Interactive Buffer Gauge & Water Tank Simulator"
        subtitle="Live mathematical simulation of token depletion, burst buffering, and leak rate regulation"
        icon={Activity}
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white transition-colors ${
                isRunning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
              <span>{isRunning ? 'Pause' : 'Play'}</span>
            </button>
            <button
              onClick={handleTriggerBurst}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>Inject Burst (+25 pkts)</span>
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Water Tank Fill Column */}
          <div className="p-5 bg-slate-900 text-white rounded-2xl flex flex-col items-center justify-between border border-slate-800">
            <div className="w-full flex justify-between items-center text-xs border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-300">Buffer Water Tank</span>
              <span className="font-mono text-emerald-400 font-bold">{bufferPercentage}% Full</span>
            </div>

            {/* Tank Graphic */}
            <div className="w-32 h-48 border-4 border-slate-700 rounded-b-2xl relative my-4 bg-slate-950 overflow-hidden shadow-inner">
              <div
                className={`absolute bottom-0 w-full transition-all duration-500 rounded-b-lg ${
                  bufferPercentage > 85 ? 'bg-rose-500' : bufferPercentage > 50 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ height: `${bufferPercentage}%` }}
              >
                <div className="w-full h-1 bg-white/40 animate-pulse" />
              </div>
            </div>

            <div className="text-center font-mono text-xs space-y-0.5">
              <div className="font-bold text-slate-100">
                {currentBuffer} / {bucketCapacity} Packets
              </div>
              <div className="text-[10px] text-slate-400">Leak Rate: {leakRate} pkts/s</div>
            </div>
          </div>

          {/* Interactive Sliders */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Fluid Dynamic Controls
            </h4>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Bucket Capacity:</span>
                <span className="font-mono font-bold text-blue-600">{bucketCapacity} pkts</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                value={bucketCapacity}
                onChange={(e) => setBucketCapacity(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Constant Leak Rate:</span>
                <span className="font-mono font-bold text-emerald-600">{leakRate} pkts/s</span>
              </div>
              <input
                type="range"
                min={2}
                max={25}
                value={leakRate}
                onChange={(e) => setLeakRate(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>Input Burst Rate:</span>
                <span className="font-mono font-bold text-rose-600">{burstRate} pkts/s</span>
              </div>
              <input
                type="range"
                min={5}
                max={40}
                value={burstRate}
                onChange={(e) => setBurstRate(Number(e.target.value))}
                className="w-full accent-rose-600"
              />
            </div>
          </div>

          {/* Accumulation Stats */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Cumulative Volume
            </h4>

            <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Inflow</span>
              <strong className="text-slate-900 font-mono text-base">{totalInflow} pkts</strong>
            </div>

            <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200">
              <span className="text-emerald-800 block text-[10px] uppercase font-bold">Smoothed Outflow</span>
              <strong className="text-emerald-900 font-mono text-base">{totalOutflow} pkts</strong>
            </div>

            <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200">
              <span className="text-rose-800 block text-[10px] uppercase font-bold">Tank Overflow Drops</span>
              <strong className="text-rose-900 font-mono text-base">{droppedCount} pkts</strong>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LeakyBucket;
