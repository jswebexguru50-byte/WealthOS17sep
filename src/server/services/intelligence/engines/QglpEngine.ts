import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';
import { QualitativeEvidenceExtractor } from '../qualitative/QualitativeEvidenceExtractor.js';
import { QualitativeSignalClassifier, QualitativeSignal } from '../qualitative/QualitativeSignalClassifier.js';
import { QglpScoringRules } from './QglpScoringRules.js';

export type EvidenceDriver = {
  metric: string;
  value: number | string | boolean | null;
  description: string;
  status: 'SUPPORTIVE' | 'NEGATIVE' | 'MIXED' | 'MISSING';
  sourceFactId?: string | null;
  sourceEventId?: string | null;
  sourceDocumentId?: string | null;
  provider?: string | null;
  evidenceDate?: string | null;
};

export type QglpPillar = {
  score: number | null;
  maxScore: number;
  rating: string;
  quantitativeDrivers: EvidenceDriver[];
  qualitativeDrivers: EvidenceDriver[];
  risks: EvidenceDriver[];
  missingInputs: string[];
};

export type SourceCoverageSummary = {
  status: 'AVAILABLE' | 'PARTIAL' | 'NOT_COMPUTED';
  fereFactsUsed: number;
  trendlyneFactsUsed: number;
  appDbFactsUsed: number;
  qualitativeEventsUsed: number;
  documentsUsed: number;
  totalEvidenceItemsUsed: number;
  missingEvidenceTypes: string[];
};

export type QglpAssessment = {
  symbol: string;
  asOf: string;

  quality: QglpPillar;
  growth: QglpPillar;
  longevity: QglpPillar;
  price: QglpPillar;

  overallScore: number | null;
  overallRating:
    | 'QGLP_COMPOUNDER'
    | 'QGLP_SUPPORTIVE'
    | 'QGLP_MIXED_WATCH'
    | 'QGLP_CYCLICAL'
    | 'QGLP_RISKY'
    | 'INSUFFICIENT_DATA';

  decisionUse:
    | 'CAN_SUPPORT_INVESTMENT_THESIS'
    | 'WATCHLIST_ONLY'
    | 'TECHNICAL_ONLY'
    | 'REJECT_UNTIL_DATA_IMPROVES'
    | 'INSUFFICIENT_DATA';

  keyStrengths: EvidenceDriver[];
  keyRisks: EvidenceDriver[];
  whatToWatchNext: EvidenceDriver[];
  missingCriticalInputs: string[];
  sourceCoverage: SourceCoverageSummary;
};

export class QglpEngine {
  private static instance: QglpEngine;
  private factRepo: CanonicalFactRepository;
  private qualExtractor: QualitativeEvidenceExtractor;
  private qualClassifier: QualitativeSignalClassifier;

  private constructor(
    factRepo = CanonicalFactRepository.getInstance(),
    qualExtractor = QualitativeEvidenceExtractor.getInstance(),
    qualClassifier = new QualitativeSignalClassifier()
  ) {
    this.factRepo = factRepo;
    this.qualExtractor = qualExtractor;
    this.qualClassifier = qualClassifier;
  }

  public static getInstance(): QglpEngine {
    if (!QglpEngine.instance) {
      QglpEngine.instance = new QglpEngine();
    }
    return QglpEngine.instance;
  }

  private getFact(facts: Record<string, CanonicalFact>, aliases: string[]): CanonicalFact | undefined {
    for (const alias of aliases) {
      if (facts[alias] !== undefined) return facts[alias];
    }
    return undefined;
  }

