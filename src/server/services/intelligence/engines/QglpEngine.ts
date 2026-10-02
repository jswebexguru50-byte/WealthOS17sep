import { CanonicalFactRepository } from '../core/CanonicalFactRepository.js';
import { SecurityIdentity } from '../contracts/SecurityIdentity.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';

export interface EvidenceDriver {
  metric: string;
  value: number | string | null;
  description: string;
}

export interface SourceCoverageSummary {
  ferePct: number;
  trendlynePct: number;
  appDbPct: number;
}

export type QglpQuality = {
  score: number | null;
  rating: 'EXCELLENT' | 'GOOD' | 'MIXED' | 'WEAK' | 'INSUFFICIENT_DATA';
  quantitativeDrivers: EvidenceDriver[];
  qualitativeDrivers: EvidenceDriver[];
  concerns: EvidenceDriver[];
  missingInputs: string[];
};

export type QglpGrowth = {
  score: number | null;
  rating: 'HIGH_GROWTH' | 'STEADY_GROWTH' | 'CYCLICAL' | 'DECLINING' | 'INSUFFICIENT_DATA';
  drivers: EvidenceDriver[];
  risks: EvidenceDriver[];
  missingInputs: string[];
};

export type QglpLongevity = {
  score: number | null;
  rating: 'DURABLE' | 'MODERATE' | 'CYCLICAL' | 'FRAGILE' | 'INSUFFICIENT_DATA';
  moatEvidence: EvidenceDriver[];
  fragilityEvidence: EvidenceDriver[];
  missingInputs: string[];
};

export type QglpPrice = {
  score: number | null;
  rating: 'ATTRACTIVE' | 'FAIR' | 'EXPENSIVE' | 'AVOID_ON_VALUATION' | 'INSUFFICIENT_DATA';
  valuationEvidence: EvidenceDriver[];
  peerContext: EvidenceDriver[];
  missingInputs: string[];
};

