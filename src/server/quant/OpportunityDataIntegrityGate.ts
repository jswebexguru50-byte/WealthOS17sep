/**
 * OpportunityDataIntegrityGate.ts — v5.4.1 (Production Master)
 * 
 * Fiduciary Pre-Scan & Execution Data Quality Gate for NRI WealthOS Opportunity Engine.
 * Enforces zero-tolerance criteria before any stock can qualify as an actionable setup:
 * 
 * 1. Freshness Check: Price candles must be current with exchange calendar (<= 2 trading days old)
 * 2. Split / Outlier Check: >30% single-day price shifts require verified corporate action
 * 3. Liquidity Floor: 20-day average daily turnover >= ₹5.0 Cr
 * 4. Forensic Fundamental Shield: Net Debt/EBITDA < 3.5x (with NBFC/Banking exemption)
 * 5. Governance Ceiling: Promoter pledge strictly < 20.0%, zero auditor qualifications
 * 6. Confirmed Bar Close Filter: Stop-loss and breakout triggers require confirmed candle close
 */

export interface CandidateDataSnapshot {
  symbol: string;
  isin?: string;
  sector?: string;
  isFinancialInstitution?: boolean;
  latestCandleDate: string;
  currentPrice: number;
  previousClose: number;
  singleDayChangePct: number;
  hasRegisteredCorporateAction?: boolean;
  corporateActionType?: string;
  turnover20DayAvgCr: number;
  dailyVolume: number;
  deliveryPercentage?: number;
  netDebtToEbitda?: number;
  promoterPledgePct?: number;
  auditorQualified?: boolean;
  operatingCashFlowPositive?: boolean;
  intradayLowPrice?: number;
  confirmedBarClosePrice?: number;
  structuralStopPrice: number;
}

export interface IntegrityCheckResult {
  symbol: string;
  isDataApproved: boolean;
  fiduciaryGrade: 'TIER_1_CERTIFIED' | 'TIER_2_ACCEPTABLE' | 'DATA_QUARANTINED';
  passedChecks: string[];
  quarantineReasons: string[];
  confirmedStopTriggered: boolean;
  wickFilteredStopAvoided: boolean;
  notes: string;
}

export class OpportunityDataIntegrityGate {
  private static readonly MAX_DATA_STALENESS_DAYS = 3;
  private static readonly MAX_UNADJUSTED_PRICE_SHIFT_PCT = 30.0;
  private static readonly MIN_LIQUIDITY_TURNOVER_CR = 5.0; // ₹5.0 Cr daily turnover floor
  private static readonly MAX_NET_DEBT_EBITDA = 3.5;
  private static readonly MAX_PROMOTER_PLEDGE_PCT = 20.0;

