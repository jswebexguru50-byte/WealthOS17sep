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
    technical?: ModuleResult<TechnicalPayload>;
    fundamental?: ModuleResult<FundamentalPayload>;
    fere?: ModuleResult<FerePayload>;
    qglp?: ModuleResult<QglpPayload>;
    management?: ModuleResult<ManagementPayload>;
    businessInflection?: ModuleResult<BusinessInflectionPayload>;
    valuation?: ModuleResult<ValuationPayload>;
    marketContext?: ModuleResult<MarketContextPayload>;
  };
}
