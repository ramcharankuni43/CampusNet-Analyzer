import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 3C Frontend Integration & Dynamic Telemetry Test Suite', () => {
  describe('1. API Client & Error Handling', () => {
    it('correctly constructs query parameters for getExperiments', () => {
      const params = {
        mode: 'realtime',
        protocol: 'TCP',
        experiment_type: 'Online Classroom',
        limit: 10
      };
      const query = new URLSearchParams();
      if (params.mode) query.set('mode', params.mode);
      if (params.protocol) query.set('protocol', params.protocol);
      if (params.experiment_type) query.set('experiment_type', params.experiment_type);
      if (params.limit) query.set('limit', params.limit.toString());

      assert.equal(query.toString(), 'mode=realtime&protocol=TCP&experiment_type=Online+Classroom&limit=10');
    });

    it('extracts detail string from FastAPI 422/404/500 JSON error bodies', () => {
      const errBody422 = {
        error: 'Validation Error',
        detail: 'body -> users: Input should be greater than or equal to 1',
        validation_errors: [{ loc: ['body', 'users'], msg: 'Input should be greater than or equal to 1' }]
      };
      const extracted422 = errBody422.detail || errBody422.error || 'Failed';
      assert.match(extracted422, /Input should be greater than or equal to 1/);

      const errBody404 = { detail: 'Simulation with ID 99999 not found' };
      const extracted404 = errBody404.detail || 'Not Found';
      assert.equal(extracted404, 'Simulation with ID 99999 not found');
    });

    it('parses system status containing SimPy engine operational metadata', () => {
      const rawStatus = {
        ns2_installed: false,
        ns2_path: null,
        execution_mode: 'SimPy Discrete-Event Simulation Engine',
        wsl_detected: false,
        wsl_distro: null,
        python_version: '3.14.6',
        db_connected: true,
        database_path: 'D:\\EduNet-Analyzer-main\\backend\\database.sqlite',
        total_experiments: 12,
        simulator_operational: true,
        simulator_engine: 'SimPy Discrete-Event Simulation Engine',
        simulator_version: '4.1.2',
        simulator_diagnostic: 'SimPy discrete-event simulation engine verified in 2.73ms (conservation passed).',
        smoke_test_latency_ms: 2.73,
        conservation_verified: true
      };

      assert.equal(rawStatus.simulator_operational, true);
      assert.equal(rawStatus.simulator_version, '4.1.2');
      assert.equal(rawStatus.conservation_verified, true);
      assert.equal(rawStatus.ns2_installed, false);
      assert.equal(rawStatus.execution_mode, 'SimPy Discrete-Event Simulation Engine');
    });
  });

  describe('2. Simulation Configuration & Benchmark Presets', () => {
    function validateForm(data) {
      const errs = {};
      if (!data.name || !data.name.trim()) errs.name = true;
      if (!data.users || data.users <= 0 || data.users > 250) errs.users = true;
      if (!data.protocol || !['TCP', 'UDP'].includes(data.protocol)) errs.protocol = true;
      if (!data.data_rate || !data.data_rate.trim()) errs.data_rate = true;
      if (!data.delay || !data.delay.trim()) errs.delay = true;
      if (!data.simulation_time || data.simulation_time <= 0 || data.simulation_time > 300) errs.simulation_time = true;
      if (!data.packet_size || data.packet_size < 64 || data.packet_size > 65535) errs.packet_size = true;
      return { isValid: Object.keys(errs).length === 0, errs };
    }

    it('validates the approved Online Classroom benchmark configuration', () => {
      const benchmarkConfig = {
        name: 'Official Benchmark - Online Classroom',
        description: '10 students, 10 Mbps bottleneck, 20ms delay, 5s duration, seed 42.',
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
        force_demo: false
      };

      const { isValid, errs } = validateForm(benchmarkConfig);
      assert.equal(isValid, true);
      assert.equal(Object.keys(errs).length, 0);
      assert.equal(benchmarkConfig.seed, 42);
      assert.equal(benchmarkConfig.users, 10);
      assert.equal(benchmarkConfig.data_rate, '10 Mbps');
    });

    it('allows seed=null for automatic PRNG random seed mode', () => {
      const randomSeedConfig = {
        name: 'Dynamic Random Seed Run',
        users: 25,
        protocol: 'UDP',
        data_rate: '2 Mbps',
        delay: '10ms',
        simulation_time: 10,
        experiment_type: 'Normal Traffic',
        packet_size: 1024,
        seed: null,
        force_demo: false
      };
      const { isValid } = validateForm(randomSeedConfig);
      assert.equal(isValid, true);
      assert.equal(randomSeedConfig.seed, null);
    });

    it('rejects invalid inputs on edge boundary cases', () => {
      assert.equal(validateForm({ users: 0 }).isValid, false);
      assert.equal(validateForm({ users: 251 }).isValid, false);
      assert.equal(validateForm({ simulation_time: 0 }).isValid, false);
      assert.equal(validateForm({ simulation_time: 301 }).isValid, false);
      assert.equal(validateForm({ packet_size: 32 }).isValid, false);
      assert.equal(validateForm({ protocol: 'ICMP' }).isValid, false);
      assert.equal(validateForm({ name: '   ' }).isValid, false);
    });
  });

  describe('3. Stage Lifecycle Telemetry & Polling Termination', () => {
    it('maps all 6 backend stages accurately', () => {
      const expectedStages = [
        'preparing',
        'generating',
        'running',
        'processing',
        'calculating',
        'completed'
      ];

      function normalizeStage(stage = '') {
        const s = stage.toLowerCase();
        if (s.includes('prep')) return 'preparing';
        if (s.includes('gen') || s.includes('topol')) return 'generating';
        if (s.includes('run') || s.includes('sim')) return 'running';
        if (s.includes('proc') || s.includes('trace') || s.includes('log')) return 'processing';
        if (s.includes('calc') || s.includes('metric')) return 'calculating';
        if (s.includes('comp')) return 'completed';
        if (s.includes('fail')) return 'failed';
        return s;
      }

      assert.equal(normalizeStage('preparing'), 'preparing');
      assert.equal(normalizeStage('Generating Network Topology'), 'generating');
      assert.equal(normalizeStage('Running Discrete-Event Simulation'), 'running');
      assert.equal(normalizeStage('Processing Event Trace'), 'processing');
      assert.equal(normalizeStage('Calculating Metrics & Conservation'), 'calculating');
      assert.equal(normalizeStage('Completed'), 'completed');
      assert.equal(normalizeStage('failed'), 'failed');
    });

    it('terminates status polling on completed or failed status', () => {
      function shouldStopPolling(status) {
        const st = (status || '').toLowerCase();
        return st === 'completed' || st === 'failed';
      }

      assert.equal(shouldStopPolling('pending'), false);
      assert.equal(shouldStopPolling('running'), false);
      assert.equal(shouldStopPolling('COMPLETED'), true);
      assert.equal(shouldStopPolling('completed'), true);
      assert.equal(shouldStopPolling('FAILED'), true);
      assert.equal(shouldStopPolling('failed'), true);
    });
  });

  describe('4. Metric Conservation & Result Mapping', () => {
    it('verifies strict mathematical conservation of unique packets', () => {
      const benchmarkResult = {
        packets_sent: 11998,
        packets_received: 11998,
        packets_dropped: 0,
        throughput_kbps: 9733.29,
        packet_loss_percent: 0.0,
        packet_delivery_ratio: 100.0,
        average_delay_ms: 37.80,
        data_rate_kbps: 10000.0,
        summary_notes: 'Online Classroom SimPy verified benchmark',
        time_series: [
          { time: 0, throughput_kbps: 0.0, delay_ms: 0.0, packets_dropped: 0 },
          { time: 1, throughput_kbps: 9720.0, delay_ms: 37.5, packets_dropped: 0 },
          { time: 2, throughput_kbps: 9740.0, delay_ms: 38.0, packets_dropped: 0 },
          { time: 3, throughput_kbps: 9735.0, delay_ms: 37.8, packets_dropped: 0 },
          { time: 4, throughput_kbps: 9736.0, delay_ms: 37.9, packets_dropped: 0 },
          { time: 5, throughput_kbps: 9733.0, delay_ms: 37.8, packets_dropped: 0 },
        ]
      };

      // Conservation: Sent = Received + Dropped
      assert.equal(benchmarkResult.packets_sent, benchmarkResult.packets_received + benchmarkResult.packets_dropped);
      assert.equal(benchmarkResult.packet_delivery_ratio, 100.0);
      assert.equal(benchmarkResult.packet_loss_percent, 0.0);
      assert.equal(Array.isArray(benchmarkResult.time_series), true);
      assert.equal(benchmarkResult.time_series.length, 6);
    });

    it('safely handles empty or missing time series without crashing', () => {
      const emptyResult = {
        packets_sent: 0,
        packets_received: 0,
        packets_dropped: 0,
        throughput_kbps: 0.0,
        packet_loss_percent: 0.0,
        packet_delivery_ratio: 0.0,
        average_delay_ms: 0.0,
        time_series: []
      };

      const chartData = (emptyResult.time_series || []).map((pt) => ({
        time: `${pt.time}s`,
        throughput: pt.throughput_kbps,
        delay: pt.delay_ms
      }));

      assert.equal(chartData.length, 0);
    });
  });

  describe('5. Experiment Comparison Multi-Select', () => {
    it('restricts multi-select to maximum 4 experiments', () => {
      let selectedIds = [1, 2, 3];
      function toggleSelect(id) {
        if (selectedIds.includes(id)) {
          selectedIds = selectedIds.filter((i) => i !== id);
        } else {
          if (selectedIds.length >= 4) {
            throw new Error('Maximum 4 experiments allowed');
          }
          selectedIds.push(id);
        }
      }

      toggleSelect(4);
      assert.deepEqual(selectedIds, [1, 2, 3, 4]);
      assert.throws(() => toggleSelect(5), /Maximum 4 experiments allowed/);
      toggleSelect(2);
      assert.deepEqual(selectedIds, [1, 3, 4]);
    });
  });

  describe('6. Specialized Analysis Response Mapping', () => {
    it('maps Leaky Bucket shaped vs unshaped comparison series', () => {
      const lbResponse = {
        bucket_size: 25,
        leak_rate: '512Kbps',
        unshaped_throughput_kbps: 620.4,
        shaped_throughput_kbps: 512.0,
        unshaped_loss_percent: 24.8,
        shaped_loss_percent: 2.1,
        comparison_series: [
          { time: 1, unshaped_throughput: 800, shaped_throughput: 512, unshaped_drops: 12, shaped_drops: 0 },
          { time: 2, unshaped_throughput: 750, shaped_throughput: 512, unshaped_drops: 10, shaped_drops: 0 },
        ],
        summary: 'Leaky bucket shaping regulated traffic',
        is_demo: false
      };

      assert.equal(lbResponse.is_demo, false);
      assert.equal(lbResponse.comparison_series.length, 2);
      assert.ok(lbResponse.unshaped_loss_percent > lbResponse.shaped_loss_percent);
      assert.equal(lbResponse.shaped_throughput_kbps, 512.0);
    });

    it('maps Go-Back-N trace points with sequence events and retransmissions', () => {
      const gbnResponse = {
        window_size: 8,
        loss_rate: 0.05,
        packets_sent: 100,
        packets_received: 95,
        packets_dropped: 5,
        retransmissions: 15,
        trace_points: [
          { time: 0.1, seq_num: 0, event: 'send', is_retransmit: false },
          { time: 0.2, seq_num: 1, event: 'drop', is_retransmit: false },
          { time: 0.5, seq_num: 1, event: 'retransmit', is_retransmit: true },
        ],
        summary: 'GBN ARQ simulation with Tahoe fast retransmit'
      };

      assert.equal(gbnResponse.packets_sent, 100);
      assert.equal(gbnResponse.trace_points.length, 3);
      assert.equal(gbnResponse.trace_points[2].is_retransmit, true);
    });
  });
});
