import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
  Activity,
  PlayCircle,
  Info,
  Server,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Zap,
  CheckCircle2
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
import { useDataService } from '../services/dataService';
import { Experiment } from '../types';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { ProtocolBadge } from '../components/Badge';
import { CustomTooltip } from '../components/CustomTooltip';

export interface CohortMetrics {
  hasData: boolean;
  users: string;
  userCount: number;
  throughput?: number;
  loss?: number;
  delay?: number;
  pdr?: number;
  code?: string;
  protocol?: string;
  name?: string;
  dataRate?: string;
}

export const PerformanceAnalysis: React.FC = () => {
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedUserCount, setSelectedUserCount] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExperiments = () => {
    setLoading(true);
    setError(null);
    dataService
      .getExperiments({ limit: 100 })
      .then((data) => {
        const valid = data.filter((e) => e.result && e.status?.toUpperCase() === 'COMPLETED');
        setExperiments(valid);
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to load experiment records from backend.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchExperiments();
  }, [mode]);

  // Standard user scaling benchmarks: 10, 25, 50, 100, 200
  const userCounts = [10, 25, 50, 100, 200];

  // Derive cohort data strictly from authentic experiment records
  const userScalingData: CohortMetrics[] = userCounts.map((count) => {
    const matches = experiments.filter((e) => e.users === count);
    const tcpMatch = matches.find((e) => e.protocol?.toUpperCase() === 'TCP') || matches[0];

    if (tcpMatch && tcpMatch.result) {
      return {
        hasData: true,
        users: `${count} Users`,
        userCount: count,
        throughput: tcpMatch.result.throughput_kbps,
        loss: tcpMatch.result.packet_loss_percent,
        delay: tcpMatch.result.average_delay_ms,
        pdr: tcpMatch.result.packet_delivery_ratio,
        code: tcpMatch.exp_code,
        protocol: tcpMatch.protocol,
        name: tcpMatch.name,
        dataRate: tcpMatch.data_rate
      };
    }

    return {
      hasData: false,
      users: `${count} Users`,
      userCount: count
    };
  });

  const validChartData = userScalingData.filter((d) => d.hasData);
  const selectedData = userScalingData.find((d) => d.userCount === selectedUserCount) || userScalingData[0];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Student Concurrency & Scaling Performance Analysis"
        description="Evaluate campus e-learning network dynamics as active student concurrency scales from 10 to 200 workstations"
        icon={Users}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchExperiments}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Metrics</span>
            </button>
            <Link
              to="/simulate"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Simulate Custom Load</span>
            </Link>
          </div>
        }
      />

      {/* Mode Callout Alert */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs ${
        isDemo ? 'bg-amber-50/80 border-amber-200 text-amber-950' : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
            isDemo ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
          }`}>
            {isDemo ? 'DEMO' : 'LIVE'}
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider">
              {isDemo
                ? 'Predefined Laboratory Concurrency Benchmarks (10 to 200 Nodes)'
                : 'Live SimPy Discrete-Event Trace Telemetry'}
            </h2>
            <p className="text-xs opacity-90 mt-0.5">
              {isDemo
                ? 'Displaying calibrated baseline reference runs for university lab evaluation.'
                : 'Displaying metrics parsed strictly from generated discrete-event simulation records.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setMode(isDemo ? 'realtime' : 'demo')}
          className="text-xs font-bold px-3.5 py-1.5 rounded-xl border bg-white shadow-xs hover:bg-slate-50 transition-colors shrink-0"
        >
          Switch to {isDemo ? 'Live Simulation Mode' : 'Demo Mode'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-900 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            onClick={fetchExperiments}
            className="text-xs font-bold px-3 py-1 bg-white border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Cohort Selector Tabs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {userScalingData.map((cohort) => {
          const isSelected = selectedUserCount === cohort.userCount;
          return (
            <button
              key={cohort.userCount}
              onClick={() => setSelectedUserCount(cohort.userCount)}
              className={`p-4 rounded-2xl border text-left transition-all ${
                isSelected
                  ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                  : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-800">{cohort.users}</span>
                <Users className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
              </div>
              {cohort.hasData ? (
                <>
                  <div className="text-lg font-bold font-mono text-slate-900">
                    {cohort.throughput} <span className="text-xs font-semibold text-slate-500">Kbps</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 font-mono">
                    <span>Loss: <strong className={Number(cohort.loss) > 5 ? 'text-rose-600' : 'text-emerald-700'}>{cohort.loss}%</strong></span>
                    <span>Delay: <strong>{cohort.delay}ms</strong></span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold text-slate-400 italic">No Data</div>
                  <div className="text-[10px] text-slate-400 mt-1">Run simulation to test</div>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Cohort Telemetry Overview */}
      <Card
        title={`Selected Cohort Telemetry: ${selectedData.users}`}
        subtitle={
          selectedData.hasData
            ? `Source: ${selectedData.code} • Protocol: ${selectedData.protocol} • Bottleneck Link: ${selectedData.dataRate || '1 Mbps'}`
            : 'No simulation recorded for this user cohort yet'
        }
        icon={Activity}
      >
        {selectedData.hasData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Delivered Throughput"
                value={selectedData.throughput ?? 0}
                unit="Kbps"
                icon={Zap}
                subtitle="Measured at LMS Server"
                color="emerald"
              />
              <StatCard
                title="Terminal Loss"
                value={selectedData.loss ?? 0}
                unit="%"
                icon={TrendingDown}
                subtitle="Router buffer drop ratio"
                color={Number(selectedData.loss ?? 0) > 5 ? 'rose' : 'slate'}
              />
              <StatCard
                title="Delivery Ratio (PDR)"
                value={selectedData.pdr ?? 0}
                unit="%"
                icon={CheckCircle2}
                subtitle="End-to-end reliability"
                color={Number(selectedData.pdr ?? 0) >= 95 ? 'emerald' : 'blue'}
              />
              <StatCard
                title="Average Delay"
                value={selectedData.delay ?? 0}
                unit="ms"
                icon={Clock}
                subtitle="Queue + propagation latency"
                color="amber"
              />
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs">
            <p className="font-semibold text-slate-700">No experiment data recorded for {selectedData.users}.</p>
            <p className="text-slate-400 mt-1">Configure a simulation run with {selectedData.userCount} nodes to record empirical metrics.</p>
            <Link
              to="/simulate"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              <span>Configure Run for {selectedData.userCount} Users</span>
            </Link>
          </div>
        )}
      </Card>

      {/* Scaling Performance Charts Grid */}
      {validChartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card
            title="Throughput Scaling Under Increasing User Load"
            subtitle="Throughput plateau demonstrates bottleneck saturation limit (Kbps)"
            icon={TrendingUp}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={validChartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tpScalingGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="users" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip unit="Kbps" />} />
                  <Area
                    type="monotone"
                    dataKey="throughput"
                    name="Throughput"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fill="url(#tpScalingGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title="Packet Loss Escalation Under High Concurrency"
            subtitle="Buffer saturation inflection point leading to Tail-Drop discards (%)"
            icon={TrendingDown}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={validChartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="users" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip unit="%" />} />
                  <Bar dataKey="loss" name="Loss %" fill="#E11D48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PerformanceAnalysis;
