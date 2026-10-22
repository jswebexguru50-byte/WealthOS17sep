import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QualitativeEvidenceExtractor } from '../../src/server/services/intelligence/qualitative/QualitativeEvidenceExtractor.js';
import { QualitativeSignalClassifier } from '../../src/server/services/intelligence/qualitative/QualitativeSignalClassifier.js';
import { QglpEngine } from '../../src/server/services/intelligence/engines/QglpEngine.js';
import { CanonicalFactRepository } from '../../src/server/services/intelligence/core/CanonicalFactRepository.js';
import { SecurityIdentity } from '../../src/server/services/intelligence/contracts/SecurityIdentity.js';
import { QglpScoringRules } from '../../src/server/services/intelligence/engines/QglpScoringRules.js';
import { ScripIntelligenceDossierService } from '../../src/server/services/ScripIntelligenceDossierService.js';
import { ScreenerService } from '../../src/server/services/screenerService.js';
import { TrendlyneIntelligenceService } from '../../src/server/services/TrendlyneIntelligenceService.js';
import { FundamentalAnalysisBuilder } from '../../src/server/services/intelligence/builders/FundamentalAnalysisBuilder.js';
import { FnOIntelligenceService } from '../../src/server/services/FnOIntelligenceService.js';
import { NewsSentimentService } from '../../src/server/services/NewsSentimentService.js';
import { MarketDataIngestorService } from '../../src/server/services/MarketDataIngestorService.js';
import { MacroRegimeClassifierService } from '../../src/server/services/MacroRegimeClassifierService.js';
import { BrokerResearchIntelligenceService } from '../../src/server/services/BrokerResearchIntelligenceService.js';
import { ScripKnowledgeBaseService } from '../../src/server/services/ScripKnowledgeBaseService.js';
import * as Database from '../../src/server/database.js';

