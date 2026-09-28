import { BusinessModel } from '../domain/BusinessModelClassifier.js';
import { ModuleResult } from '../contracts/ModuleResult.js';
import { TechnicalPayload } from './TechnicalPayload.js';
import { FundamentalPayload } from './FundamentalPayload.js';
import { FerePayload } from './FerePayload.js';
import { QglpPayload } from './QglpPayload.js';
import { ManagementPayload } from './ManagementPayload.js';
import { BusinessInflectionPayload } from './BusinessInflectionPayload.js';
import { ValuationPayload } from './ValuationPayload.js';
import { MarketContextPayload } from './MarketContextPayload.js';
// V2 module payloads
import { BusinessDriverPayload } from './BusinessDriverPayload.js';
import { DeltaPayload } from './DeltaPayload.js';
import { ContradictionPayload } from './ContradictionPayload.js';
import { AttentionPayload } from './AttentionPayload.js';

export interface CompanyIntelligenceResponse {
  security: {
    securityId: string;
    symbol: string;
    companyName: string | null;
    isin: string | null;
    sector: string | null;
    industry: string | null;
    businessModel: BusinessModel;
  };
  generatedAt: string;
  modules: {
    // V1 modules (preserved)
    technical?: ModuleResult<TechnicalPayload>;
    fundamental?: ModuleResult<FundamentalPayload>;
    fere?: ModuleResult<FerePayload>;
    qglp?: ModuleResult<QglpPayload>;
    management?: ModuleResult<ManagementPayload>;
    businessInflection?: ModuleResult<BusinessInflectionPayload>;
    valuation?: ModuleResult<ValuationPayload>;
    marketContext?: ModuleResult<MarketContextPayload>;
    // V2 modules
    businessDrivers?: ModuleResult<BusinessDriverPayload>;
    delta?: ModuleResult<DeltaPayload>;
    contradictions?: ModuleResult<ContradictionPayload>;
    attention?: ModuleResult<AttentionPayload>;
  };
}

