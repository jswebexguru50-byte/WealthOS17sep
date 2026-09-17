import { Database } from 'sqlite3';
import { dbAll, dbGet } from '../database.js';
import { BankAndFDService } from './BankAndFDService.js';

export interface UnifiedValuationResult {
  memberId: number | 'all';
  allowedPortfolios: string[];
  totalPortfolioValINR: number;
  totalCostBasisINR: number;
  totalTaxCostBasisINR: number;
  totalDayChangeINR: number;
  totalDayChangePct: number;
  totalBankAndFdValINR: number;
  pmsCashInHand: number;
  unallocatedPmsCash: number;
  pmsBaselineCost: number;
  totalNetWorthINR: number;
  totalUnrealizedGainINR: number;
  totalUnrealizedGainPct: number;
  holdingsCount: number;
  activePortfoliosCount: number;
  holdings: any[];
}

export class UnifiedValuationService {
  private static instance: UnifiedValuationService;

  private constructor() {}

  public static getInstance(): UnifiedValuationService {
    if (!UnifiedValuationService.instance) {
      UnifiedValuationService.instance = new UnifiedValuationService();
    }
    return UnifiedValuationService.instance;
  }

  /**
   * Determine allowed portfolios for a given member_id.
   * Member 1 = Gopal (Primary / Family Office)
   * Member 2 = Brother (Pankaj)
   * 'all' / 'consolidated' = All active portfolios
   */
  public async getAllowedPortfoliosForMember(db: Database, memberIdRaw: any): Promise<{ memberId: number | 'all'; allowedPortNames: string[] }> {
    let memberId: number | 'all' = 1;
    if (memberIdRaw === 'all' || memberIdRaw === 'consolidated') {
      memberId = 'all';
    } else if (memberIdRaw) {
      const p = parseInt(String(memberIdRaw), 10);
      if (!isNaN(p) && p > 0) memberId = p;
    }

    let allowedPortNames: string[] = [];
    if (memberId === 'all') {
      const allRows = await dbAll(db, "SELECT DISTINCT name FROM Portfolios WHERE status != 'ARCHIVED'");
      allowedPortNames = allRows.map((r: any) => r.name);
    } else {
      const memRows = await dbAll(db, `
        SELECT DISTINCT name FROM Portfolios 
        WHERE (member_id = ? OR name IN (SELECT portfolio_name FROM MemberPortfolioPermissions WHERE member_id = ?))
          AND status != 'ARCHIVED'
      `, [memberId, memberId]);
      allowedPortNames = memRows.map((r: any) => r.name);
    }

    return { memberId, allowedPortNames };
  }