describe('QGLP Qualitative Engine - Acceptance Tests', () => {
  let factRepo: CanonicalFactRepository;
  let qualExtractor: QualitativeEvidenceExtractor;
  let qualClassifier: QualitativeSignalClassifier;

  beforeEach(() => {
    factRepo = CanonicalFactRepository.getInstance();
    qualExtractor = QualitativeEvidenceExtractor.getInstance();
    qualClassifier = new QualitativeSignalClassifier();
  });

  const mockIdentity: SecurityIdentity = { securityId: '123', nseSymbol: 'TEST' };

  it('F1: Business description alone produces driver but no Longevity or Overall score', async () => {
    // Only biz desc available
    const longevity = QglpScoringRules.calculateLongevity(
      [], // durability
      [
        {
          signal: 'BUSINESS_DESCRIPTION_AVAILABLE',
          polarity: 'MIXED',
          severity: 'LOW',
          evidence: { id: '1', category: 'BUSINESS_DESCRIPTION', text: 'Desc', eventDate: null, provider: 'APP', sourceDocumentId: null },
          deterministicReason: 'Present'
        }
      ],
      [], // mgt
      [], // credit
      [] // pledge
    );

    expect(longevity.missingInputs).toContain('management_events');
    expect(longevity.missingInputs).toContain('credit_debt_events');
    expect(longevity.missingInputs).toContain('promoter_pledge');
    expect(longevity.missingInputs).toContain('durability_evidence');
    expect(longevity.score).toBeNull(); // No positive evidence points means score remains null
  });

  it('F2: No governance/management/credit events does not earn points and goes to missingInputs', () => {
    const q = QglpScoringRules.calculateQuality(undefined, undefined, undefined, undefined, []);
    expect(q.missingInputs).toContain('governance_events');
    expect(q.score).toBeNull();
  });

  it('F3: Credit downgrade creates NEGATIVE risk', () => {
    const sig = qualClassifier.classify({
      id: 'mock',
      category: 'CREDIT_DEBT_EVENT',
      text: 'Rating downgrade due to weak margins.',
      eventDate: '2023-01-01',
      provider: 'MOCK',
      sourceDocumentId: null
    });
    
    expect(sig?.signal).toBe('CREDIT_DEBT_EVENT_PRESENT');
    expect(sig?.polarity).toBe('NEGATIVE');
  });

  it('F4: Promoter pledge thresholds', () => {
    const s0 = qualClassifier.classifyPromoterPledge(0, { id: '1', category: 'GOVERNANCE_EVENT', text: '', eventDate: null, provider: 'A', sourceDocumentId: null });
    expect(s0.polarity).toBe('SUPPORTIVE');

    const s16 = qualClassifier.classifyPromoterPledge(16, { id: '1', category: 'GOVERNANCE_EVENT', text: '', eventDate: null, provider: 'A', sourceDocumentId: null });
    expect(s16.polarity).toBe('NEGATIVE');

    const longevity = QglpScoringRules.calculateLongevity([], [], [], [], []);
    expect(longevity.missingInputs).toContain('promoter_pledge');
  });

  it('F5: Overall score remains null if any pillar is null', async () => {
    // We mock fact repo response to return nothing
    const engine = QglpEngine.getInstance();
    const result = await engine.evaluate(mockIdentity);
    expect(result.overallScore).toBeNull();
    expect(result.overallRating).toBe('INSUFFICIENT_DATA');
    expect(result.missingCriticalInputs.length).toBeGreaterThan(0);
  });

  it('F6: Dossier blocks final decision fields when QGLP is INSUFFICIENT_DATA', async () => {
    // 1. Mock DB
    vi.spyOn(Database, 'getDB').mockReturnValue({} as any);
    vi.spyOn(Database, 'dbGet').mockResolvedValue(null);

    // 2. Mock external services that ScripIntelligenceDossierService uses
    vi.spyOn(ScreenerService, 'getInstance').mockReturnValue({
      fetchScreenerData: vi.fn().mockResolvedValue({ 
        company_name: 'Test', 
        sector: 'Test', 
        ratios: { current_price: '100', stock_pe: '20' } 
      })
    } as any);
    
    vi.spyOn(TrendlyneIntelligenceService, 'getInstance').mockReturnValue({
      getScripIntelligence: vi.fn().mockResolvedValue({ valuation: { pe: 20 } })
    } as any);
    
    vi.spyOn(FundamentalAnalysisBuilder, 'getInstance').mockReturnValue({
      buildDossier: vi.fn().mockResolvedValue({
        qglpScore: { overallRating: 'INSUFFICIENT_DATA', missingCriticalInputs: ['roe'] }
      })
    } as any);
    
    vi.spyOn(FnOIntelligenceService, 'getInstance').mockReturnValue({
      isFnoEligible: vi.fn().mockReturnValue(false),
      getLatestFnOSnapshot: vi.fn().mockResolvedValue(null)
    } as any);
    
    vi.spyOn(NewsSentimentService.prototype, 'fetchNews').mockResolvedValue({} as any);
    
    vi.spyOn(MarketDataIngestorService, 'getInstance').mockReturnValue({
      getLatestSnapshot: vi.fn().mockResolvedValue({ close: 100 })
    } as any);
    
    vi.spyOn(MacroRegimeClassifierService, 'getInstance').mockReturnValue({
      getCurrentRegime: vi.fn().mockResolvedValue({ regime: 'BULL_TREND' })
    } as any);
    
    vi.spyOn(BrokerResearchIntelligenceService, 'getInstance').mockReturnValue({
      getReportsForSymbol: vi.fn().mockResolvedValue([])
    } as any);
    
    vi.spyOn(ScripKnowledgeBaseService, 'getThesis').mockResolvedValue(null);
    vi.spyOn(ScripKnowledgeBaseService, 'saveCompleteDossier').mockResolvedValue();

    // 3. Act
    const dossier = await ScripIntelligenceDossierService.getSecurityDossier('MOCK', false);

    // 4. Assert Dossier is blocked and decision fields are null
    expect(dossier.fundamentalDecisionStatus).toBe('DATA_INSUFFICIENT');
    expect(dossier.combinedDecisionStatus).toBe('BLOCKED');
    expect(dossier.outlook.verdict).toBeNull();
    expect(dossier.outlook.calibratedProbabilityPct).toBeNull();
    expect(dossier.outlook.targetPrice).toBeNull();
    expect(dossier.outlook.stopLossPrice).toBeNull();
    expect(dossier.outlook.expectedUpsidePct).toBeNull();
    expect(dossier.outlook.riskRewardRatio).toBeNull();
    expect(dossier.outlook.halfKellyAllocationPct).toBeNull();
    expect(dossier.outlook.suggestedInvestmentAmount).toBeNull();
    
    // Validate we didn't wipe technical fields fully
    expect(dossier.scores.technicalScore).toBeDefined();
    
    vi.restoreAllMocks();
  });
});
