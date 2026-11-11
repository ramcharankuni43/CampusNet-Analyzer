import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  GitCompare,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Clock,
  Zap,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Play,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { useDataService } from '../services/dataService';
import { Experiment, ComparisonResponse, ComparisonMetricItem } from '../types';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';

interface RuleObservation {
  id: string;
  category: 'throughput' | 'loss' | 'delay' | 'pdr' | 'protocol' | 'shaping' | 'concurrency';
  title: string;
  observation: string;
  badge: string;
  badgeColor: string;
}

function generateRuleBasedObservations(
  m1: ComparisonMetricItem,
  m2: ComparisonMetricItem,
  exp1?: Experiment,
  exp2?: Experiment
): RuleObservation[] {
  const list: RuleObservation[] = [];

  // 1. Workload / Student Concurrency Observation
  if (m2.users !== m1.users) {
    const diffU = m2.users - m1.users;
    list.push({
      id: 'concurrency',
      category: 'concurrency',
      title: 'Student Workload Scaling',
      observation: `Student concurrency ${diffU > 0 ? 'increased' : 'decreased'} from ${m1.users} to ${m2.users} active nodes (${diffU > 0 ? `+${diffU}` : diffU} nodes). Concurrency directly influences aggregate packet arrival frequency at intermediate routers.`,
      badge: `${diffU > 0 ? `+${diffU}` : diffU} Users`,
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200'
    });
  }

  // 2. Throughput Observation
  if (m1.throughput_kbps > 0 && m2.throughput_kbps > 0) {
    const diffTp = Number((m2.throughput_kbps - m1.throughput_kbps).toFixed(2));
    const pctTp = Number(((diffTp / m1.throughput_kbps) * 100).toFixed(1));
    if (diffTp < -0.1) {
      list.push({
        id: 'tp_dec',
        category: 'throughput',
        title: 'Throughput Decreased',
        observation: `Throughput decreased compared with the baseline experiment by ${Math.abs(diffTp)} Kbps (${pctTp}%), dropping from ${m1.throughput_kbps} Kbps to ${m2.throughput_kbps} Kbps. Repeated packet drops triggered TCP congestion window reductions (multiplicative decrease).`,
        badge: `${diffTp} Kbps`,
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
      });
    } else if (diffTp > 0.1) {
      list.push({
        id: 'tp_inc',
        category: 'throughput',
        title: 'Throughput Increased',
        observation: `Throughput increased by ${diffTp} Kbps (+${pctTp}%), rising from ${m1.throughput_kbps} Kbps to ${m2.throughput_kbps} Kbps, indicating higher link utilization under available capacity.`,
        badge: `+${diffTp} Kbps`,
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
      });
    }
  }

  // 3. Packet Loss Observation
  const diffLoss = Number((m2.packet_loss_percent - m1.packet_loss_percent).toFixed(2));
  if (diffLoss > 0.1) {
    list.push({
      id: 'loss_inc',
      category: 'loss',
      title: 'Packet Loss Increased Under Higher Traffic',
      observation: `Packet loss increased from ${m1.packet_loss_percent}% to ${m2.packet_loss_percent}% (+${diffLoss}% points). Intermediate router queue buffers filled beyond capacity, causing Tail-Drop buffer discards.`,
      badge: `+${diffLoss}% Loss`,
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200'
    });
  } else if (diffLoss < -0.1) {
    list.push({
      id: 'loss_dec',
      category: 'loss',
      title: 'Packet Loss Decreased',
      observation: `Packet loss decreased from ${m1.packet_loss_percent}% to ${m2.packet_loss_percent}% (${diffLoss}% points), reflecting reduced buffer saturation and fewer link discards.`,
      badge: `${diffLoss}% Loss`,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    });
  }

  // 4. Average Delay Observation
  const diffDelay = Number((m2.average_delay_ms - m1.average_delay_ms).toFixed(2));
  if (diffDelay > 0.5) {
    list.push({
      id: 'delay_inc',
      category: 'delay',
      title: 'Average Delay Increased',
      observation: `Average end-to-end delay increased from ${m1.average_delay_ms} ms to ${m2.average_delay_ms} ms (+${diffDelay} ms). Packets experienced extended queueing latency in intermediate router buffers before link transmission.`,
      badge: `+${diffDelay} ms`,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
    });
  } else if (diffDelay < -0.5) {
    list.push({
      id: 'delay_dec',
      category: 'delay',
      title: 'Average Delay Decreased',
      observation: `Average delay decreased from ${m1.average_delay_ms} ms to ${m2.average_delay_ms} ms (${diffDelay} ms), indicating shorter intermediate queue residency.`,
      badge: `${diffDelay} ms`,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    });
  }

  // 5. Packet Delivery Ratio Observation
  const diffPdr = Number((m2.pdr_percent - m1.pdr_percent).toFixed(2));
  if (diffPdr < -0.1) {
    list.push({
      id: 'pdr_dec',
      category: 'pdr',
      title: 'Packet Delivery Ratio Decreased',
      observation: `Packet delivery ratio decreased from ${m1.pdr_percent}% to ${m2.pdr_percent}% (${diffPdr}% points), indicating reduced delivery reliability due to congestion drops.`,
      badge: `${diffPdr}% PDR`,
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200'
    });
  } else if (diffPdr > 0.1) {
    list.push({
      id: 'pdr_inc',
      category: 'pdr',
      title: 'Packet Delivery Ratio Improved',
      observation: `Packet delivery ratio improved from ${m1.pdr_percent}% to ${m2.pdr_percent}% (+${diffPdr}% points), demonstrating higher delivery reliability.`,
      badge: `+${diffPdr}% PDR`,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    });
  }

  // 6. Protocol Observation (TCP vs UDP)
  if (m1.protocol !== m2.protocol) {
    list.push({
      id: 'protocol',
      category: 'protocol',
      title: 'TCP vs UDP Transport Behavior',
      observation: `Comparing ${m1.protocol} against ${m2.protocol}: TCP throttles transmission window size upon detecting dropped packets to avoid congestion collapse, whereas UDP sends at an unconstrained constant rate without retransmission.`,
      badge: `${m1.protocol} vs ${m2.protocol}`,
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200'
    });
  }

  // 7. Traffic Shaping Observation (Leaky Bucket)
  const typesText = `${exp1?.experiment_type || ''} ${exp2?.experiment_type || ''}`.toLowerCase();
  if (typesText.includes('leaky bucket') || typesText.includes('shaping')) {
    list.push({
      id: 'shaping',
      category: 'shaping',
      title: 'Traffic Shaping (Leaky Bucket Control)',
      observation: 'Traffic shaping reduced the measured peak output rate to the configured leak rate, bounding queue overflow and smoothing bursty packet delivery.',
      badge: 'Leaky Bucket',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200'
    });
  }

  return list;
}

