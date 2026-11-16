import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Play,
  Sliders,
  Info,
  Network,
  AlertCircle,
  Zap,
  ShieldCheck,
  Server,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useDataService } from '../services/dataService';
import { SimulationConfig } from '../types';
import { useSimulationMode, ModeBadge, ModeSelector } from '../context/SimulationModeContext';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { ProtocolBadge, TierBadge } from '../components/Badge';

export const NewSimulation: React.FC = () => {
  const navigate = useNavigate();
  const { mode, isDemo, setMode } = useSimulationMode();
  const dataService = useDataService();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: boolean }>({});

  const [useCustomSeed, setUseCustomSeed] = useState<boolean>(true);
  const [formData, setFormData] = useState<SimulationConfig>({
    name: isDemo ? 'Demo Scenario: 25 Students (TCP)' : 'Online Classroom Workload Simulation',
    description: isDemo
      ? 'Predefined demonstration workload evaluating e-learning stream reliability.'
      : 'SimPy discrete-event simulation modeling university online classroom traffic.',
    users: 10,
    traffic_level: 'Medium',
    protocol: 'TCP',
    data_rate: '10 Mbps',
    delay: '20ms',
    simulation_time: 5,
    experiment_type: 'Online Classroom',
    packet_size: 512,
    window_size: 32,
    queue_capacity: 50,
    seed: 42,
    force_demo: isDemo,
  });

  const handleBenchmarkPreset = () => {
    setUseCustomSeed(true);
    setFormData({
      ...formData,
      name: 'Official Benchmark - Online Classroom',
      description: 'University Online Classroom: 10 students, 10 Mbps bottleneck, 20ms delay, 5s duration, seed 42.',
      users: 10,
      protocol: 'TCP',
      traffic_level: 'Medium',
      data_rate: '10 Mbps',
      delay: '20ms',
      simulation_time: 5,
      experiment_type: 'Online Classroom',
      packet_size: 512,
      window_size: 32,
      queue_capacity: 50,
      seed: 42,
    });
    setValidationErrors({});
    setError(null);
  };

  const handleDemoPreset = (users: number) => {
    let traffic: 'Low' | 'Medium' | 'High' = 'Medium';
    let rate = '1 Mbps';
    if (users <= 10) {
      traffic = 'Low';
      rate = '512 Kbps';
    } else if (users >= 100) {
      traffic = 'High';
      rate = '2 Mbps';
    }

    setFormData({
      ...formData,
      users,
      traffic_level: traffic,
      data_rate: rate,
      name: `Demo Scenario: ${users} Students (${formData.protocol})`,
      description: `Predefined ${users}-student laboratory simulation benchmark over ${formData.protocol}.`,
    });
  };

  const handleTrafficPreset = (level: 'Low' | 'Medium' | 'High' | 'Custom') => {
    let rate = formData.data_rate;
    let students = formData.users;
    if (level === 'Low') {
      rate = '512 Kbps';
      students = 10;
    } else if (level === 'Medium') {
      rate = '1 Mbps';
      students = 50;
    } else if (level === 'High') {
      rate = '2 Mbps';
      students = 150;
    }
    setFormData({
      ...formData,
      traffic_level: level,
      data_rate: rate,
      users: students,
      name: isDemo
        ? `Demo Scenario: ${students} Students (${formData.protocol})`
        : `SimPy Simulation: ${level} Load (${students} Students, ${rate})`,
    });
  };

  const validateConfig = (): boolean => {
    const errs: { [key: string]: boolean } = {};

    // 1. Number of students > 0
    if (!formData.users || formData.users <= 0) {
      errs.users = true;
    }

    // 2. Data rate is valid
    if (!formData.data_rate || !formData.data_rate.trim()) {
      errs.data_rate = true;
    }

    // 2b. Link delay is valid
    if (!formData.delay || !formData.delay.trim()) {
      errs.delay = true;
    }

    // 3. Duration > 0
    if (!formData.simulation_time || formData.simulation_time <= 0) {
      errs.simulation_time = true;
    }

    // 4. Packet size is valid
    if (!formData.packet_size || formData.packet_size <= 0 || formData.packet_size > 65535) {
      errs.packet_size = true;
    }

    // 5. Protocol is supported
    if (!['TCP', 'UDP'].includes(formData.protocol)) {
      errs.protocol = true;
    }

    // 6. Experiment type is supported
    const supportedTypes = [
      'Online Classroom',
      'Normal Traffic',
      'High Traffic',
      'TCP vs UDP',
      'Leaky Bucket',
      'Sliding Window',
      'Go-Back-N',
    ];
    if (!supportedTypes.includes(formData.experiment_type)) {
      errs.experiment_type = true;
    }

    // Name check
    if (!formData.name.trim()) {
      errs.name = true;
    }

    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateConfig()) {
      setError('❌ Invalid Simulation Configuration\n\nPlease correct the highlighted fields.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: SimulationConfig = {
        ...formData,
        seed: useCustomSeed ? (formData.seed ?? 42) : null,
        force_demo: isDemo,
      };

      const response = await dataService.runSimulation(payload);

      if (isDemo) {
        navigate(`/experiments/${response.id}`);
      } else {
        navigate(`/monitor?id=${response.id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Simulation execution failed. Please verify configuration.');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <PageHeader
        title={isDemo ? 'Demo Scenario Quick Runner' : 'Configure Network Simulation'}
        subtitle={
          isDemo
            ? 'Instantly select and execute a verified demonstration scenario (zero server dependency)'
            : 'Configure discrete-event simulation: packet generation, TCP AIMD / UDP CBR, bottleneck serialization, and conservation audit'
        }
        icon={Sliders}
        badge={
          <div className="flex items-center gap-2">
            <ModeBadge isDemo={isDemo} />
            <TierBadge tier={formData.traffic_level} />
          </div>
        }
        actions={<ModeSelector compact />}
      />

      {/* Official Benchmark Quick-Preset Banner */}
      {!isDemo && (
        <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                  Academic Benchmark Profile
                </span>
                <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                  10 Students • 10 Mbps • 5s • Seed 42
                </span>
              </div>
              <p className="text-xs text-emerald-800 mt-0.5">
                Load the approved Online Classroom benchmark parameters yielding 11,998 unique packets with 100% PDR.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBenchmarkPreset}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors whitespace-nowrap self-stretch sm:self-auto text-center flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Apply Official Benchmark</span>
          </button>
        </div>
      )}

      {/* Demo Mode Scenario Selector */}
      {isDemo && (
        <Card
          title="Predefined Demo Scenarios"
          subtitle="Select a calibrated student concurrency cohort for instant offline metrics"
          icon={Zap}
        >
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            {[10, 25, 50, 100, 200].map((count) => {
              const isSelected = formData.users === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleDemoPreset(count)}
                  className={`p-3.5 rounded-xl border text-center transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-500/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/40'
                  }`}
                >
                  <div className="text-lg font-bold font-mono">{count}</div>
                  <div className={`text-[10px] font-semibold uppercase tracking-wider ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                    Active Nodes
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Validation / Execution Notice */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs space-y-2 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-rose-950 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>Simulation Configuration Notice</span>
          </div>
          <p className="font-semibold whitespace-pre-line text-rose-800">{error}</p>
          {!isDemo && (
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('demo');
                  setError(null);
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-xs"
              >
                Use Demo Mode (Sample Data)
              </button>
              <Link
                to="/settings"
                className="px-3.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 font-semibold rounded-lg text-xs transition-colors"
              >
                Engine Diagnostics
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Main Configuration Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Workload Tier Cards */}
        <Card
          title="Workload Intensity Profile"
          subtitle="Select a pre-calibrated concurrency tier or define custom parameters"
          icon={Layers}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { level: 'Low', label: 'LOW Load', desc: '10 Students • 512 Kbps', color: 'emerald' },
              { level: 'Medium', label: 'MEDIUM Load', desc: '50 Students • 1 Mbps', color: 'blue' },
              { level: 'High', label: 'HIGH Load', desc: '150 Students • 2 Mbps', color: 'amber' },
              { level: 'Custom', label: 'CUSTOM', desc: 'Manual parameter controls', color: 'purple' },
            ].map((tier) => {
              const isSelected = formData.traffic_level === tier.level;
              return (
                <button
                  key={tier.level}
                  type="button"
                  onClick={() => handleTrafficPreset(tier.level as any)}
                  className={`p-4 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-500 shadow-sm ring-2 ring-blue-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">{tier.label}</span>
                    <TierBadge tier={tier.level as any} />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{tier.desc}</p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Transport Protocol Selection Radio Cards */}
        <Card
          title="Transport Layer Protocol"
          subtitle="Choose between reliable congestion-controlled TCP or unthrottled UDP streaming"
          icon={Network}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* TCP Card */}
            <div
              onClick={() => setFormData({ ...formData, protocol: 'TCP' })}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                formData.protocol === 'TCP'
                  ? 'bg-blue-50/60 border-blue-500 shadow-sm ring-2 ring-blue-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ProtocolBadge protocol="TCP" />
                  <span className="text-xs font-bold text-slate-900">TCP (NewReno AIMD)</span>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  formData.protocol === 'TCP' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                }`}>
                  {formData.protocol === 'TCP' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sliding window with additive increase & multiplicative decrease. Recovers from drops through fast retransmit and timeout backoff.
              </p>
            </div>

            {/* UDP Card */}
            <div
              onClick={() => setFormData({ ...formData, protocol: 'UDP' })}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                formData.protocol === 'UDP'
                  ? 'bg-amber-50/60 border-amber-500 shadow-sm ring-2 ring-amber-500/20'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ProtocolBadge protocol="UDP" />
                  <span className="text-xs font-bold text-slate-900">UDP (Constant Bit Rate)</span>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  formData.protocol === 'UDP' ? 'border-amber-600 bg-amber-600' : 'border-slate-300'
                }`}>
                  {formData.protocol === 'UDP' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Unthrottled fixed-rate packet injection without flow or congestion control. Packets arriving at full queues are dropped immediately.
              </p>
            </div>
          </div>
        </Card>

        {/* Detailed Simulation Parameters Card */}
        <Card
          title="Network & Workload Parameters"
          subtitle="Configure node counts, link constraints, buffers, and discrete-event duration"
          icon={Sliders}
        >
          {/* Experiment Identification */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Experiment Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (validationErrors.name) setValidationErrors({ ...validationErrors, name: false });
                }}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 ${
                  validationErrors.name ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200'
                }`}
                placeholder="e.g. 50-Node Peak Lecture Simulation"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">Description / Notes</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                placeholder="Evaluation objectives and study constraints"
              />
            </div>
          </div>

          {/* Core Topology Parameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            {/* Student Nodes */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Student Nodes (1-250) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={250}
                value={formData.users}
                onChange={(e) => {
                  setFormData({ ...formData, users: parseInt(e.target.value, 10) || 0 });
                  if (validationErrors.users) setValidationErrors({ ...validationErrors, users: false });
                }}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono font-semibold ${
                  validationErrors.users ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200'
                }`}
              />
              <p className="text-[11px] text-slate-400 mt-1">Concurrently transmitting nodes</p>
            </div>

            {/* Bottleneck Bandwidth */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Bottleneck Data Rate <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.data_rate}
                onChange={(e) => {
                  setFormData({ ...formData, data_rate: e.target.value });
                  if (validationErrors.data_rate) setValidationErrors({ ...validationErrors, data_rate: false });
                }}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono font-semibold ${
                  validationErrors.data_rate ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200'
                }`}
              >
                <option value="256 Kbps">256 Kbps (Severe Bottleneck)</option>
                <option value="512 Kbps">512 Kbps (Constrained Campus)</option>
                <option value="1 Mbps">1 Mbps (Standard Campus)</option>
                <option value="2 Mbps">2 Mbps (High Speed)</option>
                <option value="5 Mbps">5 Mbps (High Concurrency)</option>
                <option value="10 Mbps">10 Mbps (Academic Benchmark)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Bandwidth between R1 and R2</p>
            </div>

            {/* Link Propagation Delay */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Link Delay <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.delay || '20ms'}
                onChange={(e) => {
                  setFormData({ ...formData, delay: e.target.value });
                  if (validationErrors.delay) setValidationErrors({ ...validationErrors, delay: false });
                }}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono font-semibold ${
                  validationErrors.delay ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200'
                }`}
              >
                <option value="5ms">5ms (Campus LAN / Low Latency)</option>
                <option value="10ms">10ms (Metro Network)</option>
                <option value="20ms">20ms (Standard E-Learning Link)</option>
                <option value="50ms">50ms (Intercity WAN)</option>
                <option value="100ms">100ms (High Latency Link)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">One-way R1-R2 propagation delay</p>
            </div>
          </div>

          {/* Scenario & Duration Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Scenario Selection (Experiment Type) <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.experiment_type}
                onChange={(e) => setFormData({ ...formData, experiment_type: e.target.value })}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold ${
                  validationErrors.experiment_type ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200'
                }`}
              >
                <option value="Online Classroom">Online Classroom (Official Academic Benchmark)</option>
                <option value="Normal Traffic">Normal Traffic (Standard Campus E-Learning)</option>
                <option value="High Traffic">High Traffic (Peak Concurrency Lecture Load)</option>
                <option value="TCP vs UDP">TCP vs UDP Protocol Benchmark</option>
                <option value="Leaky Bucket">Leaky Bucket Traffic Shaping Evaluation</option>
                <option value="Sliding Window">Sliding Window Reliability Analysis</option>
                <option value="Go-Back-N">Go-Back-N ARQ Retransmission</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Target analytical scenario context</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Simulation Duration <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.simulation_time}
                onChange={(e) => setFormData({ ...formData, simulation_time: parseFloat(e.target.value) })}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold ${
                  validationErrors.simulation_time ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200'
                }`}
              >
                <option value={5}>5 Seconds (Official Benchmark / Fast Run)</option>
                <option value={10}>10 Seconds (Rapid test)</option>
                <option value={30}>30 Seconds (Fast check)</option>
                <option value={60}>60 Seconds (Standard Lab)</option>
                <option value={90}>90 Seconds (Steady State)</option>
                <option value={120}>120 Seconds (Extended Benchmark)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Simulated time elapsed in discrete-event engine</p>
            </div>
          </div>

          {/* Packet & Window Tuning */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Packet MTU Size (Bytes) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={64}
                max={9000}
                value={formData.packet_size || 512}
                onChange={(e) => {
                  setFormData({ ...formData, packet_size: parseInt(e.target.value, 10) || 0 });
                  if (validationErrors.packet_size) setValidationErrors({ ...validationErrors, packet_size: false });
                }}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono font-semibold ${
                  validationErrors.packet_size ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200'
                }`}
              />
              <p className="text-[11px] text-slate-400 mt-1">Payload MTU (512 for benchmark, 1024 standard)</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                TCP Window Size (Frames)
              </label>
              <input
                type="number"
                min={1}
                max={128}
                value={formData.window_size || 32}
                onChange={(e) => setFormData({ ...formData, window_size: parseInt(e.target.value, 10) || 32 })}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono font-semibold"
              />
              <p className="text-[11px] text-slate-400 mt-1">Maximum unacknowledged inflight packets</p>
            </div>
          </div>

          {/* Seed & Queue Limit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-800">
                  Random Seed (Reproducibility)
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomSeed}
                    onChange={(e) => {
                      setUseCustomSeed(e.target.checked);
                      if (!e.target.checked) {
                        setFormData({ ...formData, seed: null });
                      } else {
                        setFormData({ ...formData, seed: 42 });
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <span>Deterministic Seed</span>
                </label>
              </div>
              <input
                type="number"
                disabled={!useCustomSeed}
                value={useCustomSeed ? (formData.seed ?? 42) : ''}
                onChange={(e) => setFormData({ ...formData, seed: parseInt(e.target.value, 10) || 0 })}
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl border font-mono font-semibold ${
                  useCustomSeed
                    ? 'border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500'
                    : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                placeholder={useCustomSeed ? '42' : 'Random seed generated per run'}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {useCustomSeed
                  ? 'Deterministic PRNG seed (42 matches official benchmark)'
                  : 'Automatic PRNG random seed generated at runtime'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Router Queue Capacity (Packets)
              </label>
              <input
                type="number"
                min={5}
                max={500}
                value={formData.queue_capacity || 50}
                onChange={(e) => setFormData({ ...formData, queue_capacity: parseInt(e.target.value, 10) || 50 })}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono font-semibold"
              />
              <p className="text-[11px] text-slate-400 mt-1">Bottleneck router buffer limit before Tail-Drop</p>
            </div>
          </div>
        </Card>

        {/* Topology Summary Live Card */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
              <Network className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Simulated Campus Network Path
              </h4>
              <p className="text-xs text-slate-300 mt-0.5">
                {formData.users} Nodes (10Mb, 5ms) ➔ R1 Access Router ➔ [{formData.data_rate}, {formData.delay || '20ms'}, Queue: {formData.queue_capacity || 50} pkts] ➔ R2 Core Router ➔ LMS Server (100Mb)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <span className="font-mono text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {formData.protocol} • {formData.simulation_time}s {useCustomSeed ? `• Seed ${formData.seed ?? 42}` : '• Dynamic PRNG'}
            </span>
          </div>
        </div>

        {/* Submission CTA */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className={`w-full sm:w-auto flex items-center justify-center gap-2.5 font-bold text-xs px-8 py-3.5 rounded-xl shadow-md transition-all disabled:opacity-50 text-white ${
              isDemo
                ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'
            }`}
          >
            <Play className="w-4 h-4 fill-white" />
            <span>
              {submitting
                ? isDemo
                  ? 'Loading Demo Experiment...'
                  : 'Executing Discrete-Event Engine...'
                : isDemo
                ? 'RUN DEMO EXPERIMENT'
                : 'RUN DISCRETE-EVENT SIMULATION'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewSimulation;
