import { MetricFamily, MeasurementType } from '../../src/server/intelligence/types/FinancialFact.js';
import { ManagementClaim } from '../../src/server/intelligence/types/ManagementClaim.js';
import { IntelligenceEvent } from '../../src/server/intelligence/types/IntelligenceEvent.js';
import { Contradiction } from '../../src/server/intelligence/types/Contradiction.js';
import { ThesisBreaker } from '../../src/server/intelligence/types/ThesisBreaker.js';
import { ItasQuantInput } from '../../src/server/intelligence/services/ItasIiceReconciliationService.js';

export interface CompanyMetadata {
  symbol: string;
  companyName: string;
  bseCode: string;
  isin: string;
  marketCapTier: 'LARGECAP' | 'MIDCAP' | 'SMALLCAP' | 'MICROCAP_SME';
  exchangeBoard: 'MAIN_BOARD' | 'SME_EXCHANGE';
  industry: string;
  headquarters: string;
  primaryExchange: 'NSE' | 'BSE';
}

export interface SourceDocument {
  documentId: string;
  documentName: string;
  documentType: string;
  sourceTier: 'TIER_1_PRIMARY_AUTHORITATIVE' | 'TIER_2_PRIMARY_CORPORATE';
  publicationDate: string;
  documentHashSha256: string;
  pageCount: number;
  filingAuthority: string;
}

export interface EvidenceSpanRecord {
  evidenceId: string;
  issuerNseSymbol: string;
  issuerBseCode: string;
  documentId: string;
  documentHash: string;
  documentType: string;
  pagePhysical: number;
  pagePrinted: string;
  quotedText: string;
  verificationStatus: string;
}

export interface RawFactData {
  factId: string;
  metric: string;
  metricFamily: MetricFamily;
  value: number;
  unit: string;
  scope: 'CONSOLIDATED' | 'STANDALONE';
  measurementType: MeasurementType;
  asOfDate: string;
  sourceEvidenceId: string;
  sourceQuotedText: string;
}

export interface ThesisPillar {
  pillarId: string;
  title: string;
  description: string;
}

export interface ThesisDefinition {
  symbol: string;
  coreThesisStatement: string;
  investmentPillars: ThesisPillar[];
  thesisBreakersDefined: string[];
}

export interface CompanyCohortDefinition {
  company: CompanyMetadata;
  sources: SourceDocument[];
  evidenceSpans: EvidenceSpanRecord[];
  factsData: RawFactData[];
  claims: ManagementClaim[];
  events: IntelligenceEvent[];
  contradictions?: Contradiction[];
  breakers: ThesisBreaker[];
  breakerContextMetrics: Record<string, number>;
  itasSignal: ItasQuantInput;
  thesis: ThesisDefinition;
}
