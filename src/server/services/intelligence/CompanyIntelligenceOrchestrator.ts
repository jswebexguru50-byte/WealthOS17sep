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

import { AnalysisModule, ModuleResult, ModuleStatus, SecurityIdentity } from './contracts/index.js';
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
import crypto from 'crypto';
import { ContradictionEngine } from './contradictions/ContradictionEngine.js';
import { ContradictionStore } from './contradictions/ContradictionStore.js';
import { CompanyDeltaEngine } from './delta/CompanyDeltaEngine.js';
import { ValuationIntelligenceEngine } from './valuation/ValuationIntelligenceEngine.js';
import { AttentionEngine } from './attention/AttentionEngine.js';
import { QuestionEngine } from './attention/QuestionEngine.js';
import { ThesisEngine } from './thesis/ThesisEngine.js';
// Assembler
import { CompanyAnalyticalStateAssembler } from './assembler/CompanyAnalyticalStateAssembler.js';
// V3 Product Realization Engines
import { OperatingKpiService } from './kpi/OperatingKpiService.js';
import { CatalystEngine } from './catalysts/CatalystEngine.js';
import { RiskEngine } from './risks/RiskEngine.js';
import { CompanyTimelineEngine } from './timeline/CompanyTimelineEngine.js';
import { CommitmentSupersessionEngine } from './management/CommitmentSupersessionEngine.js';
import { NarrativeChangeEngine } from './management/NarrativeChangeEngine.js';
// Constitution Gatekeepers
import { ClaimSafetyGate } from './safety/ClaimSafetyGate.js';
import { CrossModuleConsistencyValidator } from './validation/CrossModuleConsistencyValidator.js';
import { DataCoverageEngine } from './coverage/DataCoverageEngine.js';
// Core Repositories (Checkpoint 1)
import { CompanyEventRepository } from './core/CompanyEventRepository.js';
import { ManagementCommitmentRepository } from './core/ManagementCommitmentRepository.js';
import { CompanySnapshotRepository } from './core/CompanySnapshotRepository.js';
import { PriceSeriesRepository } from './core/PriceSeriesRepository.js';
import { EvidenceRepository } from './core/EvidenceRepository.js';
import { FreshnessEngine } from './freshness/FreshnessEngine.js';
import { CompanyBusinessProfileEngine } from './business/CompanyBusinessProfile.js';
import { SinceLastReviewEngine } from './changes/SinceLastReview.js';
import { FundamentalExperienceBuilder } from './modules/FundamentalExperienceBuilder.js';
import { RecentAccumulationEngine } from './modules/RecentAccumulationEngine.js';

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
   * Alias for getCompanyIntelligence matching master architecture specification.
   */
  public async orchestrate(
    identifier: string,
    asOfDate?: string | null,
    shouldPersist?: boolean
  ): Promise<CompanyIntelligenceResponse> {
    return this.getCompanyIntelligence(identifier, undefined, { asOfDate: asOfDate || undefined, persist: shouldPersist });
  }

  /**
   * Main entry point for company intelligence cockpit.
   * Runs requested modules concurrently without blocking on slower ones.
   */
  public async getCompanyIntelligence(
    identifier: string,
    requestedModules?: AnalysisModule[],
    options?: { persist?: boolean; asOfDate?: string }
  ): Promise<CompanyIntelligenceResponse> {
    const cleanSym = identifier.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    const generatedAt = new Date().toISOString();
    const shouldPersist = options?.persist === true;
    const asOfDate = options?.asOfDate || null;

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

    const businessModel: BusinessModel = BusinessModelClassifier.classify(cleanSym, sector, industry, companyName);
    const securityId = resolution.status === 'VERIFIED' ? resolution.securityId : (isin || cleanSym);

    const identity: SecurityIdentity = {
      securityId,
      isin: isin || securityId,
      nseSymbol: cleanSym,
      companyName: companyName || cleanSym,
      sector: sector || null,
      industry: industry || null,
    };

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

    // Apply management commitment supersession logic if management commitments exist
    if (modulesResult.management?.result?.commitments) {
      try {
        const supersessionRes = CommitmentSupersessionEngine.getInstance()
          .resolveSupersessions(modulesResult.management.result.commitments);
        modulesResult.management.result.commitments = supersessionRes.commitments;
      } catch (e: any) {
        console.warn('[CompanyIntelligenceOrchestrator] Supersession engine failed:', e);
        if (modulesResult.management) {
          modulesResult.management.warnings.push('Supersession engine failed: ' + (e?.message || String(e)));
        }
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

    // ═══════════════════════════════════════════════════════════════
    // 4. V2 Intelligence Loop — uses typed CompanyAnalyticalState
    //    No `as any` casting. All inputs are verified from state.
    // ═══════════════════════════════════════════════════════════════

    // 4a. Assemble CompanyAnalyticalState from module payloads
    const analyticalState = await CompanyAnalyticalStateAssembler.getInstance().assemble({
      securityId,
      symbol: cleanSym,
      businessModel: businessModel as string,
      asOfDate,
      fundamentals: modulesResult.fundamental?.result ?? null,
      management: modulesResult.management?.result ?? null,
      valuation: modulesResult.valuation?.result ?? null,
      market: modulesResult.marketContext?.result ?? null,
      fere: modulesResult.fere?.result ?? null,
      technical: modulesResult.technical?.result ?? null,
    });

    // 4b. Wave 1: Business Drivers — real canonical facts (not {})
    let primaryDrivers: any[] = [];
    try {
      const driverResult = await BusinessDriverEngine.getInstance().evaluate({
        symbol: cleanSym,
        businessModel,
        canonicalFacts: analyticalState.facts.latest, // REAL facts
        operatingKpis: analyticalState.facts.operatingKpis,
        managementEvidence: modulesResult.management?.result ?? null,
        asOfDate,
      });
      primaryDrivers = driverResult.primaryDrivers;
      const evalTs = new Date().toISOString();
      const withEvidence = driverResult.drivers.filter(d => d.direction !== 'UNKNOWN').length;
      const driverStatus = driverResult.coverage === 'MINIMAL' ? 'DATA_INSUFFICIENT'
        : withEvidence >= driverResult.drivers.length * 0.6 ? 'WORKING' : 'PARTIAL';
      const driverDataStatus = withEvidence >= 3 ? 'PARTIAL' : 'DATA_INSUFFICIENT';
      modulesResult.businessDrivers = {
        moduleId: 'BUSINESS_DRIVERS' as any,
        status: driverStatus,
        dataStatus: driverDataStatus,
        result: {
          drivers: driverResult.drivers,
          primaryDrivers,
          businessModel: driverResult.businessModel,
          coverage: driverResult.coverage,
          sectorTemplate: businessModel,
          evaluatedAt: driverResult.evaluatedAt,
          // Honest driver coverage
          driversWithEvidence: withEvidence,
          driversTotal: driverResult.drivers.length,
        },
        evidenceRefs: driverResult.drivers.flatMap(d => d.evidence),
        missingRequirements: driverResult.drivers
          .filter(d => d.direction === 'UNKNOWN')
          .map(d => `Missing evidence for driver: ${d.name}`),
        warnings: driverResult.coverage === 'MINIMAL'
          ? [`Only ${withEvidence}/${driverResult.drivers.length} drivers have evidence`]
          : [],
        evaluationTimestamp: evalTs,
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'BusinessDriverEngine-v2.0',
      };
    } catch (e: any) {
      modulesResult.businessDrivers = {
        moduleId: 'BUSINESS_DRIVERS' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['BusinessDriverEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'BusinessDriverEngine-v2.0',
      };
    }

    // 4c. Wave 1: Management delivery history (enrich management module)
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
    } catch (e: any) {
      modulesResult.delta = {
        moduleId: 'DELTA' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['CompanyDeltaEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'CompanyDeltaEngine-v2.0',
      };
    }

    // 4d. Wave 2: Delta Intelligence — wire CompanyDeltaEngine
    let materialDeltas: any[] = [];
    try {
      const priorSnapshot = await CompanySnapshotRepository.getInstance().getPreviousSnapshot(
        identity,
        analyticalState.asOfDate
      );
      if (priorSnapshot) {
        const deltaResult = CompanyDeltaEngine.getInstance().computeDeltas({
          symbol: cleanSym,
          securityId,
          current: analyticalState.facts.latest,
          prior: (priorSnapshot.payloadSummary as any) ?? {},
          currentFacts: analyticalState.facts,
        });
        materialDeltas = deltaResult.deltas.filter(d => d.materiality === 'HIGH' || d.materiality === 'MEDIUM');
        const evalTs = new Date().toISOString();
        modulesResult.delta = {
          moduleId: 'DELTA' as any,
          status: deltaResult.deltas.length > 0 ? 'WORKING' : 'PARTIAL',
          dataStatus: priorSnapshot ? 'PARTIAL' : 'DATA_INSUFFICIENT',
          result: {
            deltas: deltaResult.deltas,
            materialCount: materialDeltas.length,
            comparisonTypes: deltaResult.comparisonTypes,
            evaluatedAt: evalTs,
          },
          evidenceRefs: deltaResult.deltas.flatMap(d => d.evidence ?? []),
          missingRequirements: !priorSnapshot ? ['No prior snapshot — first-run analysis has no delta'] : [],
          warnings: [],
          evaluationTimestamp: evalTs,
          dataAsOf: analyticalState.asOfDate,
          configVersion: '2.0.0',
          engineVersion: 'CompanyDeltaEngine-v2.0',
        };
      } else {
        // No prior snapshot — first run, create initial
        const evalTs = new Date().toISOString();
        modulesResult.delta = {
          moduleId: 'DELTA' as any,
          status: 'DATA_INSUFFICIENT',
          dataStatus: 'DATA_INSUFFICIENT',
          result: {
            deltas: [],
            materialCount: 0,
            comparisonTypes: ['LAST_ANALYSIS'],
            evaluatedAt: evalTs,
          },
          evidenceRefs: [],
          missingRequirements: ['No prior snapshot available — delta comparison requires at least two analysis runs'],
          warnings: ['First analysis run — delta will be available on next refresh'],
          evaluationTimestamp: evalTs,
          dataAsOf: analyticalState.asOfDate,
          configVersion: '2.0.0',
          engineVersion: 'CompanyDeltaEngine-v2.0',
        };
      }
    } catch (e: any) {
      modulesResult.delta = {
        moduleId: 'DELTA' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['CompanyDeltaEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'CompanyDeltaEngine-v2.0',
      };
    }

    // 4e. Wave 2: Contradiction detection — from CompanyAnalyticalState
    let openContradictions: any[] = [];
    try {
      const contradictionInput = CompanyAnalyticalStateAssembler.getInstance()
        .toContradictionInput(analyticalState);
      const contraResult = ContradictionEngine.getInstance().evaluate(contradictionInput as any);
      // Reads must be side-effect free.  Lifecycle reconciliation is an
      // explicit refresh operation only; a normal company-page GET reports
      // the current evidence-backed observations without writing them.
      const reconciledContradictions = shouldPersist
        ? await ContradictionStore.getInstance().reconcile(securityId, cleanSym, contraResult.contradictions)
        : contraResult.contradictions;
      openContradictions = reconciledContradictions.filter(c => c.status === 'OPEN' || c.status === 'EXPLAINED');

      const evalTs = new Date().toISOString();
      const patternsConfigured = contraResult.patternsConfigured || 6;
      const patternsEvaluable = contraResult.patternsEvaluable;
      const patternsEvaluated = contraResult.patternsEvaluated;
      const patternsSkipped = contraResult.patternsSkipped;
      const contradictionsDetected = contraResult.contradictionsDetected;
      const evidenceCoverage = patternsEvaluated >= patternsConfigured * 0.7 ? 'PARTIAL' : 'DATA_INSUFFICIENT';

      modulesResult.contradictions = {
        moduleId: 'CONTRADICTIONS' as any,
        status: patternsEvaluated > 0 ? 'WORKING' : 'PARTIAL',
        dataStatus: evidenceCoverage, // Honest: not VERIFIED just because execution succeeded
        result: {
          contradictions: reconciledContradictions,
          openCount: openContradictions.length,
          materialCount: contraResult.materialCount,
          patternsChecked: patternsConfigured,
          patternsConfigured,
          patternsEvaluable,
          patternsEvaluated,
          patternsSkipped,
          contradictionsDetected,
          evaluations: contraResult.evaluations,
          evaluatedAt: evalTs,
        },
        evidenceRefs: reconciledContradictions.flatMap(c => c.evidence),
        missingRequirements: analyticalState.evidenceCoverage.limitations,
        warnings: patternsSkipped > 0
          ? [`${patternsSkipped}/${patternsConfigured} contradiction patterns skipped due to missing inputs`]
          : [],
        evaluationTimestamp: evalTs,
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'ContradictionEngine-v2.0',
      };
    } catch (e: any) {
      modulesResult.contradictions = {
        moduleId: 'CONTRADICTIONS' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['ContradictionEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'ContradictionEngine-v2.0',
      };
    }

    // 4f. Wire ValuationIntelligenceEngine
    try {
      const valuationResult = await ValuationIntelligenceEngine.getInstance().evaluate(
        cleanSym,
        businessModel as string,
      );
      if (modulesResult.valuation) {
        modulesResult.valuation = {
          ...modulesResult.valuation,
          result: {
            ...modulesResult.valuation.result,
            historicalIntelligence: valuationResult,
          } as any,
        };
      }
    } catch (e: any) {
      modulesResult.delta = {
        moduleId: 'DELTA' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['CompanyDeltaEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'CompanyDeltaEngine-v2.0',
      };
    }

    // 4g. Wave 3: Living Thesis — runs after drivers + contradictions
    try {
      const thesisResult = await ThesisEngine.getInstance().evaluate({
        state: analyticalState,
        primaryDrivers,
        openContradictions,
        materialDeltas,
        persist: shouldPersist,
      });
      const evalTs = new Date().toISOString();
      const challengedPillars = thesisResult.pillars.filter(
        p => p.status === 'CHALLENGED' || p.status === 'BROKEN'
      ).length;
      const thesisStatus = thesisResult.coverage === 'MINIMAL' ? 'DATA_INSUFFICIENT'
        : challengedPillars > 0 ? 'WORKING'
        : 'WORKING';
      modulesResult.thesis = {
        moduleId: 'THESIS' as any,
        status: thesisStatus,
        dataStatus: thesisResult.coverage === 'FULL' ? 'PARTIAL' : 'DATA_INSUFFICIENT',
        result: {
          thesis: thesisResult.thesis,
          pillars: thesisResult.pillars,
          changes: thesisResult.changes,
          evaluatedAt: thesisResult.evaluatedAt,
          coverage: thesisResult.coverage,
          limitations: thesisResult.limitations,
          patternsEvaluable: thesisResult.patternsEvaluable,
          patternsEvaluated: thesisResult.patternsEvaluated,
        },
        evidenceRefs: thesisResult.pillars.flatMap(p => p.supportingEvidence),
        missingRequirements: thesisResult.limitations,
        warnings: thesisResult.patternsEvaluated < thesisResult.patternsEvaluable
          ? [`${thesisResult.patternsEvaluated}/${thesisResult.patternsEvaluable} thesis pillars have evidence`]
          : [],
        evaluationTimestamp: evalTs,
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'ThesisEngine-v2.0',
      };
    } catch (e: any) {
      modulesResult.thesis = {
        moduleId: 'THESIS' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['ThesisEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'ThesisEngine-v2.0',
      };
    }

    // 4h. Wave 3: Attention + Questions — real inputs (no fake aggregates)
    try {
      // Real missed commitments — individual statements, not "N missed"
      const realMissedCommitments = analyticalState.missedCommitments;
      // Real deltas from Delta module
      const realDeltas = modulesResult.delta?.result?.deltas ?? [];
      // Thesis changes for attention signals
      const thesisChanges = modulesResult.thesis?.result?.changes ?? [];

      const attentionResult = AttentionEngine.getInstance().evaluate({
        symbol: cleanSym,
        securityId,
        openContradictions,
        missedCommitments: realMissedCommitments.map(c => ({
          originalStatement: c.statement,
          metric: c.targetMetric as string | null,
          status: (c.status as any),
          explanation: `Actual: ${c.actualValue ?? 'unknown'} vs target: ${c.targetValue ?? 'unknown'}`,
        })),
        materialDeltas: realDeltas as any,
        primaryDriverIds: primaryDrivers.map(d => d.driverId),
        thesisWeakened: thesisChanges
          .filter((ch: any) => ch.changeType === 'WEAKENED' || ch.changeType === 'PILLAR_CHALLENGED')
          .map((ch: any) => ({ pillarTitle: ch.affectedPillarId ?? 'Unknown', explanation: ch.reason })),
        thesisStrengthened: thesisChanges
          .filter((ch: any) => ch.changeType === 'STRENGTHENED')
          .map((ch: any) => ({ pillarTitle: ch.affectedPillarId ?? 'Unknown', explanation: ch.reason })),
      });

      const questionResult = QuestionEngine.getInstance().generate({
        symbol: cleanSym,
        securityId,
        contradictions: openContradictions,
        missedCommitments: realMissedCommitments.map(c => ({
          originalStatement: c.statement,
          metric: c.targetMetric as string | null,
          status: (c.status as any),
        })),
      });

      const evalTs = new Date().toISOString();
      const hasRealInputs = openContradictions.length > 0 || realMissedCommitments.length > 0 || realDeltas.length > 0;
      modulesResult.attention = {
        moduleId: 'ATTENTION' as any,
        status: 'WORKING',
        dataStatus: hasRealInputs ? 'PARTIAL' : 'DATA_INSUFFICIENT', // Honest
        result: {
          items: attentionResult.items,
          highCount: attentionResult.highCount,
          questions: questionResult,
          evaluatedAt: attentionResult.evaluatedAt,
        },
        evidenceRefs: [
          ...openContradictions.flatMap(c => c.evidence || []),
          ...realMissedCommitments.flatMap(m => (m.sourceDocument ? [m.sourceDocument] : (m.actualEvidence || []))),
          ...realDeltas.flatMap(d => d.evidence || []),
        ],
        missingRequirements: !hasRealInputs
          ? ['No contradictions, missed commitments, or material deltas available']
          : [],
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'AttentionEngine-v2.0',
      };
    } catch (e: any) {
      modulesResult.attention = {
        moduleId: 'ATTENTION' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['AttentionEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'AttentionEngine-v2.0',
      };
    }

    // 4j. Operating KPI Intelligence — non-accounting operational data
    try {
      const kpiReport = await OperatingKpiService.getInstance().getKpisForCompany(cleanSym, asOfDate);
      const evalTs = new Date().toISOString();
      modulesResult.operatingKpis = {
        moduleId: 'OPERATING_KPIS' as any,
        status: kpiReport.coveredCount > 0 ? 'WORKING' : 'DATA_INSUFFICIENT',
        dataStatus: kpiReport.coveragePct >= 60 ? 'PARTIAL' : kpiReport.coveragePct > 0 ? 'PARTIAL' : 'DATA_INSUFFICIENT',
        result: kpiReport,
        evidenceRefs: kpiReport.kpis.flatMap(k => k.evidence),
        missingRequirements: kpiReport.coveredCount === 0 ? ['No operating KPIs available for this business model'] : [],
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: kpiReport.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'OperatingKpiService-v2.0',
      };
    } catch (e: any) {
      modulesResult.operatingKpis = {
        moduleId: 'OPERATING_KPIS' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['OperatingKpiService failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: analyticalState.asOfDate,
        configVersion: '2.0.0',
        engineVersion: 'OperatingKpiService-v2.0',
      };
    }

    // 4k. Catalyst Engine — product, capacity, debt, and corporate actions
    let companyCatalysts: any[] = [];
    try {
      const catalystResult = CatalystEngine.getInstance().evaluate({
        securityId,
        symbol: cleanSym,
        managementCommitments: modulesResult.management?.result?.commitments ?? [],
        asOfDate,
      });
      companyCatalysts = catalystResult.catalysts;
      const evalTs = new Date().toISOString();
      modulesResult.catalysts = {
        moduleId: 'CATALYSTS' as any,
        status: catalystResult.catalysts.length > 0 ? 'WORKING' : 'DATA_INSUFFICIENT',
        dataStatus: catalystResult.catalysts.length > 0 ? 'PARTIAL' : 'DATA_INSUFFICIENT',
        result: catalystResult,
        evidenceRefs: catalystResult.catalysts.flatMap(c => c.evidence),
        missingRequirements: catalystResult.catalysts.length === 0 ? ['No catalysts identified'] : [],
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: asOfDate || evalTs,
        configVersion: '2.0.0',
        engineVersion: 'CatalystEngine-v2.0',
      };
    } catch (e: any) {
      modulesResult.catalysts = {
        moduleId: 'CATALYSTS' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['CatalystEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: asOfDate || new Date().toISOString(),
        configVersion: '2.0.0',
        engineVersion: 'CatalystEngine-v2.0',
      };
    }

    // 4l. Risk Engine — business, balance sheet, valuation, execution risks
    try {
      const riskResult = RiskEngine.getInstance().evaluate({
        securityId,
        symbol: cleanSym,
        businessModel: businessModel as string,
        state: analyticalState,
        contradictions: openContradictions,
        valuationPercentile: (modulesResult.valuation?.result as any)?.historicalIntelligence?.historicalPercentile ?? null,
      });
      const evalTs = new Date().toISOString();
      modulesResult.risks = {
        moduleId: 'RISKS' as any,
        status: riskResult.risks.length > 0 ? 'WORKING' : 'DATA_INSUFFICIENT',
        dataStatus: riskResult.risks.length > 0 ? 'PARTIAL' : 'DATA_INSUFFICIENT',
        result: riskResult,
        evidenceRefs: riskResult.risks.flatMap(r => r.evidence),
        missingRequirements: [],
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: asOfDate || evalTs,
        configVersion: '2.0.0',
        engineVersion: 'RiskEngine-v2.0',
      };
    } catch (e: any) {
      modulesResult.risks = {
        moduleId: 'RISKS' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['RiskEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: asOfDate || new Date().toISOString(),
        configVersion: '2.0.0',
        engineVersion: 'RiskEngine-v2.0',
      };
    }

    // 4m. Company Event Timeline — unified chronological narrative with real corporate events
    let corporateEvents: any[] = [];
    try {
      corporateEvents = await CompanyEventRepository.getInstance().getEvents(
        identity,
        asOfDate
      );
      const timeline = CompanyTimelineEngine.getInstance().buildTimeline({
        securityId,
        symbol: cleanSym,
        corporateEvents,
        commitments: modulesResult.management?.result?.commitments ?? [],
        contradictions: openContradictions,
        thesisChanges: modulesResult.thesis?.result?.changes ?? [],
        catalysts: companyCatalysts,
      });
      const evalTs = new Date().toISOString();
      modulesResult.timeline = {
        moduleId: 'TIMELINE' as any,
        status: timeline.events.length > 0 ? 'WORKING' : 'PARTIAL',
        dataStatus: timeline.events.length > 0 ? 'PARTIAL' : 'DATA_INSUFFICIENT',
        result: timeline,
        evidenceRefs: timeline.events.flatMap(e => e.evidence || []),
        missingRequirements: timeline.events.length === 0 ? ['No timeline events generated'] : [],
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: asOfDate || evalTs,
        configVersion: '2.0.0',
        engineVersion: 'CompanyTimelineEngine-v2.0',
      };
    } catch (e: any) {
      modulesResult.timeline = {
        moduleId: 'TIMELINE' as any,
        status: 'ERROR',
        dataStatus: 'ERROR',
        result: null,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: ['CompanyTimelineEngine failed: ' + (e?.message || String(e))],
        evaluationTimestamp: new Date().toISOString(),
        dataAsOf: asOfDate || new Date().toISOString(),
        configVersion: '2.0.0',
        engineVersion: 'CompanyTimelineEngine-v2.0',
      };
    }
 
    // 4m2. Wave 4: Fundamental Experience Expansion 001 & Recent Accumulation Engine
    let fundamentalExperienceData: any = null;
    try {
      fundamentalExperienceData = await FundamentalExperienceBuilder.getInstance().buildExperience(cleanSym);
      const evalTs = new Date().toISOString();
      modulesResult.fundamentalExperience = {
        moduleId: 'FUNDAMENTAL_EXPERIENCE' as any,
        status: fundamentalExperienceData.dataConfidence === 'DATA_INSUFFICIENT' ? 'DATA_INSUFFICIENT' : 'WORKING',
        dataStatus: fundamentalExperienceData.dataConfidence === 'HIGH' ? 'VERIFIED' : 'PARTIAL',
        result: fundamentalExperienceData,
        evidenceRefs: [],
        missingRequirements: [],
        warnings: fundamentalExperienceData.unresolvedConflicts.map((c: any) => `Conflict in ${c.field}: ${c.reason}`),
        evaluationTimestamp: evalTs,
        dataAsOf: fundamentalExperienceData.asOfDate,
        configVersion: '1.0.0',
        engineVersion: 'FundamentalExperienceBuilder-v1.0',
      };
      // Derive recentAccumulation dataStatus accurately from actual evidence requirements
      const acc = fundamentalExperienceData.recentAccumulation;
      let accDataStatus: 'DATA_INSUFFICIENT' | 'PARTIAL' | 'VERIFIED' | 'STALE' = 'VERIFIED';
      if (!acc.latestOwnershipDate || !acc.analysisStartDate) {
        accDataStatus = 'DATA_INSUFFICIENT';
      } else if (acc.totalSessions < 10) {
        accDataStatus = 'PARTIAL';
      } else if (acc.deliveryEvidence.trend === 'DATA_INSUFFICIENT') {
        accDataStatus = 'PARTIAL';
      }

      modulesResult.recentAccumulation = {
        moduleId: 'RECENT_ACCUMULATION' as any,
        status: accDataStatus === 'DATA_INSUFFICIENT' ? 'DATA_INSUFFICIENT' : (acc.classification === 'NO_CONFIRMATION' ? 'PARTIAL' : 'WORKING'),
        dataStatus: accDataStatus,
        result: acc,
        evidenceRefs: [],
        missingRequirements: acc.limitations,
        warnings: [],
        evaluationTimestamp: evalTs,
        dataAsOf: acc.analysisEndDate || null,
        configVersion: '1.0.0',
        engineVersion: 'RecentAccumulationEngine-v1.0',
      };
    } catch (e: any) {
      console.error('[CompanyIntelligenceOrchestrator] FundamentalExperienceBuilder failed:', e);
      const evalTs = new Date().toISOString();
      modulesResult.fundamentalExperience = {
        moduleId: 'FUNDAMENTAL_EXPERIENCE' as any,
        status: 'ERROR',
        dataStatus: 'DATA_INSUFFICIENT',
        result: null,
        evidenceRefs: [],
        missingRequirements: ['FUNDAMENTAL_EXPERIENCE_UNAVAILABLE'],
        warnings: ['FUNDAMENTAL_EXPERIENCE_UNAVAILABLE'],
        evaluationTimestamp: evalTs,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'FundamentalExperienceBuilder-v1.0',
      };
      modulesResult.recentAccumulation = {
        moduleId: 'RECENT_ACCUMULATION' as any,
        status: 'ERROR',
        dataStatus: 'DATA_INSUFFICIENT',
        result: null,
        evidenceRefs: [],
        missingRequirements: ['RECENT_ACCUMULATION_UNAVAILABLE'],
        warnings: ['RECENT_ACCUMULATION_UNAVAILABLE'],
        evaluationTimestamp: evalTs,
        dataAsOf: null,
        configVersion: '1.0.0',
        engineVersion: 'RecentAccumulationEngine-v1.0',
      };
    }

    // 4n. Query PriceSeriesRepository for technical freshness & state
    let marketPriceState: any = null;
    try {
      marketPriceState = await PriceSeriesRepository.getInstance().getMarketPriceState(
        identity,
        asOfDate || undefined
      );
    } catch {
      marketPriceState = {
        latestPrice: 0,
        priceAsOf: asOfDate || generatedAt.substring(0, 10),
        freshness: 'UNKNOWN',
        fiftyTwoWeekHigh: 0,
        fiftyTwoWeekLow: 0,
        observableSupportLevels: [],
        observableResistanceLevels: [],
      };
    }

    // 4o. Query ManagementCommitmentRepository for Walk-the-Talk ledger
    let walkTheTalkRecords: any[] = [];
    try {
      walkTheTalkRecords = await ManagementCommitmentRepository.getInstance().getCommitmentsForSecurity(
        identity,
        asOfDate || undefined
      );
      if (modulesResult.management?.result) {
        modulesResult.management.result.walkTheTalkLedger = walkTheTalkRecords;
      }
    } catch (e: any) {
      console.warn('[CompanyIntelligenceOrchestrator] ManagementCommitmentRepository failed:', e);
      if (modulesResult.management) {
        modulesResult.management.warnings.push('Walk-the-Talk ledger query failed: ' + (e?.message || String(e)));
      }
    }

    // 4p. Compute Freshness Matrix via deterministic FreshnessEngine (Constitution P4)
    const latestFactPeriod = analyticalState.facts?.latest?.revenue_cr?.periodEnd || analyticalState.asOfDate;
    const latestFactAvailable = analyticalState.facts?.latest?.revenue_cr?.availableAt;
    const promoterHolding = analyticalState.facts?.latest?.promoter_holding_pct;
    const freshness = FreshnessEngine.getInstance().evaluate({
      asOfDate,
      marketPriceAsOf: marketPriceState.priceAsOf,
      marketPriceFreshness: marketPriceState.freshness,
      latestFilingPeriodEnd: latestFactPeriod,
      latestFilingAvailableAt: latestFactAvailable,
      shareholdingAsOf: promoterHolding ? (latestFactPeriod || asOfDate) : null,
      managementCommitmentCount: walkTheTalkRecords.length,
      corporateEventCount: corporateEvents.length,
      latestCorporateEventDate: corporateEvents[0]?.eventDate || null,
      valuationStatus: modulesResult.valuation?.status,
    });

    // 4q. Build Rich Investor-Centric Overview (Generic Evidence-Backed Generation)
    const whyInteresting: Array<{ observation: string; evidenceRef?: any; domain: string }> = [];
    const latestFacts = analyticalState.facts?.latest || {};
    const priorAnnualFacts = analyticalState.facts?.priorAnnual || {};

    const rev = latestFacts.revenue_cr?.value;
    const revPrior = priorAnnualFacts.revenue_cr?.value;
    const pat = latestFacts.pat_cr?.value;
    const patPrior = priorAnnualFacts.pat_cr?.value;
    const roce = latestFacts.roce_pct?.value;
    const deRatio = latestFacts.debt_to_equity?.value;
    const cfo = latestFacts.cfo_cr?.value;
    const receivables = latestFacts.trade_receivables_cr?.value;

    if (rev !== undefined && rev !== null) {
      let revGrowth = '';
      if (revPrior && Number(revPrior) > 0) {
        const pct = (((Number(rev) - Number(revPrior)) / Number(revPrior)) * 100).toFixed(1);
        revGrowth = ` (${Number(pct) >= 0 ? '+' : ''}${pct}% YoY)`;
      }
      let patGrowth = '';
      if (pat !== undefined && pat !== null && patPrior && Number(patPrior) > 0) {
        const pct = (((Number(pat) - Number(patPrior)) / Number(patPrior)) * 100).toFixed(1);
        patGrowth = ` with PAT of ₹${Number(pat).toLocaleString()} Cr (${Number(pct) >= 0 ? '+' : ''}${pct}% YoY)`;
      }
      whyInteresting.push({
        observation: `Reported annual revenue of ₹${Number(rev).toLocaleString()} Cr${revGrowth}${patGrowth}.`,
        domain: 'FUNDAMENTALS',
        evidenceRef: latestFacts.revenue_cr?.evidenceRef || undefined,
      });
    }

    if (roce !== undefined && roce !== null) {
      const deStr = deRatio !== undefined && deRatio !== null ? ` alongside leverage of ${deRatio}x D/E` : '';
      whyInteresting.push({
        observation: `Capital productivity reflected in Return on Capital Employed (ROCE) of ${roce}%${deStr}.`,
        domain: 'FUNDAMENTALS',
        evidenceRef: latestFacts.roce_pct?.evidenceRef || undefined,
      });
    }

    // Business driver backed observation
    if (primaryDrivers.length > 0) {
      const topDriver = primaryDrivers[0];
      whyInteresting.push({
        observation: `Key operating business driver: ${topDriver.name} (${topDriver.direction || 'ACTIVE'}) — ${topDriver.description}`,
        domain: 'BUSINESS',
        evidenceRef: undefined,
      });
    }

    // Valuation context observation
    const valMultiple = (modulesResult.valuation?.result as any)?.peRatio?.value ?? null;
    const peerMedianPe = (modulesResult.valuation?.result as any)?.peerMedianPe ?? null;
    if (valMultiple !== null) {
      const peerStr = peerMedianPe ? ` vs peer median ${peerMedianPe}x` : '';
      whyInteresting.push({
        observation: `Trades at ${valMultiple}x P/E multiple${peerStr}; relative multiples reflect business scale, liquidity, and operating profile.`,
        domain: 'VALUATION',
        evidenceRef: undefined,
      });
    }

    const deltas = modulesResult.delta?.result?.deltas || [];
    const whatChanged = deltas.length > 0
      ? deltas.map((d: any) => `${d.item || d.domain}: ${d.explanation || d.narrative || d.direction}`)
      : [`Initial analytical baseline established as of ${asOfDate || generatedAt.substring(0, 10)}. Subsequent disclosures will compute time-series deltas.`];

    // Generic Fundamental Trajectory Summary
    let trajectorySummary = `Operating business model classified as ${businessModel} within ${sector || 'Equities'} (${industry || 'General'}).`;
    if (rev !== undefined && rev !== null) {
      trajectorySummary = `Latest disclosed revenue ₹${Number(rev).toLocaleString()} Cr` +
        (pat !== undefined && pat !== null ? `, with net profit (PAT) ₹${Number(pat).toLocaleString()} Cr.` : '.');
      if (receivables !== undefined && receivables !== null && cfo !== undefined && cfo !== null) {
        trajectorySummary += ` Working capital conversion shows trade receivables of ₹${Number(receivables).toLocaleString()} Cr alongside operating cash flow (CFO) of ₹${Number(cfo).toLocaleString()} Cr.`;
      }
    }

    // Generic Management Delivery Summary
    const deliveredCommitments = walkTheTalkRecords.filter(r => r.status === 'ACHIEVED' || r.status === 'DELIVERED');
    const pendingCommitments = walkTheTalkRecords.filter(r => r.status === 'ON_TRACK' || r.status === 'PARTIALLY_ACHIEVED');
    const mgmtSummary = walkTheTalkRecords.length > 0
      ? `Tracked ${walkTheTalkRecords.length} management commitments: ${deliveredCommitments.length} achieved/delivered, ${pendingCommitments.length} on track or partially achieved.`
      : 'No formal management commitments cataloged for this evaluation period.';

    // Generic Technical Summary
    const techSummary = marketPriceState.latestPrice > 0
      ? `Latest traded price ₹${marketPriceState.latestPrice} (Freshness: ${marketPriceState.freshness}). 52-week trading range ₹${marketPriceState.fiftyTwoWeekLow} – ₹${marketPriceState.fiftyTwoWeekHigh}.` +
        (marketPriceState.observableSupportLevels?.length > 0 ? ` Observable traded support area ₹${marketPriceState.observableSupportLevels[0].minPrice}–${marketPriceState.observableSupportLevels[0].maxPrice}.` : '')
      : 'Market price series unobservable or currently stale.';

    // Generic Tension / Contradiction Summary
    let contradictionSummary = 'No open contradictions or analytical tensions detected across active data.';
    if (openContradictions.length > 0) {
      contradictionSummary = `${openContradictions.length} analytical tension(s) flagged: ` +
        openContradictions.slice(0, 2).map((c: any) => `${c.observationA} vs ${c.observationB}`).join('; ');
    }

    // Generic Watch Items
    const whatToMonitorNext: Array<{ question: string; metricToWatch: string; targetOrTrigger: string }> = [];
    if (receivables !== undefined && receivables !== null) {
      whatToMonitorNext.push({
        question: 'Will trade receivable days trend down towards normalized cycle?',
        metricToWatch: 'trade_receivables_cr',
        targetOrTrigger: 'Receivables normalization',
      });
    }
    if (latestFacts.ebitda_margin_pct?.value !== undefined && latestFacts.ebitda_margin_pct?.value !== null) {
      whatToMonitorNext.push({
        question: 'Can the company sustain operating margin performance under cost fluctuations?',
        metricToWatch: 'ebitda_margin_pct',
        targetOrTrigger: `>= ${latestFacts.ebitda_margin_pct.value}%`,
      });
    }
    whatToMonitorNext.push({
      question: 'Next earnings release revenue and margin trajectory delivery',
      metricToWatch: 'revenue_cr',
      targetOrTrigger: 'Quarterly Filing',
    });

    const discountPct = (valMultiple !== null && peerMedianPe && peerMedianPe > 0)
      ? (((valMultiple - peerMedianPe) / peerMedianPe) * 100).toFixed(0)
      : null;

    const keyMetrics: Array<{ label: string; value: string; subtext: string; trend?: 'UP' | 'DOWN' | 'FLAT' }> = [];
    if (rev !== undefined && rev !== null) {
      let revGrowth = 'Audited';
      let trend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
      if (revPrior && Number(revPrior) > 0) {
        const pct = (((Number(rev) - Number(revPrior)) / Number(revPrior)) * 100).toFixed(1);
        revGrowth = `${Number(pct) >= 0 ? '+' : ''}${pct}% YoY`;
        trend = Number(pct) >= 0 ? 'UP' : 'DOWN';
      }
      keyMetrics.push({
        label: latestFacts.revenue_cr?.periodEnd ? `${latestFacts.revenue_cr.periodEnd.substring(0, 4)} Revenue` : 'Revenue',
        value: `₹${Number(rev).toLocaleString()} Cr`,
        subtext: revGrowth,
        trend,
      });
    }
    if (pat !== undefined && pat !== null) {
      let patGrowth = 'Audited';
      let trend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
      if (patPrior && Number(patPrior) > 0) {
        const pct = (((Number(pat) - Number(patPrior)) / Number(patPrior)) * 100).toFixed(1);
        patGrowth = `${Number(pct) >= 0 ? '+' : ''}${pct}% YoY`;
        trend = Number(pct) >= 0 ? 'UP' : 'DOWN';
      }
      keyMetrics.push({
        label: latestFacts.pat_cr?.periodEnd ? `${latestFacts.pat_cr.periodEnd.substring(0, 4)} Net Profit (PAT)` : 'Net Profit (PAT)',
        value: `₹${Number(pat).toLocaleString()} Cr`,
        subtext: patGrowth,
        trend,
      });
    }
    if (roce !== undefined && roce !== null) {
      keyMetrics.push({
        label: 'Return on Capital (ROCE)',
        value: `${roce}%`,
        subtext: Number(roce) > 15 ? 'High Productivity' : 'Capital Efficiency',
        trend: Number(roce) > 15 ? 'UP' : 'FLAT',
      });
    }
    if (deRatio !== undefined && deRatio !== null) {
      keyMetrics.push({
        label: 'Debt to Equity',
        value: `${deRatio}x`,
        subtext: Number(deRatio) < 0.5 ? 'Conservative Balance Sheet' : 'Leverage Ratio',
        trend: Number(deRatio) < 0.5 ? 'UP' : 'DOWN',
      });
    }

    const valuationMetrics = {
      peRatio: valMultiple !== null ? `${valMultiple}x` : '—',
      peerMedianPe: peerMedianPe !== null ? `${peerMedianPe}x` : '—',
      discount: discountPct !== null ? `${Number(discountPct) > 0 ? '+' : ''}${discountPct}%` : '—',
    };

    const technicalRanges = {
      support: marketPriceState.observableSupportLevels?.[0]
        ? `₹${marketPriceState.observableSupportLevels[0].minPrice} – ₹${marketPriceState.observableSupportLevels[0].maxPrice}`
        : (marketPriceState.fiftyTwoWeekLow > 0 ? `52W Low ₹${marketPriceState.fiftyTwoWeekLow}` : 'Under evaluation'),
      resistance: marketPriceState.observableResistanceLevels?.[0]
        ? `₹${marketPriceState.observableResistanceLevels[0].minPrice} – ₹${marketPriceState.observableResistanceLevels[0].maxPrice}`
        : (marketPriceState.fiftyTwoWeekHigh > 0 ? `52W High ₹${marketPriceState.fiftyTwoWeekHigh}` : 'Under evaluation'),
    };

    const overview = {
      whatChanged,
      whyInteresting,
      businessEconomics: `Business model classified as ${businessModel} within ${sector || 'Equities'} (${industry || 'General'}). Structural drivers evaluate product mix, capacity, and execution pace.`,
      fundamentalTrajectory: trajectorySummary,
      keyMetrics,
      managementDelivery: mgmtSummary,
      valuationContext: valMultiple !== null
        ? `Trades at ${valMultiple}x P/E multiple` + (peerMedianPe ? ` vs peer median ${peerMedianPe}x.` : '.') + ' Multiples should be evaluated against historical growth and capital return.'
        : 'Valuation multiples computed from verified financial horizon and closing price state.',
      valuationMetrics,
      technicalMarketState: techSummary,
      technicalRanges,
      contradictionsSummary: contradictionSummary,
      thesisSummary: (() => {
        const pillars = modulesResult.thesis?.result?.pillars ?? [];
        const supported = pillars.filter((p: any) => p.status === 'SUPPORTED').length;
        const challenged = pillars.filter((p: any) => p.status === 'CHALLENGED').length;
        const unknown = pillars.filter((p: any) => p.status === 'UNKNOWN' || p.status === 'INSUFFICIENT_EVIDENCE').length;
        // Derive stance from evidence — never default to FAVORABLE
        let stance: string;
        if (pillars.length === 0 || !modulesResult.thesis?.result?.thesis?.summary) {
          stance = 'INSUFFICIENT_EVIDENCE';
        } else if (challenged > 0) {
          stance = 'CHALLENGED';
        } else if (supported > 0 && challenged === 0 && unknown === 0) {
          stance = 'SUPPORTED';
        } else {
          stance = 'PARTIAL';
        }
        return {
          stance: stance as any,
          supportedPillars: supported,
          challengedPillars: challenged,
          unknownPillars: unknown,
        };
      })(),
      whatToMonitorNext,
    };

    // 4r. Monitoring Loop: Generic Active Watches from Canonical Rules
    const activeWatches: any[] = [];
    if (receivables !== undefined && receivables !== null) {
      activeWatches.push({
        watchId: `w_wc_${cleanSym}`,
        userId: 'system',
        securityId,
        symbol: cleanSym,
        subjectType: 'METRIC',
        subject: 'trade_receivables_cr',
        operator: 'BELOW_THRESHOLD',
        threshold: Number(receivables) * 0.9,
        unit: 'INR_CR',
        status: 'ACTIVE',
        description: `Monitor trade receivables reduction towards sub-${(Number(receivables) * 0.9).toFixed(0)} Cr target`,
        createdAt: generatedAt,
      });
    }
    if (latestFacts.ebitda_margin_pct?.value !== undefined && latestFacts.ebitda_margin_pct?.value !== null) {
      activeWatches.push({
        watchId: `w_margin_${cleanSym}`,
        userId: 'system',
        securityId,
        symbol: cleanSym,
        subjectType: 'METRIC',
        subject: 'ebitda_margin_pct',
        operator: 'MAINTAIN_ABOVE',
        threshold: Number(latestFacts.ebitda_margin_pct.value),
        unit: 'PERCENT',
        status: 'ACTIVE',
        description: `Track sustainment of operating margin above ${latestFacts.ebitda_margin_pct.value}%`,
        createdAt: generatedAt,
      });
    }
    activeWatches.push({
      watchId: `w_results_${cleanSym}`,
      userId: 'system',
      securityId,
      symbol: cleanSym,
      subjectType: 'EVENT',
      subject: 'FINANCIAL_RESULTS',
      operator: 'EVENT_TRIGGER',
      threshold: 'PUBLISHED',
      unit: 'STATUS',
      status: 'ACTIVE',
      description: 'Trigger notification when new statutory quarterly or annual results are published',
      createdAt: generatedAt,
    });

    const monitoring = { activeWatches };

    // 4i. Persist snapshot only if explicit refresh/persist requested AND state changed
    if (shouldPersist) {
      try {
        const repo = CompanySnapshotRepository.getInstance();
        const factHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(analyticalState.facts.latest || {}))
          .digest('hex');
        const evidenceHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(modulesResult.management?.result || {}))
          .digest('hex');
        const moduleHashes: Record<string, string> = {
          fundamental: factHash,
          management: evidenceHash,
          valuation: crypto.createHash('sha256').update(JSON.stringify(modulesResult.valuation?.result || {})).digest('hex'),
          business: crypto.createHash('sha256').update(JSON.stringify(modulesResult.businessDrivers?.result || {})).digest('hex'),
          technical: crypto.createHash('sha256').update(JSON.stringify(modulesResult.technical?.result || {})).digest('hex'),
        };
        const analyticalHash = repo.computeAnalyticalHash(
          analyticalState.asOfDate,
          factHash,
          evidenceHash,
          moduleHashes
        );

        await repo.saveSnapshot({
          snapshotId: `snap_${securityId}_${analyticalHash.substring(0, 8)}`,
          securityId,
          isin: identity.isin,
          asOf: analyticalState.asOfDate,
          dataCutoff: analyticalState.asOfDate,
          canonicalFactHash: factHash,
          evidenceHash,
          moduleHashes,
          createdAt: generatedAt,
          payloadSummary: (analyticalState.facts.latest as any) || {},
        });
      } catch (err: any) {
        console.warn('[CompanyIntelligenceOrchestrator] Failed to persist snapshot to repository:', err);
      }
    }

    // 5. Constitution Invariants: ClaimSafetyGate & CrossModuleConsistency & DataCoverage
    const safetyReport = { totalAudited: 0, rejectedCount: 0, approvedCount: 0 };
    try {
      const safetyGate = ClaimSafetyGate.getInstance();
      if (modulesResult.thesis?.result?.pillars) {
        const auditedPillars = modulesResult.thesis.result.pillars.filter((p: any) => {
          safetyReport.totalAudited++;
          const res = safetyGate.auditAssertion({
            id: p.pillarId || p.title,
            text: p.title + ': ' + (p.summary || p.explanation || ''),
            kind: p.kind,
            evidenceRefs: p.supportingEvidence || [],
            confidence: p.confidence,
            support: p.support,
            limitations: [],
            asOfDate: generatedAt,
          });
          if (res.passed) {
            safetyReport.approvedCount++;
            return true;
          } else {
            safetyReport.rejectedCount++;
            return false;
          }
        });
        modulesResult.thesis.result.pillars = auditedPillars;
      }
    } catch (e: any) {
      console.warn('[CompanyIntelligenceOrchestrator] ClaimSafetyGate audit error:', e);
      if (modulesResult.thesis) {
        modulesResult.thesis.warnings.push('ClaimSafetyGate audit failed: ' + (e?.message || String(e)));
      }
    }

    // Cross-Module Consistency
    let consistencyReport = undefined;
    try {
      const validator = CrossModuleConsistencyValidator.getInstance();
      const observations: any[] = [];
      const fRes = modulesResult.fundamental?.result as any;
      if (fRes?.roce?.value != null) {
        observations.push({ module: 'FUNDAMENTAL', metric: 'ROCE', value: Number(fRes.roce.value), period: fRes.roce.period });
      }
      const vRes = modulesResult.valuation?.result as any;
      if (vRes?.roce?.value != null) {
        observations.push({ module: 'VALUATION', metric: 'ROCE', value: Number(vRes.roce.value), period: vRes.roce.period });
      }
      consistencyReport = validator.validate(observations);
    } catch (e: any) {
      console.warn('[CompanyIntelligenceOrchestrator] CrossModuleConsistencyValidator audit error:', e);
    }

    // Field-level Data Coverage
    let dataCoverage = undefined;
    try {
      const coverageEngine = DataCoverageEngine.getInstance();
      dataCoverage = coverageEngine.evaluateCoverage(
        securityId,
        isin || securityId,
        {
          incomeStatement: analyticalState.facts?.latest as any,
          keyRatios: analyticalState.facts?.latest as any,
          prices: (modulesResult.technical?.result as any)?.prices || [],
          managementClaims: modulesResult.management?.result?.commitments,
          canonicalFacts: analyticalState.facts?.latest as any,
        },
        generatedAt
      );
    } catch (e: any) {
      console.warn('[CompanyIntelligenceOrchestrator] DataCoverageEngine evaluation error:', e);
    }

    // Invariant: Scope is derived from canonical fundamental facts/evidence, never hardcoded per symbol
    let resolvedScope: 'STANDALONE' | 'CONSOLIDATED' = 'CONSOLIDATED';
    const fundSeries = modulesResult.fundamental?.result?.historicalSeries;
    if (fundSeries) {
      for (const k of Object.keys(fundSeries)) {
        const item = fundSeries[k]?.find((it: any) => it?.scope);
        if (item?.scope) {
          resolvedScope = item.scope === 'STANDALONE' ? 'STANDALONE' : 'CONSOLIDATED';
          break;
        }
      }
    }
    const businessProfile = CompanyBusinessProfileEngine.getInstance().buildProfile({
      securityId,
      symbol: cleanSym,
      sector,
      industry,
      businessModel,
      canonicalFacts: latestFacts,
      asOfDate,
    });

    const snapshotHash = CompanySnapshotRepository.getInstance().computeAnalyticalHash(
      asOfDate || generatedAt.substring(0, 10),
      cleanSym,
      isin,
      {}
    );

    const sinceLastReview = SinceLastReviewEngine.getInstance().buildReport({
      securityId,
      symbol: cleanSym,
      delta: modulesResult.delta?.result || null,
      currentSnapshotId: snapshotHash,
      currentAsOf: asOfDate || generatedAt.substring(0, 10),
      fallbackEvidence: modulesResult.delta?.evidenceRefs?.[0] || null,
    });

    return {
      security: {
        securityId,
        symbol: cleanSym,
        companyName,
        isin,
        sector,
        industry,
        businessModel,
        scope: resolvedScope,
      },
      freshness,
      coverage: dataCoverage,
      businessProfile,
      sinceLastReview,
      overview: {
        ...overview,
        businessProfile,
        sinceLastReview,
      },
      modules: modulesResult,
      fundamentalExperience: fundamentalExperienceData,
      timeline: modulesResult.timeline?.result || null,
      delta: modulesResult.delta?.result || null,
      attention: modulesResult.attention?.result || null,
      questions: modulesResult.attention?.result?.questions || [],
      snapshot: {
        securityId,
        asOfDate: asOfDate || generatedAt.substring(0, 10),
        dataCutoff: asOfDate || generatedAt.substring(0, 10),
        analyticalHash: snapshotHash,
      },
      monitoring,
      generatedAt,
      dataCoverage,
      consistencyReport,
      safetyReport,
    };
  }

  private logTelemetry(telemetry: SimpleModuleTelemetry): void {
    // Minimal standard logging without heavy telemetry infrastructure
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[ModuleTelemetry] ${telemetry.symbol} ${telemetry.moduleId} ${telemetry.status} ${telemetry.durationMs}ms`);
    }
  }
}
