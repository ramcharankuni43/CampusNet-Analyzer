import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PlayCircle,
  Activity,
  History,
  GitCompare,
  Network,
  ShieldCheck,
  Gauge,
  FileText,
  Settings as SettingsIcon,
  Server,
  Info,
  Users,
  Repeat,
  Sliders,
  Terminal,
  Zap,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { SystemStatusResponse } from '../types';
import { AppLogo } from '../components/AppLogo';
import { useSimulationMode } from '../context/SimulationModeContext';

interface NavSection {
  title?: string;
  items: {
    path: string;
    label: string;
    icon: any;
    badge?: string;
  }[];
}

const navSections: NavSection[] = [
  {
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Simulation',
    items: [
      { path: '/simulation/new', label: 'New Simulation', icon: PlayCircle },
      { path: '/simulation/monitor', label: 'Simulation Monitor', icon: Activity },
      { path: '/experiments', label: 'Experiments', icon: History },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { path: '/comparison', label: 'Experiment Comparison', icon: GitCompare },
      { path: '/performance', label: 'Performance Analysis', icon: Users, badge: 'Load' },
      { path: '/tcp-udp', label: 'TCP vs UDP', icon: Zap },
    ],
  },
  {
    title: 'Reliable Transmission',
    items: [
      { path: '/sliding-window', label: 'Sliding Window', icon: ShieldCheck },
      { path: '/go-back-n', label: 'Go-Back-N', icon: Repeat },
    ],
  },
  {
    title: 'Traffic Control',
    items: [
      { path: '/leaky-bucket', label: 'Traffic Shaping & Congestion', icon: Sliders },
    ],
  },
  {
    title: 'Network',
    items: [
      { path: '/network', label: 'Network Visualization', icon: Network },
    ],
  },
  {
    items: [
      { path: '/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    title: 'Settings',
    items: [
      { path: '/settings', label: 'System & Simulator Settings', icon: SettingsIcon },
    ],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const { isDemo } = useSimulationMode();

  useEffect(() => {
    api.getSystemStatus().then(setStatus).catch(() => null);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const renderNavContent = (isMobile: boolean = false) => (
    <>
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-200/90 bg-gradient-to-b from-white to-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo className="w-9 h-9 shadow-sm shadow-blue-500/20 flex-shrink-0" />
            <div>
              <h1 className="font-bold text-sm text-slate-900 tracking-tight leading-none">CampusNet Analyzer</h1>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">University Network Lab</p>
            </div>
          </div>
          {isMobile && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="mt-3 text-[10px] text-blue-700 bg-blue-50/80 px-2.5 py-1.5 rounded-xl font-medium border border-blue-200/60 flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse flex-shrink-0"></span>
            <span className="truncate font-semibold">Simulate • Measure • Compare</span>
          </div>
          <span className="font-mono font-bold text-[9px] px-1.5 py-0.5 rounded-md bg-white text-blue-800 border border-blue-200 ml-1 shadow-2xs">
            {isDemo ? 'DEMO' : 'SIMPY'}
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-3.5 space-y-4 overflow-y-auto text-xs">
        {navSections.map((sec, secIdx) => (
          <div key={secIdx} className="space-y-1">
            {sec.title && (
              <div className="px-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {sec.title}
              </div>
            )}
            {sec.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => {
                    if (isMobile && onClose) onClose();
                  }}
                  className={({ isActive }) =>
                    `group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs shadow-blue-500/20'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110 ${
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'
                        }`} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-mono font-bold ${
                          isActive
                            ? 'bg-blue-700/60 text-white'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Engine Status Card */}
      <div className="p-3 border-t border-slate-200/90 bg-slate-50/50">
        <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Engine Status</span>
            {status?.simulator_operational ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                SIMPY 4.1
              </span>
            ) : status?.ns2_installed ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                NS-2 READY
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                DEMO BENCHMARK
              </span>
            )}
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1.5 leading-tight">
            <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">
              {isDemo
                ? 'Offline reference dataset mode.'
                : 'SimPy discrete-event engine active.'}
            </span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-[#E2E8F0] flex-col h-screen sticky top-0 select-none flex-shrink-0 z-30">
        {renderNavContent(false)}
      </aside>

      {/* Mobile Drawer Backdrop & Container */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Slide-in Drawer */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white flex flex-col h-full shadow-2xl z-50 select-none animate-in slide-in-from-left duration-200">
            {renderNavContent(true)}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