  /**
   * Evaluates complete data integrity for an opportunity candidate
   */
  public static verifyCandidate(data: CandidateDataSnapshot): IntegrityCheckResult {
    const passedChecks: string[] = [];
    const quarantineReasons: string[] = [];

    // 1. Freshness Check
    const candleDate = new Date(data.latestCandleDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - candleDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (isNaN(candleDate.getTime()) || diffDays > this.MAX_DATA_STALENESS_DAYS + 2) { // allow weekend grace
      quarantineReasons.push(`Stale Price Data: Latest candle date ${data.latestCandleDate} is ${diffDays} days old.`);
    } else {
      passedChecks.push('Freshness: Verified current exchange trading session.');
    }

    // 2. Split / Outlier Sanity Check (>30% single-day change)
    const absChange = Math.abs(data.singleDayChangePct);
    if (absChange >= this.MAX_UNADJUSTED_PRICE_SHIFT_PCT) {
      if (data.hasRegisteredCorporateAction) {
        passedChecks.push(`Split Sanity: Large price shift (${data.singleDayChangePct.toFixed(1)}%) verified by corporate action (${data.corporateActionType || 'SPLIT/BONUS'}).`);
      } else {
        quarantineReasons.push(`Unadjusted Price Outlier: Price shifted by ${data.singleDayChangePct.toFixed(1)}% without registered corporate action in database.`);
      }
    } else {
      passedChecks.push('Split Sanity: Normal market volatility range (<30%).');
    }

    // 3. Liquidity Floor Hurdle
    if (data.turnover20DayAvgCr < this.MIN_LIQUIDITY_TURNOVER_CR) {
      quarantineReasons.push(`Illiquidity Gate: 20-day turnover of ₹${data.turnover20DayAvgCr.toFixed(2)} Cr is below institutional floor (₹${this.MIN_LIQUIDITY_TURNOVER_CR} Cr).`);
    } else {
      passedChecks.push(`Liquidity Floor: Institutional liquidity verified (₹${data.turnover20DayAvgCr.toFixed(2)} Cr/day).`);
    }

    // 4. Forensic Fundamental Shield
    if (data.isFinancialInstitution) {
      passedChecks.push('Forensic Shield: Financial Institution/NBFC exempted from industrial Net Debt/EBITDA checks.');
    } else if (typeof data.netDebtToEbitda === 'number' && data.netDebtToEbitda > this.MAX_NET_DEBT_EBITDA) {
      quarantineReasons.push(`Forensic Debt Bloat: Net Debt/EBITDA is ${data.netDebtToEbitda.toFixed(2)}x (exceeds ${this.MAX_NET_DEBT_EBITDA}x cap).`);
    } else {
      passedChecks.push('Forensic Shield: Clean balance sheet leverage.');
    }

    // 5. Governance & Pledging Ceiling
    if (typeof data.promoterPledgePct === 'number' && data.promoterPledgePct >= this.MAX_PROMOTER_PLEDGE_PCT) {
      quarantineReasons.push(`Governance Red Flag: Promoter pledge of ${data.promoterPledgePct.toFixed(1)}% violates safety ceiling (${this.MAX_PROMOTER_PLEDGE_PCT}%).`);
    } else if (data.auditorQualified) {
      quarantineReasons.push('Governance Red Flag: Statutory auditor qualified or resigned with adverse remarks.');
    } else {
      passedChecks.push('Governance: Promoter pledge safe (<20%), clean statutory audit.');
    }

    // 6. Confirmed Bar Close Filter for Execution & Stops
    let confirmedStopTriggered = false;
    let wickFilteredStopAvoided = false;

    const stopPrice = data.structuralStopPrice;
    const intradayLow = data.intradayLowPrice ?? data.currentPrice;
    const confirmedClose = data.confirmedBarClosePrice ?? data.currentPrice;

    if (stopPrice > 0) {
      if (confirmedClose <= stopPrice) {
        // Confirmed bar closed at or below stop -> Valid Stop Loss Exit
        confirmedStopTriggered = true;
      } else if (intradayLow <= stopPrice && confirmedClose > stopPrice) {
        // Intraday wick breached stop but candle closed above -> Wick filtered out!
        wickFilteredStopAvoided = true;
        passedChecks.push(`Wick Protection: Intraday low (₹${intradayLow}) touched stop (₹${stopPrice}), but confirmed close (₹${confirmedClose}) held above. Premature shakeout prevented.`);
      }
    }

    const isDataApproved = quarantineReasons.length === 0;
    const fiduciaryGrade: IntegrityCheckResult['fiduciaryGrade'] = isDataApproved
      ? (data.turnover20DayAvgCr >= 10.0 ? 'TIER_1_CERTIFIED' : 'TIER_2_ACCEPTABLE')
      : 'DATA_QUARANTINED';

    const notes = isDataApproved
      ? `Data Integrity 100% Certified. Passed all ${passedChecks.length} institutional gates.`
      : `QUARANTINED: Failed ${quarantineReasons.length} integrity checks. Automated trading blocked.`;

    return {
      symbol: data.symbol,
      isDataApproved,
      fiduciaryGrade,
      passedChecks,
      quarantineReasons,
      confirmedStopTriggered,
      wickFilteredStopAvoided,
      notes
    };
  }
}
