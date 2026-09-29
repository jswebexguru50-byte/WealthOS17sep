/**
 * CommitmentSupersessionEngine.ts — Section 6 Management Walk-The-Talk V3
 *
 * Detects when new management guidance or targets supersede prior active commitments.
 *
 * Example:
 *   Q1 guidance: Revenue growth 20% by FY25
 *   Q2 revision: Revenue growth 12-15% by FY25
 *
 * Result:
 *   Original commitment → SUPERSEDED (supersededById = Q2.id)
 *   New commitment → ACTIVE (supersedesId = Q1.id)
 *   History preserved: Both visible in audit trail; superseded commitment not evaluated as an active miss.
 */

import { ManagementCommitment } from '../types/ManagementPayload.js';

export interface SupersessionResult {
  commitments: ManagementCommitment[];
  supersededCount: number;
  activeCount: number;
  supersessionChains: Array<{
    originalId: string;
    supersededById: string;
    metric: string;
    statementDifference: string;
  }>;
}

export class CommitmentSupersessionEngine {
  private static instance: CommitmentSupersessionEngine;

  public static getInstance(): CommitmentSupersessionEngine {
    if (!CommitmentSupersessionEngine.instance) {
      CommitmentSupersessionEngine.instance = new CommitmentSupersessionEngine();
    }
    return CommitmentSupersessionEngine.instance;
  }

  /**
   * Applies supersession rules across a set of commitments for a single company.
   * Returns updated commitments with status and supersession links.
   */
  public resolveSupersessions(commitments: ManagementCommitment[]): SupersessionResult {
    if (!commitments || commitments.length <= 1) {
      return {
        commitments: commitments || [],
        supersededCount: 0,
        activeCount: commitments?.length || 0,
        supersessionChains: [],
      };
    }

    // Sort commitments chronologically by statementDate ascending
    const sorted = [...commitments].sort((a, b) =>
      a.statementDate.localeCompare(b.statementDate)
    );

    const chains: SupersessionResult['supersessionChains'] = [];
    const updated = sorted.map(c => ({ ...c }));

    // Group by category + targetMetric + targetPeriod
    for (let i = 0; i < updated.length; i++) {
      const prior = updated[i];
      // Skip if already superseded, delivered, or missed
      if (prior.status === 'SUPERSEDED' || prior.status === 'DELIVERED' || prior.status === 'ACHIEVED' || prior.status === 'ACHIEVED_LATE') {
        continue;
      }

      for (let j = i + 1; j < updated.length; j++) {
        const newer = updated[j];

        // Match condition: Same metric or closely related category targeting the same period
        const sameMetric = prior.targetMetric && newer.targetMetric && prior.targetMetric === newer.targetMetric;
        const sameCategory = prior.category && newer.category && prior.category.toUpperCase() === newer.category.toUpperCase();
        const samePeriod = prior.targetPeriod && newer.targetPeriod && prior.targetPeriod === newer.targetPeriod;

        if ((sameMetric || sameCategory) && samePeriod) {
          // Newer statement supersedes prior if prior was not yet finalized
          if (prior.status === 'PENDING' || prior.status === 'NOT_YET_DUE' || prior.status === 'PARTIALLY_ACHIEVED') {
            prior.status = 'SUPERSEDED';
            prior.supersededById = newer.id;
            newer.supersedesId = prior.id;

            chains.push({
              originalId: prior.id,
              supersededById: newer.id,
              metric: prior.targetMetric || prior.category,
              statementDifference: `Revised from "${prior.statement}" to "${newer.statement}"`,
            });
            break; // prior is superseded, move to next
          }
        }
      }
    }

    const supersededCount = updated.filter(c => c.status === 'SUPERSEDED').length;
    const activeCount = updated.length - supersededCount;

    return {
      commitments: updated,
      supersededCount,
      activeCount,
      supersessionChains: chains,
    };
  }
}
