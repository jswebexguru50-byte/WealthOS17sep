/**
 * CatalystEngine.ts — Section 13 Catalyst Intelligence Engine
 *
 * Tracks company investment catalysts: capacity additions, product rollouts,
 * debt milestones, earnings dates, regulatory approvals, and corporate actions.
 *
 * Constitution:
 * - Links catalysts explicitly to business drivers and thesis pillars
 * - Tracks state transitions (EXPECTED → DELIVERED | DELAYED | FAILED)
 * - Evidence-backed provenance for every catalyst claim
 */

import { EvidenceReference } from '../contracts/Provenance.js';
import crypto from 'crypto';

export type CatalystType =
  | 'RESULT'
  | 'CAPACITY'
  | 'PRODUCT'
  | 'ORDER'
  | 'REGULATORY'
  | 'DEBT'
  | 'CORPORATE_ACTION'
  | 'MANAGEMENT_TARGET'
  | 'OTHER';

export type CatalystState =
  | 'EXPECTED'
  | 'IN_PROGRESS'
  | 'DELIVERED'
  | 'DELAYED'
  | 'FAILED'
  | 'CANCELLED';

export interface Catalyst {
  catalystId: string;
  securityId: string;
  title: string;
  description?: string;
  type: CatalystType;
  expectedDate: string | null;
  state: CatalystState;
  linkedDrivers: string[];
  linkedThesisPillars: string[];
  evidence: EvidenceReference[];
}

export interface CatalystResult {
  securityId: string;
  catalysts: Catalyst[];
  upcomingCount: number;
  deliveredCount: number;
  delayedCount: number;
  evaluatedAt: string;
}

export class CatalystEngine {
  private static instance: CatalystEngine;

  private constructor() {}

  public static getInstance(): CatalystEngine {
    if (!CatalystEngine.instance) {
      CatalystEngine.instance = new CatalystEngine();
    }
    return CatalystEngine.instance;
  }

  /**
   * Evaluates and returns structured catalysts for a company from management targets and known events.
   */
  public evaluate(params: {
    securityId: string;
    symbol: string;
    managementCommitments?: any[];
    knownEvents?: any[];
    asOfDate?: string | null;
  }): CatalystResult {
    const { securityId, managementCommitments = [] } = params;
    const now = new Date().toISOString();

    const catalysts: Catalyst[] = [];

    // 1. Convert management targets with future or recent deadlines into catalysts
    for (const c of managementCommitments) {
      const evidence = Array.isArray(c.sourceDocument)
        ? c.sourceDocument
        : c.sourceDocument ? [c.sourceDocument] : [];
      // A target without a persisted, source-backed reference is a question
      // for research, not a live company catalyst.
      if ((c.targetPeriod || c.deadline) && evidence.length > 0) {
        let type: CatalystType = 'MANAGEMENT_TARGET';
        const cat = (c.category || '').toUpperCase();
        if (cat.includes('CAPEX') || cat.includes('CAPACITY')) type = 'CAPACITY';
        else if (cat.includes('PRODUCT') || cat.includes('LAUNCH')) type = 'PRODUCT';
        else if (cat.includes('DEBT') || cat.includes('DELEVERAG')) type = 'DEBT';
        else if (cat.includes('ORDER')) type = 'ORDER';

        let state: CatalystState = 'EXPECTED';
        if (c.status === 'ACHIEVED' || c.status === 'DELIVERED') state = 'DELIVERED';
        else if (c.status === 'ACHIEVED_LATE' || c.status === 'DEFERRED') state = 'DELAYED';
        else if (c.status === 'MISSED') state = 'FAILED';
        else if (c.status === 'SUPERSEDED' || c.status === 'WITHDRAWN') state = 'CANCELLED';

        catalysts.push({
          catalystId: `cat_comm_${c.id}`,
          securityId,
          title: c.statement.substring(0, 100),
          description: `Target: ${c.targetValue ?? 'N/A'} for period ${c.targetPeriod ?? c.deadline}`,
          type,
          expectedDate: c.deadline || c.targetPeriod || null,
          state,
          linkedDrivers: c.targetMetric ? [c.targetMetric] : [],
          linkedThesisPillars: [],
          evidence,
        });
      }
    }

    const upcomingCount = catalysts.filter(c => c.state === 'EXPECTED' || c.state === 'IN_PROGRESS').length;
    const deliveredCount = catalysts.filter(c => c.state === 'DELIVERED').length;
    const delayedCount = catalysts.filter(c => c.state === 'DELAYED').length;

    return {
      securityId,
      catalysts,
      upcomingCount,
      deliveredCount,
      delayedCount,
      evaluatedAt: now,
    };
  }

}
