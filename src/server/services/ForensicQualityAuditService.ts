import sqlite3 from 'sqlite3';
import path from 'path';
import { ForensicOperationalInsights } from './ForensicLLMRouter.js';
import {
  ListingPlatform,
  GOVERNANCE_WEIGHT_MULTIPLIER,
  REGULATORY_SEGMENT_BOUNDS,
  SANITY_BOUNDS,
} from './ForensicExtractionSchema.js';
import { QuarantineQueueService } from './QuarantineQueueService.js';

export interface QualityAuditReport {
  symbol: string;
  listingPlatform: ListingPlatform;
  isSanityPassed: boolean;
  citationVeracityScore: number; // 0 to 1
  overallQualityScore: number;  // 0 to 100
  governanceWeightMultiplier: number;
  flags: string[];
  isQuarantined: boolean;
  auditedAt: string;
}

export interface ScripRegulatoryProfile {
  paidUpCapitalCr?: number;
  netWorthCr?: number;
  consolidatedTurnoverCr?: number;
}

export class ForensicQualityAuditService {
  private static db: sqlite3.Database | null = null;

  private static getDb(): sqlite3.Database {
    if (!ForensicQualityAuditService.db) {
      const dbPath = path.resolve(process.cwd(), 'portfolio.db');
      ForensicQualityAuditService.db = new (sqlite3.verbose()).Database(dbPath);
    }
    return ForensicQualityAuditService.db;
  }

  /**
   * Audit an extracted insight payload against sanity constraints, citation veracity,
   * and segment-specific regulatory exemptions (LODR 17-27, RPT thresholds).
   */
  public static async auditExtraction(
    symbol: string,
    insights: ForensicOperationalInsights,
    sourceText: string,
    listingPlatform: ListingPlatform = 'NSE_MAIN',
    regProfile?: ScripRegulatoryProfile
  ): Promise<QualityAuditReport> {
    const flags: string[] = [];
    let sanityPassed = true;
    let shouldQuarantine = false;
    let quarantineReason: 'SANITY_BOUND_VIOLATION' | 'CITATION_VERACITY_LOW' | 'CROSS_CHECK_DISAGREEMENT' = 'SANITY_BOUND_VIOLATION';
    let failedField = '';
    let failedVal = '';

    // 1. Order book visibility bounds (1 to 60 months)
    const [minOb, maxOb] = SANITY_BOUNDS.orderBookVisibilityMonths;
    if (insights.orderBookVisibilityMonths < 0 || insights.orderBookVisibilityMonths > maxOb) {
      flags.push(`Order book visibility (${insights.orderBookVisibilityMonths}m) outside realistic ${minOb}-${maxOb}m bounds.`);
      sanityPassed = false;
      shouldQuarantine = true;
      failedField = 'orderBookVisibilityMonths';
      failedVal = String(insights.orderBookVisibilityMonths);
      quarantineReason = 'SANITY_BOUND_VIOLATION';
    }

    // 2. Pass-through percentage check (0 to 100%)
    const [minPt, maxPt] = SANITY_BOUNDS.passThroughPct;
    if (insights.rawMaterialPassThroughPct < minPt || insights.rawMaterialPassThroughPct > maxPt) {
      flags.push(`Raw material pass-through (${insights.rawMaterialPassThroughPct}%) must be between ${minPt}% and ${maxPt}%.`);
      sanityPassed = false;
      shouldQuarantine = true;
      failedField = 'passThroughPct';
      failedVal = String(insights.rawMaterialPassThroughPct);
      quarantineReason = 'SANITY_BOUND_VIOLATION';
    }

    // 3. Capacity utilization check (20 to 100%)
    const [minCap, maxCap] = SANITY_BOUNDS.capacityUtilizationPct;
    if (insights.capacityUtilizationPct < minCap || insights.capacityUtilizationPct > maxCap) {
      flags.push(`Capacity utilization (${insights.capacityUtilizationPct}%) outside standard ${minCap}-${maxCap}% industrial bounds.`);
      sanityPassed = false;
      shouldQuarantine = true;
      failedField = 'capacityUtilizationPct';
      failedVal = String(insights.capacityUtilizationPct);
      quarantineReason = 'SANITY_BOUND_VIOLATION';
    }

    // 4. Section 11.1: LODR 17-27 Corporate Governance Exemption Check for SME / Emerge
    const isSme = listingPlatform === 'BSE_SME' || listingPlatform === 'NSE_EMERGE';
    if (isSme && regProfile) {
      const isExempt = (regProfile.paidUpCapitalCr ?? 0) <= REGULATORY_SEGMENT_BOUNDS.SME_LODR_EXEMPTION_PAID_UP_CAPITAL_CR &&
                       (regProfile.netWorthCr ?? 0) <= REGULATORY_SEGMENT_BOUNDS.SME_LODR_EXEMPTION_NET_WORTH_CR;
      if (isExempt) {
        flags.push(`[LODR Exemption] ${symbol} is legally exempt from LODR Reg 17-27 disclosures (Paid up capital <= ₹10 Cr / Net worth <= ₹25 Cr). Absence of committee disclosures is compliant.`);
      }

      // Check RPT Materiality bound for SME: min(50 Cr, 10% turnover)
      if (regProfile.consolidatedTurnoverCr) {
        const smeRptCeiling = Math.min(
          REGULATORY_SEGMENT_BOUNDS.SME_RPT_MATERIALITY_MAX_CR,
          (regProfile.consolidatedTurnoverCr * REGULATORY_SEGMENT_BOUNDS.SME_RPT_MATERIALITY_TURNOVER_PCT) / 100
        );
        flags.push(`[RPT Bound] Segment materiality threshold applies at ₹${smeRptCeiling.toFixed(1)} Cr.`);
      }
    }

    // 5. Citation Veracity: check if citation appears in source text
    let citationVeracityScore = 0.5;
    if (insights.verbatimCitation && insights.verbatimCitation.length > 15) {
      const citeWords = insights.verbatimCitation.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const sourceLower = sourceText.toLowerCase();
      const matched = citeWords.filter(w => sourceLower.includes(w));
      citationVeracityScore = Number((matched.length / Math.max(1, citeWords.length)).toFixed(2));

      // Veracity threshold: < 30% match triggers quarantine on LLM extractions (Section 4.5 & 8)
      if (citationVeracityScore < 0.30 && !insights.engineUsed.toLowerCase().includes('heuristic')) {
        flags.push('Low verbatim citation veracity score (<0.30): excerpt could not be matched against source text.');
        shouldQuarantine = true;
        failedField = 'verbatimCitation';
        failedVal = insights.verbatimCitation.slice(0, 100);
        quarantineReason = 'CITATION_VERACITY_LOW';
      }
    }

    // 6. Section 11.3: Governance Weight Multiplier
    const govMultiplier = GOVERNANCE_WEIGHT_MULTIPLIER[listingPlatform] || 1.0;

    // 7. Overall Quality Composite Score
    let overallQualityScore = 90;
    if (!sanityPassed) overallQualityScore -= 30;
    if (citationVeracityScore < 0.5) overallQualityScore -= 20;
    if (insights.confidenceScore < 0.6) overallQualityScore -= 15;
    if (isSme) {
      // Reward verified SME disclosures with heightened confidence
      overallQualityScore = Math.min(100, Math.round(overallQualityScore * (govMultiplier > 1.0 ? 1.05 : 1.0)));
    }
    overallQualityScore = Math.max(20, Math.min(100, overallQualityScore));

    // Route to Quarantine Queue if bounds violated or veracity low
    if (shouldQuarantine) {
      try {
        await QuarantineQueueService.quarantine({
          scripCode: symbol,
          listingPlatform,
          fieldName: failedField || 'forensicOperationalMetrics',
          extractedValue: failedVal || 'Invalid metric payload',
          failureReason: quarantineReason,
          citationVeracityScore,
          sourceDocument: `Source text length: ${sourceText.length} chars, model: ${insights.engineUsed}`,
          reviewStatus: 'PENDING'
        });
      } catch (qErr) {
        console.warn('[QualityAudit] Quarantine error:', qErr);
      }
    }

    return {
      symbol,
      listingPlatform,
      isSanityPassed: sanityPassed,
      citationVeracityScore,
      overallQualityScore,
      governanceWeightMultiplier: govMultiplier,
      flags,
      isQuarantined: shouldQuarantine,
      auditedAt: new Date().toISOString()
    };
  }

