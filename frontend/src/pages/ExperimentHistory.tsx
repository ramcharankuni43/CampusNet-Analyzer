import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  History,
  Search,
  Filter,
  Trash2,
  Eye,
  GitCompare,
  Download,
  FileText,
  Plus,
  RefreshCw,
  AlertCircle,
  PlayCircle,
  X,
  Layers
} from 'lucide-react';
import { useDataService } from '../services/dataService';
import { api } from '../services/api';
import { Experiment } from '../types';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ProtocolBadge, StatusBadge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';

export const ExperimentHistory: React.FC = () => {
  const navigate = useNavigate();
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (protocol, scenario, search)
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const fetchExperiments = async () => {
    setLoading(true);
    try {
      const data = await dataService.getExperiments({
        protocol: protocolFilter || undefined,
        experiment_type: typeFilter || undefined,
        search: search || undefined,
      });
      setExperiments(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch experiment history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds([]);
    fetchExperiments();
  }, [mode, protocolFilter, typeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchExperiments();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Are you sure you want to delete Experiment #${id}?`)) return;
    try {
      await dataService.deleteExperiment(id);
      setExperiments((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => prev.filter((selId) => selId !== id));
    } catch (err: any) {
      setExperiments((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => prev.filter((selId) => selId !== id));
    }
  };

  const handleToggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } else {
      if (selectedIds.length >= 4) {
        alert('You can select a maximum of 4 experiments for comparison.');
        return;
      }
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const handleCompareSelected = () => {
    if (selectedIds.length < 2) {
      alert('Please select at least 2 experiments to compare.');
      return;
    }
    navigate(`/compare?ids=${selectedIds.join(',')}`);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Experiment History & Records Archive"
        description="Search, filter, compare, export, and manage discrete-event simulation records"
        icon={History}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <div className="flex items-center gap-2.5">
            <Link
              to="/simulate"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Simulation</span>
            </Link>
          </div>
        }
      />

      {/* Filter and Search Ribbon */}
      <Card
        title="Filter & Search Records"
        subtitle="Narrow by protocol, academic scenario, or keyword"
        icon={Filter}
      >
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by experiment code, name, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  fetchExperiments();
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Protocol Filter */}
          <div>
            <select
              value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Protocols (TCP & UDP)</option>
              <option value="TCP">TCP Only</option>
              <option value="UDP">UDP Only</option>
            </select>
          </div>

          {/* Scenario Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Scenarios</option>
              <option value="Online Classroom">Online Classroom</option>
              <option value="Normal Traffic">Normal Traffic</option>
              <option value="High Traffic">High Traffic</option>
              <option value="TCP vs UDP">TCP vs UDP</option>
              <option value="Leaky Bucket">Leaky Bucket</option>
              <option value="Sliding Window">Sliding Window</option>
              <option value="Go-Back-N">Go-Back-N</option>
            </select>
          </div>
        </form>
      </Card>

      {/* Multi-Selection Sticky Bar */}
      {selectedIds.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-white/20 text-white font-mono text-xs font-bold flex items-center justify-center">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold">
              {selectedIds.length} {selectedIds.length === 1 ? 'experiment' : 'experiments'} selected for multi-run comparison
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
            >
              Deselect All
            </button>
            <button
              onClick={handleCompareSelected}
              disabled={selectedIds.length < 2}
              className="px-4 py-1.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50 text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Compare Selected ({selectedIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Records Table */}
      <Card
        title="Archived Experiments"
        subtitle={`${experiments.length} total records logged`}
        icon={Layers}
      >
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-bold text-slate-700">Loading archived experiments...</span>
          </div>
        ) : experiments.length === 0 ? (
          <EmptyState
            title="No Experiments Found"
            description="No experiment records match your active filters or search terms."
            icon={History}
            actionLabel="Reset Filters"
            onAction={() => {
              setSearch('');
              setProtocolFilter('');
              setTypeFilter('');
              fetchExperiments();
            }}
          />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <th className="px-4 py-3.5 text-center w-10">Select</th>
                  <th className="px-4 py-3.5">Code</th>
                  <th className="px-4 py-3.5">Experiment Details</th>
                  <th className="px-4 py-3.5">Protocol</th>
                  <th className="px-4 py-3.5">Nodes</th>
                  <th className="px-4 py-3.5">Throughput</th>
                  <th className="px-4 py-3.5">Loss</th>
                  <th className="px-4 py-3.5">PDR</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {experiments.map((exp) => {
                  const isChecked = selectedIds.includes(exp.id);
                  const isFailed = exp.status?.toLowerCase() === 'failed';
                  const res = exp.result;

                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isChecked ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(exp.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3.5 font-bold text-blue-700">
                        <Link to={`/experiments/${exp.id}`} className="hover:underline">
                          {exp.exp_code}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 font-sans">
                        <div className="font-bold text-slate-800">{exp.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {exp.experiment_type} • {exp.data_rate} • {exp.simulation_time}s
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <ProtocolBadge protocol={exp.protocol} />
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {exp.users} nodes
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        {res ? `${res.throughput_kbps} Kbps` : '—'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-rose-600">
                        {res ? `${res.packet_loss_percent}%` : '—'}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-emerald-700">
                        {res ? `${res.packet_delivery_ratio}%` : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={exp.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/experiments/${exp.id}`}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors"
                          >
                            Analytics
                          </Link>
                          {res && (
                            <>
                              <a
                                href={api.getReportCsvUrl(exp.id)}
                                download
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Export CSV"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={api.getReportPdfUrl(exp.id)}
                                download
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Export PDF"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(exp.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

export default ExperimentHistory;
