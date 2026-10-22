import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { QglpEngine, QglpAssessment, SourceCoverageSummary, EvidenceDriver } from '../engines/QglpEngine.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';

export type AnalysisSection = {
  evidence: EvidenceDriver[];
  rating: string;
};

export type FundamentalAnalysis = {
  symbol: string;
  generatedAt: string;
  evidenceState: 'SUPPORTIVE' | 'MIXED_WATCH' | 'CONCERN' | 'MISSING_CONFLICTING';
  snapshot: string | null;
  qglp: QglpAssessment;
  sections: {
    growth: AnalysisSection;
    profitability: AnalysisSection;
    cashFlow: AnalysisSection;
    balanceSheet: AnalysisSection;
    ownership: AnalysisSection;
    valuation: AnalysisSection;
    qualitative: AnalysisSection;
    risks: AnalysisSection;
  };
  missingData: string[];
  sourcesUsed: SourceCoverageSummary;
};

// Deprecated type to keep backward compatibility just in case, or we rename
export interface FundamentalDossier {
  identity: SecurityIdentity;
  generatedAt: string;
  isComplete: boolean;
  missingData: string[];
  qglpScore: QglpAssessment;
  facts: Record<string, CanonicalFact>;
  analysis?: FundamentalAnalysis;
}

export class FundamentalAnalysisBuilder {
  private static instance: FundamentalAnalysisBuilder;
  private factRepo: CanonicalFactRepository;
  private qglpEngine: QglpEngine;

  private constructor(
    factRepo = CanonicalFactRepository.getInstance(),
    qglpEngine = QglpEngine.getInstance()
  ) {
    this.factRepo = factRepo;
    this.qglpEngine = qglpEngine;
  }

  public static getInstance(): FundamentalAnalysisBuilder {
    if (!FundamentalAnalysisBuilder.instance) {
      FundamentalAnalysisBuilder.instance = new FundamentalAnalysisBuilder();
    }
    return FundamentalAnalysisBuilder.instance;
  }

  private buildSnapshot(qglp: QglpAssessment): string {
    const revDriver = qglp.growth.quantitativeDrivers.find(d => d.metric === 'revenue_growth');
    const patDriver = qglp.growth.quantitativeDrivers.find(d => d.metric === 'pat_growth');
    const cfoPatDriver = qglp.quality.quantitativeDrivers.find(d => d.metric === 'cfo_pat_ratio');
    const pledgeDriver = qglp.longevity.qualitativeDrivers.find(d => d.metric === 'promoter_pledge') || qglp.longevity.risks.find(d => d.metric === 'promoter_pledge');

    const revText = revDriver ? 'Revenue history is available.' : 'Revenue history is missing.';
    const patText = patDriver ? 'PAT history is available.' : 'PAT history is missing.';
    const cfoText = cfoPatDriver ? `CFO/PAT is ${cfoPatDriver.status.toLowerCase()}.` : 'CFO/PAT is missing.';
    const pledgeText = pledgeDriver ? `Promoter pledge is ${pledgeDriver.value}%.` : 'Promoter pledge is missing.';

    return `${revText} ${patText} ${cfoText} ${pledgeText} QGLP status is ${qglp.overallRating}. Evidence state: ${qglp.sourceCoverage.status}.`;
  }

  public async buildDossier(identity: SecurityIdentity, asOfDate?: string): Promise<FundamentalDossier> {
    const latestFacts = await this.factRepo.getLatestFactsByMetric(identity, asOfDate);
    const qglpScore = await this.qglpEngine.evaluate(identity, asOfDate);

    let evidenceState: FundamentalAnalysis['evidenceState'] = 'MISSING_CONFLICTING';
    if (qglpScore.overallRating === 'QGLP_COMPOUNDER' || qglpScore.overallRating === 'QGLP_SUPPORTIVE') {
      evidenceState = 'SUPPORTIVE';
    } else if (qglpScore.overallRating === 'QGLP_MIXED_WATCH') {
      evidenceState = 'MIXED_WATCH';
    } else if (qglpScore.overallRating === 'QGLP_RISKY') {
      evidenceState = 'CONCERN';
    }

    const analysis: FundamentalAnalysis = {
      symbol: identity.nseSymbol || identity.securityId,
      generatedAt: new Date().toISOString(),
      evidenceState,
      snapshot: this.buildSnapshot(qglpScore),
      qglp: qglpScore,
      sections: {
        growth: { evidence: [...qglpScore.growth.quantitativeDrivers], rating: qglpScore.growth.rating },
        profitability: { evidence: [...qglpScore.quality.quantitativeDrivers], rating: qglpScore.quality.rating },
        cashFlow: { evidence: [...qglpScore.quality.quantitativeDrivers.filter(d => d.metric === 'cfo_pat_ratio')], rating: qglpScore.quality.rating },
        balanceSheet: { evidence: [...qglpScore.longevity.quantitativeDrivers], rating: qglpScore.longevity.rating },
        ownership: { evidence: [...qglpScore.longevity.qualitativeDrivers.filter(d => d.metric === 'promoter_pledge')], rating: qglpScore.longevity.rating },
        valuation: { evidence: [...qglpScore.price.quantitativeDrivers], rating: qglpScore.price.rating },
        qualitative: { evidence: [...qglpScore.longevity.qualitativeDrivers], rating: qglpScore.longevity.rating },
        risks: { evidence: [...qglpScore.keyRisks], rating: 'N/A' },
      },
      missingData: qglpScore.missingCriticalInputs,
      sourcesUsed: qglpScore.sourceCoverage
    };

    return {
      identity,
      generatedAt: analysis.generatedAt,
      isComplete: qglpScore.missingCriticalInputs.length === 0,
      missingData: qglpScore.missingCriticalInputs,
      qglpScore,
      facts: latestFacts,
      analysis
    };
  }
}
