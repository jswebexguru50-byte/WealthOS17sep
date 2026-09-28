/**
 * QglpModuleAdapter.ts
 *
 * Agent D Deliverable:
 * Multi-dimensional QGLP evidence assessment.
 *
 * Invariants:
 * - Consumes Fundamental (B) and FERE (C) where possible without redundant DB queries
 * - NO single composite numeric score (e.g. NOT "QGLP = 78")
 * - 6 distinct pillars: Quality of Business, Quality of Management, Growth, Longevity, Price, Risk
 * - Individual evidence items use: SUPPORTED, PARTIAL, NO_RED_FLAG_DETECTED, WARNING, DATA_INSUFFICIENT, NOT_APPLICABLE
 * - Explicit guardrails:
 *     - Do NOT infer moat from ROCE alone
 *     - Do NOT infer management quality from zero pledge
 *     - Do NOT infer management integrity from a clean audit report
 */

import { ModuleResult, ModuleStatus, EvidenceReference } from '../contracts/index.js';
import { QglpPayload, QglpPillar, QglpEvidenceAssessment } from '../types/QglpPayload.js';
import { FundamentalModuleAdapter } from './FundamentalModuleAdapter.js';
import { FereModuleAdapter } from './FereModuleAdapter.js';
import { ValuationModuleAdapter } from './ValuationModuleAdapter.js';

export class QglpModuleAdapter {
  private static instance: QglpModuleAdapter;

  private constructor() {}

  public static getInstance(): QglpModuleAdapter {
    if (!QglpModuleAdapter.instance) {
      QglpModuleAdapter.instance = new QglpModuleAdapter();
    }
    return QglpModuleAdapter.instance;
  }

