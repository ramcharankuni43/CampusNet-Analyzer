import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Network,
  Server,
  Router,
  Monitor,
  Info,
  Sliders,
  Play,
  Pause,
  Layers,
  ArrowRight,
  CheckCircle2,
  FileCode,
  Activity,
  Zap,
  RotateCcw
} from 'lucide-react';
import { useDataService } from '../services/dataService';
import { Experiment } from '../types';
import { ModeBadge, useSimulationMode } from '../context/SimulationModeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ProtocolBadge } from '../components/Badge';

export const NetworkTopology: React.FC = () => {
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [realExperiments, setRealExperiments] = useState<Experiment[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<number | null>(null);

  // Dynamic topology state
  const [studentCount, setStudentCount] = useState<number>(10);
  const [bottleneckBw, setBottleneckBw] = useState<string>('1 Mbps');
  const [currentProtocol, setCurrentProtocol] = useState<string>('TCP');
  const [activeNode, setActiveNode] = useState<{
    id: string;
    label: string;
    role: string;
    ip: string;
    interfaceDetails: string;
    queue: string;
  } | null>({
    id: 'R1',
    label: 'Access Router R1',
    role: 'Border Gateway Aggregator',
    ip: '10.0.1.1/24',
    interfaceDetails: 'N-port 10Mbps Access Links, 1x Bottleneck Trunk',
    queue: 'DropTail (Limit: 25 packets)',
  });

  const [animating, setAnimating] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [realtimePacketsSent, setRealtimePacketsSent] = useState<number>(1240);
  const [realtimePacketsDelivered, setRealtimePacketsDelivered] = useState<number>(1188);
  const [realtimePacketsDropped, setRealtimePacketsDropped] = useState<number>(52);
  const [currentQueue, setCurrentQueue] = useState<number>(8);
  const [isQueueOverflow, setIsQueueOverflow] = useState<boolean>(false);
  const [instantThroughput, setInstantThroughput] = useState<number>(864);

  // Load real-time experiments when in Real-Time Mode
  useEffect(() => {
    if (!isDemo) {
      dataService.getExperiments({ limit: 50 }).then((data) => {
        setRealExperiments(data);
        if (data.length > 0) {
          const first = data[0];
          setSelectedExpId(first.id);
          applyExperimentTopology(first);
        }
      }).catch(() => null);
    }
  }, [mode, isDemo]);

  const applyExperimentTopology = (exp: Experiment) => {
    setStudentCount(exp.users);
    setBottleneckBw(exp.data_rate);
    setCurrentProtocol(exp.protocol);
    if (exp.result) {
      setRealtimePacketsSent(exp.result.packets_sent);
      setRealtimePacketsDelivered(exp.result.packets_received);
      setRealtimePacketsDropped(exp.result.packets_dropped);
      setInstantThroughput(Math.round(exp.result.throughput_kbps));
      setCurrentQueue(Math.min(25, Math.round(exp.result.packets_dropped > 0 ? 22 : 8)));
    }
  };

  const handleExperimentSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10);
    setSelectedExpId(id);
    const exp = realExperiments.find((x) => x.id === id);
    if (exp) {
      applyExperimentTopology(exp);
    }
  };

  useEffect(() => {
    if (!animating) return;

    const interval = setInterval(() => {
      const newPackets = Math.floor((studentCount / 4) * speedMultiplier) + 1;
      setRealtimePacketsSent((s) => s + newPackets);

      setCurrentQueue((prev) => {
        const arrival = newPackets;
        const capacity = 25;
        const drain = Math.floor(4 * speedMultiplier);
        const potential = prev + arrival - drain;

        if (potential >= capacity) {
          setIsQueueOverflow(true);
          setRealtimePacketsDropped((d) => d + (potential - capacity));
          setRealtimePacketsDelivered((del) => del + drain);
          setTimeout(() => setIsQueueOverflow(false), 400);
          return capacity;
        }

        const nextQ = Math.max(0, potential);
        setRealtimePacketsDelivered((del) => del + Math.min(prev, drain));
        return nextQ;
      });

      const variation = (Math.random() - 0.5) * 40;
      setInstantThroughput(Math.round(860 + studentCount * 1.5 + variation));
    }, 600 / speedMultiplier);

    return () => clearInterval(interval);
  }, [animating, speedMultiplier, studentCount]);

  const displayCount = Math.min(studentCount, 8);
  const studentNodes = Array.from({ length: displayCount }, (_, i) => {
    const ySpacing = 360 / (displayCount + 1);
    return {
      id: `N${i}`,
      label: `Student ${i + 1}`,
      x: 90,
      y: 40 + (i + 1) * ySpacing,
      ip: `10.0.0.${i + 10}`,
    };
  });

  const r1Pos = { x: 300, y: 220 };
  const r2Pos = { x: 520, y: 220 };
  const srvPos = { x: 740, y: 220 };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title="Simulated Campus Network Topology"
        description="Interactive architectural model representing student access nodes, access router R1, bottleneck link trunk, core router R2, and central LMS server"
        icon={Network}
        badge={<ModeBadge isDemo={isDemo} />}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {!isDemo && realExperiments.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Record:</span>
                <select
                  value={selectedExpId || ''}
                  onChange={handleExperimentSelect}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold"
                >
                  {realExperiments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.exp_code}: {e.users}u ({e.protocol})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Link
              to="/simulate"
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              Configure Parameters
            </Link>
          </div>
        }
      />

      {/* Telemetry Quick Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Packets Injected</span>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {realtimePacketsSent.toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Aggregated arrival</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-emerald-800 block tracking-wider">Delivered to LMS</span>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {realtimePacketsDelivered.toLocaleString()}
          </div>
          <span className="text-[10px] text-emerald-600 mt-0.5 block">Delivered packets</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-rose-800 block tracking-wider">Buffer Drops (R1)</span>
          <div className={`text-xl font-bold font-mono mt-1 ${isQueueOverflow ? 'text-rose-600 animate-bounce' : 'text-slate-900'}`}>
            {realtimePacketsDropped.toLocaleString()}
          </div>
          <span className="text-[10px] text-rose-600 mt-0.5 block">Queue discards</span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-blue-800 block tracking-wider">Instant Rate</span>
          <div className="text-xl font-bold font-mono text-blue-700 mt-1">
            {instantThroughput} <span className="text-xs font-semibold">Kbps</span>
          </div>
          <span className="text-[10px] text-blue-600 mt-0.5 block">Current pipe rate</span>
        </div>
      </div>

      {/* Interactive SVG Topology Map Card */}
      <Card
        title="Interactive Network Topology Architecture"
        subtitle="Click any node to inspect interface addresses, routing roles, and queue parameters"
        icon={Network}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAnimating(!animating)}
              className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                animating ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
              }`}
              title={animating ? 'Pause traffic animation' : 'Resume traffic animation'}
            >
              {animating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <span className="text-[11px] font-mono text-slate-500">{currentProtocol}</span>
          </div>
        }
      >
        <div className="bg-slate-950 rounded-2xl p-4 overflow-hidden border border-slate-800 shadow-inner">
          <svg viewBox="0 0 840 440" className="w-full h-auto select-none">
            <defs>
              <linearGradient id="linkTrunkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Links from Student Nodes to Access Router R1 */}
            {studentNodes.map((node) => (
              <g key={`link-${node.id}`}>
                <line
                  x1={node.x}
                  y1={node.y}
                  x2={r1Pos.x}
                  y2={r1Pos.y}
                  stroke="#334155"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
              </g>
            ))}

            {/* Bottleneck Link (R1 to R2) */}
            <line
              x1={r1Pos.x}
              y1={r1Pos.y}
              x2={r2Pos.x}
              y2={r2Pos.y}
              stroke="url(#linkTrunkGrad)"
              strokeWidth="6"
            />
            {/* Bottleneck Label */}
            <rect
              x={(r1Pos.x + r2Pos.x) / 2 - 50}
              y={r1Pos.y - 32}
              width="100"
              height="20"
              rx="6"
              fill="#1E293B"
              stroke="#475569"
            />
            <text
              x={(r1Pos.x + r2Pos.x) / 2}
              y={r1Pos.y - 18}
              fill="#94A3B8"
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {bottleneckBw} • 20ms
            </text>

            {/* Core Link (R2 to LMS Server) */}
            <line
              x1={r2Pos.x}
              y1={r2Pos.y}
              x2={srvPos.x}
              y2={srvPos.y}
              stroke="#10B981"
              strokeWidth="4"
            />
            <rect
              x={(r2Pos.x + srvPos.x) / 2 - 40}
              y={r2Pos.y - 28}
              width="80"
              height="18"
              rx="6"
              fill="#1E293B"
              stroke="#475569"
            />
            <text
              x={(r2Pos.x + srvPos.x) / 2}
              y={r2Pos.y - 16}
              fill="#10B981"
              fontSize="9"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="monospace"
            >
              100 Mbps • 1ms
            </text>

            {/* Student Nodes Rendering */}
            {studentNodes.map((node) => (
              <g
                key={node.id}
                onClick={() =>
                  setActiveNode({
                    id: node.id,
                    label: node.label,
                    role: 'Student Workstation Host',
                    ip: `${node.ip}/24`,
                    interfaceDetails: 'FastEthernet 10Mbps Access Link',
                    queue: 'Local FIFO Transmission Buffer',
                  })
                }
                className="cursor-pointer group"
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="16"
                  fill="#1E293B"
                  stroke="#3B82F6"
                  strokeWidth="2"
                  className="transition-transform group-hover:scale-110"
                />
                <text
                  x={node.x}
                  y={node.y + 4}
                  fill="#93C5FD"
                  fontSize="9"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {node.id}
                </text>
              </g>
            ))}

            {/* Access Router R1 */}
            <g
              onClick={() =>
                setActiveNode({
                  id: 'R1',
                  label: 'Access Router R1',
                  role: 'Edge Access Gateway',
                  ip: '10.0.1.1/24',
                  interfaceDetails: 'N-port 10Mbps access aggregation link, 1x Bottleneck trunk',
                  queue: 'DropTail / LeakyBucket (Limit: 50 pkts)',
                })
              }
              className="cursor-pointer group"
            >
              <circle
                cx={r1Pos.x}
                cy={r1Pos.y}
                r="30"
                fill="#1E293B"
                stroke={isQueueOverflow ? '#EF4444' : '#3B82F6'}
                strokeWidth="3"
                className="transition-transform group-hover:scale-105"
              />
              <text
                x={r1Pos.x}
                y={r1Pos.y + 4}
                fill="#FFFFFF"
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                R1
              </text>
              <text
                x={r1Pos.x}
                y={r1Pos.y + 44}
                fill="#94A3B8"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                Access Router R1
              </text>
            </g>

            {/* Core Router R2 */}
            <g
              onClick={() =>
                setActiveNode({
                  id: 'R2',
                  label: 'Core Router R2',
                  role: 'Campus Core Trunk Router',
                  ip: '10.0.2.1/24',
                  interfaceDetails: 'High-speed gigabit fabric backbone',
                  queue: 'DropTail (High capacity)',
                })
              }
              className="cursor-pointer group"
            >
              <circle
                cx={r2Pos.x}
                cy={r2Pos.y}
                r="30"
                fill="#1E293B"
                stroke="#6366F1"
                strokeWidth="3"
                className="transition-transform group-hover:scale-105"
              />
              <text
                x={r2Pos.x}
                y={r2Pos.y + 4}
                fill="#FFFFFF"
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                R2
              </text>
              <text
                x={r2Pos.x}
                y={r2Pos.y + 44}
                fill="#94A3B8"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                Core Router R2
              </text>
            </g>

            {/* LMS Server Node */}
            <g
              onClick={() =>
                setActiveNode({
                  id: 'LMS',
                  label: 'University LMS Server',
                  role: 'Central Content & Video Delivery Target',
                  ip: '192.168.1.100/24',
                  interfaceDetails: '100Mbps dedicated datacenter trunk link',
                  queue: 'Server Application Socket Buffer',
                })
              }
              className="cursor-pointer group"
            >
              <rect
                x={srvPos.x - 28}
                y={srvPos.y - 28}
                width="56"
                height="56"
                rx="14"
                fill="#1E293B"
                stroke="#10B981"
                strokeWidth="3"
                className="transition-transform group-hover:scale-105"
              />
              <text
                x={srvPos.x}
                y={srvPos.y + 5}
                fill="#A7F3D0"
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="monospace"
              >
                LMS
              </text>
              <text
                x={srvPos.x}
                y={srvPos.y + 46}
                fill="#10B981"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                Datacenter LMS Server
              </text>
            </g>
          </svg>
        </div>
      </Card>

      {/* Node Inspector Card */}
      {activeNode && (
        <Card
          title={`Node Inspector: ${activeNode.label}`}
          subtitle={`Network node identifier: ${activeNode.id}`}
          icon={Server}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Role</span>
              <strong className="text-slate-900 mt-0.5 block">{activeNode.role}</strong>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Subnet IP Address</span>
              <strong className="text-blue-700 font-mono mt-0.5 block">{activeNode.ip}</strong>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Interface Fabric</span>
              <strong className="text-slate-800 mt-0.5 block">{activeNode.interfaceDetails}</strong>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Queue Policy</span>
              <strong className="text-emerald-700 font-mono mt-0.5 block">{activeNode.queue}</strong>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default NetworkTopology;
