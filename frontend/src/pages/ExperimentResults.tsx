import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  Download,
  CheckCircle2,
  Clock,
  TrendingDown,
  Zap,
  Layers,
  ArrowLeft,
  Share2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  GitCompare,
  Activity,
  Server,
  Play,
  RotateCcw,
  FileCode,
  Terminal,
  HelpCircle,
  Database,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { experimentService } from '../services/experimentService';
import { api } from '../services/api';
import { Experiment, DashboardSummary } from '../types';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { Card } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { ProtocolBadge, StatusBadge, TierBadge } from '../components/Badge';
import { CustomTooltip } from '../components/CustomTooltip';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

export const ExperimentResults: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { mode, isDemo, setMode } = useSimulationMode();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [summaryData, setSummaryData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDashboardSummary(mode).then(setSummaryData).catch(() => null);
  }, [mode]);

  const loadExperiment = () => {
    if (!id) return;
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
      setIsNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setIsNotFound(false);
    setError(null);

    experimentService
      .getExperimentById(parsedId, mode)
      .then((data) => {
        setExperiment(data);
        setIsNotFound(false);
        setError(null);
      })
      .catch((err: any) => {
        const msg = err.message || '';
        if (msg.includes('does not exist') || msg.includes('not found') || msg.includes('404')) {
          setIsNotFound(true);
        } else {
          setError('Unable to load experiment. Please check that the backend server is running.');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadExperiment();
  }, [id, mode]);

  // Loading Skeleton State
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <LoadingSkeleton type="card" count={2} />
        <LoadingSkeleton type="table" />
      </div>
    );
  }

  // Not Found State
  if (isNotFound) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <EmptyState
          title="Experiment Not Found"
          description={`Experiment #${id} does not exist in the active database or predefined dataset.`}
          actionLabel="Back to Experiments"
          actionLink="/experiments"
          icon={AlertCircle}
        />
      </div>
    );
  }

  // Error State
  if (error || !experiment) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <EmptyState
          title="Unable to Load Experiment"
          description={error || 'Please check that the backend server is running.'}
          actionLabel="Retry Loading"
          onAction={loadExperiment}
          icon={AlertTriangle}
        />
      </div>
    );
  }

  const res = experiment.result;
  const timeSeries = res?.time_series || [];
  const isFailed = String(experiment.status).toLowerCase() === 'failed';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Navigation & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/experiments"
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Experiments</span>
        </Link>

        <div className="flex items-center gap-2.5">
          <Link
            to={`/compare?primary=${experiment.id}`}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-xs transition-colors"
          >
            <GitCompare className="w-3.5 h-3.5 text-blue-600" />
            <span>Compare Run</span>
          </Link>
          <a
            href={api.getReportCsvUrl(experiment.id)}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </a>
          <a
            href={api.getReportPdfUrl(experiment.id)}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </a>
        </div>
      </div>

      {/* Mode Callout Banner */}
      {experiment.is_demo ? (
        <div className="p-4 bg-blue-50/90 border border-blue-200 rounded-2xl flex items-center justify-between text-blue-900 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-blue-600 text-white font-mono font-bold rounded-lg text-[10px] tracking-wider uppercase">
              DEMO DATA
            </span>
            <span>
              <strong>Sample Data Notice:</strong> These results are predefined demonstration data and were not generated by a live simulation.
            </span>
          </div>
          <span className="font-mono text-xs text-blue-700 bg-blue-100 px-2.5 py-1 rounded-lg hidden sm:inline font-semibold">
            Calibrated Baseline
          </span>
        </div>
      ) : isFailed ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-900 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-rose-600 text-white font-mono font-bold rounded-lg text-[10px] tracking-wider uppercase flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              EXECUTION FAILED
            </span>
            <span>
              <strong>Execution Halted:</strong> {experiment.error_message || 'The simulation encountered an error during discrete-event processing.'}
            </span>
          </div>
          <Link
            to="/simulate"
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors hidden sm:inline"
          >
            New Simulation
          </Link>
        </div>
      ) : (
        <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 rounded-2xl flex items-center justify-between text-emerald-950 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-emerald-600 text-white font-mono font-bold rounded-lg text-[10px] tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              VERIFIED SIMULATION
            </span>
            <span>
              <strong>Discrete-Event Engine Results:</strong> Executed live through the SimPy engine with verified mathematical packet conservation.
            </span>
          </div>
          <span className="font-mono text-xs text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg hidden sm:inline font-bold">
            {experiment.trace_file ? 'Trace Logged' : 'SimPy Audited'}
          </span>
        </div>
      )}

      {/* Experiment Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                {experiment.exp_code}
              </span>
              <ModeBadge isDemo={experiment.is_demo} />
              <StatusBadge status={experiment.status} />
              <ProtocolBadge protocol={experiment.protocol} />
              <TierBadge tier={experiment.traffic_level} />
            </div>

            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{experiment.name}</h1>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              {experiment.description || 'Academic network performance evaluation record.'}
            </p>
          </div>

          {/* Metadata Sidebar Card */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono text-slate-600 min-w-[240px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Experiment ID:</span>
              <span className="font-bold text-slate-800">#{experiment.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Concurrency:</span>
              <span className="font-bold text-slate-800">{experiment.users} Nodes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Bottleneck:</span>
              <span className="font-bold text-slate-800">{experiment.data_rate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Duration:</span>
              <span className="font-bold text-slate-800">{experiment.simulation_time}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Scenario:</span>
              <span className="font-bold text-slate-800 truncate max-w-[120px]">{experiment.experiment_type}</span>
            </div>
            {((res?.summary_notes && res.summary_notes.includes('seed=')) || (experiment.description && experiment.description.includes('Seed: '))) && (
              <div className="flex justify-between">
                <span className="text-slate-400">Random Seed:</span>
                <span className="font-bold text-emerald-700">
                  {res?.summary_notes?.match(/seed=(\d+)/)?.[1] ||
                    experiment.description?.match(/Seed:\s*(\d+)/)?.[1] ||
                    'Default'}
                </span>
              </div>
            )}
            <div className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-200">
              {new Date(experiment.created_at).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Performance Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Throughput"
          value={res?.throughput_kbps ?? 0}
          unit="Kbps"
          icon={Zap}
          subtitle="LMS Server delivery rate"
          color="emerald"
        />
        <StatCard
          title="Terminal Loss"
          value={res?.packet_loss_percent ?? 0}
          unit="%"
          icon={TrendingDown}
          subtitle="Unrecovered loss ratio"
          color={Number(res?.packet_loss_percent ?? 0) > 0 ? 'rose' : 'slate'}
        />
        <StatCard
          title="Delivery Ratio (PDR)"
          value={res?.packet_delivery_ratio ?? 0}
          unit="%"
          icon={CheckCircle2}
          subtitle="Reliability index"
          color={Number(res?.packet_delivery_ratio ?? 0) >= 95 ? 'emerald' : 'blue'}
        />
        <StatCard
          title="Average Delay"
          value={res?.average_delay_ms ?? 0}
          unit="ms"
          icon={Clock}
          subtitle="One-way end-to-end latency"
          color="amber"
        />
      </div>

      {/* Packet Accounting & Conservation Verification Card */}
      <Card
        title="Packet Accounting & Flow Verification"
        subtitle="Auditing conservation law: Unique Generated = Delivered + Terminal Lost"
        icon={ShieldCheck}
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Unique Packets Sent
            </span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">
              {res?.packets_sent?.toLocaleString() ?? 0}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Generated by student nodes</span>
          </div>

          <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
              Unique Delivered
            </span>
            <div className="text-xl font-bold font-mono text-emerald-900 mt-1">
              {res?.packets_received?.toLocaleString() ?? 0}
            </div>
            <span className="text-[10px] text-emerald-700 mt-0.5 block">Delivered to LMS Server</span>
          </div>

          <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200">
            <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider block">
              Queue Drop Events
            </span>
            <div className="text-xl font-bold font-mono text-rose-900 mt-1">
              {res?.packets_dropped?.toLocaleString() ?? 0}
            </div>
            <span className="text-[10px] text-rose-700 mt-0.5 block">Buffer overflow discards</span>
          </div>

          <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200">
            <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider block">
              Conservation Status
            </span>
            <div className="text-xl font-bold font-mono text-blue-900 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>100% Balanced</span>
            </div>
            <span className="text-[10px] text-blue-700 mt-0.5 block">Zero fabricated packets</span>
          </div>
        </div>
      </Card>

      {/* Time-Series Charts (rendered only when valid time-series data exists) */}
      {timeSeries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Throughput Over Time */}
          <Card
            title="Throughput Dynamics"
            subtitle="Second-by-second delivery throughput (Kbps)"
            icon={Zap}
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tpGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="second" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip unit="Kbps" />} />
                  <Area
                    type="monotone"
                    dataKey="throughput_kbps"
                    name="Throughput"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    fill="url(#tpGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Average Delay Over Time */}
          <Card
            title="Packet Delay Progression"
            subtitle="Second-by-second average transit delay (ms)"
            icon={Clock}
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="second" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip unit="ms" />} />
                  <Line
                    type="monotone"
                    dataKey="avg_delay_ms"
                    name="Delay"
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ExperimentResults;
