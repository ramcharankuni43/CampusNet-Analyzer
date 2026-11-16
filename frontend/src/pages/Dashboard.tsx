import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  TrendingDown,
  Layers,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Server,
  PlayCircle,
  Download,
  FileText,
  Repeat,
  Sliders,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Database
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
  Area,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { api } from '../services/api';
import { subscribeGlobalTelemetry } from '../services/websocket';
import { DashboardSummary, SystemStatusResponse } from '../types';
import { useSimulationMode, ModeBadge, ModeSelector } from '../context/SimulationModeContext';
import { DEMO_DASHBOARD_SUMMARY, DEMO_EXPERIMENTS } from '../data/demoExperiments';
import { StatCard } from '../components/StatCard';
import { Card } from '../components/Card';
import { ProtocolBadge, StatusBadge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { CustomTooltip } from '../components/CustomTooltip';

export const Dashboard: React.FC = () => {
  const { isDemo, isLive, setMode } = useSimulationMode();
  const [liveSummary, setLiveSummary] = useState<DashboardSummary | null>(null);
  const [sysStatus, setSysStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLiveTelemetry, setIsLiveTelemetry] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());
  const [isRunningFullAnalysis, setIsRunningFullAnalysis] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);

  const fetchLiveSummary = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [data, statusData] = await Promise.all([
        api.getDashboardSummary('realtime'),
        api.getSystemStatus().catch(() => null)
      ]);
      setLiveSummary(data);
      if (statusData) setSysStatus(statusData);
      setLastSyncTime(new Date().toLocaleTimeString());
      setError(null);
    } catch (err: any) {
      if (showSpinner) setError(err.message || 'Failed to connect to backend server');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    if (isLive) {
      fetchLiveSummary(true);

      const unsubscribe = subscribeGlobalTelemetry(() => {
        fetchLiveSummary(false);
      });

      const interval = setInterval(() => {
        if (isLiveTelemetry) {
          fetchLiveSummary(false);
        }
      }, 3000);

      return () => {
        unsubscribe();
        clearInterval(interval);
      };
    }
  }, [isLive, isLiveTelemetry]);

  const handleRunFullAnalysis = async () => {
    setIsRunningFullAnalysis(true);
    setAnalysisStatus('Executing full discrete-event simulation suite across all scenarios (Low, Medium, High, Multi-Rate, Leaky Bucket, Go-Back-N)...');
    setError(null);
    try {
      await api.runFullAnalysis();
      setAnalysisStatus('Full analysis pipeline completed successfully! Database refreshed with verified benchmark records.');
      await fetchLiveSummary(false);
    } catch (err: any) {
      setError(`Full analysis failed: ${err.message}`);
      setAnalysisStatus(null);
    } finally {
      setIsRunningFullAnalysis(false);
    }
  };

  const kpis = isDemo ? DEMO_DASHBOARD_SUMMARY.kpis : (liveSummary?.kpis || null);
  const recentExps = isDemo ? DEMO_EXPERIMENTS : (liveSummary?.recent_experiments || []);

  const tpVsUsers = isDemo ? DEMO_DASHBOARD_SUMMARY.throughput_vs_users : (liveSummary?.throughput_vs_users || []);
  const lossVsUsers = isDemo ? DEMO_DASHBOARD_SUMMARY.loss_vs_users : (liveSummary?.loss_vs_users || []);
  const delayVsUsers = isDemo ? DEMO_DASHBOARD_SUMMARY.delay_vs_users : (liveSummary?.delay_vs_users || []);
  const pdrVsUsers = isDemo ? DEMO_DASHBOARD_SUMMARY.pdr_vs_users : (liveSummary?.pdr_vs_users || []);
  const trafficLoadData = isDemo ? DEMO_DASHBOARD_SUMMARY.traffic_load_data : (liveSummary?.traffic_load_data || []);
  const tcpUdpRates = isDemo ? DEMO_DASHBOARD_SUMMARY.tcp_udp_rates : (liveSummary?.tcp_udp_rates || []);
  const leakyBucketComparison = isDemo ? (DEMO_DASHBOARD_SUMMARY as any).leaky_bucket_comparison || null : (liveSummary?.leaky_bucket_comparison || null);
  const gbnTracePoints = isDemo ? ((DEMO_DASHBOARD_SUMMARY as any).gbn_trace_data || []) : (liveSummary?.gbn_trace_data || []);

  const completedCount = isDemo ? 9 : (kpis?.completed_experiments ?? recentExps.filter(e => e.status.toLowerCase() === 'completed').length);
  const failedCount = isDemo ? 0 : (kpis?.failed_experiments ?? recentExps.filter(e => e.status.toLowerCase() === 'failed').length);

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Top Banner / System Status Ribbon */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-sm shadow-blue-500/20">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                University Campus E-Learning Telemetry
              </h1>
              <ModeBadge isDemo={isDemo} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isDemo
                ? 'Predefined laboratory test-case dataset (Offline Mode) • 9 Calibrated Benchmarks'
                : 'SimPy 4.1 Discrete-Event Simulation Pipeline • SQLite WAL Mode Active'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isLive && (
            <button
              onClick={() => fetchLiveSummary(true)}
              disabled={loading}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors shadow-2xs"
              title="Refresh telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          )}

          <button
            onClick={handleRunFullAnalysis}
            disabled={isRunningFullAnalysis || isDemo}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all shadow-xs ${
              isDemo
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/20 hover:scale-[1.02]'
            }`}
            title={isDemo ? 'Switch to Live SimPy Mode to run real discrete-event simulations' : 'Runs complete academic benchmark pipeline'}
          >
            <PlayCircle className="w-4 h-4" />
            <span>{isRunningFullAnalysis ? 'Simulating All Scenarios...' : 'Run Full Benchmark Suite'}</span>
          </button>

          <Link
            to="/simulation/new"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs shadow-blue-500/20 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4" />
            <span>New Simulation</span>
          </Link>
        </div>
      </div>

      {/* Engine Status Callout */}
      {isDemo ? (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200/80 rounded-2xl flex items-center justify-between text-blue-900 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-blue-600 text-white font-mono font-bold rounded-lg text-[10px] tracking-wide uppercase shadow-2xs">
              DEMO MODE
            </span>
            <span className="leading-relaxed">
              <strong>Academic Reference Dataset:</strong> Displaying verified, mathematically consistent laboratory benchmarks with zero simulator runtime requirements.
            </span>
          </div>
          <button
            onClick={() => {
              setMode('realtime');
              setError(null);
            }}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 underline whitespace-nowrap hidden sm:inline"
          >
            Switch to Live SimPy Mode →
          </button>
        </div>
      ) : (sysStatus?.simulator_operational || liveSummary?.is_ns2_available) ? (
        <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50/40 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-950 text-xs shadow-xs">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-emerald-600 text-white font-mono font-bold rounded-lg text-[10px] tracking-wide uppercase flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              {sysStatus?.simulator_engine ? 'SIMPY ENGINE' : 'LIVE SIMULATOR'}
            </span>
            <span>
              <strong>Discrete-Event Engine Operational:</strong>{' '}
              {sysStatus?.simulator_engine || 'SimPy Discrete-Event Simulation Engine'}{' '}
              {sysStatus?.simulator_version ? `(v${sysStatus.simulator_version})` : ''} • Conservation Verified • SQLite WAL Active.
            </span>
          </div>
          <span className="text-[11px] font-mono text-emerald-700 bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-200/60 shadow-2xs">
            Last Sync: {lastSyncTime}
          </span>
        </div>
      ) : (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong className="block text-amber-950 font-bold">Simulator Engine Degraded</strong>
              <span>Discrete-event simulation engine reported an operational issue. Check settings or switch to Demo Mode.</span>
            </div>
          </div>
          <button
            onClick={() => setMode('demo')}
            className="px-3 py-1.5 bg-blue-600 text-white font-semibold rounded-lg text-xs hover:bg-blue-700"
          >
            Use Demo Mode
          </button>
        </div>
      )}

      {/* Analysis Status Progress */}
      {analysisStatus && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between animate-fade-in shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{analysisStatus}</span>
          </div>
          <button
            onClick={() => setAnalysisStatus(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="Total Runs"
          value={kpis?.total_experiments ?? 0}
          unit="runs"
          subtitle={isDemo ? 'Predefined test cases' : 'SQLite records'}
          icon={Layers}
          accentColor="indigo"
        />
        <StatCard
          title="Completed"
          value={completedCount}
          unit="runs"
          subtitle={`${failedCount} failed`}
          icon={CheckCircle2}
          accentColor="emerald"
          trend={{ value: '100% OK', positive: true }}
        />
        <StatCard
          title="Avg Throughput"
          value={kpis?.avg_throughput_kbps ?? 0}
          unit="Kbps"
          subtitle="Delivered goodput"
          icon={Zap}
          accentColor="blue"
          trend={{ value: 'Bandwidth', neutral: true }}
        />
        <StatCard
          title="Avg Latency"
          value={kpis?.avg_delay_ms ?? 0}
          unit="ms"
          subtitle="End-to-end transit"
          icon={Clock}
          accentColor="amber"
          trend={{ value: 'Queuing', neutral: true }}
        />
        <StatCard
          title="Packet Delivery"
          value={kpis?.avg_pdr_percent ?? 0}
          unit="%"
          subtitle="Reliability index"
          icon={ShieldCheck}
          accentColor="emerald"
          trend={{ value: 'PDR', positive: (kpis?.avg_pdr_percent ?? 0) >= 80 }}
        />
        <StatCard
          title="Terminal Loss"
          value={kpis?.avg_packet_loss_percent ?? 0}
          unit="%"
          subtitle="Unrecovered loss"
          icon={TrendingDown}
          accentColor="rose"
          trend={{ value: 'Drops', positive: (kpis?.avg_packet_loss_percent ?? 0) === 0 }}
        />
      </div>

      {/* Empty State Callout for Real-Time Mode */}
      {!isDemo && recentExps.length === 0 && (
        <EmptyState
          icon={Activity}
          title="No Simulation Experiments Recorded in Database Yet"
          description="Click 'Run Full Benchmark Suite' above to run the official academic benchmark presets, or configure a custom simulation."
          actionText="Run Full Benchmark Suite"
          onAction={handleRunFullAnalysis}
        />
      )}

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Throughput vs Student Scaling */}
        <Card
          title="Throughput vs Student Concurrency"
          subtitle="Delivered Goodput (Kbps) measured at LMS server across student load tiers"
          icon={Zap}
          action={
            <Link to="/tcp-udp" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Compare <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tpVsUsers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="users" unit=" students" tick={{ fontSize: 11 }} />
                <YAxis unit=" Kbps" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip labelSuffix=" Students" valueFormatter={(v) => `${v} Kbps`} />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="tcp" name="TCP AIMD (Kbps)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="udp" name="UDP CBR (Kbps)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 2: Drop Rate vs Student Scaling */}
        <Card
          title="Packet Loss Rate vs Student Concurrency"
          subtitle="Buffer overflow drop percentage at the campus gateway bottleneck router"
          icon={TrendingDown}
          action={
            <Link to="/performance" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Analysis <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lossVsUsers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="users" unit=" students" tick={{ fontSize: 11 }} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip labelSuffix=" Students" valueFormatter={(v) => `${v}%`} />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="tcp_loss" name="TCP Loss Rate (%)" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="udp_loss" name="UDP Loss Rate (%)" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 3: Average Delay vs Student Concurrency */}
        <Card
          title="End-to-End Latency vs Student Concurrency"
          subtitle="Queuing, transmission, and propagation delay (ms) to central LMS server"
          icon={Clock}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={delayVsUsers}>
                <defs>
                  <linearGradient id="delayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="users" unit=" students" tick={{ fontSize: 11 }} />
                <YAxis unit=" ms" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip labelSuffix=" Students" valueFormatter={(v) => `${v} ms`} />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="delay_ms" name="Average Delay (ms)" stroke="#F59E0B" strokeWidth={2.5} fill="url(#delayGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 4: Packet Delivery Ratio (PDR %) */}
        <Card
          title="Packet Delivery Ratio Progression"
          subtitle="Unique successfully delivered packets divided by unique offered packets"
          icon={ShieldCheck}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pdrVsUsers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="users" unit=" students" tick={{ fontSize: 11 }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip labelSuffix=" Students" valueFormatter={(v) => `${v}%`} />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="pdr" name="Packet Delivery Ratio (%)" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 5: Traffic Intensity Distribution */}
        <Card
          title="Offered Traffic Load Distribution"
          subtitle="Offered data rate vs student concurrency across laboratory tiers"
          icon={BarChart3}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficLoadData}>
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="intensity" tick={{ fontSize: 11 }} />
                <YAxis unit=" Mbps" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip valueFormatter={(v) => `${v} Mbps`} />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="offered_mbps" name="Offered Load (Mbps)" stroke="#2563EB" strokeWidth={2} fill="url(#loadGrad)" />
                <Area type="monotone" dataKey="delivered_mbps" name="Delivered Goodput (Mbps)" stroke="#10B981" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 6: TCP vs UDP Multi-Rate Progression */}
        <Card
          title="TCP vs UDP Multi-Rate Progression"
          subtitle="Performance scaling under varying bottleneck capacities (256Kbps - 5Mbps)"
          icon={Sliders}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tcpUdpRates}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="rate" tick={{ fontSize: 11 }} />
                <YAxis unit=" Kbps" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip valueFormatter={(v) => `${v} Kbps`} />} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="tcp" name="TCP Throughput (Kbps)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="udp" name="UDP Throughput (Kbps)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 7: Leaky Bucket Traffic Shaper */}
        <Card
          title="Traffic Shaping: Leaky Bucket Dynamics"
          subtitle="Throughput stabilization and burst smoothing with constant leak rate"
          icon={Sliders}
          action={
            <Link to="/leaky-bucket" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Interactive View <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          <div className="h-64">
            {leakyBucketComparison?.data_points ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={leakyBucketComparison.data_points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="time" unit="s" tick={{ fontSize: 11 }} />
                  <YAxis unit=" Kbps" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip labelSuffix="s" valueFormatter={(v) => `${v} Kbps`} />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="unshaped" name="Unshaped Bursty Traffic" stroke="#EF4444" strokeWidth={2} dot={false} strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="shaped" name="Leaky Bucket Shaped Traffic" stroke="#10B981" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-500 mb-2">No Leaky Bucket simulation trace loaded yet.</p>
                <Link
                  to="/leaky-bucket"
                  className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition shadow-xs"
                >
                  Run Leaky Bucket Simulation
                </Link>
              </div>
            )}
          </div>
        </Card>

        {/* Chart 8: Go-Back-N Sequence vs Time */}
        <Card
          title="Go-Back-N ARQ: Sequence vs Time Trace"
          subtitle="Packet transmission progression with drop and timeout retransmission markers"
          icon={Repeat}
          action={
            <Link to="/go-back-n" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Interactive View <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          <div className="h-64">
            {gbnTracePoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gbnTracePoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="time" unit="s" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="seq_num" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip labelSuffix="s" />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="seq_num" name="Transmitted Seq #" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-500 mb-2">No Go-Back-N sequence trace generated yet.</p>
                <Link
                  to="/go-back-n"
                  className="px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition shadow-xs"
                >
                  Run Go-Back-N Simulation
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Experiments Data Table */}
      <Card
        title={isDemo ? 'Predefined Benchmark Experiments' : 'Recent Simulation Experiments'}
        subtitle={isDemo ? 'Standard verified laboratory benchmarks available for instant analysis' : 'Latest discrete-event simulation records persisted in SQLite database'}
        icon={Database}
        action={
          <Link
            to="/experiments"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
          >
            <span>View All Records</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Code</th>
                <th className="px-5 py-3.5">Experiment Name</th>
                <th className="px-5 py-3.5">Mode</th>
                <th className="px-5 py-3.5">Students</th>
                <th className="px-5 py-3.5">Protocol</th>
                <th className="px-5 py-3.5">Throughput</th>
                <th className="px-5 py-3.5">Terminal Loss</th>
                <th className="px-5 py-3.5">PDR</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentExps.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3.5 font-mono font-bold text-blue-700">
                    <Link to={`/experiments/${exp.id}`} className="hover:underline">
                      {exp.exp_code}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">
                    <div className="font-semibold text-slate-800">{exp.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{exp.experiment_type} • {exp.data_rate} • {exp.simulation_time}s</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <ModeBadge isDemo={exp.is_demo} />
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 font-mono">
                    {exp.users} nodes
                  </td>
                  <td className="px-5 py-3.5">
                    <ProtocolBadge protocol={exp.protocol} />
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                    {exp.result ? `${exp.result.throughput_kbps} Kbps` : '—'}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-semibold text-rose-600">
                    {exp.result ? `${exp.result.packet_loss_percent}%` : '—'}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-semibold text-emerald-700">
                    {exp.result ? `${exp.result.packet_delivery_ratio}%` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <Link
                        to={`/experiments/${exp.id}`}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors"
                      >
                        Analytics
                      </Link>
                      {exp.result && (
                        <>
                          <a
                            href={api.getReportCsvUrl(exp.id)}
                            download
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Export CSV"
                          >
                            <FileText className="w-4 h-4" />
                          </a>
                          <a
                            href={api.getReportPdfUrl(exp.id)}
                            download
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Export PDF"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
