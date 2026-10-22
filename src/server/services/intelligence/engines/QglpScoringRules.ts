import { QglpPillar, EvidenceDriver } from './QglpEngine.js';
import { QualitativeSignal } from '../qualitative/QualitativeSignalClassifier.js';
import { CanonicalFact } from '../contracts/CanonicalFact.js';

export class QglpScoringRules {
  public static calculateQuality(
    roeFact: CanonicalFact | undefined,
    cfoPatFact: CanonicalFact | undefined,
    deFact: CanonicalFact | undefined,
    fcfPatFact: CanonicalFact | undefined,
    governanceSignals: QualitativeSignal[]
  ): QglpPillar {
    const pillar: QglpPillar = {
      score: null,
      maxScore: 30,
      rating: 'INSUFFICIENT_DATA',
      quantitativeDrivers: [],
      qualitativeDrivers: [],
      risks: [],
      missingInputs: [],
    };

    let points = 0;
    
    // ROE
    const roe = this.num(roeFact);
    if (roe !== null) {
      if (roe >= 15) { points += 8; pillar.quantitativeDrivers.push(this.ev('roe', roe, roeFact, 'SUPPORTIVE', 'Strong ROE')); }
      else if (roe >= 10) { points += 4; pillar.quantitativeDrivers.push(this.ev('roe', roe, roeFact, 'MIXED', 'Moderate ROE')); }
      else { pillar.risks.push(this.ev('roe', roe, roeFact, 'NEGATIVE', 'Weak ROE')); }
    } else {
      pillar.missingInputs.push('roe');
    }

    // CFO/PAT
    const cfoPat = this.num(cfoPatFact);
    if (cfoPat !== null) {
      if (cfoPat >= 0.8) { points += 7; pillar.quantitativeDrivers.push(this.ev('cfo_pat_ratio', cfoPat, cfoPatFact, 'SUPPORTIVE', 'Strong cash conversion')); }
      else if (cfoPat >= 0.5) { points += 3; pillar.quantitativeDrivers.push(this.ev('cfo_pat_ratio', cfoPat, cfoPatFact, 'MIXED', 'Moderate cash conversion')); }
      else { pillar.risks.push(this.ev('cfo_pat_ratio', cfoPat, cfoPatFact, 'NEGATIVE', 'Weak cash conversion')); }
    } else {
      pillar.missingInputs.push('cfo_pat_ratio');
    }

    // FCF/PAT
    const fcfPat = this.num(fcfPatFact);
    if (fcfPat !== null) {
      if (fcfPat >= 0.5) { points += 6; pillar.quantitativeDrivers.push(this.ev('fcf_pat_ratio', fcfPat, fcfPatFact, 'SUPPORTIVE', 'Strong free cash generation')); }
      else if (fcfPat >= 0.2) { points += 3; pillar.quantitativeDrivers.push(this.ev('fcf_pat_ratio', fcfPat, fcfPatFact, 'MIXED', 'Moderate free cash generation')); }
      else { pillar.risks.push(this.ev('fcf_pat_ratio', fcfPat, fcfPatFact, 'NEGATIVE', 'Weak free cash generation')); }
    } else {
      pillar.missingInputs.push('fcf_pat_ratio');
    }

    // D/E
    const de = this.num(deFact);
    if (de !== null) {
      if (de <= 0.5) { points += 5; pillar.quantitativeDrivers.push(this.ev('debt_to_equity', de, deFact, 'SUPPORTIVE', 'Safe leverage')); }
      else if (de <= 1.0) { points += 2; pillar.quantitativeDrivers.push(this.ev('debt_to_equity', de, deFact, 'MIXED', 'Moderate leverage')); }
      else { pillar.risks.push(this.ev('debt_to_equity', de, deFact, 'NEGATIVE', 'High leverage')); }
    } else {
      pillar.missingInputs.push('debt_to_equity');
    }

    // Governance cleanliness
    let governanceRisk = false;
    let governanceClean = false;
    
    if (governanceSignals.length === 0) {
      pillar.missingInputs.push('governance_events');
    } else {
      for (const sig of governanceSignals) {
        if (sig.polarity === 'NEGATIVE') {
          governanceRisk = true;
          pillar.risks.push(this.sigEv(sig));
        } else {
          if (sig.polarity === 'SUPPORTIVE') governanceClean = true;
          pillar.qualitativeDrivers.push(this.sigEv(sig));
        }
      }
    }
    
    if (governanceClean && !governanceRisk) {
      points += 4;
    }

    // Scoring logic (only if critical inputs are present)
    if (roe !== null && cfoPat !== null && de !== null) {
      pillar.score = points;
      if (points >= 22) pillar.rating = 'EXCELLENT';
      else if (points >= 15) pillar.rating = 'GOOD';
      else if (points >= 8) pillar.rating = 'MIXED';
      else pillar.rating = 'WEAK';
    }

    return pillar;
  }

