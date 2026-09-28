/**
 * ManagementModuleAdapter.ts
 *
 * Agent E Deliverable:
 * Adapts management commitments and walk-the-talk delivery tracking into canonical ModuleResult<ManagementPayload>.
 *
 * Invariants:
 * - Start only with measurable commitments
 * - Categories: Revenue, Margins, Capex, Capacity, Utilisation, Debt, Working Capital, Orders, Product Launch, Geographic Expansion
 * - No sentiment scoring (NO CEO confidence = 87%)
 * - Claim retains source document link; actual retains evidence
 * - Pending target remains PENDING
 * - If no indexed commitments exist: returns DATA_INSUFFICIENT, never fabricates
 */

import { ModuleResult, ModuleStatus, EvidenceReference } from '../contracts/index.js';
import { ManagementPayload, ManagementCommitment } from '../types/ManagementPayload.js';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

export class ManagementModuleAdapter {
  private static instance: ManagementModuleAdapter;
  private evidenceDbPath = path.resolve('data', 'fere', 'verified_filings', 'fere_evidence.db');

  private constructor() {}

  public static getInstance(): ManagementModuleAdapter {
    if (!ManagementModuleAdapter.instance) {
      ManagementModuleAdapter.instance = new ManagementModuleAdapter();
    }
    return ManagementModuleAdapter.instance;
  }

