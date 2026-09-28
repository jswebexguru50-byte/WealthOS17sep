/**
 * CompanyIntelligenceOrchestrator.ts
 *
 * Agent H Deliverable:
 * Thin orchestrator coordinating independent module adapters into a unified CompanyIntelligenceResponse.
 *
 * Invariants:
 * - Thin coordination layer: does NOT implement calculations directly
 * - Concurrently runs requested modules via Promise.allSettled
 * - One failing module NEVER kills the response or blank the company page
 * - Derives Business Inflection in memory from completed modules
 * - Preserves minimal telemetry (SimpleModuleTelemetry) without heavy infrastructure
 */

import { AnalysisModule, ModuleResult, ModuleStatus } from './contracts/index.js';
import { CompanyIntelligenceResponse } from './types/CompanyIntelligenceResponse.js';
import { BusinessModelClassifier, BusinessModel } from './domain/BusinessModelClassifier.js';
import { SecurityIdentityRegistry } from '../dataAcquisition/SecurityIdentityRegistry.js';
import { TechnicalModuleAdapter } from './modules/TechnicalModuleAdapter.js';
import { FundamentalModuleAdapter } from './modules/FundamentalModuleAdapter.js';
import { FereModuleAdapter } from './modules/FereModuleAdapter.js';
import { QglpModuleAdapter } from './modules/QglpModuleAdapter.js';
import { ManagementModuleAdapter } from './modules/ManagementModuleAdapter.js';
import { BusinessInflectionModule } from './modules/BusinessInflectionModule.js';
import { ValuationModuleAdapter } from './modules/ValuationModuleAdapter.js';
import { MarketContextModuleAdapter } from './modules/MarketContextModuleAdapter.js';
import { getDB, dbGet } from '../../database.js';
// V2 engines
import { BusinessDriverEngine } from './business/BusinessDriverEngine.js';
import { ManagementIntelligenceEngine } from './management/ManagementIntelligenceEngine.js';
import { ContradictionEngine } from './contradictions/ContradictionEngine.js';
import { ValuationIntelligenceEngine } from './valuation/ValuationIntelligenceEngine.js';
import { AttentionEngine } from './attention/AttentionEngine.js';
import { QuestionEngine } from './attention/QuestionEngine.js';
import { CompanySnapshotStore } from './delta/CompanyDeltaEngine.js';

export interface SimpleModuleTelemetry {
  symbol: string;
  moduleId: AnalysisModule;
  status: 'STARTED' | 'COMPLETED' | 'FAILED';
  durationMs: number;
  dataAsOf: string | null;
  evidenceCount: number;
  timestamp: string;
}

export class CompanyIntelligenceOrchestrator {
  private static instance: CompanyIntelligenceOrchestrator;

  private constructor() {}

  public static getInstance(): CompanyIntelligenceOrchestrator {
    if (!CompanyIntelligenceOrchestrator.instance) {
      CompanyIntelligenceOrchestrator.instance = new CompanyIntelligenceOrchestrator();
    }
    return CompanyIntelligenceOrchestrator.instance;
  }

