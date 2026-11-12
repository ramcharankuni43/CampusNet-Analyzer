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
  FolderOpen
} from 'lucide-react';
import { api } from '../services/api';
import { SystemStatusResponse } from '../types';
import { ModeBadge, ModeSelector, useSimulationMode } from '../context/SimulationModeContext';

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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">System & Simulator Settings</h1>
              <ModeBadge isDemo={isDemo} />
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Engine diagnostics, global execution mode, database management, and Windows WSL2 NS-2 setup.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition shrink-0"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Diagnostics
        </button>
      </div>

      {/* Global Mode Switcher Card */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#F1F5F9]">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Global Execution Environment
          </h3>
        </div>
        <ModeSelector />
      </div>

      {/* System Health Status 5-Card Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* Backend API */}
        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Server className="w-5 h-5 text-blue-600" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xs text-slate-500 font-medium">Backend API</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">FastAPI Online</div>
          <span className="text-[10px] text-slate-400">Port 8000 (Python {status?.python_version || '3.10+'})</span>
        </div>

        {/* Database */}
        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Database className="w-5 h-5 text-indigo-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${status?.db_connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </div>
          <div className="text-xs text-slate-500 font-medium">Database</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.db_connected ? 'SQLite WAL Mode' : 'Disconnected'}
          </div>
          <span className="text-[10px] text-slate-400">{status?.total_experiments ?? 0} Experiments</span>
        </div>

        {/* WSL2 Host */}
        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Cpu className="w-5 h-5 text-amber-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${status?.wsl_detected || status?.wsl_available ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <div className="text-xs text-slate-500 font-medium">WSL2 Subsystem</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.wsl_detected || status?.wsl_available ? 'WSL2 Active' : 'Not Detected'}
          </div>
          <span className="text-[10px] text-slate-400">Windows Virtualization</span>
        </div>

        {/* Ubuntu Linux */}
        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <Terminal className="w-5 h-5 text-orange-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${Boolean(status?.wsl_distro) || status?.ubuntu_distro_found ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <div className="text-xs text-slate-500 font-medium">Ubuntu Instance</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.wsl_distro || (status?.ubuntu_distro_found ? 'Ubuntu Ready' : 'Distro Missing')}
          </div>
          <span className="text-[10px] text-slate-400">WSL Ubuntu Distro</span>
        </div>

        {/* NS-2 Engine */}
        <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span className={`w-2.5 h-2.5 rounded-full ${status?.ns2_installed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <div className="text-xs text-slate-500 font-medium">NS-2 Simulator</div>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {status?.ns2_installed ? 'NS-2 Ready' : 'Offline / Demo'}
          </div>
          <span className="text-[10px] text-slate-400 truncate block">
            {status?.ns2_installed ? 'Discrete-Event' : 'Calibrated Mode'}
          </span>
        </div>
      </div>

      {/* Guided 3-Step Setup Instructions */}
      <div className="p-6 bg-white rounded-xl border border-[#E2E8F0] shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-[#0F172A]">
            Windows 10/11 WSL2 & NS-2.35 Installation Guide
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Follow these three commands to equip your Windows machine with native discrete-event NS-2 simulation capabilities for Live NS-2 mode.
          </p>
        </div>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                Step 1: Install WSL2 Ubuntu (PowerShell as Administrator)
              </span>
              <button
                onClick={() => handleCopy('wsl --install -d Ubuntu', 'step1')}
                className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-mono"
              >
                {copiedCmd === 'step1' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCmd === 'step1' ? 'Copied!' : 'Copy Command'}
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
              wsl --install -d Ubuntu
            </pre>
            <p className="text-[11px] text-slate-500 mt-2">
              Open PowerShell as Administrator, execute this command, and restart your computer if prompted.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded">
                Step 2: Install NS-2 & NAM (Inside Ubuntu Terminal)
              </span>
              <button
                onClick={() => handleCopy('sudo apt update && sudo apt install -y ns2 nam', 'step2')}
                className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-mono"
              >
                {copiedCmd === 'step2' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCmd === 'step2' ? 'Copied!' : 'Copy Command'}
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
              sudo apt update && sudo apt install -y ns2 nam
            </pre>
            <p className="text-[11px] text-slate-500 mt-2">
              Launch Ubuntu from your Windows Start menu and run this command to install the official Network Simulator 2 suite.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                Step 3: Verify NS-2 Version & Installation
              </span>
              <button
                onClick={() => handleCopy('ns -version', 'step3')}
                className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-mono"
              >
                {copiedCmd === 'step3' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCmd === 'step3' ? 'Copied!' : 'Copy Command'}
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
              ns -version
            </pre>
            <p className="text-[11px] text-slate-500 mt-2">
              Expected output is <code>2.35</code>. Once verified, CampusNet Analyzer will automatically invoke NS-2 through WSL2.
            </p>
          </div>
        </div>
      </div>

      {/* Database Management & Clean Reset Section */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Database Management & Baseline Benchmarks
            </h3>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div>
            <h4 className="text-sm font-bold text-slate-800">Restore Laboratory Baseline Experiments</h4>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
              Resets the SQLite database and restores the 8 academic benchmark experiments (EXP-001 through EXP-008). Useful before college demonstrations or after running test experiments.
            </p>
            {reseedMsg && (
              <span className="text-xs font-semibold text-emerald-600 mt-2 block">
                ✓ {reseedMsg}
              </span>
            )}
          </div>

          <button
            onClick={handleReseed}
            disabled={reseeding}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition shrink-0 ${
              reseeding
                ? 'bg-slate-300 text-slate-600 cursor-wait'
                : 'bg-rose-600 hover:bg-rose-700 text-white'
            }`}
          >
            <RotateCcw className={`w-4 h-4 ${reseeding ? 'animate-spin' : ''}`} />
            <span>{reseeding ? 'Resetting...' : 'Reset to Clean State'}</span>
          </button>
        </div>

        {/* Directory Telemetry */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 font-medium">SQLite Database Path:</span>
            </div>
            <code className="text-[11px] font-mono text-slate-800 font-semibold truncate max-w-xs">
              {status?.database_path || 'backend/edunet.db'}
            </code>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 font-medium">Simulation Runs Dir:</span>
            </div>
            <code className="text-[11px] font-mono text-slate-800 font-semibold truncate max-w-xs">
              simulation/runs/
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};
