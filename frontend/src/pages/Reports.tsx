import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Download,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  Search,
  BookOpen,
  AlertCircle,
  X
} from 'lucide-react';
import { useDataService } from '../services/dataService';
import { api } from '../services/api';
import { Experiment } from '../types';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ProtocolBadge, StatusBadge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';

export const Reports: React.FC = () => {
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchExperiments = () => {
    setLoading(true);
    dataService
      .getExperiments({ limit: 50, search: search || undefined })
      .then(setExperiments)
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExperiments();
  }, [search, mode]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Academic Laboratory Report Hub"
        description="Download publication-grade academic laboratory reports compiled from verified discrete-event simulation records"
        icon={FileText}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search reports by experiment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        }
      />

      {/* PDF Report Structure Guide */}
      <Card
        title="University Laboratory Report Structure"
        subtitle="Standardized documentation format complying with computer networking curriculum guidelines"
        icon={BookOpen}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
            <span className="font-mono text-blue-700 font-bold block mb-1">Section 1</span>
            <strong className="text-slate-800 block">Metadata & Config</strong>
            <p className="text-[11px] text-slate-500 mt-1">Experiment code, date, protocols, student count</p>
          </div>
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
            <span className="font-mono text-blue-700 font-bold block mb-1">Section 2</span>
            <strong className="text-slate-800 block">Network Topology</strong>
            <p className="text-[11px] text-slate-500 mt-1">Node layout, link delays, bottleneck capacity</p>
          </div>
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
            <span className="font-mono text-blue-700 font-bold block mb-1">Section 3</span>
            <strong className="text-slate-800 block">Performance Metrics</strong>
            <p className="text-[11px] text-slate-500 mt-1">Throughput, packet loss, PDR, latency tables</p>
          </div>
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
            <span className="font-mono text-blue-700 font-bold block mb-1">Section 4</span>
            <strong className="text-slate-800 block">Faculty Sign-Off</strong>
            <p className="text-[11px] text-slate-500 mt-1">Analytical observations & verification block</p>
          </div>
        </div>
      </Card>

      {/* Available Reports Table */}
      <Card
        title="Available Experiment Reports"
        subtitle={`${experiments.length} simulation records ready for download`}
        icon={Layers}
      >
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-bold text-slate-700">Loading laboratory reports...</span>
          </div>
        ) : experiments.length === 0 ? (
          <EmptyState
            title="No Reports Found"
            description="No experiment records match your search query."
            icon={FileText}
            actionLabel="Clear Search"
            onAction={() => setSearch('')}
          />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <th className="px-5 py-3.5">Code</th>
                  <th className="px-5 py-3.5">Experiment Title</th>
                  <th className="px-5 py-3.5">Protocol</th>
                  <th className="px-5 py-3.5">Nodes</th>
                  <th className="px-5 py-3.5">Throughput</th>
                  <th className="px-5 py-3.5">Loss</th>
                  <th className="px-5 py-3.5">PDR</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Download Formats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {experiments.map((exp) => {
                  const res = exp.result;
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-blue-700">
                        <Link to={`/experiments/${exp.id}`} className="hover:underline">
                          {exp.exp_code}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 font-sans">
                        <div className="font-bold text-slate-800">{exp.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {exp.experiment_type} • {exp.data_rate} • {exp.simulation_time}s
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <ProtocolBadge protocol={exp.protocol} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {exp.users} nodes
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {res ? `${res.throughput_kbps} Kbps` : '—'}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-rose-600">
                        {res ? `${res.packet_loss_percent}%` : '—'}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-emerald-700">
                        {res ? `${res.packet_delivery_ratio}%` : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={exp.status} />
                      </td>
                      <td className="px-5 py-3.5 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={api.getReportCsvUrl(exp.id)}
                            download
                            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-600" />
                            <span>CSV</span>
                          </a>
                          <a
                            href={api.getReportPdfUrl(exp.id)}
                            download
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Reports;