  /**
   * Evaluates an individual module safely, returning a fail-closed ModuleResult on unhandled exception.
   */
  public async runModule(symbol: string, module: AnalysisModule): Promise<ModuleResult<any>> {
    const startTime = Date.now();
    const evaluationTimestamp = new Date().toISOString();

    try {
      let result: ModuleResult<any>;

      switch (module) {
        case 'TECHNICAL':
          result = await TechnicalModuleAdapter.getInstance().run(symbol);
          break;
        case 'FUNDAMENTAL':
          result = await FundamentalModuleAdapter.getInstance().run(symbol);
          break;
        case 'FERE':
          result = await FereModuleAdapter.getInstance().run(symbol);
          break;
        case 'QGLP':
          result = await QglpModuleAdapter.getInstance().run(symbol);
          break;
        case 'MANAGEMENT':
          result = await ManagementModuleAdapter.getInstance().run(symbol);
          break;
        case 'VALUATION':
          result = await ValuationModuleAdapter.getInstance().run(symbol);
          break;
        case 'MARKET_CONTEXT':
          result = await MarketContextModuleAdapter.getInstance().run(symbol);
          break;
        default:
          return {
            moduleId: module,
            status: 'DATA_INSUFFICIENT',
            dataStatus: 'NOT_APPLICABLE',
            result: null,
            evidenceRefs: [],
            missingRequirements: [`Module '${module}' not supported in V1 cockpit`],
            warnings: [],
            evaluationTimestamp,
            dataAsOf: null,
            configVersion: '1.0.0',
            engineVersion: 'CompanyIntelligenceOrchestrator-v1.0',
          };
      }

      this.logTelemetry({
        symbol,
        moduleId: module,
        status: 'COMPLETED',
        durationMs: Date.now() - startTime,
        dataAsOf: result.dataAsOf,
        evidenceCount: result.evidenceRefs.length,
        timestamp: evaluationTimestamp,
      });

      return result;
    } catch (err: any) {
      this.logTelemetry({
        symbol,
        moduleId: module,
        status: 'FAILED',
        durationMs: Date.now() - startTime,
        dataAsOf: null,
        evidenceCount: 0,
        timestamp: evaluationTimestamp,
      });

      return {
        moduleId: module,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [err.message || 'Unknown module error'],
        warnings: [err.stack || 'Stack unavailable'],
        evaluationTimestamp,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'CompanyIntelligenceOrchestrator-v1.0',
      };
    }
  }

