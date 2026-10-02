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

import { ModuleResult, ModuleStatus, DataStatus, EvidenceReference } from '../contracts/index.js';
import { QglpPayload, QglpPillar, QglpEvidenceAssessment } from '../types/QglpPayload.js';
import { FundamentalModuleAdapter } from './FundamentalModuleAdapter.js';
import { FereModuleAdapter } from './FereModuleAdapter.js';
import { ValuationModuleAdapter } from './ValuationModuleAdapter.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
    const fereModuleResult = fereRes.status === 'fulfilled' ? fereRes.value : null;
    const fere = fereModuleResult?.result ?? null;
    const fereEvidence = fereModuleResult?.evidenceRefs ?? [];
    const val = valRes.status === 'fulfilled' ? valRes.value.result : null;

    if (fundRes.status === 'fulfilled') evidenceRefs.push(...fundRes.value.evidenceRefs.slice(0, 1));
    if (fereEvidence.length > 0) evidenceRefs.push(...fereEvidence.slice(0, 1));
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
        status: fund?.businessModel === 'BANK' || fund?.businessModel === 'NBFC'
          ? 'NOT_APPLICABLE'
          : fund?.businessModel === 'UNKNOWN'
          ? 'DATA_INSUFFICIENT'
          : fund?.trajectory?.marginTrajectory?.status === 'EXPANDING'
          ? 'SUPPORTED'
          : 'PARTIAL',
        observation: fund?.businessModel === 'BANK' || fund?.businessModel === 'NBFC'
          ? 'Not applicable for banking and lending institutions'
          : fund?.businessModel === 'UNKNOWN'
          ? 'Working capital discipline withheld pending verified business model classification'
          : 'Evaluated via historical margin trajectory',
        evidence: fund?.businessModel === 'UNKNOWN' || fund?.businessModel === 'BANK' || fund?.businessModel === 'NBFC'
          ? []
          : evidenceRefs.slice(0, 1),
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 2: QUALITY OF MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    const auditorNotes = fere?.auditorObservations || [];
    const fereWarnings = fere?.warnings || [];
    const hasAuditQualification = auditorNotes.some(a => a.hasQualification);

    // Query actual promoter pledge evidence from shareholding_snapshot
    let pledgeStatus: QglpEvidenceAssessment['status'] = 'DATA_INSUFFICIENT';
    let pledgeObservation = 'Promoter pledge data not registered in canonical repository (unknown remains unknown)';
    const pledgeEvidence: EvidenceReference[] = [];

    const fereDbPath = path.resolve('data', 'fere', 'verified_filings', 'fere_evidence.db');
    if (fs.existsSync(fereDbPath)) {
      try {
        const fereDb = new Database(fereDbPath, { readonly: true, fileMustExist: true });
        const shpRow = fereDb.prepare(`
          SELECT period_end, promoter_pledge, source_url, source_sha256, available_at
          FROM shareholding_snapshot
          WHERE symbol = ? OR isin = ?
          ORDER BY period_end DESC LIMIT 1
        `).get(cleanSym, cleanSym) as any;

        if (shpRow && shpRow.promoter_pledge !== null && shpRow.promoter_pledge !== undefined) {
          const pledgePct = Number(shpRow.promoter_pledge);
          if (pledgePct <= 0.05) {
            pledgeStatus = 'NO_RED_FLAG_DETECTED';
            pledgeObservation = `Promoter pledge at ${(pledgePct * 100).toFixed(1)}% (below 5% distress threshold, filing ${shpRow.period_end})`;
          } else {
            pledgeStatus = 'WARNING';
            pledgeObservation = `Elevated promoter pledge at ${(pledgePct * 100).toFixed(1)}% flagged in canonical filing (${shpRow.period_end})`;
          }
          const ref: EvidenceReference = {
            evidenceId: `PLEDGE_${cleanSym}_${shpRow.period_end}`,
            sourceType: 'SHAREHOLDING_FILING',
            sourceId: shpRow.source_sha256 || `SHP_${cleanSym}`,
            timestamp: shpRow.available_at || shpRow.period_end,
            uri: shpRow.source_url || undefined,
            notes: `Promoter pledge: ${(pledgePct * 100).toFixed(1)}%`,
          };
          pledgeEvidence.push(ref);
          evidenceRefs.push(ref);
        }
      } catch {
        // If query fails, status remains DATA_INSUFFICIENT
      }
    }

    // Cash conversion logic: Absence of FERE warnings != positive evidence
    let cashConversionStatus: QglpEvidenceAssessment['status'] = 'DATA_INSUFFICIENT';
    let cashConversionObservation = 'CFO and PAT history required to verify cash conversion (absence of warnings != positive evidence)';
    const cashEvidence: EvidenceReference[] = [];

    if (fund?.businessModel === 'BANK' || fund?.businessModel === 'NBFC') {
      cashConversionStatus = 'NOT_APPLICABLE';
      cashConversionObservation = 'Industrial cash conversion (CFO/PAT) not applicable to financial institutions';
    } else {
      const cfoSeries = fund?.historicalSeries?.['CFO'] || [];
      const patSeries = fund?.historicalSeries?.['PAT'] || [];

      if (cfoSeries.length > 0 && patSeries.length > 0) {
        const cfo = cfoSeries[0]?.value;
        const pat = patSeries[0]?.value;
        if (cfo !== null && pat !== null && pat > 0) {
          const conversionRatio = cfo / pat;
          if (cfoSeries[0].provenance) cashEvidence.push(...cfoSeries[0].provenance);
          if (conversionRatio >= 0.8) {
            cashConversionStatus = 'SUPPORTED';
            cashConversionObservation = `CFO/PAT conversion ratio healthy at ${(conversionRatio * 100).toFixed(0)}% (CFO: ${cfo} Cr, PAT: ${pat} Cr)`;
          } else {
            cashConversionStatus = 'WARNING';
            cashConversionObservation = `CFO conversion lag detected: CFO at ${(conversionRatio * 100).toFixed(0)}% of PAT (CFO: ${cfo} Cr, PAT: ${pat} Cr)`;
          }
        } else if (fereWarnings.some(w => w.severity === 'MATERIAL')) {
          cashConversionStatus = 'WARNING';
          cashConversionObservation = 'Material accounting/cash conversion warnings flagged in FERE';
        }
      }
    }

    const mgmtItems: QglpEvidenceAssessment[] = [
      {
        name: 'Statutory Audit Cleanliness',
        // Invariant: Clean audit report -> NO_RED_FLAG_DETECTED, not management integrity!
        status: hasAuditQualification ? 'WARNING' : auditorNotes.length > 0 ? 'NO_RED_FLAG_DETECTED' : 'DATA_INSUFFICIENT',
        observation: hasAuditQualification ? 'Auditor qualification noted' : auditorNotes.length > 0 ? 'Unqualified statutory audit opinion; no red flags detected' : 'Statutory audit notes awaiting canonical indexing',
        evidence: evidenceRefs.slice(0, 1),
      },
      {
        name: 'Promoter Pledge Discipline',
        // Invariant: Missing pledge data remains DATA_INSUFFICIENT, never NO_RED_FLAG_DETECTED
        status: pledgeStatus,
        observation: pledgeObservation,
        evidence: pledgeEvidence.length > 0 ? pledgeEvidence : [],
      },
      {
        name: 'Financial Quality & Cash Conversion',
        // Invariant: Absence of detected warnings != evidence of good cash conversion
        status: cashConversionStatus,
        observation: cashConversionObservation,
        evidence: cashEvidence.length > 0 ? cashEvidence : [],
      },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // PILLAR 3: GROWTH
    // ─────────────────────────────────────────────────────────────────────────
    const revTrajectory = fund?.trajectory?.revenueGrowthYoY;
    const growthItems: QglpEvidenceAssessment[] = [
      {
        name: 'Top-Line Revenue Trajectory',
        status: revTrajectory?.status === 'ACCELERATING' || revTrajectory?.status === 'GROWING' ? 'SUPPORTED' : revTrajectory?.status === 'STABLE' ? 'PARTIAL' : revTrajectory?.status === 'DECELERATING' || revTrajectory?.status === 'DECLINING' ? 'WARNING' : 'DATA_INSUFFICIENT',
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
    const isFinancialModel = fund?.businessModel === 'BANK' || fund?.businessModel === 'NBFC';
    const isUnknownModel = fund?.businessModel === 'UNKNOWN';
    const debtStatus = fund?.trajectory?.debtTrajectory?.status;

    let longevityStatus: QglpEvidenceAssessment['status'] = 'DATA_INSUFFICIENT';
    let longevityObservation = 'Debt and balance sheet leverage evidence not available in canonical series';
    let longevityEvidence: EvidenceReference[] = [];

    if (fund?.businessModel === 'BANK') {
      longevityStatus = 'NOT_APPLICABLE';
      longevityObservation = 'Capital adequacy assessed under banking prudential norms';
    } else if (fund?.businessModel === 'NBFC') {
      longevityStatus = 'NOT_APPLICABLE';
      longevityObservation = 'Asset-liability maturity & borrowing structure assessed under NBFC prudential norms';
    } else if (isUnknownModel) {
      longevityStatus = 'DATA_INSUFFICIENT';
      longevityObservation = 'Leverage interpretation withheld pending verified business model classification';
    } else if (debtStatus === 'DELEVERAGING') {
      longevityStatus = 'SUPPORTED';
      longevityObservation = 'Historical balance sheet deleveraging supported by debt reduction';
      longevityEvidence = evidenceRefs.slice(0, 1);
    } else if (debtStatus === 'STABLE') {
      longevityStatus = 'PARTIAL';
      longevityObservation = 'Balance sheet leverage stable across reporting periods';
      longevityEvidence = evidenceRefs.slice(0, 1);
    } else if (debtStatus === 'LEVERAGING') {
      longevityStatus = 'WARNING';
      longevityObservation = 'Elevated balance sheet debt expansion observed';
      longevityEvidence = evidenceRefs.slice(0, 1);
    } else {
      longevityStatus = 'DATA_INSUFFICIENT';
      longevityObservation = 'Debt and balance sheet leverage evidence not available in canonical series';
      longevityEvidence = [];
    }

    const longevityItems: QglpEvidenceAssessment[] = [
      {
        name: 'Balance Sheet Solvency & Deleveraging',
        status: longevityStatus,
        observation: longevityObservation,
        evidence: longevityEvidence,
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
    const hasFereFilingEvidence = (fere?.availableFilings?.length ?? 0) > 0 && fereEvidence.length > 0;
    const isFereWorking = fereModuleResult?.status === 'WORKING';

    let riskStatus: QglpEvidenceAssessment['status'] = 'DATA_INSUFFICIENT';
    let riskObservation = 'Forensic risk evidence not available or insufficient for red flag clearance';
    let riskEvidence: EvidenceReference[] = [];

    if (fereWarnings.length > 0) {
      riskStatus = 'WARNING';
      riskObservation = fereWarnings.map(w => w.title).join('; ');
      riskEvidence = fereEvidence.slice(0, 2);
    } else if (isFereWorking && hasFereFilingEvidence) {
      riskStatus = 'NO_RED_FLAG_DETECTED';
      riskObservation = 'No forensic accounting red flags detected in indexed filings';
      riskEvidence = fereEvidence.slice(0, 2);
    } else {
      riskStatus = 'DATA_INSUFFICIENT';
      riskObservation = 'Forensic risk evidence not available or insufficient for red flag clearance';
      riskEvidence = [];
    }

    const riskItems: QglpEvidenceAssessment[] = [
      {
        name: 'Accounting & Auditor Red Flags',
        status: riskStatus,
        observation: riskObservation,
        evidence: riskEvidence,
      },
    ];

    // Build 4 explicit dimensions
    const qItems = [...businessItems, ...mgmtItems];
    const qSupported = qItems.filter(i => i.status === 'SUPPORTED' || i.status === 'NO_RED_FLAG_DETECTED').length;
    const qWarning = qItems.filter(i => i.status === 'WARNING').length;
    const qMissing = qItems.filter(i => i.status === 'DATA_INSUFFICIENT').length;
    const qStatus = qWarning > 0 ? 'WEAK' : qSupported >= 2 ? 'SUPPORTIVE' : qMissing > 2 ? 'MISSING' : 'MIXED';

    const gSupported = growthItems.filter(i => i.status === 'SUPPORTED').length;
    const gWarning = growthItems.filter(i => i.status === 'WARNING').length;
    const gMissing = growthItems.filter(i => i.status === 'DATA_INSUFFICIENT').length;
    const gStatus = gWarning > 0 ? 'WEAK' : gSupported >= 2 ? 'SUPPORTIVE' : gMissing >= 2 ? 'MISSING' : 'MIXED';

    const lSupported = longevityItems.filter(i => i.status === 'SUPPORTED' || i.status === 'NO_RED_FLAG_DETECTED').length;
    // Invariant: Longevity must be MISSING when durability inputs are absent; never default to MODERATE
    const lStatus = lSupported >= 2 ? 'STRONG' : lSupported === 1 ? 'MODERATE' : 'MISSING';

    // Invariant: A single latest P/E observation must NOT produce an interpretive conclusion (ATTRACTIVE/REASONABLE/DEMANDING)
    // without dated valuation history or verified peer comparison context
    const hasHistoricalValuation = (((val as any)?.pe as any)?.historicalSeries?.length ?? 0) >= 3;
    const hasPeerValuation = (((val as any)?.peerComparison as any)?.peers?.length ?? 0) > 0;
    let pStatus = 'MISSING';
    const priceMissingInputs = priceItems.filter(i => i.status === 'DATA_INSUFFICIENT').map(i => i.name);

    if (pe === null || pe === undefined) {
      pStatus = 'MISSING';
    } else if (!hasHistoricalValuation && !hasPeerValuation) {
      pStatus = 'DATA_INSUFFICIENT';
      priceMissingInputs.push('Dated historical valuation series (3Y/5Y)', 'Verified comparable-peer valuation context');
    } else {
      pStatus = pe < 15 ? 'ATTRACTIVE_IF_EARNINGS_HOLD' : pe <= 30 ? 'REASONABLE' : 'DEMANDING';
    }

    const dimensions = {
      quality: {
        dimension: 'QUALITY' as const,
        status: qStatus as any,
        summary: `Quality assessment derived from ${qSupported} supported pillars and ${qWarning} warnings.`,
        evidenceList: qItems.map(i => ({ parameter: i.name, value: i.observation, status: i.status, source: 'QGLP Quality' })),
        missingInputs: qItems.filter(i => i.status === 'DATA_INSUFFICIENT').map(i => i.name),
      },
      growth: {
        dimension: 'GROWTH' as const,
        status: gStatus as any,
        summary: `Growth trajectory assessment derived from ${gSupported} supported metrics and ${gWarning} warnings.`,
        evidenceList: growthItems.map(i => ({ parameter: i.name, value: i.observation, status: i.status, source: 'QGLP Growth' })),
        missingInputs: growthItems.filter(i => i.status === 'DATA_INSUFFICIENT').map(i => i.name),
      },
      longevity: {
        dimension: 'LONGEVITY' as const,
        status: lStatus as any,
        summary: lStatus === 'MISSING'
          ? 'Durability, moat, and competitive positioning evidence absent in canonical filings.'
          : `Longevity assessment reflecting franchise staying power and competitive positioning.`,
        evidenceList: longevityItems.map(i => ({ parameter: i.name, value: i.observation, status: i.status, source: 'QGLP Longevity' })),
        missingInputs: longevityItems.filter(i => i.status === 'DATA_INSUFFICIENT').map(i => i.name),
      },
      price: {
        dimension: 'PRICE' as const,
        status: pStatus as any,
        summary: pe !== null && pe !== undefined
          ? `Reported P/E of ${pe}x.${pStatus === 'DATA_INSUFFICIENT' ? ' Interpretive valuation conclusion withheld pending historical/peer valuation context.' : ''}`
          : 'Valuation multiple unavailable.',
        evidenceList: priceItems.map(i => ({ parameter: i.name, value: i.observation, status: i.status, source: 'QGLP Price' })),
        missingInputs: priceMissingInputs,
      },
    };

    const pBusiness = buildPillar('Quality of Business', businessItems);
    const pMgmt = buildPillar('Quality of Management', mgmtItems);
    const pGrowth = buildPillar('Growth', growthItems);
    const pLongevity = buildPillar('Longevity', longevityItems);
    const pPrice = buildPillar('Price', priceItems);
    const pRisk = buildPillar('Risk', riskItems);

    const payload: QglpPayload = {
      qualityOfBusiness: pBusiness,
      qualityOfManagement: pMgmt,
      growth: pGrowth,
      longevity: pLongevity,
      price: pPrice,
      risk: pRisk,
      pillars: [pBusiness, pMgmt, pGrowth, pLongevity, pPrice, pRisk],
      dimensions,
      dataAsOf: evaluationTimestamp,
    };

    const allItems = [...businessItems, ...mgmtItems, ...growthItems, ...longevityItems, ...priceItems, ...riskItems];
    const supportedCount = allItems.filter(i => i.status === 'SUPPORTED' || i.status === 'NO_RED_FLAG_DETECTED').length;
    const insufficientCount = allItems.filter(i => i.status === 'DATA_INSUFFICIENT').length;

    // Invariant: Truth status != execution status. Missing substantial pillars means PARTIAL truth quality.
    const dataStatus: DataStatus = insufficientCount <= 3 ? 'VERIFIED' : 'PARTIAL';
    const status: ModuleStatus = (supportedCount >= 4 && insufficientCount <= 6) ? 'WORKING' : 'PARTIAL';

    return {
      moduleId: 'QGLP',
      status,
      dataStatus,
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
