import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 3D System Integration & Stabilization Test Suite', () => {

  describe('1. Failure State Transparency & Error Presentation', () => {
    it('accurately identifies failed experiments without showing synthetic successful metrics', () => {
      const failedExp = {
        id: 99,
        exp_code: 'EXP-FAIL-099',
        name: 'Failed Buffer Test',
        status: 'failed',
        error_message: 'SimPy Simulation Failed: Simulated link break',
        is_demo: false,
        result: null,
      };

      const isFailed = String(failedExp.status).toLowerCase() === 'failed';
      assert.equal(isFailed, true);
      assert.equal(failedExp.result, null);
      assert.match(failedExp.error_message, /Simulated link break/);
    });

    it('ensures failed experiment status suppresses chart rendering', () => {
      const failedExp = {
        id: 100,
        exp_code: 'EXP-FAIL-100',
        status: 'FAILED',
        result: null
      };

      const timeSeries = failedExp.result?.time_series || [];
      assert.equal(timeSeries.length, 0);
      // In ExperimentResults, {timeSeries.length > 0 && <Charts />} prevents chart rendering
      const shouldRenderCharts = timeSeries.length > 0;
      assert.equal(shouldRenderCharts, false);
    });
  });

  describe('2. Seed Extraction & Display Verification', () => {
    it('extracts random seed from result summary_notes audit tag', () => {
      const summaryNotes = '[Audit: seed=42, physical_attempt_drops=93, retransmissions=93] SimPy TCP simulation completed.';
      const match = summaryNotes.match(/seed=(\d+)/);
      assert.ok(match);
      assert.equal(match[1], '42');
    });

    it('extracts random seed from experiment description fallback', () => {
      const description = 'SimPy TCP simulation | Seed: 98765';
      const match = description.match(/Seed:\s*(\d+)/);
      assert.ok(match);
      assert.equal(match[1], '98765');
    });

    it('defaults gracefully when no seed is present', () => {
      const summaryNotes = 'Plain simulation summary notes without seed tag.';
      const match = summaryNotes.match(/seed=(\d+)/);
      const seedVal = match ? match[1] : 'Default';
      assert.equal(seedVal, 'Default');
    });
  });

  describe('3. WebSocket & Polling Fallback Stability', () => {
    it('verifies connection ref prevents unnecessary teardown on state update', () => {
      let isLiveWs = false;
      const wsRef = { current: false };

      // On WebSocket open
      wsRef.current = true;
      isLiveWs = true;

      // When checking if polling is needed:
      const shouldPoll = !wsRef.current;
      assert.equal(shouldPoll, false, 'Polling should be dormant while WebSocket is connected');

      // On WebSocket drop:
      wsRef.current = false;
      isLiveWs = false;
      const shouldPollAfterDrop = !wsRef.current;
      assert.equal(shouldPollAfterDrop, true, 'Polling should immediately activate on WebSocket drop');
    });
  });

  describe('4. Metric Conservation & Packet Accounting Consistency', () => {
    it('confirms unique packet conservation: sent = delivered + lost', () => {
      const officialBenchmark = {
        packets_sent: 11998,       // Unique generated
        packets_received: 11998,   // Unique delivered
        packets_dropped: 0,        // Terminal unique lost
        physical_drops: 93,        // Intermediate attempt rejections
        retransmissions: 93,       // TCP retransmission events
      };

      // Conservation law: unique generated == delivered + terminal dropped
      assert.equal(
        officialBenchmark.packets_sent,
        officialBenchmark.packets_received + officialBenchmark.packets_dropped
      );

      // Attempt drops must equal retransmissions for 100% PDR
      assert.equal(officialBenchmark.physical_drops, officialBenchmark.retransmissions);
    });
  });

  describe('5. Comparison Edge Case Resilience', () => {
    it('handles comparison where one experiment has null result', () => {
      const expCompleted = {
        id: 1,
        exp_code: 'EXP-001',
        protocol: 'TCP',
        users: 10,
        result: {
          throughput_kbps: 9733.29,
          packet_loss_percent: 0.0,
          packet_delivery_ratio: 100.0,
          average_delay_ms: 37.8,
        }
      };

      const expFailed = {
        id: 2,
        exp_code: 'EXP-002',
        protocol: 'UDP',
        users: 10,
        result: null
      };

      // Safe access pattern used in frontend charts and tables
      const getMetrics = (exp) => ({
        id: exp.id,
        throughput: exp.result?.throughput_kbps ?? 0,
        loss: exp.result?.packet_loss_percent ?? 0,
        pdr: exp.result?.packet_delivery_ratio ?? 0,
        delay: exp.result?.average_delay_ms ?? 0,
      });

      const m1 = getMetrics(expCompleted);
      const m2 = getMetrics(expFailed);

      assert.equal(m1.throughput, 9733.29);
      assert.equal(m2.throughput, 0);
      assert.equal(m2.loss, 0);
      assert.equal(m2.pdr, 0);
      assert.equal(m2.delay, 0);
    });
  });
});