  /**
   * Main entry point for company intelligence cockpit.
   * Runs requested modules concurrently without blocking on slower ones.
   */
  public async getCompanyIntelligence(
    identifier: string,
    requestedModules?: AnalysisModule[]
  ): Promise<CompanyIntelligenceResponse> {
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const generatedAt = new Date().toISOString();

    // 1. Resolve canonical security identity & metadata
    const registry = SecurityIdentityRegistry.getInstance();
    const resolution = registry.resolveSecurityId(cleanSym);

    let companyName: string | null = null;
    let isin: string | null = resolution.status === 'VERIFIED' ? resolution.record.isin : null;
    let sector: string | null = null;
    let industry: string | null = null;

    try {
      const db = getDB();
      if (db) {
        const row = await dbGet<any>(
          db,
          `SELECT isin, name, sector, industry FROM MasterTickers WHERE UPPER(symbol) = ? LIMIT 1`,
          [cleanSym]
        );
        if (row) {
          if (!isin && row.isin) isin = row.isin;
          companyName = row.name || null;
          sector = row.sector || null;
          industry = row.industry || null;
        }
      }
    } catch {
      // Non-fatal
    }

    const businessModel: BusinessModel = BusinessModelClassifier.classify(cleanSym, sector, industry);
    const securityId = resolution.status === 'VERIFIED' ? resolution.securityId : (isin || cleanSym);

    // Default modules needed for cockpit overview if none specified
    const modulesToRun: AnalysisModule[] = requestedModules && requestedModules.length > 0
      ? requestedModules
      : ['TECHNICAL', 'FUNDAMENTAL', 'FERE', 'QGLP', 'MANAGEMENT', 'VALUATION', 'MARKET_CONTEXT'];

    // 2. Concurrently execute independent analytical modules
    const tasks = modulesToRun.map(mod =>
      this.runModule(cleanSym, mod).then(res => ({ mod, res }))
    );

    const settled = await Promise.allSettled(tasks);

    const modulesResult: CompanyIntelligenceResponse['modules'] = {};

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        const { mod, res } = item.value;
        if (mod === 'TECHNICAL') modulesResult.technical = res;
        else if (mod === 'FUNDAMENTAL') modulesResult.fundamental = res;
        else if (mod === 'FERE') modulesResult.fere = res;
        else if (mod === 'QGLP') modulesResult.qglp = res;
        else if (mod === 'MANAGEMENT') modulesResult.management = res;
        else if (mod === 'VALUATION') modulesResult.valuation = res;
        else if (mod === 'MARKET_CONTEXT') modulesResult.marketContext = res;
      }
    }

    // 3. Derive Business Inflection in-memory from completed results
    const businessInflection = BusinessInflectionModule.getInstance().derive(cleanSym, {
      technical: modulesResult.technical?.result,
      fundamental: modulesResult.fundamental?.result,
      fere: modulesResult.fere?.result,
      management: modulesResult.management?.result,
      market: modulesResult.marketContext?.result,
    });
    modulesResult.businessInflection = businessInflection;

    // 4. V2 engines — run after V1 modules (depend on Wave 1 outputs)
    const fundamentalPayload = modulesResult.fundamental?.result ?? null;

    // Wave 1: Business Drivers
    try {
      const driverResult = await BusinessDriverEngine.getInstance().evaluate({
        symbol: cleanSym,
        businessModel,
        canonicalFacts: {},   // enriched by FundamentalIntelligenceEngine in full pipeline
        managementEvidence: modulesResult.management?.result ?? null,
      });
      const evalTs = new Date().toISOString();
      modulesResult.businessDrivers = {
        moduleId: 'BUSINESS_DRIVERS' as any,
        status: driverResult.coverage === 'MINIMAL' ? 'DATA_INSUFFICIENT' : 'PASS',
        dataStatus: driverResult.coverage === 'MINIMAL' ? 'DATA_INSUFFICIENT' : 'VERIFIED',
        result: {
          drivers: driverResult.drivers,
          primaryDrivers: driverResult.primaryDrivers,
          businessModel: driverResult.businessModel,
          coverage: driverResult.coverage,
          sectorTemplate: businessModel,
          evaluatedAt: driverResult.evaluatedAt,
        },
        evidenceRefs: driverResult.drivers.flatMap(d => d.evidence),
        missingRequirements: [],
        warnings: driverResult.coverage === 'MINIMAL' ? ['Insufficient canonical facts for reliable driver state'] : [],
        evaluationTimestamp: evalTs,
        dataAsOf: evalTs,
        configVersion: '2.0.0',
        engineVersion: 'BusinessDriverEngine-v2.0',
      };
    } catch { /* Non-fatal — do not blank the response */ }

    // Wave 1: Management delivery history
    try {
      const deliveryHistory = await ManagementIntelligenceEngine.getInstance().getDeliveryHistory(cleanSym);
      if (deliveryHistory && modulesResult.management?.result) {
        modulesResult.management.result.deliveryHistory = {
          total: deliveryHistory.totalEvaluated,
          achieved: deliveryHistory.achieved,
          achievedLate: deliveryHistory.achievedLate,
          partiallyAchieved: deliveryHistory.partiallyAchieved,
          missed: deliveryHistory.missed,
          deferred: deliveryHistory.deferred,
          notYetDue: deliveryHistory.notYetDue,
          notVerifiable: deliveryHistory.notVerifiable,
          descriptiveLabel: deliveryHistory.descriptiveLabel,
        };
      }
    } catch { /* Non-fatal */ }

    // Wave 2: Contradiction detection
    try {
      const fundamental = fundamentalPayload as any;
      const contradictionInput = {
        symbol: cleanSym,
        securityId,
        revenue: fundamental?.revenue ?? null,
        revenuePrior: fundamental?.revenuePrior ?? null,
        pat: fundamental?.pat ?? null,
        patPrior: fundamental?.patPrior ?? null,
        cfo: fundamental?.cfo ?? null,
        cfoPrior: fundamental?.cfoPrior ?? null,
        netDebt: fundamental?.netDebt ?? null,
        netDebtPrior: fundamental?.netDebtPrior ?? null,
        receivableDays: fundamental?.receivableDays ?? null,
        receivableDaysPrior: fundamental?.receivableDaysPrior ?? null,
        capex: fundamental?.capex ?? null,
      };
      const contraResult = ContradictionEngine.getInstance().evaluate(contradictionInput);
      const evalTs = new Date().toISOString();
      modulesResult.contradictions = {
        moduleId: 'CONTRADICTIONS' as any,
        status: 'PASS',
        dataStatus: 'VERIFIED',
        result: {
          contradictions: contraResult.contradictions,
          openCount: contraResult.openCount,
          materialCount: contraResult.materialCount,
          patternsChecked: contraResult.patternsChecked,
          evaluatedAt: contraResult.evaluatedAt,
        },
        evidenceRefs: contraResult.contradictions.flatMap(c => c.evidence),
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: evalTs,
        configVersion: '2.0.0',
        engineVersion: 'ContradictionEngine-v2.0',
      };
    } catch { /* Non-fatal */ }

    // Wave 3: Attention + Questions
    try {
      const openContradictions = modulesResult.contradictions?.result?.contradictions.filter(c => c.status === 'OPEN') ?? [];
      const mgmtHistory = modulesResult.management?.result?.deliveryHistory;
      const missedCommitments = mgmtHistory && mgmtHistory.missed > 0
        ? [{ originalStatement: `${mgmtHistory.missed} commitment(s) missed`, metric: null, status: 'MISSED' as const }]
        : [];
      const driverDeltas = (modulesResult.businessDrivers?.result?.primaryDrivers ?? [])
        .filter(d => d.direction === 'DETERIORATING')
        .map(d => ({ item: d.name, metric: d.relatedMetrics[0] || null, direction: 'DETERIORATED' as const, materiality: 'MEDIUM' as const, affectsThesis: true, evidence: d.evidence, category: 'BUSINESS' as any, comparisonType: 'LAST_ANALYSIS' as any, previousState: null, currentState: d.currentState, explanation: `${d.name} is deteriorating`, deltaId: d.driverId }));

      const attentionResult = AttentionEngine.getInstance().evaluate({
        symbol: cleanSym,
        securityId,
        openContradictions,
        missedCommitments,
        materialDeltas: driverDeltas,
        primaryDriverIds: modulesResult.businessDrivers?.result?.primaryDrivers.map(d => d.driverId) ?? [],
      });

      const questionResult = QuestionEngine.getInstance().generate({
        symbol: cleanSym,
        securityId,
        contradictions: openContradictions,
        missedCommitments,
      });

      const evalTs = new Date().toISOString();
      modulesResult.attention = {
        moduleId: 'ATTENTION' as any,
        status: 'PASS',
        dataStatus: 'VERIFIED',
        result: {
          items: attentionResult.items,
          highCount: attentionResult.highCount,
          questions: questionResult,
          evaluatedAt: attentionResult.evaluatedAt,
        },
        evidenceRefs: [],
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: evalTs,
        configVersion: '2.0.0',
        engineVersion: 'AttentionEngine-v2.0',
      };
    } catch { /* Non-fatal */ }

    // Wave 2: Persist snapshot only if analytical state changed
    try {
      await CompanySnapshotStore.getInstance().saveIfChanged({
        securityId,
        symbol: cleanSym,
        asOfDate: generatedAt,
        fundamentalState: fundamentalPayload as any,
        managementState: modulesResult.management?.result ?? null,
        valuationState: modulesResult.valuation?.result ?? null,
        businessDriverState: modulesResult.businessDrivers?.result ?? null,
        technicalState: modulesResult.technical?.result ?? null,
      });
    } catch { /* Non-fatal */ }

    return {
      security: {
        securityId,
        symbol: cleanSym,
        companyName,
        isin,
        sector,
        industry,
        businessModel,
      },
      generatedAt,
      modules: modulesResult,
    };
  }

  private logTelemetry(telemetry: SimpleModuleTelemetry): void {
    // Minimal standard logging without heavy telemetry infrastructure
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[ModuleTelemetry] ${telemetry.symbol} ${telemetry.moduleId} ${telemetry.status} ${telemetry.durationMs}ms`);
    }
  }
}
