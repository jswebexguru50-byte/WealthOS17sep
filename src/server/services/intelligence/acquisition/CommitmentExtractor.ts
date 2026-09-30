/**
 * CommitmentExtractor.ts — Generic Management Commitment Extractor
 * WealthOS V2 Wave B (Live Data and Evidence Ingestion)
 *
 * Extracts forward-looking management commitments from corporate disclosures,
 * presentations, transcripts, and annual reports without company-specific hardcoding.
 */

import crypto from 'crypto';
import { SourceDocument } from '../contracts/SourceDocument.js';
import { ManagementCommitment, CommitmentType } from '../contracts/ManagementContracts.js';
import { EvidenceReference } from '../contracts/Provenance.js';

export interface RawStatementCandidate {
  quote: string;
  speaker?: string;
  pageOrSection?: string;
}

export class CommitmentExtractor {
  private static instance: CommitmentExtractor;
  private constructor() {}

  public static getInstance(): CommitmentExtractor {
    if (!CommitmentExtractor.instance) {
      CommitmentExtractor.instance = new CommitmentExtractor();
    }
    return CommitmentExtractor.instance;
  }

  public extractCommitments(
    doc: SourceDocument,
    statements: RawStatementCandidate[]
  ): ManagementCommitment[] {
    const commitments: ManagementCommitment[] = [];

    for (const stmt of statements) {
      const parsed = this.parseCandidate(doc, stmt);
      if (parsed) {
        commitments.push(parsed);
      }
    }

    return commitments;
  }