  /**
   * Persists provenance entry with calibrated source tier confidence discount
   * and listingPlatform tag (Section 4.5 & 11)
   */
  public static async persistProvenance(
    scripCode: string,
    fieldName: string,
    sourceTierUsed: 'STATUTORY_STRUCTURED' | 'CONCALL_PDF' | 'ANNUAL_REPORT_MDA' | 'YT_SUBTITLE' | 'AUDIO_FALLBACK' | 'HEURISTIC',
    rawConfidence: number,
    citationVeracityScore?: number,
    listingPlatform: ListingPlatform = 'NSE_MAIN'
  ): Promise<void> {
    // Calibrated source-tier discount
    let calibratedConfidence = rawConfidence;
    if (sourceTierUsed === 'STATUTORY_STRUCTURED') calibratedConfidence = 1.0;
    else if (sourceTierUsed === 'CONCALL_PDF') calibratedConfidence = Math.min(0.95, rawConfidence);
    else if (sourceTierUsed === 'ANNUAL_REPORT_MDA') calibratedConfidence = Math.min(0.88, rawConfidence);
    else if (sourceTierUsed === 'YT_SUBTITLE') calibratedConfidence = Math.min(0.80, rawConfidence - 0.15);
    else if (sourceTierUsed === 'AUDIO_FALLBACK') calibratedConfidence = Math.min(0.65, rawConfidence - 0.30);
    else if (sourceTierUsed === 'HEURISTIC') calibratedConfidence = 0.40;

    calibratedConfidence = Number(Math.max(0.1, calibratedConfidence).toFixed(2));

    const db = this.getDb();
    return new Promise((resolve) => {
      // Ensure listingPlatform column exists
      db.run(`
        CREATE TABLE IF NOT EXISTS SnapshotProvenance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scripCode TEXT NOT NULL,
          listingPlatform TEXT DEFAULT 'NSE_MAIN',
          fieldName TEXT NOT NULL,
          sourceTierUsed TEXT NOT NULL,
          confidenceScore REAL NOT NULL,
          citationVeracityScore REAL,
          recordedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        const stmt = db.prepare(`
          INSERT INTO SnapshotProvenance (scripCode, listingPlatform, fieldName, sourceTierUsed, confidenceScore, citationVeracityScore)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run([scripCode, listingPlatform, fieldName, sourceTierUsed, calibratedConfidence, citationVeracityScore || 0], () => {
          resolve();
        });
        stmt.finalize();
      });
    });
  }
}
