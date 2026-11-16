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
  Sparkles,
  RotateCcw,
  Check
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
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ProtocolBadge, StatusBadge } from '../components/Badge';
import { CustomTooltip } from '../components/CustomTooltip';

export interface RuleObservation {
  id: string;
  category: 'throughput' | 'loss' | 'delay' | 'pdr' | 'protocol' | 'shaping' | 'concurrency';
  title: string;
  observation: string;
  badge: string;
  badgeColor: string;
}

export function generateRuleBasedObservations(
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
  const [searchParams] = useSearchParams();
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [allExperiments, setAllExperiments] = useState<Experiment[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds([]);
    setComparison(null);
    setError(null);
    setLoading(true);

    dataService
      .getExperiments({ limit: 50 })
      .then((data) => {
        setAllExperiments(data);

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

        if (data.length >= 2) {
          setSelectedIds([data[0].id, data[1].id]);
        }
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load experiments for comparison');
      })
      .finally(() => setLoading(false));
  }, [mode]);

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

  const radarMetrics = [
    { subject: 'Throughput', fullMark: 100 },
    { subject: 'Reliability (PDR)', fullMark: 100 },
    { subject: 'Low Latency', fullMark: 100 },
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Multi-Experiment Comparative Analysis"
        description={
          isDemo
            ? 'Cross-scenario evaluation of predefined laboratory benchmark configurations'
            : 'Cross-scenario analytical comparison derived from recorded SimPy discrete-event runs'
        }
        icon={GitCompare}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <div className="flex items-center gap-2">
            {!isDemo && (
              <button
                type="button"
                onClick={() => setMode('demo')}
                className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-2 rounded-xl transition-colors"
              >
                Switch to Demo Benchmarks
              </button>
            )}
            <Link
              to="/simulate"
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-xl shadow-xs transition-colors"
            >
              New Run
            </Link>
          </div>
        }
      />

      {/* Experiment Selector Pills Card */}
      <Card
        title="Select Experiments to Compare"
        subtitle="Choose between 2 to 4 experiments for side-by-side metric comparison"
        icon={Layers}
        action={
          <span className="font-mono text-xs font-semibold text-slate-500">
            {selectedIds.length} of {allExperiments.length} selected
          </span>
        }
      >
        {allExperiments.length >= 2 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {allExperiments.map((exp) => {
              const isSelected = selectedIds.includes(exp.id);
              return (
                <button
                  key={exp.id}
                  onClick={() => toggleSelect(exp.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span className="font-mono">{exp.exp_code}</span>
                  <span className={`text-[11px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                    ({exp.protocol} • {exp.users} nodes)
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span>At least 2 experiments are required for comparison. Please run a simulation first.</span>
            <Link to="/simulate" className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg">
              Launch Run
            </Link>
          </div>
        )}
      </Card>

      {/* Loading Indicator */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <p className="text-xs font-bold text-slate-700">Computing comparative metrics...</p>
        </div>
      )}

      {/* Comparison Results */}
      {comparison && !loading && (
        <>
          {/* Comparative Metrics Table */}
          <Card
            title="Comparative Benchmark Matrix"
            subtitle={`Source: ${isDemo ? 'Predefined Laboratory Benchmarks' : 'SimPy Discrete-Event Simulations'}`}
            icon={Layers}
          >
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <th className="px-5 py-3">Experiment</th>
                    <th className="px-5 py-3">Protocol</th>
                    <th className="px-5 py-3">Students</th>
                    <th className="px-5 py-3">Throughput</th>
                    <th className="px-5 py-3">Packet Loss</th>
                    <th className="px-5 py-3">PDR</th>
                    <th className="px-5 py-3">Delay</th>
                    <th className="px-5 py-3">Sent / Recv / Drop</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {comparison.metrics_table.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900 font-sans">
                        <Link to={`/experiments/${row.id}`} className="font-mono text-blue-700 font-bold hover:underline mr-2">
                          {row.exp_code}
                        </Link>
                        {row.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <ProtocolBadge protocol={row.protocol} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{row.users} nodes</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">{row.throughput_kbps} Kbps</td>
                      <td className="px-5 py-3.5 font-semibold text-rose-600">{row.packet_loss_percent}%</td>
                      <td className="px-5 py-3.5 font-bold text-emerald-700">{row.pdr_percent}%</td>
                      <td className="px-5 py-3.5 font-semibold text-amber-700">{row.average_delay_ms} ms</td>
                      <td className="px-5 py-3.5 text-[11px] text-slate-500">
                        {row.packets_sent.toLocaleString()} / {row.packets_received.toLocaleString()} / {row.packets_dropped.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Direct Head-to-Head Variance (When exactly 2 experiments are compared) */}
          {isTwoExps && m1 && m2 && (
            <Card
              title="Direct Head-to-Head Variance"
              subtitle={`Comparing exact metric deltas from ${m1.exp_code} to ${m2.exp_code}`}
              icon={GitCompare}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Delta Throughput */}
                {(() => {
                  const diff = Number((m2.throughput_kbps - m1.throughput_kbps).toFixed(2));
                  const isPositive = diff > 0;
                  const pct = m1.throughput_kbps > 0 ? Number(((diff / m1.throughput_kbps) * 100).toFixed(1)) : 0;
                  return (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
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

                {/* Delta Packet Loss */}
                {(() => {
                  const diff = Number((m2.packet_loss_percent - m1.packet_loss_percent).toFixed(2));
                  const isIncreased = diff > 0;
                  return (
                    <div className={`p-4 rounded-xl border space-y-1 ${isIncreased ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200 bg-slate-50/70'}`}>
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

                {/* Delta Delay */}
                {(() => {
                  const diff = Number((m2.average_delay_ms - m1.average_delay_ms).toFixed(2));
                  const isIncreased = diff > 0;
                  return (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1">
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

                {/* Delta PDR */}
                {(() => {
                  const diff = Number((m2.pdr_percent - m1.pdr_percent).toFixed(2));
                  const isImproved = diff > 0;
                  return (
                    <div className={`p-4 rounded-xl border space-y-1 ${diff < 0 ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/70'}`}>
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
            </Card>
          )}

          {/* Rule-Based Observations Card */}
          {observations.length > 0 && (
            <Card
              title="Automated Rule-Based Academic Observations"
              subtitle="Analytical inferences generated from empirical simulation deltas"
              icon={Sparkles}
            >
              <div className="space-y-3">
                {observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-colors space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <h4 className="text-xs font-bold text-slate-900">{obs.title}</h4>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${obs.badgeColor}`}>
                        {obs.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed pl-4">
                      {obs.observation}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 4 Comparative Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card
              title="Delivered Throughput (Kbps)"
              subtitle="Measured goodput arriving at destination server"
              icon={Zap}
            >
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.comparison_charts.throughput}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip unit="Kbps" />} />
                    <Bar dataKey="throughput" name="Throughput" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card
              title="Packet Loss Ratio (%)"
              subtitle="Drop rate percentage at intermediate bottleneck queue"
              icon={TrendingDown}
            >
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.comparison_charts.loss}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip unit="%" />} />
                    <Bar dataKey="loss" name="Loss %" fill="#DC2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card
              title="Average Latency (ms)"
              subtitle="End-to-end packet transmission and queue latency"
              icon={Clock}
            >
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.comparison_charts.delay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip unit="ms" />} />
                    <Bar dataKey="delay" name="Delay (ms)" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card
              title="Holistic Performance Radar"
              subtitle="Multi-attribute performance footprint across selected runs"
              icon={Layers}
            >
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
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default ExperimentComparison;