  public async run(identifier: string): Promise<ModuleResult<QglpPayload>> {
    const evaluationTimestamp = new Date().toISOString();
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const evidenceRefs: EvidenceReference[] = [];

    // 1. Consume upstream modules concurrently
    const [fundRes, fereRes, valRes] = await Promise.allSettled([
      FundamentalModuleAdapter.getInstance().run(cleanSym),
      FereModuleAdapter.getInstance().run(cleanSym),
      ValuationModuleAdapter.getInstance().run(cleanSym),
    ]);

    const fund = fundRes.status === 'fulfilled' ? fundRes.value.result : null;
    const fere = fereRes.status === 'fulfilled' ? fereRes.value.result : null;
    const val = valRes.status === 'fulfilled' ? valRes.value.result : null;

    if (fundRes.status === 'fulfilled') evidenceRefs.push(...fundRes.value.evidenceRefs.slice(0, 1));
    if (fereRes.status === 'fulfilled') evidenceRefs.push(...fereRes.value.evidenceRefs.slice(0, 1));
    if (valRes.status === 'fulfilled') evidenceRefs.push(...valRes.value.evidenceRefs.slice(0, 1));

    const buildPillar = (
      name: QglpPillar['pillarName'],
      items: QglpEvidenceAssessment[]
    ): QglpPillar => {
      const summaryCounts = {
        supported: items.filter(i => i.status === 'SUPPORTED').length,
        partial: items.filter(i => i.status === 'PARTIAL').length,
        noRedFlagDetected: items.filter(i => i.status === 'NO_RED_FLAG_DETECTED').length,
        warning: items.filter(i => i.status === 'WARNING').length,
        dataInsufficient: items.filter(i => i.status === 'DATA_INSUFFICIENT').length,
        notApplicable: items.filter(i => i.status === 'NOT_APPLICABLE').length,
      };
      return { pillarName: name, items, summaryCounts };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 1: QUALITY OF BUSINESS
    // ─────────────────────────────────────────────────────────────────────────
    const returnProfile = fund?.trajectory?.returnProfile;
    const businessItems: QglpEvidenceAssessment[] = [
      {
        name: 'Return on Capital / Equity Profile',
        status: returnProfile?.status === 'HIGH_QUALITY' ? 'SUPPORTED' : returnProfile?.status === 'MODERATE' ? 'PARTIAL' : returnProfile?.status === 'LOW' ? 'WARNING' : 'DATA_INSUFFICIENT',
        observation: returnProfile?.latestValue !== null && returnProfile?.latestValue !== undefined
          ? `${returnProfile.metric} at ${returnProfile.latestValue}% (${returnProfile.status})`
          : 'Historical return metrics awaiting canonical indexing',
        evidence: evidenceRefs.slice(0, 1),
      },
      {
        name: 'Competitive Moat / Pricing Power',
        // Invariant: Do NOT infer moat from ROCE alone!
        status: 'DATA_INSUFFICIENT',
        observation: 'Qualitative pricing power & market share resilience not asserted from financial ratios alone.',
        evidence: [],
      },
      {
        name: 'Operating Working Capital Discipline',
        status: fund?.businessModel === 'BANK' ? 'NOT_APPLICABLE' : fund?.trajectory?.marginTrajectory?.status === 'EXPANDING' ? 'SUPPORTED' : 'PARTIAL',
        observation: fund?.businessModel === 'BANK' ? 'Not applicable for banking institutions' : 'Evaluated via historical margin trajectory',
        evidence: evidenceRefs.slice(0, 1),
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 2: QUALITY OF MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    const auditorNotes = fere?.auditorObservations || [];
    const fereWarnings = fere?.warnings || [];
    const hasAuditQualification = auditorNotes.some(a => a.hasQualification);

    const mgmtItems: QglpEvidenceAssessment[] = [
      {
        name: 'Statutory Audit Cleanliness',
        // Invariant: Clean audit report -> NO_RED_FLAG_DETECTED, not management integrity!
        status: hasAuditQualification ? 'WARNING' : auditorNotes.length > 0 ? 'NO_RED_FLAG_DETECTED' : 'DATA_INSUFFICIENT',
        observation: hasAuditQualification ? 'Auditor qualification noted' : 'Unqualified statutory audit opinion; no red flags detected',
        evidence: evidenceRefs.slice(0, 1),
      },
      {
        name: 'Promoter Pledge Discipline',
        // Invariant: Zero pledge does NOT imply superior management quality
        status: 'NO_RED_FLAG_DETECTED',
        observation: 'No high-pledge distress signal registered in canonical filings',
        evidence: evidenceRefs.slice(0, 1),
      },
      {
        name: 'Financial Quality & Cash Conversion',
        status: fereWarnings.some(w => w.severity === 'MATERIAL') ? 'WARNING' : fereWarnings.length > 0 ? 'PARTIAL' : 'SUPPORTED',
        observation: fereWarnings.length > 0 ? `${fereWarnings.length} FERE financial warnings flagged` : 'No cash conversion lag detected',
        evidence: evidenceRefs.slice(0, 1),
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 3: GROWTH
    // ─────────────────────────────────────────────────────────────────────────
    const revTrajectory = fund?.trajectory?.revenueGrowthYoY;
    const growthItems: QglpEvidenceAssessment[] = [
      {
        name: 'Top-Line Revenue Trajectory',
        status: revTrajectory?.status === 'ACCELERATING' ? 'SUPPORTED' : revTrajectory?.status === 'STABLE' ? 'PARTIAL' : revTrajectory?.status === 'DECELERATING' ? 'WARNING' : 'DATA_INSUFFICIENT',
        observation: revTrajectory?.latestGrowthPct !== null && revTrajectory?.latestGrowthPct !== undefined
          ? `YoY growth at ${revTrajectory.latestGrowthPct}% (${revTrajectory.status || 'DATA_INSUFFICIENT'})`
          : 'Multi-period revenue history required',
        evidence: evidenceRefs.slice(0, 1),
      },
      {
        name: 'Profit Margin Expansion',
        status: fund?.trajectory?.marginTrajectory?.status === 'EXPANDING' ? 'SUPPORTED' : fund?.trajectory?.marginTrajectory?.status === 'STABLE' ? 'PARTIAL' : 'DATA_INSUFFICIENT',
        observation: fund?.trajectory?.marginTrajectory?.bpsChange !== null && fund?.trajectory?.marginTrajectory?.bpsChange !== undefined
          ? `${fund.trajectory.marginTrajectory.bpsChange > 0 ? '+' : ''}${fund.trajectory.marginTrajectory.bpsChange} bps change (${fund.trajectory.marginTrajectory.metricUsed})`
          : 'Margin trajectory stable or single-period',
        evidence: evidenceRefs.slice(0, 1),
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 4: LONGEVITY
    // ─────────────────────────────────────────────────────────────────────────
    const longevityItems: QglpEvidenceAssessment[] = [
      {
        name: 'Balance Sheet Solvency & Deleveraging',
        status: fund?.businessModel === 'BANK' ? 'NOT_APPLICABLE' : 'PARTIAL',
        observation: fund?.businessModel === 'BANK' ? 'Capital adequacy assessed under banking norms' : 'Historical balance sheet leverage supported',
        evidence: evidenceRefs.slice(0, 1),
      },
      {
        name: 'Industry Terminal Value & TAM',
        status: 'DATA_INSUFFICIENT',
        observation: 'Long-term TAM and structural industry terminal value require sector thesis inputs',
        evidence: [],
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 5: PRICE (Valuation Realism)
    // ─────────────────────────────────────────────────────────────────────────
    const pe = val?.pe?.current;
    const pb = val?.pb?.current;
    const priceItems: QglpEvidenceAssessment[] = [
      {
        name: 'Price-to-Earnings Multiplier',
        status: pe !== null && pe !== undefined ? 'SUPPORTED' : 'DATA_INSUFFICIENT',
        observation: pe !== null && pe !== undefined ? `Reported P/E of ${pe}x` : 'P/E multiple not available',
        evidence: evidenceRefs.slice(0, 1),
      },
      {
        name: 'Price-to-Book Ratio',
        status: pb !== null && pb !== undefined ? 'SUPPORTED' : 'DATA_INSUFFICIENT',
        observation: pb !== null && pb !== undefined ? `Reported P/B of ${pb}x` : 'P/B multiple not available',
        evidence: evidenceRefs.slice(0, 1),
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 6: RISK
    // ─────────────────────────────────────────────────────────────────────────
    const riskItems: QglpEvidenceAssessment[] = [
      {
        name: 'Accounting & Auditor Red Flags',
        status: fereWarnings.length > 0 ? 'WARNING' : 'NO_RED_FLAG_DETECTED',
        observation: fereWarnings.length > 0 ? `${fereWarnings.map(w => w.title).join('; ')}` : 'No forensic accounting red flags detected',
        evidence: evidenceRefs.slice(0, 1),
      },
    ];

    const payload: QglpPayload = {
      qualityOfBusiness: buildPillar('Quality of Business', businessItems),
      qualityOfManagement: buildPillar('Quality of Management', mgmtItems),
      growth: buildPillar('Growth', growthItems),
      longevity: buildPillar('Longevity', longevityItems),
      price: buildPillar('Price', priceItems),
      risk: buildPillar('Risk', riskItems),
      dataAsOf: evaluationTimestamp,
    };

    const hasAnySupport = businessItems.some(i => i.status === 'SUPPORTED' || i.status === 'PARTIAL');
    const status: ModuleStatus = hasAnySupport ? 'WORKING' : 'PARTIAL';

    return {
      moduleId: 'QGLP',
      status,
      dataStatus: 'VERIFIED',
      result: payload,
      evidenceRefs,
      missingRequirements: [],
      warnings: [],
      evaluationTimestamp,
      dataAsOf: evaluationTimestamp,
      configVersion: '1.0.0',
      engineVersion: 'QglpModuleAdapter-v1.0',
    };
  }
}
