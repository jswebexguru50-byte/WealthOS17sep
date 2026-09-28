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