export const ExperimentComparison: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [allExperiments, setAllExperiments] = useState<Experiment[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available experiments whenever mode changes
  useEffect(() => {
    setSelectedIds([]);
    setComparison(null);
    setError(null);
    setLoading(true);

    dataService
      .getExperiments({ limit: 50 })
      .then((data) => {
        setAllExperiments(data);

        // Check query params
        const idsParam = searchParams.get('ids');
        const primaryParam = searchParams.get('primary');

        if (idsParam) {
          const parsed = idsParam
            .split(',')
            .map((x) => parseInt(x, 10))
            .filter((x) => !isNaN(x) && data.some((e) => e.id === x));
          if (parsed.length >= 2) {
            setSelectedIds(parsed);
            return;
          }
        }

        if (primaryParam && data.length >= 2) {
          const pId = parseInt(primaryParam, 10);
          const hasP = data.some((e) => e.id === pId);
          if (hasP) {
            const second = data.find((e) => e.id !== pId);
            if (second) {
              setSelectedIds([pId, second.id]);
              return;
            }
          }
        }

        // Default select first two experiments in the active mode
        if (data.length >= 2) {
          setSelectedIds([data[0].id, data[1].id]);
        }
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load experiments for comparison');
      })
      .finally(() => setLoading(false));
  }, [mode]);

  // Fetch comparison data whenever selectedIds change
  useEffect(() => {
    if (selectedIds.length < 2) {
      setComparison(null);
      return;
    }

    setLoading(true);
    dataService
      .compareExperiments(selectedIds)
      .then((res) => {
        setComparison(res);
        setError(null);
      })
      .catch((err: any) => {
        setError(err.message || 'Comparison failed');
      })
      .finally(() => setLoading(false));
  }, [selectedIds, mode]);

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= 2) {
        alert('You must keep at least two experiments selected for comparison.');
        return;
      }
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      if (selectedIds.length >= 4) {
        alert('Maximum of 4 experiments can be compared simultaneously.');
        return;
      }
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Radar chart normalized metrics (0-100 scale)
  const radarMetrics = [
    { subject: 'Throughput (Scaled)', fullMark: 100 },
    { subject: 'Reliability (PDR %)', fullMark: 100 },
    { subject: 'Low Latency Score', fullMark: 100 },
    { subject: 'Queue Stability', fullMark: 100 },
  ];

  const radarData = radarMetrics.map((rm, idx) => {
    const item: any = { subject: rm.subject };
    comparison?.experiments.forEach((exp) => {
      const r = exp.result;
      if (!r) return;
      if (idx === 0) {
        item[exp.exp_code] = Math.min(Math.round((r.throughput_kbps / 1000) * 100), 100);
      } else if (idx === 1) {
        item[exp.exp_code] = Math.round(r.packet_delivery_ratio);
      } else if (idx === 2) {
        item[exp.exp_code] = Math.max(0, Math.round(100 - r.average_delay_ms));
      } else if (idx === 3) {
        item[exp.exp_code] = Math.max(0, Math.round(100 - r.packet_loss_percent));
      }
    });
    return item;
  });

  const radarColors = ['#2563EB', '#F59E0B', '#10B981', '#8B5CF6'];

  const isTwoExps = comparison !== null && comparison.metrics_table.length === 2;
  const m1 = isTwoExps ? comparison.metrics_table[0] : null;
  const m2 = isTwoExps ? comparison.metrics_table[1] : null;
  const exp1 = isTwoExps ? comparison.experiments.find((e) => e.id === m1?.id) : undefined;
  const exp2 = isTwoExps ? comparison.experiments.find((e) => e.id === m2?.id) : undefined;
  const observations = m1 && m2 ? generateRuleBasedObservations(m1, m2, exp1, exp2) : [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#0F172A]">Multi-Experiment Comparison</h2>
                <ModeBadge isDemo={isDemo} />
              </div>
              <p className="text-xs text-[#64748B]">
                {isDemo
                  ? 'Comparing verified laboratory demonstration benchmarks (deterministic sample data)'
                  : 'Comparing live recorded NS-2 discrete-event simulation runs'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isDemo && (
              <button
                type="button"
                onClick={() => setMode('demo')}
                className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                Switch to Demo Mode (9 Predefined Benchmarks)
              </button>
            )}
          </div>
        </div>

        {/* Experiment Selector Pills */}
        {allExperiments.length >= 2 ? (
          <div className="mt-5 pt-5 border-t border-[#F1F5F9]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#64748B]">
                Select Experiments to Compare (2 - 4 runs):
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {selectedIds.length} of {allExperiments.length} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allExperiments.map((exp) => {
                const isSelected = selectedIds.includes(exp.id);
                return (
                  <button
                    key={exp.id}
                    onClick={() => toggleSelect(exp.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white border-[#CBD5E1] text-[#475569] hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono">{exp.exp_code}</span>
                    <span>
                      ({exp.protocol} - {exp.users}u)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : !loading && allExperiments.length < 2 && (
          <div className="mt-5 pt-5 border-t border-[#F1F5F9]">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Insufficient real-time experiments for comparison
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  At least 2 real-time simulations must be recorded in the database. Currently {allExperiments.length} run found.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('demo')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-xs"
                >
                  Use Demo Mode (Sample Data)
                </button>
                <Link
                  to="/simulate"
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition-colors"
                >
                  Run New Simulation
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-xs font-medium">Computing comparative metrics...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {!isDemo && (
            <button
              onClick={() => setMode('demo')}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-xs transition-colors"
            >
              Use Demo Mode (Sample Data)
            </button>
          )}
        </div>
      )}

      {comparison && !loading && (
        <>
          {/* Comparative Metrics Table */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs overflow-hidden">
            <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0F172A]">Comparative Benchmark Matrix</h3>
              <span className="text-[11px] font-mono text-slate-500">
                Source: {isDemo ? 'PREDEFINED DEMO BENCHMARKS' : 'LIVE NS-2 SIMULATIONS'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8FAFC] text-[#64748B] font-semibold border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-5 py-3">Experiment</th>
                    <th className="px-5 py-3">Mode</th>
                    <th className="px-5 py-3">Protocol</th>
                    <th className="px-5 py-3">Students</th>
                    <th className="px-5 py-3">Throughput</th>
                    <th className="px-5 py-3">Packet Loss</th>
                    <th className="px-5 py-3">PDR</th>
                    <th className="px-5 py-3">Avg Delay</th>
                    <th className="px-5 py-3">Sent / Recv / Drop</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {comparison.metrics_table.map((row) => {
                    const matchedExp = comparison.experiments.find((e) => e.id === row.id);
                    const isDemoRun = matchedExp ? matchedExp.is_demo : false;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-semibold text-[#0F172A]">
                          <span className="font-mono text-blue-700 font-bold mr-2">{row.exp_code}</span>
                          {row.name}
                        </td>
                        <td className="px-5 py-3">
                          <ModeBadge isDemo={isDemoRun} />
                        </td>
                        <td className="px-5 py-3 font-semibold">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              row.protocol === 'TCP'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {row.protocol}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-medium text-[#475569]">{row.users} nodes</td>
                        <td className="px-5 py-3 font-mono font-bold text-[#0F172A]">
                          {row.throughput_kbps} Kbps
                        </td>
                        <td className="px-5 py-3 font-mono font-bold text-rose-600">
                          {row.packet_loss_percent}%
                        </td>
                        <td className="px-5 py-3 font-mono font-bold text-emerald-700">
                          {row.pdr_percent}%
                        </td>
                        <td className="px-5 py-3 font-mono text-amber-700 font-semibold">
                          {row.average_delay_ms} ms
                        </td>
                        <td className="px-5 py-3 font-mono text-slate-500 text-[11px]">
                          {row.packets_sent.toLocaleString()} / {row.packets_received.toLocaleString()} /{' '}
                          {row.packets_dropped.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Direct Head-to-Head Difference Analysis (When 2 Experiments are Selected) */}
          {isTwoExps && m1 && m2 && (
            <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <span>Direct Head-to-Head Difference Analysis</span>
                    <span className="text-xs font-mono font-normal text-slate-500">
                      ({m1.exp_code} &rarr; {m2.exp_code})
                    </span>
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Calculated variance across the four primary performance metrics
                  </p>
                </div>
                <span className="text-[11px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  Exact Metric Variance
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Delta Throughput */}
                {(() => {
                  const diff = Number((m2.throughput_kbps - m1.throughput_kbps).toFixed(2));
                  const isPositive = diff > 0;
                  const pct = m1.throughput_kbps > 0 ? Number(((diff / m1.throughput_kbps) * 100).toFixed(1)) : 0;
                  return (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                        <span>Throughput</span>
                        <Zap className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-bold font-mono ${isPositive ? 'text-emerald-700' : diff < 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                          {diff > 0 ? `+${diff}` : diff} Kbps
                        </span>
                        <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-slate-500'}`}>
                          ({isPositive ? `+${pct}%` : `${pct}%`})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {m1.throughput_kbps} &rarr; {m2.throughput_kbps} Kbps
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Delta Packet Loss */}
                {(() => {
                  const diff = Number((m2.packet_loss_percent - m1.packet_loss_percent).toFixed(2));
                  const isIncreased = diff > 0;
                  return (
                    <div className={`p-4 rounded-xl border space-y-1 ${isIncreased ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                        <span>Packet Loss</span>
                        <TrendingDown className={`w-4 h-4 ${isIncreased ? 'text-rose-600' : 'text-emerald-600'}`} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-bold font-mono ${isIncreased ? 'text-rose-700' : diff < 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {diff > 0 ? `+${diff}` : diff}%
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">variance</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {m1.packet_loss_percent}% &rarr; {m2.packet_loss_percent}%
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Delta Average Delay */}
                {(() => {
                  const diff = Number((m2.average_delay_ms - m1.average_delay_ms).toFixed(2));
                  const isIncreased = diff > 0;
                  return (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                        <span>Average Latency</span>
                        <Clock className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-bold font-mono ${isIncreased ? 'text-amber-700' : diff < 0 ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {diff > 0 ? `+${diff}` : diff} ms
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">latency</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {m1.average_delay_ms} ms &rarr; {m2.average_delay_ms} ms
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Delta PDR */}
                {(() => {
                  const diff = Number((m2.pdr_percent - m1.pdr_percent).toFixed(2));
                  const isImproved = diff > 0;
                  return (
                    <div className={`p-4 rounded-xl border space-y-1 ${diff < 0 ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                        <span>Delivery Ratio (PDR)</span>
                        <CheckCircle2 className={`w-4 h-4 ${isImproved ? 'text-emerald-600' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-bold font-mono ${isImproved ? 'text-emerald-700' : diff < 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                          {diff > 0 ? `+${diff}` : diff}%
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">reliability</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {m1.pdr_percent}% &rarr; {m2.pdr_percent}%
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Automatic Rule-Based Result Interpretation (Phase 7) */}
          {observations.length > 0 && (
            <div className="bg-white p-5 rounded-xl border border-blue-200 shadow-xs space-y-3 bg-gradient-to-br from-white to-blue-50/20">
              <div className="flex items-center gap-2 border-b border-[#F1F5F9] pb-3">
                <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Automated Academic Analysis & Observations (Rule-Based Engine)
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Calculated networking observations derived strictly from measured simulation data
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                {observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-blue-300 transition-colors space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <h4 className="text-xs font-bold text-[#0F172A]">{obs.title}</h4>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${obs.badgeColor}`}>
                        {obs.badge}
                      </span>
                    </div>
                    <p className="text-xs text-[#475569] leading-relaxed pl-4">
                      {obs.observation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comparative Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Throughput Comparison */}
            <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
              <h3 className="text-sm font-bold text-[#0F172A] mb-1">Delivered Throughput Comparison</h3>
              <p className="text-xs text-[#64748B] mb-4">
                Throughput (Kbps) measured at LMS server ({isDemo ? 'Demo Model' : 'Live NS-2'})
              </p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.comparison_charts.throughput}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Kbps', angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="throughput" name="Throughput (Kbps)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Packet Loss Comparison */}
            <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
              <h3 className="text-sm font-bold text-[#0F172A] mb-1">Packet Loss Rate Comparison</h3>
              <p className="text-xs text-[#64748B] mb-4">
                Drop percentage at bottleneck router ({isDemo ? 'Demo Model' : 'Live NS-2'})
              </p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.comparison_charts.loss}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Loss %', angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="loss" name="Packet Loss %" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* End-to-End Delay Comparison */}
            <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
              <h3 className="text-sm font-bold text-[#0F172A] mb-1">End-to-End Latency Comparison</h3>
              <p className="text-xs text-[#64748B] mb-4">
                Average packet transit time in milliseconds ({isDemo ? 'Demo Model' : 'Live NS-2'})
              </p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.comparison_charts.delay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      label={{ value: 'ms', angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="delay" name="Delay (ms)" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Multi-Dimensional Radar Comparison */}
            <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
              <h3 className="text-sm font-bold text-[#0F172A] mb-1">Holistic Performance Radar</h3>
              <p className="text-xs text-[#64748B] mb-4">
                Multi-attribute scoring (Throughput, PDR, Latency, Stability)
              </p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#E2E8F0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                    {comparison.experiments.map((exp, i) => (
                      <Radar
                        key={exp.id}
                        name={exp.exp_code}
                        dataKey={exp.exp_code}
                        stroke={radarColors[i % radarColors.length]}
                        fill={radarColors[i % radarColors.length]}
                        fillOpacity={0.25}
                      />
                    ))}
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Analytical Observation Box */}
          <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 mb-2 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span>Comparative Evaluation & Observations ({isDemo ? 'Demo Mode' : 'Live NS-2'})</span>
            </h4>
            <p className="text-xs text-blue-800 leading-relaxed font-medium">
              {comparison.analysis_summary}
            </p>
          </div>
        </>
      )}
    </div>
  );
};