  public async evaluate(identity: SecurityIdentity, asOfDate?: string): Promise<QglpAssessment> {
    const latestFacts = await this.factRepo.getLatestFactsByMetric(identity, asOfDate);
    const qualBundle = await this.qualExtractor.extract(identity, asOfDate);

    const governanceSignals: QualitativeSignal[] = [];
    for (const ev of qualBundle.governanceEvents) {
      const sig = this.qualClassifier.classify(ev);
      if (sig) governanceSignals.push(sig);
    }
    for (const ev of qualBundle.insiderDealEvents) {
      const sig = this.qualClassifier.classify(ev);
      if (sig) governanceSignals.push(sig);
    }

    const sectorSignals: QualitativeSignal[] = [];
    if (qualBundle.sectorContext) {
      const sig = this.qualClassifier.classify(qualBundle.sectorContext);
      if (sig) sectorSignals.push(sig);
    }

    const bizDescSignals: QualitativeSignal[] = [];
    if (qualBundle.businessDescription) {
      const sig = this.qualClassifier.classify(qualBundle.businessDescription);
      if (sig) bizDescSignals.push(sig);
    }

    const mgtSignals: QualitativeSignal[] = [];
    for (const ev of qualBundle.managementEvents) {
      const sig = this.qualClassifier.classify(ev);
      if (sig) mgtSignals.push(sig);
    }

    const debtSignals: QualitativeSignal[] = [];
    for (const ev of qualBundle.creditDebtEvents) {
      const sig = this.qualClassifier.classify(ev);
      if (sig) debtSignals.push(sig);
    }

    const pledgeFact = this.getFact(latestFacts, ['promoter_pledge', 'promoter_pledge_pct']);
    const pledgeSignals: QualitativeSignal[] = [];
    if (pledgeFact && typeof pledgeFact.value === 'number') {
      pledgeSignals.push(this.qualClassifier.classifyPromoterPledge(pledgeFact.value, {
        id: pledgeFact.factId,
        category: 'GOVERNANCE_EVENT',
        text: `Promoter pledge is ${pledgeFact.value}%`,
        eventDate: pledgeFact.periodEnd || pledgeFact.publishedAt || null,
        provider: pledgeFact.sourceId || 'UNKNOWN',
        sourceDocumentId: pledgeFact.sourceId || null
      }));
    }

    // Build Pillars
    const quality = QglpScoringRules.calculateQuality(
      this.getFact(latestFacts, ['roe', 'roe_reported', 'roe_pct']),
      this.getFact(latestFacts, ['cfo_pat_ratio']),
      this.getFact(latestFacts, ['debt_to_equity', 'debt_to_equity_reported']),
      this.getFact(latestFacts, ['fcf_pat_ratio', 'fcf_margin']),
      governanceSignals
    );

    const revHistory = await this.factRepo.getHistoricalSeries(identity, 'revenue', asOfDate);
    const patHistory = await this.factRepo.getHistoricalSeries(identity, 'pat', asOfDate);

    let revGrFact: CanonicalFact | undefined;
    if (revHistory.length >= 2) {
      const latest = revHistory[revHistory.length - 1];
      const prev = revHistory[revHistory.length - 2];
      if (typeof latest.value === 'number' && typeof prev.value === 'number' && prev.value > 0) {
        revGrFact = { ...latest, value: ((latest.value - prev.value) / prev.value) * 100 };
      }
    }

    let patGrFact: CanonicalFact | undefined;
    if (patHistory.length >= 2) {
      const latest = patHistory[patHistory.length - 1];
      const prev = patHistory[patHistory.length - 2];
      if (typeof latest.value === 'number' && typeof prev.value === 'number' && prev.value > 0) {
        patGrFact = { ...latest, value: ((latest.value - prev.value) / prev.value) * 100 };
      }
    }

    const growth = QglpScoringRules.calculateGrowth(
      revGrFact,
      patGrFact,
      this.getFact(latestFacts, ['margin_expansion']),
      sectorSignals,
      this.getFact(latestFacts, ['capex'])
    );

    const longevity = QglpScoringRules.calculateLongevity(
      [], 
      bizDescSignals,
      mgtSignals,
      debtSignals,
      pledgeSignals
    );

    const price = QglpScoringRules.calculatePrice(
      this.getFact(latestFacts, ['pe', 'pe_ratio', 'pe_ttm']),
      this.getFact(latestFacts, ['peg', 'peg_ratio']),
      this.getFact(latestFacts, ['pb', 'pb_ratio']),
      this.getFact(latestFacts, ['fcf_yield']),
      (latestFacts['market_cap_category']?.value as string) || undefined
    );

    const missingCriticalInputs = [
      ...quality.missingInputs,
      ...growth.missingInputs,
      ...longevity.missingInputs,
      ...price.missingInputs
    ];

    let overallScore: number | null = null;
    let overallRating: QglpAssessment['overallRating'] = 'INSUFFICIENT_DATA';
    let decisionUse: QglpAssessment['decisionUse'] = 'INSUFFICIENT_DATA';

    if (quality.score !== null && growth.score !== null && longevity.score !== null && price.score !== null) {
      overallScore = quality.score + growth.score + longevity.score + price.score;
      if (overallScore >= 80) {
        overallRating = 'QGLP_COMPOUNDER';
        decisionUse = 'CAN_SUPPORT_INVESTMENT_THESIS';
      } else if (overallScore >= 60) {
        overallRating = 'QGLP_SUPPORTIVE';
        decisionUse = 'CAN_SUPPORT_INVESTMENT_THESIS';
      } else if (overallScore >= 40) {
        overallRating = 'QGLP_MIXED_WATCH';
        decisionUse = 'WATCHLIST_ONLY';
      } else {
        overallRating = 'QGLP_RISKY';
        decisionUse = 'REJECT_UNTIL_DATA_IMPROVES';
      }
    } else if (missingCriticalInputs.length > 0) {
        overallRating = 'INSUFFICIENT_DATA';
        decisionUse = 'INSUFFICIENT_DATA';
    }

    const allDrivers = [
      ...quality.quantitativeDrivers, ...quality.qualitativeDrivers, ...quality.risks,
      ...growth.quantitativeDrivers, ...growth.qualitativeDrivers, ...growth.risks,
      ...longevity.quantitativeDrivers, ...longevity.qualitativeDrivers, ...longevity.risks,
      ...price.quantitativeDrivers, ...price.qualitativeDrivers, ...price.risks
    ];

    const keyStrengths = allDrivers.filter(d => d.status === 'SUPPORTIVE');
    const keyRisks = allDrivers.filter(d => d.status === 'NEGATIVE');
    const whatToWatchNext = allDrivers.filter(d => d.status === 'MIXED');

    const usedDrivers = allDrivers.filter(d => d.status !== 'MISSING');
    let fereFactsUsed = 0;
    let trendlyneFactsUsed = 0;
    let appDbFactsUsed = 0;
    let qualitativeEventsUsed = 0;
    let documentsUsed = qualBundle.documentEvidence.length;

    for (const d of usedDrivers) {
      const p = String(d.provider || '').toUpperCase();
      if (p.includes('FERE')) fereFactsUsed++;
      else if (p.includes('TRENDLYNE')) trendlyneFactsUsed++;
      else if (p.includes('APP_DB')) appDbFactsUsed++;
      if (d.sourceEventId) qualitativeEventsUsed++;
    }

    const sourceCoverage: SourceCoverageSummary = {
      status: usedDrivers.length >= 6 ? 'AVAILABLE' : (usedDrivers.length > 0 ? 'PARTIAL' : 'NOT_COMPUTED'),
      fereFactsUsed,
      trendlyneFactsUsed,
      appDbFactsUsed,
      qualitativeEventsUsed,
      documentsUsed,
      totalEvidenceItemsUsed: usedDrivers.length,
      missingEvidenceTypes: missingCriticalInputs,
    };

    return {
      symbol: identity.nseSymbol || identity.securityId,
      asOf: asOfDate || new Date().toISOString(),
      quality,
      growth,
      longevity,
      price,
      overallScore,
      overallRating,
      decisionUse,
      keyStrengths,
      keyRisks,
      whatToWatchNext,
      missingCriticalInputs,
      sourceCoverage
    };
  }
}