  public static calculateGrowth(
    revGrFact: CanonicalFact | undefined,
    patGrFact: CanonicalFact | undefined,
    marginExpFact: CanonicalFact | undefined,
    sectorSignals: QualitativeSignal[],
    capexFact: CanonicalFact | undefined
  ): QglpPillar {
    const pillar: QglpPillar = {
      score: null, maxScore: 25, rating: 'INSUFFICIENT_DATA', quantitativeDrivers: [], qualitativeDrivers: [], risks: [], missingInputs: []
    };
    let points = 0;

    const revGr = this.num(revGrFact);
    if (revGr !== null) {
      if (revGr >= 15) { points += 8; pillar.quantitativeDrivers.push(this.ev('revenue_growth', revGr, revGrFact, 'SUPPORTIVE', 'High revenue growth')); }
      else if (revGr >= 8) { points += 4; pillar.quantitativeDrivers.push(this.ev('revenue_growth', revGr, revGrFact, 'MIXED', 'Moderate revenue growth')); }
      else if (revGr < 0) { pillar.risks.push(this.ev('revenue_growth', revGr, revGrFact, 'NEGATIVE', 'Negative revenue growth')); }
    } else {
      pillar.missingInputs.push('revenue_growth');
    }

    const patGr = this.num(patGrFact);
    if (patGr !== null) {
      if (patGr >= 15) { points += 8; pillar.quantitativeDrivers.push(this.ev('pat_growth', patGr, patGrFact, 'SUPPORTIVE', 'High PAT growth')); }
      else if (patGr >= 8) { points += 4; pillar.quantitativeDrivers.push(this.ev('pat_growth', patGr, patGrFact, 'MIXED', 'Moderate PAT growth')); }
      else if (patGr < 0) { pillar.risks.push(this.ev('pat_growth', patGr, patGrFact, 'NEGATIVE', 'Negative PAT growth')); }
    } else {
      pillar.missingInputs.push('pat_growth');
    }

    const marginExp = this.num(marginExpFact);
    if (marginExp !== null) {
      if (marginExp > 0) { points += 4; pillar.quantitativeDrivers.push(this.ev('margin_expansion', marginExp, marginExpFact, 'SUPPORTIVE', 'Margin expansion')); }
      else if (marginExp < -5) { pillar.risks.push(this.ev('margin_expansion', marginExp, marginExpFact, 'NEGATIVE', 'Significant margin contraction')); }
    } else {
      pillar.missingInputs.push('margin_expansion');
    }

    let sectorBoost = false;
    for (const sig of sectorSignals) {
      pillar.qualitativeDrivers.push(this.sigEv(sig));
      if (sig.polarity === 'SUPPORTIVE') sectorBoost = true;
    }
    if (sectorBoost) points += 3;

    const capex = this.num(capexFact);
    if (capex !== null && capex > 0) {
      points += 2;
      pillar.quantitativeDrivers.push(this.ev('capex', capex, capexFact, 'SUPPORTIVE', 'Capex investments present'));
    }

    if (revGr !== null && patGr !== null) {
      pillar.score = points;
      if (points >= 18) pillar.rating = 'HIGH_GROWTH';
      else if (points >= 10) pillar.rating = 'STEADY_GROWTH';
      else if (points >= 5) pillar.rating = 'CYCLICAL';
      else pillar.rating = 'DECLINING';
    }

    return pillar;
  }