  /**
   * Single Source of Truth for Family Office & Dashboard Valuations
   */
  public async getUnifiedValuation(
    db: Database,
    memberIdRaw: any,
    selectedPortfolios?: string[] | null
  ): Promise<UnifiedValuationResult> {
    const { memberId, allowedPortNames } = await this.getAllowedPortfoliosForMember(db, memberIdRaw);

    // Apply explicit portfolio selection within the allowed member boundary
    let targetPortfolios = allowedPortNames;
    if (selectedPortfolios && selectedPortfolios.length > 0 && !selectedPortfolios.includes('__ALL__') && !selectedPortfolios.includes('all') && !selectedPortfolios.includes('Combined')) {
      const selectedClean = selectedPortfolios.map(s => String(s).trim().toLowerCase());
      targetPortfolios = allowedPortNames.filter(p => selectedClean.includes(p.toLowerCase()));
    }

    const fxRates = await BankAndFDService.getInstance().getCurrencyRates();
    const usdRate = fxRates.USD || 84.0;

    // 1. Fetch active holdings
    let holdings: any[] = [];
    if (targetPortfolios.length > 0) {
      const placeholders = targetPortfolios.map(() => '?').join(',');
      holdings = await dbAll(db, `
        SELECT 
          h.portfolio,
          h.symbol,
          h.isin,
          COALESCE(m.name, h.symbol) as company_name,
          h.quantity,
          h.avg_buy_price,
          h.total_cost,
          h.tax_avg_price,
          h.tax_cost_basis,
          h.ltp,
          h.prev_close,
          h.current_value,
          h.unrealized_pnl,
          h.unrealized_pct,
          h.day_change,
          h.day_change_pct,
          h.currency,
          h.data_source,
          h.last_update,
          p.type as portfolio_type,
          COALESCE(p.base_currency, 'INR') as base_currency
        FROM Holdings h
        LEFT JOIN Portfolios p ON h.portfolio = p.name
        LEFT JOIN MasterTickers m ON (h.isin IS NOT NULL AND h.isin != '' AND m.isin = h.isin)
        WHERE h.quantity > 0 AND h.portfolio IN (${placeholders})
      `, targetPortfolios);
    }

    // 2. Fetch Bank Accounts & FDs (only for Gopal / member 1, never for Brother)
    let bankFds: any[] = [];
    if (memberId === 1 || memberId === 'all') {
      bankFds = await BankAndFDService.getInstance().getAllBankAndFDs();
      if (selectedPortfolios && selectedPortfolios.length > 0 && !selectedPortfolios.includes('Cash & FD') && !selectedPortfolios.includes('Combined') && !selectedPortfolios.includes('all') && !selectedPortfolios.includes('__ALL__')) {
        // If user specifically filtered to single equity portfolio, don't include FDs
        bankFds = [];
      }
    }

    let totalBankAndFdValINR = 0;
    bankFds.forEach((b: any) => {
      const bal = b.balance_amount || b.principal_amount || 0;
      const cur = (b.currency || 'INR').toUpperCase();
      const mult = cur === 'INR' ? 1.0 : (fxRates[cur] || 1.0);
      totalBankAndFdValINR += bal * mult;
    });

    // 3. Fetch PMS Cash in Hand & Injected Capital Baseline
    let pmsCashInHand = 0;
    let pmsBaselineCost = 0;
    if (targetPortfolios.map(p => p.toLowerCase()).includes('cc9')) {
      try {
        const pmsRow: any = await dbGet(db, "SELECT cash_in_hand, initial_cash_deposits, in_kind_cost_val FROM PmsReconciliationBaseline WHERE portfolio = 'cc9'");
        pmsCashInHand = pmsRow?.cash_in_hand || 0;
        if (pmsRow && (pmsRow.initial_cash_deposits > 0 || pmsRow.in_kind_cost_val > 0)) {
          pmsBaselineCost = (pmsRow.initial_cash_deposits || 0) + (pmsRow.in_kind_cost_val || 0);
        }
      } catch (_) {}
    }

    // 4. Aggregations
    let totalPortfolioValINR = 0;
    let totalCostBasisINR = 0;
    let totalTaxCostBasisINR = 0;
    let totalDayChangeINR = 0;
    let totalPrevCloseValINR = 0;
    let cc9HoldingCost = 0;

    holdings.forEach((h: any) => {
      const curVal = Number(h.current_value || (h.quantity * (h.ltp || h.avg_buy_price)) || 0);
      const isUsAsset = h.currency === 'USD' || h.portfolio === 'US - IBKR' || h.portfolio === 'Sarwa';
      const rawCost = Number(h.total_cost || (h.quantity * h.avg_buy_price) || 0);
      const costVal = isUsAsset && rawCost < 1000000 ? (rawCost * usdRate) : rawCost;
      const rawTaxCost = Number(h.tax_cost_basis || rawCost);
      const taxCost = isUsAsset && rawTaxCost < 1000000 ? (rawTaxCost * usdRate) : rawTaxCost;
      const dayChg = Number(h.day_change || 0);
      const prevVal = curVal - dayChg;

      totalPortfolioValINR += curVal;
      totalCostBasisINR += costVal;
      totalTaxCostBasisINR += taxCost;
      totalDayChangeINR += dayChg;
      totalPrevCloseValINR += prevVal;

      if (String(h.portfolio).toLowerCase() === 'cc9') {
        cc9HoldingCost += costVal;
      }
    });

    // Align PMS baseline cost if available
    if (pmsBaselineCost > 0 && targetPortfolios.map(p => p.toLowerCase()).includes('cc9')) {
      const pmsDiff = pmsBaselineCost - cc9HoldingCost;
      totalCostBasisINR += pmsDiff;
      totalTaxCostBasisINR += pmsDiff;
    }

    const hasPmsCashInHoldings = holdings.some((h: any) => (h.symbol === 'CASH' || h.isin === 'CASH') && (String(h.portfolio).toLowerCase() === 'cc9' || (h.portfolio || '').includes('PMS')));
    const unallocatedPmsCash = hasPmsCashInHoldings ? 0 : pmsCashInHand;

    const totalNetWorthINR = totalPortfolioValINR + totalBankAndFdValINR + unallocatedPmsCash;
    const totalDayChangePct = totalPrevCloseValINR > 0 ? (totalDayChangeINR / totalPrevCloseValINR) * 100 : 0;
    const totalUnrealizedGainINR = totalNetWorthINR - (totalCostBasisINR + totalBankAndFdValINR + unallocatedPmsCash);
    const totalUnrealizedGainPct = (totalCostBasisINR + totalBankAndFdValINR + unallocatedPmsCash) > 0 
      ? (totalUnrealizedGainINR / (totalCostBasisINR + totalBankAndFdValINR + unallocatedPmsCash)) * 100 
      : 0;

    return {
      memberId,
      allowedPortfolios: targetPortfolios,
      totalPortfolioValINR: Math.round(totalPortfolioValINR * 100) / 100,
      totalCostBasisINR: Math.round(totalCostBasisINR * 100) / 100,
      totalTaxCostBasisINR: Math.round(totalTaxCostBasisINR * 100) / 100,
      totalDayChangeINR: Math.round(totalDayChangeINR * 100) / 100,
      totalDayChangePct: Math.round(totalDayChangePct * 100) / 100,
      totalBankAndFdValINR: Math.round(totalBankAndFdValINR * 100) / 100,
      pmsCashInHand,
      unallocatedPmsCash,
      pmsBaselineCost,
      totalNetWorthINR: Math.round(totalNetWorthINR * 100) / 100,
      totalUnrealizedGainINR: Math.round(totalUnrealizedGainINR * 100) / 100,
      totalUnrealizedGainPct: Math.round(totalUnrealizedGainPct * 100) / 100,
      holdingsCount: holdings.length,
      activePortfoliosCount: new Set(holdings.map(h => h.portfolio)).size,
      holdings
    };
  }
}
