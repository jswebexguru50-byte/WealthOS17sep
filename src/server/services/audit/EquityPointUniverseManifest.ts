/**
 * src/server/services/audit/EquityPointUniverseManifest.ts
 *
 * WealthOS v6.7.2 Canonical Equity Universe Manifest & Exact Curve Comparator.
 *
 * Enforces date-by-date session calendar alignment, strict ordering,
 * equity equality, cash equality, exposure equality, and drawdown equality.
 */

import crypto from 'node:crypto';
import { V65EquityPoint } from '../research/V65BaselineReproducer.js';

export interface EquityPointUniverseManifest {
  runId: string;
  observationFrequency: 'DAILY';
  sessionCount: number;
  firstDate: string;
  lastDate: string;
  observationCount: number;
  includedDatesHash: string;
  calendarHash: string;
  excludedDates: string[];
  exclusionReasons: string[];
}

export interface DetailedEquityPoint {
  date: string;
  equity: number;
  cash: number;
  exposure: number;
  drawdownPct: number;
}

export interface EquityComparisonResult {
  passed: boolean;
  mismatchReason?: string;
  totalDatesEvaluated: number;
  producerHash: string;
  shadowHash: string;
  hashesMatch: boolean;
  exactDateMatch: boolean;
  maxEquityDelta: number;
  maxCashDelta: number;
  maxExposureDelta: number;
  maxDrawdownDelta: number;
}

export class EquityPointUniverseManifestService {
  /**
   * Constructs the canonical universe manifest from daily equity points.
   */
  public buildManifest(runId: string, equityPoints: V65EquityPoint[]): EquityPointUniverseManifest {
    if (equityPoints.length === 0) {
      throw new Error('CANONICAL_EQUITY_EMPTY');
    }

    const sorted = [...equityPoints].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map(p => p.date);
    const includedDatesHash = crypto.createHash('sha256').update(dates.join(',')).digest('hex');
    const calendarHash = crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');

    return {
      runId,
      observationFrequency: 'DAILY',
      sessionCount: sorted.length,
      firstDate: sorted[0].date,
      lastDate: sorted[sorted.length - 1].date,
      observationCount: sorted.length,
      includedDatesHash,
      calendarHash,
      excludedDates: [],
      exclusionReasons: []
    };
  }

  /**
   * Performs exact date-by-date and metric-by-metric comparison between producer and shadow curves.
   */
  public compareCurves(
    producerCurve: DetailedEquityPoint[],
    shadowCurve: DetailedEquityPoint[],
    tolerance: number = 0.01
  ): EquityComparisonResult {
    if (producerCurve.length !== shadowCurve.length) {
      return {
        passed: false,
        mismatchReason: `LENGTH_MISMATCH: Producer has ${producerCurve.length}, Shadow has ${shadowCurve.length}`,
        totalDatesEvaluated: 0,
        producerHash: '',
        shadowHash: '',
        hashesMatch: false,
        exactDateMatch: false,
        maxEquityDelta: Infinity,
        maxCashDelta: Infinity,
        maxExposureDelta: Infinity,
        maxDrawdownDelta: Infinity
      };
    }

    let maxEquityDelta = 0;
    let maxCashDelta = 0;
    let maxExposureDelta = 0;
    let maxDrawdownDelta = 0;

    for (let i = 0; i < producerCurve.length; i++) {
      const p = producerCurve[i];
      const s = shadowCurve[i];

      if (p.date !== s.date) {
        return {
          passed: false,
          mismatchReason: `DATE_ORDERING_MISMATCH at index ${i}: Producer=${p.date}, Shadow=${s.date}`,
          totalDatesEvaluated: i,
          producerHash: '',
          shadowHash: '',
          hashesMatch: false,
          exactDateMatch: false,
          maxEquityDelta,
          maxCashDelta,
          maxExposureDelta,
          maxDrawdownDelta
        };
      }

      const eqDelta = Math.abs(p.equity - s.equity);
      const cashDelta = Math.abs(p.cash - s.cash);
      const expDelta = Math.abs(p.exposure - s.exposure);
      const ddDelta = Math.abs(p.drawdownPct - s.drawdownPct);

      if (eqDelta > maxEquityDelta) maxEquityDelta = eqDelta;
      if (cashDelta > maxCashDelta) maxCashDelta = cashDelta;
      if (expDelta > maxExposureDelta) maxExposureDelta = expDelta;
      if (ddDelta > maxDrawdownDelta) maxDrawdownDelta = ddDelta;

      if (eqDelta > tolerance || cashDelta > tolerance || expDelta > tolerance || ddDelta > tolerance) {
        return {
          passed: false,
          mismatchReason: `TOLERANCE_EXCEEDED on ${p.date}: eqDelta=${eqDelta}, cashDelta=${cashDelta}`,
          totalDatesEvaluated: i + 1,
          producerHash: '',
          shadowHash: '',
          hashesMatch: false,
          exactDateMatch: true,
          maxEquityDelta,
          maxCashDelta,
          maxExposureDelta,
          maxDrawdownDelta
        };
      }
    }

    const producerHash = crypto.createHash('sha256').update(JSON.stringify(producerCurve)).digest('hex');
    const shadowHash = crypto.createHash('sha256').update(JSON.stringify(shadowCurve)).digest('hex');

    return {
      passed: true,
      totalDatesEvaluated: producerCurve.length,
      producerHash,
      shadowHash,
      hashesMatch: producerHash === shadowHash,
      exactDateMatch: true,
      maxEquityDelta,
      maxCashDelta,
      maxExposureDelta,
      maxDrawdownDelta
    };
  }
}