  public static calculateLongevity(
    durabilitySignals: QualitativeSignal[],
    bizDescSignals: QualitativeSignal[],
    managementSignals: QualitativeSignal[],
    creditDebtSignals: QualitativeSignal[],
    pledgeSignals: QualitativeSignal[]
  ): QglpPillar {
    const pillar: QglpPillar = {
      score: null, maxScore: 25, rating: 'INSUFFICIENT_DATA', quantitativeDrivers: [], qualitativeDrivers: [], risks: [], missingInputs: []
    };
    let points = 0;
    let hasPositiveEvidence = false;

    let bizDescPresent = false;
    if (bizDescSignals.length === 0) {
      pillar.missingInputs.push('business_description');
    } else {
      for (const sig of bizDescSignals) {
        pillar.qualitativeDrivers.push(this.sigEv(sig));
        bizDescPresent = true;
      }
    }

    let mgtRisk = false;
    if (managementSignals.length === 0) {
      pillar.missingInputs.push('management_events');
    } else {
      for (const sig of managementSignals) {
        if (sig.polarity === 'NEGATIVE') { mgtRisk = true; pillar.risks.push(this.sigEv(sig)); }
        else {
          if (sig.polarity === 'SUPPORTIVE') { hasPositiveEvidence = true; points += 3; }
          pillar.qualitativeDrivers.push(this.sigEv(sig));
        }
      }
    }

    let debtRisk = false;
    if (creditDebtSignals.length === 0) {
      pillar.missingInputs.push('credit_debt_events');
    } else {
      for (const sig of creditDebtSignals) {
        if (sig.polarity === 'NEGATIVE') { debtRisk = true; pillar.risks.push(this.sigEv(sig)); }
        else {
          if (sig.polarity === 'SUPPORTIVE') { hasPositiveEvidence = true; points += 5; }
          pillar.qualitativeDrivers.push(this.sigEv(sig));
        }
      }
    }

    let pledgeRisk = false;
    if (pledgeSignals.length === 0) {
       pillar.missingInputs.push('promoter_pledge');
    } else {
      for (const sig of pledgeSignals) {
        if (sig.polarity === 'NEGATIVE') { pledgeRisk = true; pillar.risks.push(this.sigEv(sig)); }
        else {
          pillar.qualitativeDrivers.push(this.sigEv(sig));
        }
      }
    }

    // Return durability etc should come from explicit signals, for now if none, score is limited.
    if (durabilitySignals.length === 0) {
       pillar.missingInputs.push('durability_evidence');
    } else {
      for (const sig of durabilitySignals) {
        if (sig.polarity === 'SUPPORTIVE') { hasPositiveEvidence = true; points += 6; }
        else if (sig.polarity === 'NEGATIVE') pillar.risks.push(this.sigEv(sig));
        else pillar.qualitativeDrivers.push(this.sigEv(sig));
      }
    }

    // Deduct points for risks
    if (mgtRisk) points -= 3;
    if (debtRisk) points -= 5;
    if (pledgeRisk) points -= 5;
    
    // Clamp points
    points = Math.max(0, points);

    if (hasPositiveEvidence) {
      pillar.score = points;
      if (points >= 18) pillar.rating = 'DURABLE';
      else if (points >= 12) pillar.rating = 'MODERATE';
      else if (points >= 6) pillar.rating = 'CYCLICAL';
      else pillar.rating = 'FRAGILE';
    }

    return pillar;
  }

