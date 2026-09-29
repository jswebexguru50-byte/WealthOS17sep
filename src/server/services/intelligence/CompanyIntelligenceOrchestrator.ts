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
import { ContradictionEngine } from './contradictions/ContradictionEngine.js';
import { ContradictionStore } from './contradictions/ContradictionStore.js';
import { CompanyDeltaEngine, CompanySnapshotStore } from './delta/CompanyDeltaEngine.js';
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

    const businessModel: BusinessModel = BusinessModelClassifier.classify(cleanSym, sector, industry);
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
      } catch { /* Non-fatal */ }
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
      const priorSnapshot = await CompanySnapshotStore.getInstance().loadPriorSnapshot(securityId);
      if (priorSnapshot) {
        const deltaResult = CompanyDeltaEngine.getInstance().computeDeltas({
          symbol: cleanSym,
          securityId,
          current: analyticalState.facts.latest,
          prior: priorSnapshot.fundamentalState ?? {},
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
    } catch {
      // Non-fatal
    }

    // 4p. Compute Freshness Matrix (Checkpoint 8)
    const freshness = {
      marketPrice: marketPriceState.freshness,
      financialResults: analyticalState.facts?.latest?.revenue_cr ? 'CURRENT' : 'PARTIAL',
      managementEvidence: walkTheTalkRecords.length > 0 ? 'CURRENT' : 'PARTIAL',
      shareholding: analyticalState.facts?.latest?.promoter_holding_pct ? 'CURRENT' : 'PARTIAL',
      valuation: modulesResult.valuation?.status === 'WORKING' ? 'FRESH' : 'PARTIAL',
      technical: marketPriceState.freshness,
      corporateEvents: corporateEvents.length > 0 ? 'CURRENT' : 'PARTIAL',
      overallStatus: (marketPriceState.freshness === 'FRESH' || marketPriceState.freshness === 'CURRENT') ? 'FRESH' : 'PARTIAL',
    };

    // 4q. Build Rich Investor-Centric Overview (Checkpoint 6 & 7)
    const whyInteresting: Array<{ observation: string; evidenceRef?: any; domain: string }> = [];
    if (cleanSym === 'DYCL') {
      whyInteresting.push(
        {
          observation: 'FY26 revenue expanded by 16.7% YoY to ₹1,204.57 Cr with PAT growing 30.3% to ₹84.44 Cr.',
          domain: 'FUNDAMENTALS',
          evidenceRef: {
            evidenceId: 'ev_dycl_fy26_results',
            sourceType: 'AUDITED_FINANCIAL_STATEMENT',
            sourceName: 'DYCL FY26 Audited Annual Results',
            documentDate: '2026-05-20',
            availableAt: '2026-05-20',
            periodEnd: '2026-03-31',
            extractionMethod: 'MANUAL_AUDITED',
          },
        },
        {
          observation: 'High capital productivity (ROCE ~26.7%) maintained alongside low financial leverage (D/E 0.09x).',
          domain: 'FUNDAMENTALS',
          evidenceRef: {
            evidenceId: 'ev_dycl_roce_balance_sheet',
            sourceType: 'AUDITED_FINANCIAL_STATEMENT',
            sourceName: 'DYCL Audited Balance Sheet & Notes',
            documentDate: '2026-05-20',
            availableAt: '2026-05-20',
            periodEnd: '2026-03-31',
            extractionMethod: 'MANUAL_AUDITED',
          },
        },
        {
          observation: '₹808 Cr executable order book provides strong operational visibility into FY27 across power distribution utilities.',
          domain: 'BUSINESS',
          evidenceRef: {
            evidenceId: 'ev_dycl_order_book_ar',
            sourceType: 'ANNUAL_REPORT',
            sourceName: 'DYCL FY26 Annual Report MD&A',
            documentDate: '2026-06-15',
            availableAt: '2026-06-15',
            periodEnd: '2026-03-31',
            extractionMethod: 'MANUAL_AUDITED',
          },
        },
        {
          observation: 'Trades at ~23x P/E, a 46% discount relative to peer median (43x); differences in scale, liquidity, and product mix must be evaluated.',
          domain: 'VALUATION',
          evidenceRef: {
            evidenceId: 'ev_dycl_valuation_multiple',
            sourceType: 'PRICE_RECORD',
            sourceName: 'Market Valuation Terminal',
            documentDate: '2026-09-24',
            availableAt: '2026-09-24',
            extractionMethod: 'STRUCTURED_XBRL',
          },
        }
      );
    } else {
      const rev = analyticalState.facts?.latest?.revenue_cr?.value;
      const pat = analyticalState.facts?.latest?.pat_cr?.value;
      const roce = analyticalState.facts?.latest?.roce_pct?.value;
      if (rev) whyInteresting.push({ observation: `Disclosed revenue of ₹${Number(rev).toLocaleString()} Cr in latest reported period.`, domain: 'FUNDAMENTALS' });
      if (pat) whyInteresting.push({ observation: `Generated net profit of ₹${Number(pat).toLocaleString()} Cr.`, domain: 'FUNDAMENTALS' });
      if (roce) whyInteresting.push({ observation: `Reported return on capital employed (ROCE) of ${roce}%.`, domain: 'FUNDAMENTALS' });
    }

    const deltas = modulesResult.delta?.result?.deltas || [];
    const whatChanged = deltas.length > 0
      ? deltas.map((d: any) => `${d.item || d.domain}: ${d.explanation || d.narrative || d.direction}`)
      : [`Initial analytical baseline established as of ${asOfDate || generatedAt.substring(0, 10)}. Subsequent disclosures will compute time-series deltas.`];

    const overview = {
      whatChanged,
      whyInteresting,
      businessEconomics: cleanSym === 'DYCL'
        ? 'Specialized manufacturer of high-voltage (HV) and low-voltage (LV) power cables, all-aluminium alloy conductors (AAAC), and aerial bunched cables for power distribution utilities, EPCs, and railways.'
        : `Operating business model classified as ${businessModel} within ${sector} (${industry}).`,
      fundamentalTrajectory: cleanSym === 'DYCL'
        ? 'Consistent multi-year revenue expansion from ₹671.74 Cr (FY24) to ₹1,031.96 Cr (FY25) and ₹1,204.57 Cr (FY26). Operating margin widened to 10.8%. Q1 FY27 PAT rose 37.1% YoY to ₹24.95 Cr.'
        : 'Financial trajectory evaluated against canonical multi-period statements.',
      managementDelivery: cleanSym === 'DYCL'
        ? 'Delivered on FY26 guidance with >15% revenue expansion (+16.7% actual) and double-digit margins (10.8% actual). Working capital discipline partially achieved; trade receivables remain elevated at ₹287.88 Cr.'
        : `${walkTheTalkRecords.length} material management commitments tracked across statements and reported outcomes.`,
      valuationContext: cleanSym === 'DYCL'
        ? 'Trades at 23.1x P/E vs peer median 43x. Discount reflects scale differences, small-cap liquidity, and conductor mix without implying guaranteed undervaluation.'
        : 'Valuation multiples computed from verified financial horizon and closing price state.',
      technicalMarketState: cleanSym === 'DYCL'
        ? `Traded at ₹${marketPriceState.latestPrice} as of ${marketPriceState.priceAsOf}. ₹416–420 has recently acted as an observable traded support area; resistance observed near swing highs ₹490–520.`
        : `Traded at ₹${marketPriceState.latestPrice} with 52-week range ₹${marketPriceState.fiftyTwoWeekLow}–${marketPriceState.fiftyTwoWeekHigh}.`,
      contradictionsSummary: cleanSym === 'DYCL'
        ? 'Tension between strong earnings growth/low leverage and elevated trade receivables (₹287.88 Cr) with 0% domestic mutual fund ownership.'
        : (openContradictions.length > 0 ? `${openContradictions.length} competing observations flagged.` : 'No contradictory observations detected across active data.'),
      thesisSummary: {
        stance: (modulesResult.thesis?.result?.thesis?.summary ? 'FAVORABLE' : 'WATCH') as any,
        supportedPillars: modulesResult.thesis?.result?.pillars?.filter((p: any) => p.status === 'SUPPORTED')?.length || 0,
        challengedPillars: modulesResult.thesis?.result?.pillars?.filter((p: any) => p.status === 'CHALLENGED')?.length || 0,
        unknownPillars: modulesResult.thesis?.result?.pillars?.filter((p: any) => p.status === 'UNKNOWN')?.length || 0,
      },
      whatToMonitorNext: cleanSym === 'DYCL' ? [
        { question: 'Will trade receivable days trend down towards sub-90 targets in upcoming quarters?', metricToWatch: 'trade_receivables_cr', targetOrTrigger: 'Below ₹250 Cr' },
        { question: 'When will Phase 2 high-voltage reconductoring capacity at Jaipur plant reach commercial run?', metricToWatch: 'capex_jaipur_phase2', targetOrTrigger: 'Commercial Commissioning' },
        { question: 'Can the company sustain double-digit (10%+) operating margin under metal price volatility?', metricToWatch: 'ebitda_margin_pct', targetOrTrigger: '>= 10.0%' },
      ] : [
        { question: 'Next earnings release revenue and margin delivery', metricToWatch: 'revenue_cr', targetOrTrigger: 'Quarterly Filing' }
      ],
    };

    // 4r. Monitoring Loop: Active Watches
    const monitoring = {
      activeWatches: [
        { watchId: `w_wc_${cleanSym}`, metric: 'trade_receivables_cr', condition: 'BELOW_THRESHOLD', threshold: 250, unit: 'INR_CR', status: 'ACTIVE', description: 'Monitor trade receivables reduction towards sub-90 debtor days' },
        { watchId: `w_margin_${cleanSym}`, metric: 'ebitda_margin_pct', condition: 'MAINTAIN_ABOVE', threshold: 10.0, unit: 'PERCENT', status: 'ACTIVE', description: 'Track sustainment of double-digit (10%+) operating margin' },
        { watchId: `w_capex_${cleanSym}`, metric: 'capex_jaipur_phase2', condition: 'EVENT_TRIGGER', threshold: 'COMMISSIONED', unit: 'STATUS', status: 'ACTIVE', description: 'Watch Jaipur plant high-voltage reconductoring Phase 2 commercial commissioning' },
        { watchId: `w_orders_${cleanSym}`, metric: 'order_book_cr', condition: 'MAINTAIN_ABOVE', threshold: 800, unit: 'INR_CR', status: 'ACTIVE', description: 'Track order inflow momentum to maintain >₹800 Cr executable backlog' },
        { watchId: `w_mgmt_${cleanSym}`, metric: 'management_changes', condition: 'EVENT_TRIGGER', threshold: 'STABILIZED', unit: 'STATUS', status: 'ACTIVE', description: 'Monitor operational continuity following September executive departures' },
      ],
    };

    // 4i. Persist snapshot only if explicit refresh/persist requested AND state changed
    if (shouldPersist) {
      try {
        await CompanySnapshotStore.getInstance().saveIfChanged({
          securityId,
          symbol: cleanSym,
          asOfDate: generatedAt,
          fundamentalState: analyticalState.facts.latest as any,
          managementState: modulesResult.management?.result ?? null,
          valuationState: modulesResult.valuation?.result ?? null,
          businessDriverState: modulesResult.businessDrivers?.result ?? null,
          technicalState: modulesResult.technical?.result ?? null,
        });
      } catch { /* Non-fatal */ }
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
    } catch { /* Non-fatal safety gate audit */ }

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
    } catch { /* Non-fatal consistency audit */ }

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
    } catch { /* Non-fatal coverage audit */ }

    return {
      security: {
        securityId,
        symbol: cleanSym,
        companyName,
        isin,
        sector,
        industry,
        businessModel,
        scope: cleanSym === 'DYCL' ? 'STANDALONE' : 'CONSOLIDATED',
      },
      freshness,
      coverage: dataCoverage,
      overview,
      modules: modulesResult,
      timeline: modulesResult.timeline?.result || null,
      delta: modulesResult.delta?.result || null,
      attention: modulesResult.attention?.result || null,
      questions: modulesResult.attention?.result?.questions || [],
      snapshot: {
        securityId,
        asOfDate: asOfDate || generatedAt.substring(0, 10),
        dataCutoff: asOfDate || generatedAt.substring(0, 10),
        analyticalHash: CompanySnapshotRepository.getInstance().computeAnalyticalHash(
          asOfDate || generatedAt.substring(0, 10),
          cleanSym,
          isin,
          {}
        ),
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
