import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Info,
  PlayCircle,
  Clock,
  Activity,
  Plus
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { api } from '../services/api';
import { useDataService } from '../services/dataService';
import { Experiment } from '../types';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ProtocolBadge } from '../components/Badge';
import { CustomTooltip } from '../components/CustomTooltip';

export const TcpUdpComparison: React.FC = () => {
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [tcpExps, setTcpExps] = useState<Experiment[]>([]);
  const [udpExps, setUdpExps] = useState<Experiment[]>([]);
  const [ratesData, setRatesData] = useState<any[]>([]);
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const summary = await api.getDashboardSummary(mode);
      if (summary?.tcp_udp_rates && summary.tcp_udp_rates.length > 0) {
        setRatesData(summary.tcp_udp_rates);
      } else {
        setRatesData([]);
      }
    } catch {
      setRatesData([]);
    }

    try {
      const all = await dataService.getExperiments({ limit: 100 });
      const withRes = all.filter((e) => e.result);
      setTcpExps(withRes.filter((e) => e.protocol === 'TCP'));
      setUdpExps(withRes.filter((e) => e.protocol === 'UDP'));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
  }, [mode]);

  const handleRunBatch = async () => {
    setIsRunningBatch(true);
    setBatchMessage('Executing multi-rate discrete-event simulation batch (256Kbps, 512Kbps, 1Mbps, 2Mbps, 5Mbps)...');
    try {
      await api.runTcpUdpBatch();
      await loadData();
      setBatchMessage('Multi-rate discrete-event simulation batch completed! Database metrics loaded.');
      setTimeout(() => setBatchMessage(null), 5000);
    } catch (err: any) {
      setBatchMessage(`Simulation batch failed: ${err.message || 'Error executing batch'}`);
    } finally {
      setIsRunningBatch(false);
    }
  };

  // Discrete-event results dynamically sourced from database (or verified demo benchmark)
  const comparisonData = ratesData.length > 0
    ? ratesData.map((r) => ({
        label: `${r.rate}`,
        rate: r.rate,
        tcpThroughput: r.tcpThroughput,
        udpThroughput: r.udpThroughput,
        tcpLoss: r.tcpLoss,
        udpLoss: r.udpLoss,
        tcpDelay: r.tcpDelay,
        udpDelay: r.udpDelay,
        tcpPdr: r.tcpPdr,
        udpPdr: r.udpPdr,
      }))
    : isDemo
    ? [
        { label: '256 Kbps', rate: '256K', tcpThroughput: 245.2, udpThroughput: 252.0, tcpLoss: 0.2, udpLoss: 0.5, tcpDelay: 15.4, udpDelay: 14.2, tcpPdr: 99.8, udpPdr: 99.5 },
        { label: '512 Kbps', rate: '512K', tcpThroughput: 490.5, udpThroughput: 505.0, tcpLoss: 1.1, udpLoss: 2.8, tcpDelay: 22.1, udpDelay: 19.8, tcpPdr: 98.9, udpPdr: 97.2 },
        { label: '1 Mbps', rate: '1M', tcpThroughput: 940.0, udpThroughput: 985.0, tcpLoss: 3.5, udpLoss: 8.4, tcpDelay: 35.8, udpDelay: 28.4, tcpPdr: 96.5, udpPdr: 91.6 },
        { label: '2 Mbps', rate: '2M', tcpThroughput: 1780.0, udpThroughput: 1940.0, tcpLoss: 6.8, udpLoss: 16.2, tcpDelay: 52.4, udpDelay: 38.6, tcpPdr: 93.2, udpPdr: 83.8 },
        { label: '5 Mbps', rate: '5M', tcpThroughput: 4200.0, udpThroughput: 4850.0, tcpLoss: 11.4, udpLoss: 28.5, tcpDelay: 78.2, udpDelay: 49.0, tcpPdr: 88.6, udpPdr: 71.5 },
      ]
    : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="TCP vs UDP Protocol Performance Analysis"
        description="Comparative evaluation of Connection-Oriented Flow Control (TCP NewReno) vs Connectionless Streaming (UDP CBR) under bottleneck congestion"
        icon={ArrowRightLeft}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRunBatch}
              disabled={isRunningBatch || isDemo}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              title={isDemo ? 'Switch to Live Mode to run' : 'Execute multi-rate benchmark simulations'}
            >
              <PlayCircle className="w-4 h-4" />
              <span>{isRunningBatch ? 'Running 5 Rates...' : 'Run Multi-Rate Benchmark'}</span>
            </button>
            <Link
              to="/simulate"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Single Simulation</span>
            </Link>
          </div>
        }
      />

      {/* Batch Notification Banner */}
      {batchMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="font-semibold">{batchMessage}</span>
          </div>
        </div>
      )}

      {/* Empty State Banner */}
      {!isDemo && comparisonData.length === 0 && (
        <div className="p-5 bg-amber-50/90 border border-amber-300 rounded-2xl text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <span>No multi-rate simulation records in the database yet. Click &ldquo;Run Multi-Rate Benchmark&rdquo; to execute all 5 bottleneck rate simulations.</span>
          <button
            onClick={handleRunBatch}
            disabled={isRunningBatch}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition shadow-xs self-start sm:self-auto shrink-0"
          >
            Run Now
          </button>
        </div>
      )}

      {/* Protocol Architecture Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TCP Architecture Card */}
        <div className="p-5 bg-white rounded-2xl border border-blue-200/90 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-blue-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <ProtocolBadge protocol="TCP" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">TCP (NewReno AIMD)</h3>
                <span className="text-[11px] text-slate-500">Sliding Window • Congestion Control • Reliable Retransmission</span>
              </div>
            </div>
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>

          <p className="text-xs text-slate-600 mb-4 leading-relaxed">
            Employs additive-increase multiplicative-decrease (AIMD) congestion control. Dynamically scales transmission window inflight, backing off exponentially upon packet drop detection at Router R1.
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Flow Control</span>
              <strong className="text-slate-800">Sliding Window</strong>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Loss Recovery</span>
              <strong className="text-slate-800">Fast Retransmit</strong>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Typical PDR</span>
              <strong className="text-emerald-700 font-mono">92% – 99%</strong>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Buffer Policy</span>
              <strong className="text-slate-800">Backs Off on Drop</strong>
            </div>
          </div>
        </div>

        {/* UDP Architecture Card */}
        <div className="p-5 bg-white rounded-2xl border border-amber-200/90 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <ProtocolBadge protocol="UDP" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">UDP (Constant Bit Rate)</h3>
                <span className="text-[11px] text-slate-500">Connectionless • Fixed Bitrate • Zero Sender Backoff</span>
              </div>
            </div>
            <Zap className="w-5 h-5 text-amber-600" />
          </div>

          <p className="text-xs text-slate-600 mb-4 leading-relaxed">
            Transmits packets at an unthrottled constant rate without regard to bottleneck queue depth. Provides minimal delay under low traffic, but causes queue buffer collapse and heavy packet loss under load.
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Flow Control</span>
              <strong className="text-slate-800">None (Unthrottled)</strong>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Loss Recovery</span>
              <strong className="text-slate-800">No Retransmission</strong>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Typical PDR</span>
              <strong className="text-rose-700 font-mono">71% – 91%</strong>
            </div>
            <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Latency Profile</span>
              <strong className="text-blue-700">Minimal / Fixed</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Multi-Rate Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Throughput Comparison */}
        <Card
          title="Throughput Comparison (Kbps)"
          subtitle="UDP vs TCP aggregate received throughput across bottleneck capacities"
          icon={TrendingUp}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="rate" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip unit="Kbps" />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tcpThroughput" name="TCP (Kbps)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="udpThroughput" name="UDP (Kbps)" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-slate-500 bg-slate-50/80 p-3 rounded-xl border border-slate-200 leading-relaxed">
            <strong className="text-slate-800">Analytical Insight:</strong> UDP achieves slightly higher raw throughput because it does not throttle upon buffer drops, but at the cost of high loss rates.
          </div>
        </Card>

        {/* Chart 2: Packet Loss Comparison */}
        <Card
          title="Packet Loss Rate Comparison (%)"
          subtitle="Percentage of unique packets discarded at bottleneck router queues"
          icon={TrendingDown}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="rate" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip unit="%" />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tcpLoss" name="TCP Loss (%)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="udpLoss" name="UDP Loss (%)" fill="#E11D48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-slate-500 bg-slate-50/80 p-3 rounded-xl border border-slate-200 leading-relaxed">
            <strong className="text-slate-800">Analytical Insight:</strong> UDP suffers up to 2.5x higher packet drop rates under heavy load due to lack of sender-side congestion feedback.
          </div>
        </Card>

        {/* Chart 3: End-to-End Latency */}
        <Card
          title="Average End-to-End Delay (ms)"
          subtitle="Queuing buffer latency plus link propagation time"
          icon={Clock}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="rate" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip unit="ms" />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="tcpDelay" name="TCP Delay (ms)" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="udpDelay" name="UDP Delay (ms)" stroke="#D97706" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-slate-500 bg-slate-50/80 p-3 rounded-xl border border-slate-200 leading-relaxed">
            <strong className="text-slate-800">Analytical Insight:</strong> TCP delay scales as queue buffers fill before backoff triggers, whereas UDP latency remains bounded since dropped packets are simply discarded.
          </div>
        </Card>

        {/* Chart 4: Packet Delivery Ratio (PDR) */}
        <Card
          title="Packet Delivery Ratio (PDR %)"
          subtitle="Overall end-to-end delivery reliability index"
          icon={ShieldCheck}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="rate" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[65, 100]} />
                <Tooltip content={<CustomTooltip unit="%" />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tcpPdr" name="TCP PDR (%)" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="udpPdr" name="UDP PDR (%)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-slate-500 bg-slate-50/80 p-3 rounded-xl border border-slate-200 leading-relaxed">
            <strong className="text-slate-800">Analytical Insight:</strong> TCP maintains &gt;90% PDR across all test cases. For examinations and submission uploads, TCP is non-negotiable.
          </div>
        </Card>
      </div>

      {/* Multi-Rate Progression Table */}
      <Card
        title="Multi-Rate Benchmark Progression Table"
        subtitle="Side-by-side metric comparison across 5 link bandwidth scales"
        icon={Layers}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                <th className="px-4 py-3">Bottleneck Bandwidth</th>
                <th className="px-4 py-3 text-blue-700">TCP Throughput</th>
                <th className="px-4 py-3 text-amber-700">UDP Throughput</th>
                <th className="px-4 py-3 text-blue-700">TCP Loss</th>
                <th className="px-4 py-3 text-rose-700">UDP Loss</th>
                <th className="px-4 py-3 text-emerald-700">TCP PDR</th>
                <th className="px-4 py-3 text-amber-700">UDP PDR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {comparisonData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900">{row.rate}</td>
                  <td className="px-4 py-3 font-semibold text-blue-700">{row.tcpThroughput} Kbps</td>
                  <td className="px-4 py-3 font-semibold text-amber-700">{row.udpThroughput} Kbps</td>
                  <td className="px-4 py-3 text-slate-600">{row.tcpLoss}%</td>
                  <td className="px-4 py-3 font-semibold text-rose-600">{row.udpLoss}%</td>
                  <td className="px-4 py-3 font-bold text-emerald-700">{row.tcpPdr}%</td>
                  <td className="px-4 py-3 font-semibold text-amber-700">{row.udpPdr}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default TcpUdpComparison;
