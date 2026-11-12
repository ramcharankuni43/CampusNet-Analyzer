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
  RefreshCw
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
        // Filter strictly for valid completed experiments with real calculated results
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
    // Prefer TCP run or latest available run for this user count
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

    // Explicit empty state representation: Zero synthetic or hardcoded fallback
    return {
      hasData: false,
      users: `${count} Users`,
      userCount: count
    };
  });

  // Filter only cohorts with real measured data for charts
  const validChartData = userScalingData.filter((d) => d.hasData);

  const selectedData = userScalingData.find((d) => d.userCount === selectedUserCount) || userScalingData[0];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">
              User Load Performance Analysis
            </h1>
            <ModeBadge />
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Evaluate campus e-learning network dynamics as concurrent student cohorts scale from 10 to 200 workstations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchExperiments}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-[#E2E8F0] shadow-xs transition"
            title="Refresh experiment data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/simulation/new"
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
          >
            <PlayCircle className="w-4 h-4" />
            Simulate Custom User Load
          </Link>
        </div>
      </div>

      {/* Mode Callout Alert */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${
        isDemo ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
            isDemo ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
          }`}>
            {isDemo ? 'DEMO' : 'LIVE'}
          </div>
          <div>
            <h2 className="text-sm font-bold">
              {isDemo
                ? 'Academic Calibrated Benchmarks (10 to 200 Student Nodes)'
                : 'Live Discrete-Event NS-2 Trace Telemetry'}
            </h2>
            <p className="text-xs opacity-90">
              {isDemo
                ? 'Displaying offline reference simulation runs for laboratory verification without active NS-2 execution.'
                : 'Displaying metrics parsed strictly from generated NS-2 .tr trace events.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setMode(isDemo ? 'realtime' : 'demo')}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border bg-white shadow-xs hover:bg-slate-50 transition"
        >
          Switch to {isDemo ? 'Live NS-2 Mode' : 'Demo Mode'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={fetchExperiments}
            className="text-xs font-semibold px-3 py-1 bg-white border border-rose-200 rounded-lg hover:bg-rose-100 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="p-8 bg-white rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col items-center justify-center space-y-2">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Fetching verified experiment metrics from backend...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Cohort Selector Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {userScalingData.map((cohort) => (
              <button
                key={cohort.userCount}
                onClick={() => setSelectedUserCount(cohort.userCount)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  selectedUserCount === cohort.userCount
                    ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-white border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500">{cohort.users}</span>
                  <Users className={`w-3.5 h-3.5 ${selectedUserCount === cohort.userCount ? 'text-blue-600' : 'text-slate-400'}`} />
                </div>
                {cohort.hasData ? (
                  <>
                    <div className="text-lg font-bold text-[#0F172A]">
                      {cohort.throughput} <span className="text-[10px] font-normal text-slate-500">Kbps</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                      <span>Loss: <strong className={cohort.loss! > 5 ? 'text-rose-600' : 'text-emerald-600'}>{cohort.loss}%</strong></span>
                      <span>Delay: <strong>{cohort.delay}ms</strong></span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-slate-400 italic">No Data</div>
                    <div className="text-[10px] text-slate-400 mt-1">Click to run simulation</div>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Selected Cohort Telemetry Overview */}
          <div className="p-5 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
            {selectedData.hasData ? (
              <>
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">
                      Detailed Telemetry: {selectedData.users} accessing Central LMS Server
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Source: <span className="font-mono font-semibold">{selectedData.code}</span> • Protocol: {selectedData.protocol} • Bottleneck Link: {selectedData.dataRate || '1 Mbps'} (20ms latency)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                      selectedData.loss! > 10 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {selectedData.loss! > 10 ? 'Congestion Warning: High Loss' : 'Stable Queuing'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] text-slate-500 font-medium">Throughput</span>
                    <div className="text-lg font-bold text-blue-600 mt-0.5">{selectedData.throughput} Kbps</div>
                    <span className="text-[10px] text-slate-400">Total received data rate</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] text-slate-500 font-medium">Packet Delivery Ratio</span>
                    <div className="text-lg font-bold text-emerald-600 mt-0.5">{selectedData.pdr}%</div>
                    <span className="text-[10px] text-slate-400">Received / Sent packets</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] text-slate-500 font-medium">Packet Loss Rate</span>
                    <div className={`text-lg font-bold mt-0.5 ${selectedData.loss! > 5 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {selectedData.loss}%
                    </div>
                    <span className="text-[10px] text-slate-400">Dropped at bottleneck queue</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] text-slate-500 font-medium">Average End-to-End Latency</span>
                    <div className="text-lg font-bold text-purple-600 mt-0.5">{selectedData.delay} ms</div>
                    <span className="text-[10px] text-slate-400">Queuing + Propagation</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 px-4 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <AlertCircle className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800">
                    No Experiment Data for {selectedUserCount} Concurrent Students
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mt-1">
                    No completed simulation run exists in the database for a {selectedUserCount}-student workload in this mode. Performance metrics are calculated strictly from verified trace executions without synthetic estimation.
                  </p>
                </div>
                <Link
                  to={`/simulation/new?users=${selectedUserCount}&protocol=TCP`}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <PlayCircle className="w-4 h-4" />
                  Run {selectedUserCount}-Student Simulation
                </Link>
              </div>
            )}
          </div>

          {/* Analytical Charts Grid */}
          {validChartData.length > 0 ? (
            <>
              {validChartData.length < userCounts.length && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      Plotting {validChartData.length} measured cohort{validChartData.length > 1 ? 's' : ''} ({validChartData.map((d) => d.users).join(', ')}). Run additional user simulations to complete the full 10-200 node scaling curve.
                    </span>
                  </div>
                  <Link to="/simulation/new" className="font-semibold underline hover:text-blue-900 shrink-0 ml-2">
                    Run Simulation &rarr;
                  </Link>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart 1: Throughput vs Users */}
                <div className="p-5 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Throughput vs Number of Students</h3>
                      <p className="text-[11px] text-slate-500">Aggregate throughput across concurrent student nodes</p>
                    </div>
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={validChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="tpGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="users" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit=" Kbps" domain={[0, 1000]} />
                        <Tooltip />
                        <Area type="monotone" dataKey="throughput" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#tpGradient)" name="Throughput (Kbps)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                    <strong>Engineering Note:</strong> Throughput rises with concurrency up to link saturation (~50 nodes). Beyond 50 nodes, queue overflow and TCP window backoffs cause stabilization and slight degradation.
                  </div>
                </div>

                {/* Chart 2: Packet Loss vs Users */}
                <div className="p-5 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Packet Loss Rate vs Number of Students</h3>
                      <p className="text-[11px] text-slate-500">DropTail bottleneck buffer overflow percentage</p>
                    </div>
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={validChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="users" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 30]} />
                        <Tooltip />
                        <Bar dataKey="loss" fill="#DC2626" radius={[4, 4, 0, 0]} name="Packet Loss (%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                    <strong>Engineering Note:</strong> Minimal packet loss occurs below 25 nodes (&lt;1%). Beyond 50 nodes, offered rate exceeds the 1 Mbps bottleneck capacity, triggering router buffer drops.
                  </div>
                </div>

                {/* Chart 3: End-to-End Delay vs Users */}
                <div className="p-5 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Average End-to-End Delay vs Number of Students</h3>
                      <p className="text-[11px] text-slate-500">Propagation (27ms) + Queuing buffer latency</p>
                    </div>
                    <Clock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={validChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="users" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit=" ms" domain={[0, 180]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="delay" stroke="#9333EA" strokeWidth={2.5} dot={{ r: 4 }} name="Avg Delay (ms)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                    <strong>Engineering Note:</strong> At low traffic, latency is bounded by static physical link delay (5ms + 20ms + 2ms = 27ms). As queues fill, buffer queuing delay scales upwards.
                  </div>
                </div>

                {/* Chart 4: PDR vs Users */}
                <div className="p-5 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Packet Delivery Ratio (PDR) vs Students</h3>
                      <p className="text-[11px] text-slate-500">Proportion of injected packets successfully acknowledged</p>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={validChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="users" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" domain={[70, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="pdr" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 4 }} name="PDR (%)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                    <strong>Engineering Note:</strong> High concurrency degrades PDR due to DropTail queue overflow at Access Router R1. Reliable protocols like TCP recover lost packets through retransmission.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 bg-white rounded-xl border border-[#E2E8F0] shadow-xs text-center space-y-3">
              <Layers className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No Scaling Data Available</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No completed experiments were found for user scaling analysis. Execute simulations across different student cohorts (10, 25, 50, 100, 200) to populate comparison curves.
              </p>
              <Link
                to="/simulation/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                <PlayCircle className="w-4 h-4" />
                Launch New Simulation
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
};
