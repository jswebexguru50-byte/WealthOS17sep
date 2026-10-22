import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('v6.4.1 Replay Authority Separation & Acceptance Hierarchy Tests', () => {
  const readinessPath = path.join(process.cwd(), 'data/v6.4/V641_REPLAY_READINESS.json');
  const statusPath = path.join(process.cwd(), 'data/v6.4/V641_INDEPENDENT_VALIDATION_STATUS.json');

  test('V641_REPLAY_READINESS must have economicReplayAuthorization=false and productionPromotionAuthorized=false', () => {
    expect(fs.existsSync(readinessPath)).toBe(true);
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf-8'));
    
    expect(readiness.economicReplayAuthorization).toBe(false);
    expect(readiness.productionPromotionAuthorized).toBe(false);
    expect(readiness.authorizationType).toBe('DATA_VALIDATION_READINESS_RECOMMENDATION');
  });

  test('Acceptance hierarchy: historicalPITMembershipStatus cannot be PASS on static universe detection', () => {
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf-8'));

    if (status.staticUniverseDetection?.classification === 'LIKELY_STATIC_UNIVERSE') {
      expect(readiness.historicalPITMembershipStatus).not.toBe('PASS');
      expect(readiness.historicalPITMembershipStatus).toBe('DATA_INSUFFICIENT_FOR_500_DYNAMIC_PIT');
    }
  });
});