  public static calculatePrice(
    peFact: CanonicalFact | undefined,
    pegFact: CanonicalFact | undefined,
    pbFact: CanonicalFact | undefined,
    fcfYieldFact: CanonicalFact | undefined,
    mcapCategory: string | undefined
  ): QglpPillar {
    const pillar: QglpPillar = {
      score: null, maxScore: 20, rating: 'INSUFFICIENT_DATA', quantitativeDrivers: [], qualitativeDrivers: [], risks: [], missingInputs: []
    };
    let points = 0;

    const pe = this.num(peFact);
    const peg = this.num(pegFact);
    
    if (pe !== null) {
      if (pe > 0 && pe <= 20) { points += 4; pillar.quantitativeDrivers.push(this.ev('pe', pe, peFact, 'SUPPORTIVE', 'Attractive P/E')); }
      else if (pe > 20 && pe <= 40) { points += 2; pillar.quantitativeDrivers.push(this.ev('pe', pe, peFact, 'MIXED', 'Fair P/E')); }
      else { pillar.risks.push(this.ev('pe', pe, peFact, 'NEGATIVE', 'Expensive or negative P/E')); }
    } else {
      pillar.missingInputs.push('pe');
    }

    if (peg !== null) {
      if (peg > 0 && peg <= 1.0) { points += 3; pillar.quantitativeDrivers.push(this.ev('peg', peg, pegFact, 'SUPPORTIVE', 'Attractive PEG')); }
      else if (peg > 1.0 && peg <= 2.0) { points += 1; pillar.quantitativeDrivers.push(this.ev('peg', peg, pegFact, 'MIXED', 'Fair PEG')); }
      else { pillar.risks.push(this.ev('peg', peg, pegFact, 'NEGATIVE', 'Expensive PEG')); }
    } else {
      pillar.missingInputs.push('peg');
    }

    const pb = this.num(pbFact);
    if (pb !== null) {
      if (pb > 0 && pb <= 3) { points += 5; pillar.quantitativeDrivers.push(this.ev('pb', pb, pbFact, 'SUPPORTIVE', 'Attractive P/B')); }
      else if (pb > 3 && pb <= 6) { points += 2; pillar.quantitativeDrivers.push(this.ev('pb', pb, pbFact, 'MIXED', 'Fair P/B')); }
      else { pillar.risks.push(this.ev('pb', pb, pbFact, 'NEGATIVE', 'Expensive P/B')); }
    }

    if (mcapCategory) {
      if (mcapCategory === 'LARGE_CAP') points += 3;
      else if (mcapCategory === 'MID_CAP') points += 2;
      else if (mcapCategory === 'SMALL_CAP') points += 1;
      pillar.qualitativeDrivers.push({
        metric: 'market_cap_category',
        value: mcapCategory,
        description: `Market cap category: ${mcapCategory}`,
        status: 'SUPPORTIVE'
      });
    }

    const fcfYield = this.num(fcfYieldFact);
    if (fcfYield !== null) {
      if (fcfYield >= 5) { points += 3; pillar.quantitativeDrivers.push(this.ev('fcf_yield', fcfYield, fcfYieldFact, 'SUPPORTIVE', 'High FCF yield')); }
      else if (fcfYield > 0) { points += 1; pillar.quantitativeDrivers.push(this.ev('fcf_yield', fcfYield, fcfYieldFact, 'MIXED', 'Positive FCF yield')); }
    }

    if (pe !== null && peg !== null) {
      pillar.score = points;
      if (points >= 14) pillar.rating = 'ATTRACTIVE';
      else if (points >= 8) pillar.rating = 'FAIR';
      else if (points >= 4) pillar.rating = 'EXPENSIVE';
      else pillar.rating = 'AVOID_ON_VALUATION';
    }

    return pillar;
  }

  private static num(fact: CanonicalFact | undefined): number | null {
    if (!fact) return null;
    if (typeof fact.value === 'number' && Number.isFinite(fact.value)) return fact.value;
    return null;
  }

  private static ev(metric: string, value: any, fact: CanonicalFact | undefined, status: any, description: string): EvidenceDriver {
    return {
      metric,
      value,
      description,
      status,
      sourceFactId: fact?.factId ?? null,
      provider: fact?.sourceId ?? null,
      evidenceDate: fact?.periodEnd || fact?.publishedAt || null,
    };
  }

  private static sigEv(sig: QualitativeSignal): EvidenceDriver {
    return {
      metric: sig.evidence.category,
      value: sig.evidence.text,
      description: sig.deterministicReason,
      status: sig.polarity,
      sourceEventId: sig.evidence.id,
      sourceDocumentId: sig.evidence.sourceDocumentId,
      provider: sig.evidence.provider,
      evidenceDate: sig.evidence.eventDate,
    };
  }
}
