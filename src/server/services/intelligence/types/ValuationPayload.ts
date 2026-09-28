import { EvidenceReference } from '../contracts/Provenance.js';

export interface ValuationMetric {
  metric: string; // PE, PB, EV/EBITDA, EV/Sales, DivYield, PEG
  current: number | null;
  historicalMedian?: number | null;
  historicalMin?: number | null;
  historicalMax?: number | null;
  relativeStatus: 'ABOVE_MEDIAN' | 'NEAR_MEDIAN' | 'BELOW_MEDIAN' | 'DATA_INSUFFICIENT';
  evidence: EvidenceReference[];
}

export interface ValuationPayload {
  pe: ValuationMetric;
  pb: ValuationMetric;
  evEbitda?: ValuationMetric;
  dividendYield: ValuationMetric;
  peg?: ValuationMetric;
  dataAsOf: string | null;
}
