import { SevenStrategiesCandidateEnrichmentService } from './SevenStrategiesCandidateEnrichmentService.js';
import { readFereEvidence } from './FereEvidenceService.js';
import { calculateQglp, DEFAULT_QGLP_CONFIG } from './QglpScoringService.js';
import { getDB, dbGet } from '../database.js';
import { QglpInput } from './QglpScoringService.js';
import { Analyze360FieldResolver } from './Analyze360FieldSourceMap.js';

export class Analyze360Service {
  private static instance: Analyze360Service;
  public static getInstance(): Analyze360Service {
    if (!Analyze360Service.instance) {
      Analyze360Service.instance = new Analyze360Service();
    }
    return Analyze360Service.instance;
  }

  public async getAnalyze360View(
    symbol: string,
    candidateId?: string,
    signalIds?: string[],
    recommendedDate?: string,
    strategyIds?: string[],
    options?: { includeTechnicals?: boolean; includeSectorMomentum?: boolean }
  ) {
    const includeTechnicals = options?.includeTechnicals === true;
    const includeSectorMomentum = options?.includeSectorMomentum === true;

    // 1. Get base enrichment (Technical, Sector, basic momentum)
    const enrichmentService = SevenStrategiesCandidateEnrichmentService.getInstance();
    const enrichmentMap = await enrichmentService.bulkEnrich(
      [{ symbol, cmp: null }],
      {
        includeTechnicals,
        includeSectorMomentum,
        includeActionReadiness: includeTechnicals
      }
    );
    const base = enrichmentMap.get(symbol);

    if (!base) {
      throw new Error(`Could not generate base enrichment for ${symbol}`);
    }

    // 2. Fetch master row to get ISIN and missing fundamentals
    const db = getDB();
    const masterRow = await dbGet(db, `
      SELECT m.isin, m.company_name, m.sector, m.industry,
             d.roce_pct, d.roe_pct, d.debt_to_equity,
             d.sales_growth_5y_pct, d.profit_growth_5y_pct,
             d.latest_sales_cr, d.latest_pat_cr, d.latest_op_profit_cr,
             d.fii_pct, d.dii_pct, d.promoter_pct, d.pe_ratio,
             d.as_of_quarter, d.as_of_year, d.audited_at,
             d.cfo_cr, d.total_assets_cr, d.total_borrowings_cr
      FROM MasterTickers m
      LEFT JOIN DataQualityAuditLedger d ON m.symbol = d.symbol
      WHERE m.symbol = ?
    `, [symbol]) as any;

    const isin = masterRow?.isin || null;

    // 3. FERE Evidence
    const fereSummary = await readFereEvidence(isin, symbol);

    // 4. Resolve facts and QGLP inputs across all persisted sources
    const { fields: resolved, qglpInputs } = await Analyze360FieldResolver.resolveAllFields(symbol, masterRow);

    // 5. QGLP Scoring (Evidence Safe)
    const qglp = calculateQglp(qglpInputs, DEFAULT_QGLP_CONFIG);

    // 6. Build Fundamental Snapshot
    const buildField = (val: any, missingReason: string | null = null, periodType: string | null = 'Latest Quarter/LTM', source: string | null = 'DataQualityAuditLedger', note: string | null = null) => {
      const isMissing = val === null || val === undefined;
      return { 
        value: isMissing ? null : val, 
        status: isMissing ? 'MISSING' : 'AVAILABLE',
        missingReason: isMissing ? (missingReason || 'DATA_MISSING') : null,
        provider: isMissing ? null : source,
        sourceTable: isMissing ? null : source,
        sourceFactId: null,
        availableAt: isMissing ? null : (masterRow?.audited_at || null),
        fetchedAt: null, // do not invent timestamp if not persisted
        periodType: isMissing ? null : periodType,
        periodEnd: isMissing ? null : (masterRow?.as_of_quarter && masterRow?.as_of_year ? `${masterRow.as_of_quarter} ${masterRow.as_of_year}` : null),
        note: isMissing ? null : note
      };
    };

    const fundamental = {
      revenueGrowth: {
        ...resolved.salesCagr3yPct,
        fiveYearCagr: resolved.salesGrowth5y
      },
      profitability: {
        operatingProfit: resolved.operatingProfit,
        pat: resolved.pat,
        marginTrend: resolved.operatingMarginTrend
      },
      debtAndService: {
        debtToEquity: resolved.debtToEquity,
        totalBorrowings: resolved.totalBorrowings
      },
      cashFlow: {
        cfoToPat: resolved.cfoToPatPct,
        cfo: resolved.cfo,
        cfoToOperatingProfit: resolved.cfoToOperatingProfitPct,
        workingCapital: resolved.workingCapital,
        freeCashFlow: resolved.freeCashFlow,
        fcfYield: resolved.fcfYield
      },
      holdings: {
        promoterHolding: resolved.promoterHolding,
        promoterPledge: resolved.promoterPledgePct,
        fiiHolding: resolved.fiiHolding,
        diiHolding: resolved.diiHolding,
        fiiTrend: resolved.fiiTrend,
        diiTrend: resolved.diiTrend
      },
      efficiency: {
        roe: resolved.roe,
        roce: resolved.roce
      },
      valuation: {
        peg: resolved.pegRatio,
        pe: resolved.pe
      },
      outlook: {
        demandOutlook: resolved.demandOutlook,
        peerContext: resolved.peerContext,
        capacityRisks: buildField(null, 'NO_CAPACITY_EVIDENCE')
      },
      keyRisks: resolved.keyRisks,
      whatToWatchNext: resolved.whatToWatchNext,
      evidenceState: base.fundamentalEvidenceState
    };

    // 6. Action Readiness Blockers
    const technicalStale = base.technicalFreshnessStatus !== 'VALID';
    const noOhlcv = base.ohlcvStatus !== 'AVAILABLE';

    const buildAction = (isAllowedBase: boolean, actionName: string) => {
      if (!isAllowedBase) {
        let reason = 'Requirements not met.';
        const missing: string[] = [];
        if (noOhlcv) { reason = 'OHLCV data missing.'; missing.push('OHLCV'); }
        else if (technicalStale) { reason = 'OHLCV data stale.'; missing.push('LATEST_OHLCV'); }
        return { enabled: false, blockerReason: reason, missingData: missing };
      }
      return { enabled: true };
    };

    const actionReadiness = {
      canBacktest: buildAction(base.canBacktest, 'Backtest'),
      canPaperTrade: buildAction(base.canPaperTrade, 'Paper Trade'),
      canCreateAlert: buildAction(base.canCreateAlert, 'Alert')
    };

    const summarySnapshot = {
      revenueGrowth: fundamental.revenueGrowth.fiveYearCagr,
      operatingProfit: fundamental.profitability.operatingProfit,
      pat: fundamental.profitability.pat,
      demandOutlook: fundamental.outlook.demandOutlook,
      competitivePosition: fundamental.outlook.peerContext,
      capacityCapability: fundamental.outlook.capacityRisks,
      rawMaterialRisks: buildField(null, 'NO_RAW_MATERIAL_EVIDENCE'),
      debtAndServicing: fundamental.debtAndService.debtToEquity,
      cashFlowAndWorkingCapital: fundamental.cashFlow.cfo,
      promoterHolding: fundamental.holdings.promoterHolding,
      institutionalTrends: fundamental.holdings.fiiHolding,
      roeRoce: fundamental.efficiency.roe,
      valuation: fundamental.valuation.pe,
      keyRisks: fundamental.keyRisks,
      whatToWatchNext: fundamental.whatToWatchNext,
      evidenceState: base.fundamentalEvidenceState || 'MISSING_CONFLICTING'
    };

    const technical = {
      latestClose: buildField(base.latestClose, 'NO_OHLCV', 'Technical', null, 'Local from OHLCV'),
      latestOhlcvDate: buildField(base.latestOhlcvDate, 'NO_OHLCV', 'Technical', null, 'Local from OHLCV'),
      freshnessStatus: base.technicalFreshnessStatus,
      ema20: buildField(base.ema20, 'NO_EMA20', 'Technical', null, 'Local from OHLCV'),
      sma20: buildField(base.sma20, 'NO_SMA20', 'Technical', null, 'Local from OHLCV'),
      sma50: buildField(base.sma50, 'NO_SMA50', 'Technical', null, 'Local from OHLCV'),
      sma200: buildField(base.sma200, 'NO_SMA200', 'Technical', null, 'Local from OHLCV'),
      rsi14: buildField(base.rsi14, 'NO_RSI', 'Technical', null, 'Local from OHLCV'),
      atrPct: buildField(base.atrPct, 'NO_ATR', 'Technical', null, 'Local from OHLCV'),
      stockReturn5D: buildField(base.stockReturn5D, 'NO_RETURN_DATA', 'Technical', null, 'Local from OHLCV'),
      stockReturn20D: buildField(base.stockReturn20D, 'NO_RETURN_DATA', 'Technical', null, 'Local from OHLCV'),
      stockMomentumStatus: base.stockMomentumStatus,
      gapSignalToClose: buildField(
        base.signalCmp && base.latestClose ? ((base.latestClose - base.signalCmp) / base.signalCmp) * 100 : null,
        'NO_SIGNAL_OR_OHLCV',
        'Technical',
        null,
        'Local from OHLCV'
      )
    };

    const sectorMomentum = {
      sector: base.sector,
      sectorIndex: base.sectorIndex,
      mappingStatus: base.sectorMappingStatus,
      status: base.sectorMomentumStatus,
      missingReason: base.sectorMomentumStatus === 'DATA_INSUFFICIENT' ? 
         (base.sectorMappingStatus === 'MAPPED' ? 'SECTOR_INDEX_OHLCV_MISSING' : 'SECTOR_UNMAPPED') : null
    };

    const missingDataChecklist: Array<{ group: string, field: string, reason: string, severity: 'HIGH' | 'MEDIUM' | 'LOW' }> = [];
    const missingKeys = new Set<string>();
    const addMissing = (group: string, field: string, reason: string, severity: 'HIGH' | 'MEDIUM' | 'LOW') => {
      const key = `${group}|${field}|${reason}`;
      if (missingKeys.has(key)) return;
      missingKeys.add(key);
      missingDataChecklist.push({ group, field, reason, severity });
    };
    const checkMissing = (obj: any, group: string, severity: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM', prefix = '') => {
      for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          if (obj[key].status === 'MISSING') {
            addMissing(group, prefix + key, obj[key].missingReason || 'Unknown', severity);
          } else if (!obj[key].status) {
            checkMissing(obj[key], group, severity, prefix + key + '.');
          }
        }
      }
    };
    checkMissing(fundamental, 'fundamentals', 'HIGH');
    checkMissing(technical, 'technicals', 'MEDIUM');
    ['quality', 'growth', 'longevity', 'price'].forEach(pillar => {
      const p = (qglp as any)[pillar];
      if (p && p.status !== 'PASS') {
        (p.missingFields || []).forEach((mf: string) => {
          addMissing('QGLP', `${pillar}.${mf}`, `Missing required ${pillar} metric`, 'HIGH');
        });
      }
    });
    if (sectorMomentum.status === 'DATA_INSUFFICIENT') {
      addMissing('sector', 'sectorMomentum', sectorMomentum.missingReason || 'Missing', 'MEDIUM');
    }
    const equivalentFereAvailability: Record<string, boolean> = {
      debt: fundamental.debtAndService.debtToEquity.status === 'AVAILABLE' || fundamental.debtAndService.totalBorrowings.status === 'AVAILABLE',
      borrowings: fundamental.debtAndService.totalBorrowings.status === 'AVAILABLE',
      total_borrowings: fundamental.debtAndService.totalBorrowings.status === 'AVAILABLE',
      cash: fundamental.cashFlow.cfo.status === 'AVAILABLE' || fundamental.cashFlow.freeCashFlow.status === 'AVAILABLE',
      receivables: fundamental.cashFlow.workingCapital.status === 'AVAILABLE',
      trade_receivables: fundamental.cashFlow.workingCapital.status === 'AVAILABLE',
      inventory: fundamental.cashFlow.workingCapital.status === 'AVAILABLE',
      inventories: fundamental.cashFlow.workingCapital.status === 'AVAILABLE',
      promoter_pledge: fundamental.holdings.promoterPledge.status === 'AVAILABLE',
      promoter_holding: fundamental.holdings.promoterHolding.status === 'AVAILABLE',
      fii: fundamental.holdings.fiiHolding.status === 'AVAILABLE' || fundamental.holdings.fiiTrend.status === 'AVAILABLE',
      dii: fundamental.holdings.diiHolding.status === 'AVAILABLE' || fundamental.holdings.diiTrend.status === 'AVAILABLE',
      free_float: fundamental.holdings.promoterHolding.status === 'AVAILABLE'
    };
    (fereSummary.missingFields || []).forEach((mf: any) => {
      const normalized = String(mf || '').toLowerCase();
      const hasAlternateVerifiedSource = Object.entries(equivalentFereAvailability)
        .some(([needle, available]) => available && normalized.includes(needle));
      if (hasAlternateVerifiedSource) return;
      addMissing('FERE', String(mf), 'No FERE evidence extracted from local downloaded filings; no alternate verified local source found', 'LOW');
    });

    const sum = [];
    sum.push(`For ${symbol}, revenue growth is ${fundamental.revenueGrowth.fiveYearCagr.status === 'AVAILABLE' ? fundamental.revenueGrowth.fiveYearCagr.value + '%' : 'missing'} and operating profit is ${fundamental.profitability.operatingProfit.status === 'AVAILABLE' ? '₹' + fundamental.profitability.operatingProfit.value + ' Cr' : 'missing'}.`);
    sum.push(`Debt/Equity stands at ${fundamental.debtAndService.debtToEquity.status === 'AVAILABLE' ? fundamental.debtAndService.debtToEquity.value : 'missing'} with CFO of ${fundamental.cashFlow.cfo.status === 'AVAILABLE' ? '₹' + fundamental.cashFlow.cfo.value + ' Cr' : 'missing'}.`);
    sum.push(`ROE is reported as ${fundamental.efficiency.roe.status === 'AVAILABLE' ? fundamental.efficiency.roe.value + '%' : 'missing'} while ROCE is ${fundamental.efficiency.roce?.status === 'AVAILABLE' ? fundamental.efficiency.roce.value + '%' : 'missing'}.`);
    sum.push(`Promoter holding is ${fundamental.holdings.promoterHolding.status === 'AVAILABLE' ? fundamental.holdings.promoterHolding.value + '%' : 'missing'} and PE ratio is ${fundamental.valuation.pe.status === 'AVAILABLE' ? fundamental.valuation.pe.value : 'missing'}.`);
    sum.push(`Technical freshness is ${technical.freshnessStatus} while sector momentum is ${sectorMomentum.status}.`);
    const keyMissing = missingDataChecklist.filter(m => m.severity === 'HIGH').slice(0, 3).map(m => m.field).join(', ');
    if (keyMissing) {
      sum.push(`Key missing data includes: ${keyMissing}. This limits holistic analysis.`);
    } else {
      sum.push(`No critical data points are missing, providing a robust dataset for evaluation.`);
    }
    sum.push(`Final fundamental evidence state is ${base.fundamentalEvidenceState || 'MISSING_CONFLICTING'}.`);
    const summaryText = sum.join(' ');
    const summarySnapshotWithText = { ...summarySnapshot, summaryText };

    const topEvidenceLabels = fereSummary.documents && fereSummary.documents.length > 0 
      ? Array.from(new Set(fereSummary.documents.map((d: any) => d.type || 'DOCUMENT'))).slice(0, 5)
      : [];
    const evidenceLabelStatus = topEvidenceLabels.length > 0 ? 'AVAILABLE' : 'NO_FERE_LABELS_AVAILABLE';

    return {
      symbol,
      candidateId: candidateId || null,
      signalIds: signalIds || [],
      recommendedDate: recommendedDate || null,
      strategyIds: strategyIds || [],
      companyName: base.companyName || masterRow?.company_name,
      sector: base.sector,
      industry: base.industry,
      summarySnapshot: summarySnapshotWithText,
      qglp,
      fundamental,
      technical,
      sectorMomentum,
      fere: {
        status: fereSummary.status,
        evidenceCount: fereSummary.verifiedFactCount + fereSummary.verifiedMetricCount,
        documentCount: fereSummary.documents.length,
        missingFields: fereSummary.missingFields,
        topEvidenceLabels,
        evidenceLabelStatus
      },
      missingDataChecklist,
      actionReadiness
    };
  }
}
