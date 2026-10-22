import { describe, it, expect } from '@jest/globals';
import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

describe('Integration: Self-Learning Rule Management', () => {
  let targetRuleId: number;

  // I-SL-01
  it('I-SL-01: GET /v1/autonomous-agent/self-learning-rules returns array with baseline rules', async () => {
    const res = await axios.get(`${API_BASE}/v1/autonomous-agent/self-learning-rules`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(4);

    const firstRule = res.data.data[0];
    expect(firstRule).toHaveProperty('ruleName');
    expect(firstRule).toHaveProperty('baselineThreshold');
    expect(firstRule).toHaveProperty('currentThreshold');
    expect(firstRule).toHaveProperty('status');

    targetRuleId = firstRule.id;
  });

  // I-SL-02
  it('I-SL-02: POST /v1/autonomous-agent/self-learning-rules/rollback with valid ruleId updates status to ROLLED_BACK', async () => {
    expect(targetRuleId).toBeDefined();

    const rollbackRes = await axios.post(`${API_BASE}/v1/autonomous-agent/self-learning-rules/rollback`, {
      ruleId: targetRuleId,
      reason: 'Integration test rollback execution'
    });

    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.data.success).toBe(true);

    // Subsequent GET reflects change
    const getRes = await axios.get(`${API_BASE}/v1/autonomous-agent/self-learning-rules`);
    const rule = getRes.data.data.find((r: any) => r.id === targetRuleId);
    expect(rule).toBeDefined();
    expect(rule.status).toBe('ROLLED_BACK');
  });

  // I-SL-03
  it('I-SL-03: POST rollback with non-existent ruleId returns 404 and error message', async () => {
    try {
      await axios.post(`${API_BASE}/v1/autonomous-agent/self-learning-rules/rollback`, {
        ruleId: 999999,
        reason: 'Rollback of non-existent rule'
      });
      // Should fail
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.response).toBeDefined();
      expect(err.response.status).toBe(404);
      expect(err.response.data.success).toBe(false);
      expect(err.response.data.error).toBeDefined();
    }
  });
});
