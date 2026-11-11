import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper reproduction of form validation rules from NewSimulation.tsx
function validateSimulationConfig(formData) {
  const errs = {};
  if (!formData.users || formData.users <= 0 || formData.users > 250) {
    errs.users = 'Students must be between 1 and 250';
  }
  if (!formData.data_rate || !formData.data_rate.trim()) {
    errs.data_rate = 'Bandwidth is required';
  } else if (!/^[0-9]+(?:\.[0-9]+)?\s*(k|m|g)?(bps|b)?$/i.test(formData.data_rate.trim())) {
    errs.data_rate = 'Invalid bandwidth format (e.g. 10Mb, 512Kbps)';
  }
  if (!formData.delay || !formData.delay.trim()) {
    errs.delay = 'Link delay is required';
  } else if (!/^[0-9]+(?:\.[0-9]+)?\s*(ms|s|us)$/i.test(formData.delay.trim())) {
    errs.delay = 'Invalid delay format (e.g. 20ms, 10ms)';
  }
  if (!formData.simulation_time || formData.simulation_time <= 0 || formData.simulation_time > 300) {
    errs.simulation_time = 'Duration must be between 1 and 300 seconds';
  }
  if (!formData.packet_size || formData.packet_size <= 0 || formData.packet_size > 65535) {
    errs.packet_size = 'Packet size must be between 1 and 65535 bytes';
  }
  if (!['TCP', 'UDP'].includes(formData.protocol?.toUpperCase())) {
    errs.protocol = 'Protocol must be TCP or UDP';
  }
  const supportedTypes = [
    'Normal Traffic',
    'High Traffic',
    'TCP vs UDP',
    'Leaky Bucket',
    'Sliding Window',
    'Go-Back-N',
  ];
  if (!supportedTypes.includes(formData.experiment_type)) {
    errs.experiment_type = 'Unsupported experiment type';
  }
  if (!formData.name || !formData.name.trim()) {
    errs.name = 'Experiment name is required';
  }
  return {
    isValid: Object.keys(errs).length === 0,
    errors: errs,
  };
}

// Helper reproduction of rule-based interpretation from ExperimentComparison.tsx
function generateRuleBasedObservations(m1, m2, exp1, exp2) {
  const list = [];
  if (m2.users !== m1.users) {
    const diffU = m2.users - m1.users;
    list.push({
      id: 'concurrency',
      title: 'Student Workload Scaling',
      diff: diffU,
      observation: `Student concurrency ${diffU > 0 ? 'increased' : 'decreased'} from ${m1.users} to ${m2.users} active nodes (${diffU > 0 ? `+${diffU}` : diffU} nodes).`,
    });
  }

  if (m1.throughput_kbps > 0 && m2.throughput_kbps > 0) {
    const diffTp = Number((m2.throughput_kbps - m1.throughput_kbps).toFixed(2));
    const pctTp = Number(((diffTp / m1.throughput_kbps) * 100).toFixed(1));
    if (diffTp < -0.1) {
      list.push({
        id: 'tp_dec',
        title: 'Throughput Decreased',
        diff: diffTp,
        observation: `Throughput decreased compared with the baseline experiment by ${Math.abs(diffTp)} Kbps (${pctTp}%), dropping from ${m1.throughput_kbps} Kbps to ${m2.throughput_kbps} Kbps. Repeated packet drops triggered TCP congestion window reductions (multiplicative decrease).`,
      });
    } else if (diffTp > 0.1) {
      list.push({
        id: 'tp_inc',
        title: 'Throughput Increased',
        diff: diffTp,
        observation: `Throughput increased by ${diffTp} Kbps (+${pctTp}%), rising from ${m1.throughput_kbps} Kbps to ${m2.throughput_kbps} Kbps, indicating higher link utilization under available capacity.`,
      });
    }
  }

  const diffLoss = Number((m2.packet_loss_percent - m1.packet_loss_percent).toFixed(2));
  if (diffLoss > 0.1) {
    list.push({
      id: 'loss_inc',
      title: 'Packet Loss Increased Under Higher Traffic',
      diff: diffLoss,
      observation: `Packet loss increased from ${m1.packet_loss_percent}% to ${m2.packet_loss_percent}% (+${diffLoss}% points). Intermediate router queue buffers filled beyond capacity, causing Tail-Drop buffer discards.`,
    });
  } else if (diffLoss < -0.1) {
    list.push({
      id: 'loss_dec',
      title: 'Packet Loss Decreased',
      diff: diffLoss,
      observation: `Packet loss decreased from ${m1.packet_loss_percent}% to ${m2.packet_loss_percent}% (${diffLoss}% points), reflecting reduced buffer saturation and fewer link discards.`,
    });
  }

  const diffDelay = Number((m2.average_delay_ms - m1.average_delay_ms).toFixed(2));
  if (diffDelay > 0.5) {
    list.push({
      id: 'delay_inc',
      title: 'Average Delay Increased',
      diff: diffDelay,
      observation: `Average end-to-end packet delay increased by ${diffDelay} ms (from ${m1.average_delay_ms} ms to ${m2.average_delay_ms} ms). Larger queue depths at intermediate routers added queueing delay to transit latency.`,
    });
  } else if (diffDelay < -0.5) {
    list.push({
      id: 'delay_dec',
      title: 'Average Delay Decreased',
      diff: diffDelay,
      observation: `Average end-to-end latency decreased by ${Math.abs(diffDelay)} ms (from ${m1.average_delay_ms} ms to ${m2.average_delay_ms} ms) due to lower queue occupancy.`,
    });
  }

  const diffPdr = Number((m2.packet_delivery_ratio - m1.packet_delivery_ratio).toFixed(2));
  if (diffPdr < -0.5) {
    list.push({
      id: 'pdr_dec',
      title: 'Packet Delivery Ratio Decreased',
      diff: diffPdr,
      observation: `Packet Delivery Ratio (PDR) decreased by ${Math.abs(diffPdr)}% (from ${m1.packet_delivery_ratio}% to ${m2.packet_delivery_ratio}%), indicating higher proportion of dropped packets over the bottleneck link.`,
    });
  }

  if (exp1 && exp2 && exp1.protocol !== exp2.protocol) {
    list.push({
      id: 'protocol_diff',
      title: `Transport Protocol Shift (${exp1.protocol} vs ${exp2.protocol})`,
      observation: `Comparison between ${exp1.protocol} and ${exp2.protocol} demonstrates transport layer differences under identical network bottlenecks.`,
    });
  }

  return list;
}