export type QglpAssessment = {
  symbol: string;
  asOf: string;

  quality: QglpQuality;
  growth: QglpGrowth;
  longevity: QglpLongevity;
  price: QglpPrice;

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

  private constructor(factRepo = CanonicalFactRepository.getInstance()) {
    this.factRepo = factRepo;
  }

  public static getInstance(): QglpEngine {
    if (!QglpEngine.instance) {
      QglpEngine.instance = new QglpEngine();
    }
    return QglpEngine.instance;
  }
  
  private numberValue(fact: CanonicalFact | undefined | null): number | null {
    if (!fact) return null;
    if (typeof fact.value === 'number' && Number.isFinite(fact.value)) {
      return fact.value;
    }
    return null;
  }

  private getFact(facts: Record<string, CanonicalFact>, aliases: string[]): CanonicalFact | undefined {
    for (const alias of aliases) {
      if (facts[alias] !== undefined) return facts[alias];
    }
    return undefined;
  }

  public async evaluate(identity: SecurityIdentity, asOfDate?: string): Promise<QglpAssessment> {
    const latestFacts = await this.factRepo.getLatestFactsByMetric(identity, asOfDate);
    const missingCriticalInputs: string[] = [];
    const strengths: EvidenceDriver[] = [];
    const risks: EvidenceDriver[] = [];
    const watchNext: EvidenceDriver[] = [];

    // QUALITY
    const quality: QglpQuality = {
      score: null, rating: 'INSUFFICIENT_DATA', quantitativeDrivers: [], qualitativeDrivers: [], concerns: [], missingInputs: []
    };
    const roe = this.numberValue(this.getFact(latestFacts, ['roe', 'roe_reported', 'roe_pct']));
    const deFact = this.getFact(latestFacts, ['debt_to_equity', 'debt_to_equity_reported']);
    const de = this.numberValue(deFact);
    const cfo_pat = this.numberValue(this.getFact(latestFacts, ['cfo_pat_ratio']));
    
    let qPoints = 0;
    if (roe !== null) {
      quality.quantitativeDrivers.push({ metric: 'roe', value: roe, description: 'Return on Equity' });
      if (roe > 20) qPoints += 10;
      else if (roe > 15) qPoints += 7;
      else if (roe > 10) qPoints += 4;
    } else {
      quality.missingInputs.push('roe');
    }

    if (de !== null) {
      quality.quantitativeDrivers.push({ metric: 'debt_to_equity', value: de, description: 'Debt to Equity' });
      if (de < 0.2) qPoints += 10;
      else if (de < 0.5) qPoints += 7;
      else if (de < 1.0) qPoints += 4;
      else quality.concerns.push({ metric: 'debt_to_equity', value: de, description: 'High debt to equity ratio' });
    } else {
      quality.missingInputs.push('debt_to_equity');
    }

    if (cfo_pat !== null) {
      quality.quantitativeDrivers.push({ metric: 'cfo_pat_ratio', value: cfo_pat, description: 'Cash Flow to PAT' });
      if (cfo_pat > 1.0) qPoints += 10;
      else if (cfo_pat > 0.8) qPoints += 7;
      else if (cfo_pat > 0.5) qPoints += 4;
    } else {
      quality.missingInputs.push('cfo_pat_ratio');
    }

    if (roe !== null && de !== null && cfo_pat !== null) {
      quality.score = qPoints;
      if (qPoints >= 25) quality.rating = 'EXCELLENT';
      else if (qPoints >= 18) quality.rating = 'GOOD';
      else if (qPoints >= 10) quality.rating = 'MIXED';
      else quality.rating = 'WEAK';
    }

    // GROWTH
    const growth: QglpGrowth = {
      score: null, rating: 'INSUFFICIENT_DATA', drivers: [], risks: [], missingInputs: []
    };
    const revHistory = await this.factRepo.getHistoricalSeries(identity, 'revenue', asOfDate);
    const patHistory = await this.factRepo.getHistoricalSeries(identity, 'pat', asOfDate);
    
    let gPoints = 0;
    if (revHistory.length >= 2) {
      const latest = this.numberValue(revHistory[revHistory.length - 1]);
      const prev = this.numberValue(revHistory[revHistory.length - 2]);
      if (latest !== null && prev !== null && prev > 0) {
        const gr = ((latest - prev) / prev) * 100;
        growth.drivers.push({ metric: 'revenue_growth', value: gr, description: 'Revenue Growth' });
        if (gr > 15) gPoints += 10;
        else if (gr > 10) gPoints += 7;
        else if (gr > 5) gPoints += 4;
        else if (gr < 0) growth.risks.push({ metric: 'revenue_growth', value: gr, description: 'Negative revenue growth' });
      }
    } else {
      growth.missingInputs.push('revenue_history');
    }

    if (patHistory.length >= 2) {
      const latest = this.numberValue(patHistory[patHistory.length - 1]);
      const prev = this.numberValue(patHistory[patHistory.length - 2]);
      if (latest !== null && prev !== null && prev > 0) {
        const gr = ((latest - prev) / prev) * 100;
        growth.drivers.push({ metric: 'pat_growth', value: gr, description: 'PAT Growth' });
        if (gr > 20) gPoints += 20;
        else if (gr > 15) gPoints += 15;
        else if (gr > 10) gPoints += 10;
        else if (gr > 5) gPoints += 5;
        else if (gr < 0) growth.risks.push({ metric: 'pat_growth', value: gr, description: 'Negative PAT growth' });
      }
    } else {
      growth.missingInputs.push('pat_history');
    }

    if (revHistory.length >= 2 && patHistory.length >= 2) {
      growth.score = gPoints;
      if (gPoints >= 25) growth.rating = 'HIGH_GROWTH';
      else if (gPoints >= 15) growth.rating = 'STEADY_GROWTH';
      else if (gPoints > 0) growth.rating = 'CYCLICAL';
      else growth.rating = 'DECLINING';
    }

    // LONGEVITY
    const longevity: QglpLongevity = {
      score: null, rating: 'INSUFFICIENT_DATA', moatEvidence: [], fragilityEvidence: [], missingInputs: []
    };
    let lPoints = 0;
    const pledgeFact = this.getFact(latestFacts, ['promoter_pledge', 'promoter_pledge_pct']);
    const pledge = this.numberValue(pledgeFact);
    
    if (pledge !== null) {
      longevity.moatEvidence.push({ metric: 'promoter_pledge', value: pledge, description: 'Promoter Pledge' });
      if (pledge === 0) lPoints += 5;
      else if (pledge < 5) lPoints += 3;
      else if (pledge < 15) lPoints += 1;
      else longevity.fragilityEvidence.push({ metric: 'promoter_pledge', value: pledge, description: 'High promoter pledge' });
    } else {
      longevity.missingInputs.push('promoter_pledge');
    }
    
    const mgtChanges = this.getFact(latestFacts, ['management_changes']);
    const creditDebt = this.getFact(latestFacts, ['credit_debt_events']);
    const bizDesc = this.getFact(latestFacts, ['business_description']);

    if (mgtChanges && typeof mgtChanges.value === 'string' && mgtChanges.value.trim() !== '') {
      longevity.fragilityEvidence.push({ metric: 'management_changes', value: mgtChanges.value, description: 'Management Changes' });
    } else if (!mgtChanges) {
      longevity.missingInputs.push('management_changes');
    }

    if (creditDebt && typeof creditDebt.value === 'string' && creditDebt.value.trim() !== '') {
      longevity.fragilityEvidence.push({ metric: 'credit_debt_events', value: creditDebt.value, description: 'Credit/Debt Events' });
    } else if (!creditDebt) {
      longevity.missingInputs.push('credit_debt_events');
    }

    if (bizDesc && typeof bizDesc.value === 'string' && bizDesc.value.trim() !== '') {
      longevity.moatEvidence.push({ metric: 'business_description', value: bizDesc.value, description: 'Business Description' });
    } else if (!bizDesc) {
      longevity.missingInputs.push('business_description');
    }

    if (pledge !== null) {
       if (longevity.missingInputs.includes('management_changes') || longevity.missingInputs.includes('credit_debt_events') || longevity.missingInputs.includes('business_description')) {
         longevity.rating = 'INSUFFICIENT_DATA';
         longevity.score = null;
       } else {
         // Qualitative scoring requires proper semantic review; leaving score null if missing qualitative rules
         longevity.score = lPoints; 
         if (longevity.score >= 18) longevity.rating = 'DURABLE';
         else if (longevity.score >= 12) longevity.rating = 'MODERATE';
         else if (longevity.score >= 5) longevity.rating = 'CYCLICAL';
         else longevity.rating = 'FRAGILE';
       }
    }

    // PRICE
    const price: QglpPrice = {
      score: null, rating: 'INSUFFICIENT_DATA', valuationEvidence: [], peerContext: [], missingInputs: []
    };
    let pPoints = 0;
    const peFact = this.getFact(latestFacts, ['pe', 'pe_ratio', 'pe_ttm']);
    const pe = this.numberValue(peFact);
    const pegFact = this.getFact(latestFacts, ['peg', 'peg_ratio']);
    const peg = this.numberValue(pegFact);

    if (pe !== null) {
      price.valuationEvidence.push({ metric: 'pe', value: pe, description: 'P/E Ratio' });
      if (pe > 0 && pe < 15) pPoints += 10;
      else if (pe >= 15 && pe < 25) pPoints += 7;
      else if (pe >= 25 && pe < 40) pPoints += 4;
    } else {
      price.missingInputs.push('pe');
    }

    if (peg !== null) {
      price.valuationEvidence.push({ metric: 'peg', value: peg, description: 'PEG Ratio' });
      if (peg > 0 && peg < 1) pPoints += 10;
      else if (peg >= 1 && peg < 1.5) pPoints += 7;
      else if (peg >= 1.5 && peg < 2.5) pPoints += 4;
    } else {
      price.missingInputs.push('peg');
    }

    if (pe !== null && peg !== null) {
      price.score = pPoints;
      if (pPoints >= 18) price.rating = 'ATTRACTIVE';
      else if (pPoints >= 10) price.rating = 'FAIR';
      else if (pPoints >= 4) price.rating = 'EXPENSIVE';
      else price.rating = 'AVOID_ON_VALUATION';
    }

    // OVERALL
    missingCriticalInputs.push(...quality.missingInputs, ...growth.missingInputs, ...longevity.missingInputs, ...price.missingInputs);

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
      keyStrengths: strengths,
      keyRisks: risks,
      whatToWatchNext: watchNext,
      missingCriticalInputs,
      sourceCoverage: {
        ferePct: 0,
        trendlynePct: 0,
        appDbPct: 0,
      }
    };
  }
}
