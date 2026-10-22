/**
 * DerivedFact.ts
 *
 * FERE v3.2 Derived Financial Fact model.
 * Represents deterministic mathematical derivations computed from one or more Canonical Facts.
 * Holds full mathematical provenance (source fact IDs, formula ID, formula version, timestamp).
 */

import { MetricFamily } from './FinancialFact.js';

export interface DerivedFact {
  derivedFactId: string;
  issuerSymbol: string;
  metric: string;
  metricFamily: MetricFamily;
  value: number;
  unit: string;
  measurementPeriod?: string;
  asOfDate?: string;

  // Mathematical Provenance
  sourceFactIds: string[];
  formulaId: string;       // e.g. "FORMULA_YOY_GROWTH_V1", "FORMULA_NET_DEBT_TO_EBITDA_V1"
  formulaVersion: string;  // e.g. "1.0"
  formulaExpression: string; // e.g. "((valCurrent - valPrior) / valPrior) * 100"
  calculatedAt: string;

  notes?: string;
}
