/**
 * WealthOS v6.6–v6.7 - PKScreener Scanner Adapter
 * External Reference Acceleration Layer
 * 
 * Adapts specific technical screening scans:
 * - 52W High Breakout, Volume Breakout, VCP, ATR Cross
 */

import { PKScreenerAdapter } from './PKScreenerAdapter.js';
import { ReferenceEvaluationRequest, ReferenceEvaluationResult } from '../ReferenceEngineContract.js';

export class PKScreenerScannerAdapter {
  private adapter = new PKScreenerAdapter();

  public async runScan(
    scanType: 'VCP' | '52W_HIGH_BREAKOUT' | 'VOLUME_BREAKOUT' | 'ATR_CROSS',
    securities: Array<{ securityId: string; symbol: string }>,
    decisionDate: string,
    decisionTimestamp: string
  ): Promise<Array<{ securityId: string; passed: boolean; details: unknown }>> {
    const batch = await this.adapter.evaluateBatch({
      batchId: `SCAN_${scanType}_${Date.now()}`,
      exchange: 'NSE',
      decisionDate,
      decisionTimestamp,
      securities,
      capabilities: [scanType],
      dataSnapshotHash: 'SNAP_PRICES_V66',
      pitContextHash: 'PIT_HASH_V66'
    });

    const results: Array<{ securityId: string; passed: boolean; details: unknown }> = [];
    for (const [secId, res] of batch) {
      const obs = res.observations.find(o => o.featureId === scanType);
      results.push({
        securityId: secId,
        passed: res.status === 'MATCH',
        details: obs?.value
      });
    }
    return results;
  }
}