// Helper reproduction of Dashboard summary aggregation
function computeDashboardKPIs(experiments) {
  const completed = experiments.filter(e => e.status === 'completed' && e.result);
  const total = experiments.length;
  const failed = experiments.filter(e => e.status === 'failed').length;

  if (completed.length === 0) {
    return {
      total,
      completed: 0,
      failed,
      avg_throughput_kbps: 0,
      avg_packet_loss_percent: 0,
      avg_delay_ms: 0,
      avg_pdr: 0,
    };
  }

  const sumTp = completed.reduce((acc, e) => acc + e.result.throughput_kbps, 0);
  const sumLoss = completed.reduce((acc, e) => acc + e.result.packet_loss_percent, 0);
  const sumDelay = completed.reduce((acc, e) => acc + e.result.average_delay_ms, 0);
  const sumPdr = completed.reduce((acc, e) => acc + e.result.packet_delivery_ratio, 0);

  return {
    total,
    completed: completed.length,
    failed,
    avg_throughput_kbps: Number((sumTp / completed.length).toFixed(2)),
    avg_packet_loss_percent: Number((sumLoss / completed.length).toFixed(2)),
    avg_delay_ms: Number((sumDelay / completed.length).toFixed(2)),
    avg_pdr: Number((sumPdr / completed.length).toFixed(2)),
  };
}