  public async run(identifier: string): Promise<ModuleResult<ManagementPayload>> {
    const evaluationTimestamp = new Date().toISOString();
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const evidenceRefs: EvidenceReference[] = [];

    if (!fs.existsSync(this.evidenceDbPath)) {
      return {
        moduleId: 'MANAGEMENT',
        status: 'SOURCE_UNAVAILABLE',
        dataStatus: 'SOURCE_UNAVAILABLE',
        result: null,
        evidenceRefs: [],
        missingRequirements: ['fere_evidence.db database unavailable'],
        warnings: ['FERE database file absent'],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'ManagementModuleAdapter-v1.0',
      };
    }

    try {
      const db = new Database(this.evidenceDbPath, { readonly: true, fileMustExist: true });

      // 1. Query management commitments and claim candidates
      const candidates = db.prepare(`
        SELECT id, claim_date AS claimDate, source_url AS sourceUrl,
               source_sha256 AS sourceSha256, evidence_text AS evidenceText,
               detected_metric AS metric, detected_target AS target,
               detected_unit AS unit, detected_deadline AS deadline, decision
        FROM management_claim_candidate
        WHERE symbol = ? OR isin = ?
        ORDER BY claim_date DESC
      `).all(cleanSym, cleanSym) as any[];

      // 2. Pre-fetch verified XBRL facts for deterministic actual-vs-promise comparison
      const xbrlFacts = db.prepare(`
        SELECT id, metric, value, unit, period_end AS periodEnd,
               available_at AS availableAt, source_url AS sourceUrl,
               filing_sha256 AS filingSha256
        FROM verified_xbrl_fact
        WHERE symbol = ? OR isin = ?
        ORDER BY period_end DESC
      `).all(cleanSym, cleanSym) as any[];

      const factsByMetric: Record<string, any[]> = {};
      for (const f of xbrlFacts) {
        if (!factsByMetric[f.metric]) factsByMetric[f.metric] = [];
        factsByMetric[f.metric].push(f);
      }

      const commitments: ManagementCommitment[] = [];

      for (const row of candidates) {
        const sourceDoc: EvidenceReference = {
          evidenceId: `MGMT_DOC_${cleanSym}_${row.id}`,
          sourceType: 'FERE_FILING',
          sourceId: row.sourceSha256 || `CLAIM_${row.id}`,
          timestamp: row.claimDate || evaluationTimestamp,
          uri: row.sourceUrl || undefined,
          notes: `Extracted claim from transcript/filing: "${row.evidenceText?.slice(0, 100)}..."`,
        };
        evidenceRefs.push(sourceDoc);

        // Classify category from detected metric
        let category = 'Revenue';
        const metricLower = (row.metric || '').toLowerCase();
        if (metricLower.includes('margin') || metricLower.includes('ebitda')) category = 'Margins';
        else if (metricLower.includes('capex')) category = 'Capex';
        else if (metricLower.includes('capacity')) category = 'Capacity';
        else if (metricLower.includes('debt') || metricLower.includes('deleverag')) category = 'Debt';
        else if (metricLower.includes('working capital')) category = 'Working Capital';
        else if (metricLower.includes('order')) category = 'Orders';
        else if (metricLower.includes('launch') || metricLower.includes('product')) category = 'Product Launch';
        else if (metricLower.includes('geographic') || metricLower.includes('expansion')) category = 'Geographic Expansion';

        let actualVal: string | number | null = null;
        let commitmentStatus: ManagementCommitment['status'] = 'PENDING';
        const actualEvidence: EvidenceReference[] = [];

        // Deterministic matching against subsequent reported actuals
        let targetXbrlMetric: string | null = null;
        if (metricLower.includes('revenue') || metricLower.includes('sales')) targetXbrlMetric = 'sales';
        else if (metricLower.includes('profit') || metricLower.includes('pat')) targetXbrlMetric = 'pat';
        else if (metricLower.includes('cfo') || metricLower.includes('cash')) targetXbrlMetric = 'cfo';

        if (targetXbrlMetric && factsByMetric[targetXbrlMetric]?.length > 0) {
          const matchingFacts = factsByMetric[targetXbrlMetric];
          // If we have >= 2 periods, compare growth against target
          if (matchingFacts.length >= 2 && row.target !== null && !isNaN(Number(row.target))) {
            const latestFact = matchingFacts[0];
            const priorFact = matchingFacts[1];
            if (latestFact.value && priorFact.value && priorFact.value > 0) {
              const reportedGrowth = Number((((latestFact.value - priorFact.value) / priorFact.value) * 100).toFixed(1));
              actualVal = `${reportedGrowth}% (${targetXbrlMetric} YoY in ${latestFact.periodEnd})`;

              const targetNum = Number(row.target);
              if (reportedGrowth >= targetNum - 1.0) {
                commitmentStatus = 'ACHIEVED';
              } else if (reportedGrowth >= targetNum * 0.5) {
                commitmentStatus = 'PARTIALLY_ACHIEVED';
              } else {
                commitmentStatus = 'MISSED';
              }

              const actualRef: EvidenceReference = {
                evidenceId: `ACTUAL_XBRL_${cleanSym}_${latestFact.id}`,
                sourceType: 'XBRL_FILING',
                sourceId: latestFact.filingSha256 || `XBRL_${latestFact.id}`,
                timestamp: latestFact.availableAt || latestFact.periodEnd,
                uri: latestFact.sourceUrl || undefined,
                notes: `Subsequent reported actual: ${targetXbrlMetric} = ${latestFact.value} ${latestFact.unit} (${latestFact.periodEnd})`,
              };
              actualEvidence.push(actualRef);
              evidenceRefs.push(actualRef);
            }
          } else {
            commitmentStatus = 'NOT_YET_DUE';
          }
        } else if (!targetXbrlMetric || row.target === null) {
          commitmentStatus = 'NOT_VERIFIABLE';
        } else {
          commitmentStatus = 'PENDING';
        }

        commitments.push({
          id: `COMMITMENT_${row.id}`,
          category,
          statementDate: row.claimDate || 'UNKNOWN',
          sourceDocument: sourceDoc,
          statement: row.evidenceText || '',
          targetMetric: row.metric || null,
          targetValue: row.target || null,
          targetPeriod: row.deadline || null,
          actualValue: actualVal,
          status: commitmentStatus,
          actualEvidence,
        });
      }

      const deliveredCount = commitments.filter(c => c.status === 'ACHIEVED' || c.status === 'DELIVERED' || c.status === 'PARTIALLY_ACHIEVED' || c.status === 'PARTIAL').length;
      const missedCount = commitments.filter(c => c.status === 'MISSED').length;
      const pendingCount = commitments.filter(c => c.status === 'PENDING' || c.status === 'NOT_YET_DUE').length;
      const notVerifiableCount = commitments.filter(c => c.status === 'NOT_VERIFIABLE').length;

      const hasCommitments = commitments.length > 0;
      const status: ModuleStatus = hasCommitments ? 'WORKING' : 'DATA_INSUFFICIENT';

      const payload: ManagementPayload = {
        commitments,
        deliveredCount,
        pendingCount,
        missedCount,
        notVerifiableCount,
        dataAsOf: hasCommitments ? evaluationTimestamp : null,
      };

      return {
        moduleId: 'MANAGEMENT',
        status,
        dataStatus: hasCommitments ? 'PARTIAL' : 'DATA_INSUFFICIENT',
        result: payload,
        evidenceRefs,
        missingRequirements: hasCommitments ? [] : [`No indexed management commitments found for ${cleanSym}`],
        warnings: hasCommitments ? [] : [`Transcripts/filings for ${cleanSym} await commitment candidate extraction`],
        evaluationTimestamp,
        dataAsOf: hasCommitments ? evaluationTimestamp : null,
        configVersion: '1.0.0',
        engineVersion: 'ManagementModuleAdapter-v1.0',
      };
    } catch (err: any) {
      return {
        moduleId: 'MANAGEMENT',
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [err.message],
        warnings: [err.message],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'ManagementModuleAdapter-v1.0',
      };
    }
  }
}
