import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Menu } from 'lucide-react';
import { api } from '../services/api';
import { SystemStatusResponse } from '../types';
import { ModeSelector, useSimulationMode } from '../context/SimulationModeContext';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const location = useLocation();
  const { isDemo } = useSimulationMode();

  const fetchStatus = () => {
    api.getSystemStatus().then(setStatus).catch(() => null);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Laboratory Dashboard';
      case '/dashboard': return 'Laboratory Dashboard';
      case '/simulation/new': return 'Configure New Simulation';
      case '/simulate': return 'Configure New Simulation';
      case '/simulation/monitor': return 'Simulation Monitor & Console';
      case '/monitor': return 'Simulation Monitor & Console';
      case '/experiments': return 'Experiment Records & History';
      case '/comparison': return 'Multi-Experiment Comparison';
      case '/compare': return 'Multi-Experiment Comparison';
      case '/performance': return 'Performance Analysis';
      case '/tcp-udp': return 'TCP vs UDP Comparison';
      case '/congestion': return 'Traffic Shaping & Congestion';
      case '/leaky-bucket': return 'Traffic Shaping & Congestion';
      case '/sliding-window': return 'Sliding Window Protocol';
      case '/go-back-n': return 'Go-Back-N ARQ Protocol';
      case '/network': return 'E-Learning Network Topology';
      case '/topology': return 'E-Learning Network Topology';
      case '/reports': return 'Laboratory Reports Hub';
      case '/settings': return 'System & Simulator Settings';
      case '/settings/ns2': return 'System & Simulator Settings';
      default:
        if (location.pathname.startsWith('/experiments/')) return 'Experiment Results';
        if (location.pathname.startsWith('/simulation/')) return 'Simulation Monitor';
        return 'CampusNet Analyzer';
    }
  };

  return (
    <header className="h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      {/* Left: Mobile Menu Toggle & Page Titles */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 -ml-1 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors flex-shrink-0"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
            {getPageTitle()}
          </h2>
          <p className="text-[10px] sm:text-[11px] text-slate-500 truncate hidden sm:block">
            Computer Networks & Internet Protocols Lab — Discrete-Event Performance Telemetry
          </p>
        </div>
      </div>

      {/* Right: Controls & Actions */}
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 flex-shrink-0">
        {/* Global Simulation Mode Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden xl:inline font-mono">
            Mode:
          </span>
          <ModeSelector compact />
        </div>

        {/* Mode Status Pill */}
        <div className="hidden md:flex items-center">
          {isDemo ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>DEMO MODE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{status?.simulator_operational ? 'SIMPY ENGINE' : (status?.ns2_installed ? 'LIVE NS-2' : 'REALTIME')}</span>
            </div>
          )}
        </div>

        {/* New Simulation CTA */}
        {location.pathname !== '/simulation/new' && location.pathname !== '/simulate' && (
          <Link
            to="/simulation/new"
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition-all shadow-xs shadow-blue-500/20 hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">New Simulation</span>
          </Link>
        )}
      </div>
    </header>
  );
};

export default Header;