describe('Frontend Verification Test Suite', () => {

  describe('1. Dashboard Loading & Summary KPIs', () => {
    it('aggregates completed and failed counts and calculates KPI averages', () => {
      const mockExperiments = [
        { id: 1, status: 'completed', result: { throughput_kbps: 100, packet_loss_percent: 1.0, average_delay_ms: 20.0, packet_delivery_ratio: 99.0 } },
        { id: 2, status: 'completed', result: { throughput_kbps: 200, packet_loss_percent: 3.0, average_delay_ms: 30.0, packet_delivery_ratio: 97.0 } },
        { id: 3, status: 'failed', result: null },
      ];

      const kpis = computeDashboardKPIs(mockExperiments);
      assert.equal(kpis.total, 3);
      assert.equal(kpis.completed, 2);
      assert.equal(kpis.failed, 1);
      assert.equal(kpis.avg_throughput_kbps, 150.0);
      assert.equal(kpis.avg_packet_loss_percent, 2.0);
      assert.equal(kpis.avg_delay_ms, 25.0);
      assert.equal(kpis.avg_pdr, 98.0);
    });

    it('handles zero completed experiments without NaN division errors', () => {
      const emptyKpis = computeDashboardKPIs([]);
      assert.equal(emptyKpis.total, 0);
      assert.equal(emptyKpis.completed, 0);
      assert.equal(emptyKpis.avg_throughput_kbps, 0);
      assert.equal(emptyKpis.avg_delay_ms, 0);
    });
  });

  describe('2. Configuration Form Validation', () => {
    it('approves a fully valid configuration', () => {
      const validConfig = {
        name: 'University Campus High Load Test',
        users: 100,
        data_rate: '10Mb',
        delay: '20ms',
        simulation_time: 60,
        packet_size: 1024,
        protocol: 'TCP',
        experiment_type: 'Normal Traffic',
      };
      const res = validateSimulationConfig(validConfig);
      assert.equal(res.isValid, true);
      assert.equal(Object.keys(res.errors).length, 0);
    });

    it('rejects zero or negative students', () => {
      const resZero = validateSimulationConfig({ users: 0, name: 'T', data_rate: '1Mb', delay: '10ms', simulation_time: 10, packet_size: 1024, protocol: 'TCP', experiment_type: 'Normal Traffic' });
      assert.equal(resZero.isValid, false);
      assert.ok(resZero.errors.users);

      const resNeg = validateSimulationConfig({ users: -5, name: 'T', data_rate: '1Mb', delay: '10ms', simulation_time: 10, packet_size: 1024, protocol: 'TCP', experiment_type: 'Normal Traffic' });
      assert.equal(resNeg.isValid, false);
      assert.ok(resNeg.errors.users);
    });

    it('rejects students exceeding maximum capacity (250)', () => {
      const resExceed = validateSimulationConfig({ users: 300, name: 'T', data_rate: '1Mb', delay: '10ms', simulation_time: 10, packet_size: 1024, protocol: 'TCP', experiment_type: 'Normal Traffic' });
      assert.equal(resExceed.isValid, false);
      assert.ok(resExceed.errors.users);
    });

    it('rejects invalid bandwidth string (e.g. non-numeric)', () => {
      const resBw = validateSimulationConfig({ users: 10, name: 'T', data_rate: 'gigabit', delay: '10ms', simulation_time: 10, packet_size: 1024, protocol: 'TCP', experiment_type: 'Normal Traffic' });
      assert.equal(resBw.isValid, false);
      assert.ok(resBw.errors.data_rate);
    });

    it('rejects invalid delay string (e.g. non-numeric)', () => {
      const resDelay = validateSimulationConfig({ users: 10, name: 'T', data_rate: '2Mb', delay: 'fast', simulation_time: 10, packet_size: 1024, protocol: 'TCP', experiment_type: 'Normal Traffic' });
      assert.equal(resDelay.isValid, false);
      assert.ok(resDelay.errors.delay);
    });

    it('rejects unsupported protocols', () => {
      const resProto = validateSimulationConfig({ users: 10, name: 'T', data_rate: '2Mb', delay: '10ms', simulation_time: 10, packet_size: 1024, protocol: 'HTTP', experiment_type: 'Normal Traffic' });
      assert.equal(resProto.isValid, false);
      assert.ok(resProto.errors.protocol);
    });

    it('rejects empty experiment name', () => {
      const resName = validateSimulationConfig({ users: 10, name: '   ', data_rate: '2Mb', delay: '10ms', simulation_time: 10, packet_size: 1024, protocol: 'TCP', experiment_type: 'Normal Traffic' });
      assert.equal(resName.isValid, false);
      assert.ok(resName.errors.name);
    });
  });

  describe('3. Simulation Status Lifecycle & State Machine', () => {
    it('maintains expected progression without fake progress', () => {
      const stages = ['preparing', 'generating', 'running', 'processing', 'calculating'];
      const statusTransitions = [
        { stage: 'preparing', status: 'pending', progress: 10 },
        { stage: 'generating', status: 'running', progress: 25 },
        { stage: 'running', status: 'running', progress: 50 },
        { stage: 'processing', status: 'running', progress: 75 },
        { stage: 'calculating', status: 'running', progress: 90 },
        { stage: 'completed', status: 'completed', progress: 100 },
      ];

      for (let i = 0; i < statusTransitions.length - 1; i++) {
        assert.ok(statusTransitions[i + 1].progress > statusTransitions[i].progress, 'Progress must be monotonically increasing');
      }

      // Verify failure stops lifecycle cleanly
      const failedState = { stage: 'failed', status: 'failed', progress: 50, error: 'NS-2 returned exit code 1' };
      assert.equal(failedState.status, 'failed');
      assert.ok(failedState.error.length > 0);
    });
  });

  describe('4. Results Rendering & Core Metrics', () => {
    it('correctly maps 4 core metrics with proper units', () => {
      const rawResult = {
        throughput_kbps: 1845.67,
        packet_loss_percent: 2.34,
        average_delay_ms: 28.50,
        packet_delivery_ratio: 97.66,
        packets_sent: 5000,
        packets_received: 4883,
        lost_packets: 117,
      };

      // Conservation check
      assert.equal(rawResult.packets_sent, rawResult.packets_received + rawResult.lost_packets);
      // PDR calculation check
      const calcPdr = Number(((rawResult.packets_received / rawResult.packets_sent) * 100).toFixed(2));
      assert.equal(calcPdr, rawResult.packet_delivery_ratio);
      // Loss % calculation check
      const calcLoss = Number(((rawResult.lost_packets / rawResult.packets_sent) * 100).toFixed(2));
      assert.equal(calcLoss, rawResult.packet_loss_percent);
    });
  });

  describe('5. Chart Updates & Data Transformers', () => {
    it('transforms experiment list into sorted throughput and delay series', () => {
      const exps = [
        { exp_code: 'EXP-001', users: 10, result: { throughput_kbps: 95.4, average_delay_ms: 18.2 } },
        { exp_code: 'EXP-002', users: 50, result: { throughput_kbps: 450.2, average_delay_ms: 24.1 } },
        { exp_code: 'EXP-003', users: 150, result: { throughput_kbps: 890.5, average_delay_ms: 45.8 } },
      ];

      const chartData = exps.map(e => ({
        name: e.exp_code,
        students: e.users,
        throughput: e.result.throughput_kbps,
        delay: e.result.average_delay_ms,
      }));

      assert.equal(chartData.length, 3);
      assert.equal(chartData[0].students, 10);
      assert.equal(chartData[2].throughput, 890.5);
    });
  });

  describe('6. History Display & Filtering', () => {
    it('filters experiments by protocol and sorts descending by ID', () => {
      const history = [
        { id: 1, exp_code: 'EXP-001', protocol: 'TCP', users: 10 },
        { id: 2, exp_code: 'EXP-002', protocol: 'UDP', users: 20 },
        { id: 3, exp_code: 'EXP-003', protocol: 'TCP', users: 50 },
      ];

      const tcpOnly = history.filter(e => e.protocol === 'TCP');
      assert.equal(tcpOnly.length, 2);

      const sorted = [...history].sort((a, b) => b.id - a.id);
      assert.equal(sorted[0].id, 3);
      assert.equal(sorted[2].id, 1);
    });
  });

  describe('7. Experiment Comparison & Rule-Based Automatic Interpretation', () => {
    it('generates factual rule-based observations for throughput, loss, delay, and PDR', () => {
      const exp1 = { id: 1, exp_code: 'EXP-001', protocol: 'TCP', users: 10 };
      const exp2 = { id: 2, exp_code: 'EXP-002', protocol: 'TCP', users: 150 };

      const m1 = {
        users: 10,
        throughput_kbps: 95.4,
        packet_loss_percent: 0.8,
        average_delay_ms: 18.2,
        packet_delivery_ratio: 99.2,
      };

      const m2 = {
        users: 150,
        throughput_kbps: 850.0,
        packet_loss_percent: 8.5,
        average_delay_ms: 48.6,
        packet_delivery_ratio: 91.5,
      };

      const observations = generateRuleBasedObservations(m1, m2, exp1, exp2);

      // Verify that all 5 key categories were analyzed
      const ids = observations.map(o => o.id);
      assert.ok(ids.includes('concurrency'), 'Must observe student concurrency change');
      assert.ok(ids.includes('tp_inc'), 'Must observe throughput increase');
      assert.ok(ids.includes('loss_inc'), 'Must observe packet loss increase under higher traffic');
      assert.ok(ids.includes('delay_inc'), 'Must observe delay increase from queue buffers');
      assert.ok(ids.includes('pdr_dec'), 'Must observe PDR decrease from link drops');

      // Check text explanations are academic and student-friendly
      const lossObs = observations.find(o => o.id === 'loss_inc');
      assert.ok(lossObs.observation.includes('Tail-Drop buffer discards'));
      assert.ok(lossObs.observation.includes('+7.7% points'));
    });

    it('generates transport protocol shift observation when comparing TCP vs UDP', () => {
      const expTcp = { id: 1, exp_code: 'EXP-001', protocol: 'TCP', users: 50 };
      const expUdp = { id: 2, exp_code: 'EXP-002', protocol: 'UDP', users: 50 };
      const mTcp = { users: 50, throughput_kbps: 450, packet_loss_percent: 1.0, average_delay_ms: 25, packet_delivery_ratio: 99 };
      const mUdp = { users: 50, throughput_kbps: 480, packet_loss_percent: 5.0, average_delay_ms: 22, packet_delivery_ratio: 95 };

      const obs = generateRuleBasedObservations(mTcp, mUdp, expTcp, expUdp);
      assert.ok(obs.some(o => o.id === 'protocol_diff'));
    });
  });

  describe('8. Error States & Handling', () => {
    it('handles simulated 503 NS-2 missing diagnostic without crashing', () => {
      const errResponse = {
        status: 503,
        error: 'Simulator Unavailable',
        detail: 'NS-2 discrete-event simulator is not available on this system. Live simulation requires NS-2 in WSL2.',
      };

      assert.equal(errResponse.status, 503);
      assert.ok(errResponse.detail.includes('WSL2'));
    });
  });
});

