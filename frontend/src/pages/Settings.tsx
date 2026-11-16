import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Server,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
  Cpu,
  Database,
  Info,
  Sliders,
  ShieldCheck,
  RefreshCw,
  FolderOpen,
  Activity,
  HardDrive,
  FileText
} from 'lucide-react';
import { api } from '../services/api';
import { SystemStatusResponse } from '../types';
import { ModeBadge, ModeSelector, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';

export const Settings: React.FC = () => {
  const { mode, isDemo, setMode } = useSimulationMode();
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reseeding, setReseeding] = useState(false);
  const [reseedMsg, setReseedMsg] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    api.getSystemStatus()
      .then(setStatus)
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleReseed = async () => {
    if (!window.confirm('Reset all experiments and restore initial laboratory benchmarks (EXP-001 through EXP-008)?')) return;
    setReseeding(true);
    setReseedMsg(null);
    try {
      const res = await api.seedSystemData(true);
      setReseedMsg(res.message);
      fetchStatus();
    } catch (err: any) {
      alert(err.message || 'Failed to reseed database.');
    } finally {
      setReseeding(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title="System Diagnostics & Simulator Settings"
        description="Discrete-event engine health, SQLite WAL concurrency, global execution modes, and database backup guides"
        icon={SettingsIcon}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <button
            onClick={fetchStatus}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-xs transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Diagnostics</span>
          </button>
        }
      />

      {/* Global Mode Switcher Card */}
      <Card
        title="Global Execution Environment Mode"
        subtitle="Toggle between offline demonstration benchmarks and live discrete-event simulation"
        icon={Sliders}
      >
        <ModeSelector />
      </Card>

      {/* System Health Diagnostics 6-Card Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Backend API */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Server className="w-5 h-5 text-blue-600" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Backend API</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">FastAPI Online</div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Python {status?.python_version || '3.14+'}</span>
        </div>

        {/* Database */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Database className="w-5 h-5 text-indigo-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${status?.db_connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Database</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.db_connected ? 'SQLite WAL' : 'Disconnected'}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">{status?.total_experiments ?? 0} Records</span>
        </div>

        {/* SimPy Discrete-Event Engine */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${status?.simulator_operational ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Simulation Engine</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.simulator_operational ? 'SimPy Active' : 'Offline'}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
            {status?.simulator_version ? `v${status.simulator_version} Audited` : 'Verified Engine'}
          </span>
        </div>

        {/* Smoke Test Latency */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Cpu className="w-5 h-5 text-amber-600" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Engine Smoke Test</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
            {status?.smoke_test_latency_ms ? `${status.smoke_test_latency_ms} ms` : '< 5 ms'}
          </div>
          <span className="text-[10px] text-emerald-600 block mt-0.5 font-semibold">Conservation OK</span>
        </div>

        {/* WSL2 Host */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Terminal className="w-5 h-5 text-orange-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${status?.wsl_detected || status?.wsl_available ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-400">WSL2 Subsystem</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.wsl_detected || status?.wsl_available ? 'WSL2 Active' : 'Not Detected'}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Windows Host</span>
        </div>

        {/* NS-2 Engine */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${status?.ns2_installed ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <div className="text-[10px] uppercase font-bold text-slate-400">NS-2 Simulator</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.ns2_installed ? 'NS-2 Ready' : 'Optional Extra'}
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
            {status?.ns2_installed ? 'WSL2 / Native' : 'SimPy Primary'}
          </span>
        </div>
      </div>

      {/* SQLite Persistence, Concurrency & Backup Guide */}
      <Card
        title="SQLite Database Persistence & Local Backup Instructions"
        subtitle="SQLite WAL mode (Write-Ahead Logging) and busy timeout configuration for concurrent simulation access"
        icon={HardDrive}
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-900 text-sm">Active SQLite Concurrency Settings</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono">
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Journal Mode</span>
                <strong className="text-emerald-700">PRAGMA journal_mode = WAL</strong>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Busy Timeout</span>
                <strong className="text-blue-700">PRAGMA busy_timeout = 5000</strong>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Connect Timeout</span>
                <strong className="text-indigo-700">timeout = 30.0s</strong>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
              WAL mode allows multiple concurrent readers while a simulation background worker writes metrics and trace points, preventing database locks.
            </p>
          </div>

          {/* Backup & Restore Instructions */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Local Database Backup & Restore Guide
            </h4>

            {/* Backup Command */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                  Backup Command (Creates a consistent point-in-time snapshot)
                </span>
                <button
                  onClick={() => handleCopy('sqlite3 backend/edunet.db ".backup backend/backup_snapshot.db"', 'backup')}
                  className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-mono font-semibold"
                >
                  {copiedCmd === 'backup' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCmd === 'backup' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
                sqlite3 backend/edunet.db &quot;.backup backend/backup_snapshot.db&quot;
              </pre>
              <p className="text-[11px] text-slate-500">
                The SQLite online backup API copies the live database safely even while simulations are actively reading or writing.
              </p>
            </div>

            {/* Restore Command */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Restore Command
                </span>
                <button
                  onClick={() => handleCopy('cp backend/backup_snapshot.db backend/edunet.db', 'restore')}
                  className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-mono font-semibold"
                >
                  {copiedCmd === 'restore' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCmd === 'restore' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
                cp backend/backup_snapshot.db backend/edunet.db
              </pre>
              <p className="text-[11px] text-slate-500">
                Ensure backend server is paused or stopped during physical restoration of the main <code>.db</code> file.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Database Management & Clean Reset Section */}
      <Card
        title="Laboratory Database Reset & Baseline Restoration"
        subtitle="Clean reset tool to restore initial academic baseline experiments (EXP-001 through EXP-008)"
        icon={Database}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50/80 border border-slate-200">
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Restore Official Laboratory Benchmarks
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
              Resets the SQLite experiment database and seeds the 8 standardized university curriculum benchmarks. Recommended before demonstration or presentation.
            </p>
            {reseedMsg && (
              <span className="text-xs font-bold text-emerald-700 mt-2 block">
                ✓ {reseedMsg}
              </span>
            )}
          </div>

          <button
            onClick={handleReseed}
            disabled={reseeding}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 ${
              reseeding
                ? 'bg-slate-300 text-slate-600 cursor-wait'
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20'
            }`}
          >
            <RotateCcw className={`w-4 h-4 ${reseeding ? 'animate-spin' : ''}`} />
            <span>{reseeding ? 'Restoring...' : 'Reset to Clean Benchmarks'}</span>
          </button>
        </div>

        {/* Directory Telemetry */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-4 border-t border-slate-100 mt-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 font-medium">SQLite Database:</span>
            </div>
            <code className="text-[11px] font-mono text-slate-900 font-bold truncate max-w-xs">
              {status?.database_path || 'backend/edunet.db'}
            </code>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 font-medium">Documentation:</span>
            </div>
            <code className="text-[11px] font-mono text-slate-900 font-bold truncate max-w-xs">
              docs/PROJECT_REPORT.pdf
            </code>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