  private parseCandidate(
    doc: SourceDocument,
    candidate: RawStatementCandidate
  ): ManagementCommitment | null {
    const text = candidate.quote.trim();
    if (text.length < 15) return null;

    const lower = text.toLowerCase();

    // Look for target periods: FY24, FY25, FY26, FY27, FY28, Q1 FY26, etc.
    let targetPeriod: string | null = null;
    const fyMatch = lower.match(/fy\s*(20)?(2[4-9]|3[0-5])/);
    if (fyMatch) {
      const yr = fyMatch[2];
      targetPeriod = `20${yr}-03-31`;
    }

    let category = 'GENERAL';
    let commitmentType: CommitmentType = 'OTHER';
    let canonicalMetric: string | null = null;
    let targetValue: number | null = null;
    let targetMin: number | null = null;
    let targetMax: number | null = null;
    let targetUnit: string | null = null;

    // Pattern 1: Revenue Target ("target revenue of ₹X cr" or "reach ₹X cr turnover")
    const revMatch = lower.match(/(?:revenue|turnover|sales).*?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(cr|crore|billion)?/);
    if (revMatch && (lower.includes('target') || lower.includes('guidance') || lower.includes('expect') || lower.includes('aim') || lower.includes('reach'))) {
      category = 'REVENUE';
      commitmentType = 'NUMERIC_TARGET';
      canonicalMetric = 'revenue_cr';
      targetValue = parseFloat(revMatch[1].replace(/,/g, ''));
      targetUnit = 'Cr';
    }

    // Pattern 2: Margin Target ("EBITDA margin of 18-20%" or "margin above 18%")
    const marginRangeMatch = lower.match(/(?:ebitda|operating|pat)?\s*margin.*?(?:of|between|at)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:-|to)\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
    const marginSingleMatch = lower.match(/(?:ebitda|operating|pat)?\s*margin.*?(?:of|at|above|exceeding)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/);

    if (marginRangeMatch && (lower.includes('expect') || lower.includes('target') || lower.includes('aim') || lower.includes('guidance') || lower.includes('guide'))) {
      category = 'MARGIN';
      commitmentType = 'RANGE';
      canonicalMetric = lower.includes('pat') ? 'pat_margin_pct' : 'ebitda_margin_pct';
      targetMin = parseFloat(marginRangeMatch[1]);
      targetMax = parseFloat(marginRangeMatch[2]);
      targetUnit = '%';
    } else if (marginSingleMatch && (lower.includes('expect') || lower.includes('target') || lower.includes('aim') || lower.includes('guidance') || lower.includes('guide'))) {
      category = 'MARGIN';
      commitmentType = 'NUMERIC_TARGET';
      canonicalMetric = lower.includes('pat') ? 'pat_margin_pct' : 'ebitda_margin_pct';
      targetValue = parseFloat(marginSingleMatch[1]);
      targetUnit = '%';
    }

    // Pattern 3: Capex Plan ("capex of ₹X cr over X years")
    const capexMatch = lower.match(/capex.*?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(cr|crore)?/);
    if (capexMatch && (lower.includes('plan') || lower.includes('invest') || lower.includes('outlay') || lower.includes('committed'))) {
      category = 'CAPEX';
      commitmentType = 'CAPITAL_ALLOCATION';
      canonicalMetric = 'capex_cr';
      targetValue = parseFloat(capexMatch[1].replace(/,/g, ''));
      targetUnit = 'Cr';
    }

    // Pattern 4: Capacity Expansion ("capacity expansion to X MT / MW / units")
    const capacityMatch = lower.match(/capacity.*?(?:to|reach|of)\s*([0-9,]+(?:\.[0-9]+)?)\s*(mt|mw|tpa|gw|units|tonnes|kl)?/);
    if (capacityMatch && (lower.includes('expand') || lower.includes('reach') || lower.includes('commission') || lower.includes('target'))) {
      category = 'CAPACITY';
      commitmentType = 'PROJECT';
      canonicalMetric = 'capacity_mt';
      targetValue = parseFloat(capacityMatch[1].replace(/,/g, ''));
      targetUnit = capacityMatch[2] ? capacityMatch[2].toUpperCase() : 'Units';
    }

    // Pattern 5: Deleveraging ("net debt free by FY26" or "reduce debt to X cr")
    if (lower.includes('debt free') || lower.includes('zero net debt')) {
      category = 'DELEVERAGING';
      commitmentType = 'NUMERIC_TARGET';
      canonicalMetric = 'net_debt_cr';
      targetValue = 0;
      targetUnit = 'Cr';
    }

    // If no forward-looking commitment structure was identified, return null
    if (category === 'GENERAL') {
      return null;
    }

    // Deterministic commitment ID: SHA256 of securityId + statementDate + quote
    const idPreimage = `${doc.securityId}|${doc.publishedAt}|${text}`;
    const commitmentId = `comm_${crypto.createHash('sha256').update(idPreimage).digest('hex').substring(0, 16)}`;

    const sourceRef: EvidenceReference = {
      evidenceId: `ev_${commitmentId}`,
      sourceId: doc.documentId,
      documentId: doc.documentId,
      sourceType: doc.sourceType === 'INVESTOR_PRESENTATION' ? 'INVESTOR_PRESENTATION' : 'EXCHANGE_FILING',
      timestamp: doc.publishedAt,
      asOfDate: doc.publishedAt,
      uri: doc.sourceUrl || undefined,
      notes: `${doc.title} (${doc.sourceAuthority})`,
    };

    return {
      commitmentId,
      securityId: doc.securityId,
      statementDate: doc.publishedAt,
      speaker: candidate.speaker || 'Management',
      source: sourceRef,
      originalStatement: text,
      category,
      commitmentType,
      targetValue,
      targetMin,
      targetMax,
      targetUnit,
      targetPeriod,
      status: 'NOT_YET_DUE',
      metricMapping: canonicalMetric
        ? {
            extractedMetric: category.toLowerCase(),
            canonicalMetric,
            comparisonType: commitmentType === 'RANGE' ? 'RANGE' : 'LEVEL',
            targetMin,
            targetMax,
            targetDate: targetPeriod,
            confidence: 'HIGH',
          }
        : null,
      actualEvidence: [],
      evaluationExplanation: `Extracted forward-looking statement for ${category} target targeting ${targetPeriod || 'future period'}`,
    };
  }
}
