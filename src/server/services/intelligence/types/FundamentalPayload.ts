import { BusinessModel } from '../domain/BusinessModelClassifier.js';
import { EvidenceReference } from '../contracts/Provenance.js';

export interface FundamentalMetricItem {
  period: string; // e.g. "FY2024", "Q3FY25"
  value: number | null;
  unit: string; // "INR_CR", "PERCENT", "RATIO"
  scope: 'CONSOLIDATED' | 'STANDALONE' | 'UNKNOWN';
  status: 'VERIFIED' | 'PARTIAL' | 'DATA_INSUFFICIENT';
  provenance: EvidenceReference[];
}

export interface FundamentalSeries {
  [metricName: string]: FundamentalMetricItem[];
}

export interface FundamentalTrajectory {
  revenueGrowthYoY: {
    status: 'ACCELERATING' | 'DECELERATING' | 'STABLE' | 'DATA_INSUFFICIENT';
    latestGrowthPct: number | null;
    priorGrowthPct: number | null;
    periodsCompared: string | null;
  };
  marginTrajectory: {
    status: 'EXPANDING' | 'CONTRACTING' | 'STABLE' | 'DATA_INSUFFICIENT';
    bpsChange: number | null;
    metricUsed: string; // "EBITDA_MARGIN" or "NIM"
  };
  debtTrajectory: {
    status: 'DELEVERAGING' | 'LEVERAGING' | 'STABLE' | 'DATA_INSUFFICIENT' | 'NOT_APPLICABLE';
    changePct: number | null;
  };
  returnProfile: {
    metric: string; // "ROCE" or "ROE" or "ROA"
    latestValue: number | null;
    status: 'HIGH_QUALITY' | 'MODERATE' | 'LOW' | 'DATA_INSUFFICIENT';
  };
}

export interface FundamentalPayload {
  businessModel: BusinessModel;
  historicalSeries: FundamentalSeries;
  trajectory: FundamentalTrajectory;
  dataAsOf: string | null;
}
