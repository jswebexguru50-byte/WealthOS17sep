import { dbAll, dbGet, getDB } from '../database.js';
import { calculateXIRR, CashFlow } from '../xirr.js';
import { parseDate } from '../fifoEngine.js';

export interface PanTaxBreakdown {
  pan: string;
  ownerName: string;
  isSeniorCitizen: boolean;
  taxResidency: string;
  portfolios: string[];
  grossValuation: number;
  realized: {
    total: number;
    stcg: number;
    ltcg: number;
    tax: number;
  };
  unrealized: {
    total: number;
    totalWithAif: number;
    stcg: number;
    ltcg: number;
    tax: number;
  };
  totalGains: number;
  carriedForwardLosses: {
    stclBroughtForward: number;
    ltclBroughtForward: number;
    stclUtilized: number;
    ltclUtilized: number;
    stclRemaining: number;
    ltclRemaining: number;
    taxSaved: number;
  };
  sec112aExemptionApplied: number;
  aifPostTaxValuation: number;
  aifPostTaxGain: number;
  taxableStcg: number;
  taxableLtcg: number;
  baseTax: number;
  surchargeRate: number; // in %: 0, 10, 15
  surchargeAmount: number;
  cessAmount: number;
  totalTaxProvision: number;
  taxSaved: number;
}

export interface TaxProvisionBreakdown {
  financialYear: string;
  portfolios: string[];
  grossValuation: number;
  postTaxValuation: number;
  totalAifPostTaxValuation: number;
  totalAifPostTaxGain: number;
  totalTaxProvision: number;
  baseTax: number;
  surchargeRate: number;
  surchargeAmount: number;
  cessAmount: number;
  realized: {
    total: number;
    stcg: number;
    ltcg: number;
    tax: number;
  };
  unrealized: {
    total: number;
    totalWithAif: number;
    stcg: number;
    ltcg: number;
    tax: number;
  };
  totalGains: number;
  carriedForwardLosses: {
    stclBroughtForward: number;
    ltclBroughtForward: number;
    stclUtilized: number;
    ltclUtilized: number;
    stclRemaining: number;
    ltclRemaining: number;
    taxSaved: number;
  };
  sec112aExemptionApplied: number;
  panBreakdowns: PanTaxBreakdown[];
}

export class PostTaxXirrService {
  private static instance: PostTaxXirrService;

  public static getInstance(): PostTaxXirrService {
    if (!PostTaxXirrService.instance) {
      PostTaxXirrService.instance = new PostTaxXirrService();
    }
    return PostTaxXirrService.instance;
  }

  /**
   * Compute statutory capital gains tax provision strictly ASSESSED BY PAN.
   * Under Indian IT Act (Sec 111A, 112A, 70, 71 & 74):
   * 1. Capital gains are assessed on the individual PAN (assesse).
   * 2. Section 112A ₹1,25,000 exemption is granted PER PAN.
   * 3. Surcharge (capped at 15%) is evaluated PER PAN on total taxable gains.
   * 4. 4% Health & Education Cess applies on (Base Tax + Surcharge).
   * 5. Carried forward losses in Schedule CFL offset gains within the same PAN only.
   */
  public async computeTaxProvision(
    portfolios: string[] | null,
    fy: string = '2024-25'
  ): Promise<TaxProvisionBreakdown> {
    const db = getDB();

    // 1. Fetch all portfolios with their assigned PAN and Owner Name
    const pRows = await dbAll(db, "SELECT name, COALESCE(pan, '') as pan, COALESCE(owner_name, '') as owner_name FROM Portfolios WHERE status != 'ARCHIVED'");
    const portPanMap = new Map<string, { pan: string; ownerName: string }>();

    pRows.forEach((r: any) => {
      let pan = r.pan;
      let ownerName = r.owner_name;

      // Ensure exact user mapping rules if database not yet migrated
      const upper = (r.name || '').toUpperCase();
      if (upper.includes('MAA') || r.name === 'cc9' || r.name === 'Unlisted' || r.name === 'IIFL360') {
        pan = 'BBFPS1002P';
        ownerName = 'Maa (Mother)';
      } else if (upper.includes('PAPA')) {
        pan = 'ALRSP9041D';
        ownerName = 'Papa (Father)';
      } else if (upper.includes('BROTHER') || upper.includes('PANKAJ')) {
        pan = 'DFYPS6605R';
        ownerName = 'Pankaj Sharma (Brother)';
      } else if (upper.includes('POOJA')) {
        pan = 'POOJA_PAN_PENDING';
        ownerName = 'Pooja Sharma';
      } else {
        pan = 'AQCPS7204G';
        ownerName = 'Gopal Sharma (Self)';
      }

      portPanMap.set(r.name, { pan, ownerName });
    });

    // 2. Fetch FamilyMembers for Senior Citizen status & Tax Residency
    const fmRows = await dbAll(db, "SELECT pan_number, is_senior_citizen, tax_residency FROM FamilyMembers");
    const memberMetaMap = new Map<string, { isSeniorCitizen: boolean; taxResidency: string }>();
    fmRows.forEach((m: any) => {
      if (m.pan_number) {
        memberMetaMap.set(m.pan_number, {
          isSeniorCitizen: Number(m.is_senior_citizen) === 1,
          taxResidency: m.tax_residency || 'RESIDENT'
        });
      }
    });

    // Known statutory defaults
    if (!memberMetaMap.has('BBFPS1002P')) memberMetaMap.set('BBFPS1002P', { isSeniorCitizen: true, taxResidency: 'RESIDENT' });
    if (!memberMetaMap.has('ALRSP9041D')) memberMetaMap.set('ALRSP9041D', { isSeniorCitizen: true, taxResidency: 'RESIDENT' });
    if (!memberMetaMap.has('AQCPS7204G')) memberMetaMap.set('AQCPS7204G', { isSeniorCitizen: false, taxResidency: 'NRI' });
    if (!memberMetaMap.has('DFYPS6605R')) memberMetaMap.set('DFYPS6605R', { isSeniorCitizen: false, taxResidency: 'RESIDENT' });
    if (!memberMetaMap.has('POOJA_PAN_PENDING')) memberMetaMap.set('POOJA_PAN_PENDING', { isSeniorCitizen: false, taxResidency: 'RESIDENT' });

    // 3. Resolve active portfolio list
    let portList: string[] = [];
    if (portfolios && portfolios.length > 0) {
      portList = portfolios;
    } else {
      portList = pRows.map((r: any) => r.name);
    }

    if (portList.length === 0) {
      return this.getEmptyTaxBreakdown(fy, []);
    }

    // 4. Group target portfolios by PAN
    const panGroupMap = new Map<string, string[]>();
    for (const port of portList) {
      const info = portPanMap.get(port) || { pan: 'AQCPS7204G', ownerName: 'Gopal Sharma (Self)' };
      const list = panGroupMap.get(info.pan) || [];
      list.push(port);
      panGroupMap.set(info.pan, list);
    }

    // 5. Fetch first transaction dates across all requested portfolios for holding period calculation
    const placeholders = portList.map(() => '?').join(',');
    const firstTxMap = new Map<string, Date>();
    const txRows = await dbAll(db, `
      SELECT portfolio, COALESCE(isin, symbol) as key_id, MIN(date) as first_date
      FROM Transactions
      WHERE portfolio IN (${placeholders}) AND type IN ('BUY', 'PURCHASE', 'IPO', 'INVESTMENT', 'TRANSFER IN', 'SECURITY IN')
      GROUP BY portfolio, key_id
    `, portList);
    txRows.forEach((r: any) => {
      const d = parseDate(r.first_date);
      if (d) firstTxMap.set(`${r.portfolio}::${r.key_id}`, d);
    });

    const now = new Date();
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

    // 6. Compute tax individually FOR EACH PAN
    const panBreakdowns: PanTaxBreakdown[] = [];

    for (const [pan, panPorts] of panGroupMap.entries()) {
      const panPlaceholders = panPorts.map(() => '?').join(',');
      const meta = memberMetaMap.get(pan) || { isSeniorCitizen: false, taxResidency: 'RESIDENT' };
      const samplePort = panPorts[0];
      const ownerName = portPanMap.get(samplePort)?.ownerName || 'Family Member';

      // A. Realized Capital Gains for this PAN in this FY
      let panRealizedStcg = 0;
      let panRealizedLtcg = 0;

      const gains = await dbAll(db, `
        SELECT portfolio, sell_date, realized_pnl, taxable_pnl, tax_category 
        FROM RealizedGains 
        WHERE portfolio IN (${panPlaceholders})
      `, panPorts);

      for (const g of gains) {
        const sellDate = parseDate(g.sell_date);
        if (!sellDate) continue;

        const m = sellDate.getMonth();
        const y = sellDate.getFullYear();
        const startY = m >= 3 ? y : y - 1;
        const gFy = `${startY}-${String(startY + 1).slice(-2)}`;
        if (gFy !== fy) continue;

        const pnl = g.taxable_pnl !== null ? g.taxable_pnl : (g.realized_pnl || 0);
        if (g.tax_category === 'STCG') {
          panRealizedStcg += pnl;
        } else if (g.tax_category === 'LTCG') {
          panRealizedLtcg += pnl;
        }
      }

      // B. Unrealized Capital Gains & Gross Valuation for this PAN's open holdings
      let panUnrealizedStcg = 0;
      let panUnrealizedLtcg = 0;
      let panGrossValuation = 0;
      let panAifValuation = 0;
      let panAifGain = 0;

      const holdings = await dbAll(db, `
        SELECT h.portfolio, h.isin, h.symbol, h.quantity, h.total_cost, h.tax_cost_basis, h.current_value, h.holding_type, h.created_at
        FROM Holdings h
        WHERE h.quantity > 0 AND h.portfolio IN (${panPlaceholders})
      `, panPorts);

      for (const h of holdings) {
        const curVal = Number(h.current_value || 0);
        const costVal = Number(h.tax_cost_basis || h.total_cost || 0);
        panGrossValuation += curVal;
        const gain = curVal - costVal;

        if (h.holding_type === 'CASH') continue;

        // AIF (Alternative Investment Funds, e.g. Smart Horizon Opportunity Fund):
        // Fund manager explicitly reports post-tax NAVs where fund-level tax on
        // unrealized gains is already incorporated directly into the NAV and redemption NAV.
        // Therefore, AIF unrealized gains must NOT be subjected to statutory capital gains tax again.
        const symUp = (h.symbol || '').toUpperCase();
        const isinUp = (h.isin || '').toUpperCase();
        const isAif = h.holding_type === 'AIF' || 
          symUp.includes('SMART HORIZON') || 
          symUp.includes('UL-SMART') || 
          symUp.includes('AIF') ||
          isinUp.includes('HORIZON');

        if (isAif) {
          panAifValuation += curVal;
          panAifGain += gain;
          continue;
        }

        const key = `${h.portfolio}::${h.isin || h.symbol}`;
        const acqDate = firstTxMap.get(key) || parseDate(h.created_at) || now;
        const isLongTerm = (now.getTime() - acqDate.getTime()) >= ONE_YEAR_MS;

        if (isLongTerm) {
          panUnrealizedLtcg += gain;
        } else {
          panUnrealizedStcg += gain;
        }
      }

      // C. Brought Forward Losses for this PAN
      let panStclBroughtForward = 0;
      let panLtclBroughtForward = 0;

      const cflRows = await dbAll(db, `
        SELECT portfolio, stcl_amount, ltcl_amount 
        FROM CarriedForwardLosses 
        WHERE portfolio IN (${panPlaceholders}) AND financial_year = ?
      `, [...panPorts, fy]);

      cflRows.forEach((r: any) => {
        panStclBroughtForward += Number(r.stcl_amount || 0);
        panLtclBroughtForward += Number(r.ltcl_amount || 0);
      });

      // D. Statutory Set-Off Matrix FOR THIS PAN
      let totalLtcg = Math.max(0, panRealizedLtcg + panUnrealizedLtcg);
      let totalStcg = Math.max(0, panRealizedStcg + panUnrealizedStcg);

      // Rule A: LTCL offsets LTCG only
      const ltclUtilized = Math.min(panLtclBroughtForward, totalLtcg);
      totalLtcg -= ltclUtilized;
      const ltclRemaining = panLtclBroughtForward - ltclUtilized;

      // Rule B: STCL offsets STCG first
      const stclUsedOnStcg = Math.min(panStclBroughtForward, totalStcg);
      totalStcg -= stclUsedOnStcg;
      const remStcl = panStclBroughtForward - stclUsedOnStcg;

      // Rule C: Remaining STCL offsets remaining LTCG
      const stclUsedOnLtcg = Math.min(remStcl, totalLtcg);
      totalLtcg -= stclUsedOnLtcg;
      const stclRemaining = remStcl - stclUsedOnLtcg;
      const stclUtilized = stclUsedOnStcg + stclUsedOnLtcg;

      // Rule D: Section 112A annual exemption of ₹1,25,000 granted PER PAN
      const sec112aLimit = 125000;
      const sec112aExemptionApplied = Math.min(totalLtcg, sec112aLimit);
      const taxableLtcg = Math.max(0, totalLtcg - sec112aExemptionApplied);
      const taxableStcg = Math.max(0, totalStcg);

      // E. Base Tax Provision (Budget 2024 Regime: STCG 20%, LTCG 12.5%)
      const baseStcgTax = taxableStcg * 0.20;
      const baseLtcgTax = taxableLtcg * 0.125;
      const baseTax = baseStcgTax + baseLtcgTax;

      // F. Surcharge Calculation (Assessed on THIS PAN's total taxable capital gains)
      // Statutory 15% Cap applies to equity capital gains u/s 111A/112A
      const panTotalTaxableGains = taxableStcg + taxableLtcg;
      let surchargeRate = 0;
      if (panTotalTaxableGains > 10000000) {
        surchargeRate = 0.15;
      } else if (panTotalTaxableGains > 5000000) {
        surchargeRate = 0.10;
      }
      const surchargeAmount = baseTax * surchargeRate;

      // G. Health & Education Cess (4% on Tax + Surcharge)
      const cessAmount = (baseTax + surchargeAmount) * 0.04;
      const panTotalTaxProvision = Math.round(baseTax + surchargeAmount + cessAmount);

      // Effective multiplier for tax savings
      const effectiveMultiplier = (1 + surchargeRate) * 1.04;
      const panTaxSaved = Math.round(
        ((ltclUtilized * 0.125) +
        (stclUsedOnStcg * 0.20) +
        (stclUsedOnLtcg * 0.125) +
        (sec112aExemptionApplied * 0.125)) * effectiveMultiplier
      );

      panBreakdowns.push({
        pan,
        ownerName,
        isSeniorCitizen: meta.isSeniorCitizen,
        taxResidency: meta.taxResidency,
        portfolios: panPorts,
        grossValuation: Math.round(panGrossValuation * 100) / 100,
        realized: {
          total: Math.round((panRealizedStcg + panRealizedLtcg) * 100) / 100,
          stcg: Math.round(panRealizedStcg * 100) / 100,
          ltcg: Math.round(panRealizedLtcg * 100) / 100,
          tax: Math.round((((Math.max(0, panRealizedStcg) * 0.20) + (Math.max(0, panRealizedLtcg) * 0.125)) * effectiveMultiplier) * 100) / 100
        },
        unrealized: {
          total: Math.round((panUnrealizedStcg + panUnrealizedLtcg) * 100) / 100,
          totalWithAif: Math.round((panUnrealizedStcg + panUnrealizedLtcg + panAifGain) * 100) / 100,
          stcg: Math.round(panUnrealizedStcg * 100) / 100,
          ltcg: Math.round(panUnrealizedLtcg * 100) / 100,
          tax: Math.round((((Math.max(0, panUnrealizedStcg) * 0.20) + (Math.max(0, panUnrealizedLtcg) * 0.125)) * effectiveMultiplier) * 100) / 100
        },
        totalGains: Math.round(((panRealizedStcg + panRealizedLtcg) + (panUnrealizedStcg + panUnrealizedLtcg) + panAifGain) * 100) / 100,
        carriedForwardLosses: {
          stclBroughtForward: Math.round(panStclBroughtForward * 100) / 100,
          ltclBroughtForward: Math.round(panLtclBroughtForward * 100) / 100,
          stclUtilized: Math.round(stclUtilized * 100) / 100,
          ltclUtilized: Math.round(ltclUtilized * 100) / 100,
          stclRemaining: Math.round(stclRemaining * 100) / 100,
          ltclRemaining: Math.round(ltclRemaining * 100) / 100,
          taxSaved: panTaxSaved
        },
        sec112aExemptionApplied,
        aifPostTaxValuation: Math.round(panAifValuation * 100) / 100,
        aifPostTaxGain: Math.round(panAifGain * 100) / 100,
        taxableStcg: Math.round(taxableStcg * 100) / 100,
        taxableLtcg: Math.round(taxableLtcg * 100) / 100,
        baseTax: Math.round(baseTax * 100) / 100,
        surchargeRate: surchargeRate * 100,
        surchargeAmount: Math.round(surchargeAmount * 100) / 100,
        cessAmount: Math.round(cessAmount * 100) / 100,
        totalTaxProvision: panTotalTaxProvision,
        taxSaved: panTaxSaved
      });
    }

    // 7. Aggregate totals across all PANs for the requested portfolios
    let totalGrossValuation = 0;
    let totalTaxProvision = 0;
    let totalAifPostTaxValuation = 0;
    let totalAifPostTaxGain = 0;
    let totalBaseTax = 0;
    let totalSurchargeAmount = 0;
    let totalCessAmount = 0;
    let totalSec112aExemption = 0;
    let totalTaxSaved = 0;

    let totalRealizedStcg = 0;
    let totalRealizedLtcg = 0;
    let totalRealizedTax = 0;

    let totalUnrealizedStcg = 0;
    let totalUnrealizedLtcg = 0;
    let totalUnrealizedTax = 0;

    let totalStclBroughtForward = 0;
    let totalLtclBroughtForward = 0;
    let totalStclUtilized = 0;
    let totalLtclUtilized = 0;
    let totalStclRemaining = 0;
    let totalLtclRemaining = 0;

    for (const b of panBreakdowns) {
      totalGrossValuation += b.grossValuation;
      totalTaxProvision += b.totalTaxProvision;
      totalAifPostTaxValuation += b.aifPostTaxValuation || 0;
      totalAifPostTaxGain += b.aifPostTaxGain || 0;
      totalBaseTax += b.baseTax;
      totalSurchargeAmount += b.surchargeAmount;
      totalCessAmount += b.cessAmount;
      totalSec112aExemption += b.sec112aExemptionApplied;
      totalTaxSaved += b.taxSaved;

      totalRealizedStcg += b.realized.stcg;
      totalRealizedLtcg += b.realized.ltcg;
      totalRealizedTax += b.realized.tax;

      totalUnrealizedStcg += b.unrealized.stcg;
      totalUnrealizedLtcg += b.unrealized.ltcg;
      totalUnrealizedTax += b.unrealized.tax;

      totalStclBroughtForward += b.carriedForwardLosses.stclBroughtForward;
      totalLtclBroughtForward += b.carriedForwardLosses.ltclBroughtForward;
      totalStclUtilized += b.carriedForwardLosses.stclUtilized;
      totalLtclUtilized += b.carriedForwardLosses.ltclUtilized;
      totalStclRemaining += b.carriedForwardLosses.stclRemaining;
      totalLtclRemaining += b.carriedForwardLosses.ltclRemaining;
    }

    const effectiveSurchargeRate = totalBaseTax > 0 ? (totalSurchargeAmount / totalBaseTax) * 100 : 0;
    const postTaxValuation = Math.max(0, totalGrossValuation - totalTaxProvision);

    return {
      financialYear: fy,
      portfolios: portList,
      grossValuation: Math.round(totalGrossValuation * 100) / 100,
      postTaxValuation: Math.round(postTaxValuation * 100) / 100,
      totalAifPostTaxValuation: Math.round(totalAifPostTaxValuation * 100) / 100,
      totalAifPostTaxGain: Math.round(totalAifPostTaxGain * 100) / 100,
      totalTaxProvision,
      baseTax: Math.round(totalBaseTax * 100) / 100,
      surchargeRate: Math.round(effectiveSurchargeRate * 10) / 10,
      surchargeAmount: Math.round(totalSurchargeAmount * 100) / 100,
      cessAmount: Math.round(totalCessAmount * 100) / 100,
      realized: {
        total: Math.round((totalRealizedStcg + totalRealizedLtcg) * 100) / 100,
        stcg: Math.round(totalRealizedStcg * 100) / 100,
        ltcg: Math.round(totalRealizedLtcg * 100) / 100,
        tax: Math.round(totalRealizedTax * 100) / 100
      },
      unrealized: {
        total: Math.round((totalUnrealizedStcg + totalUnrealizedLtcg) * 100) / 100,
        totalWithAif: Math.round((totalUnrealizedStcg + totalUnrealizedLtcg + totalAifPostTaxGain) * 100) / 100,
        stcg: Math.round(totalUnrealizedStcg * 100) / 100,
        ltcg: Math.round(totalUnrealizedLtcg * 100) / 100,
        tax: Math.round(totalUnrealizedTax * 100) / 100
      },
      totalGains: Math.round(((totalRealizedStcg + totalRealizedLtcg) + (totalUnrealizedStcg + totalUnrealizedLtcg) + totalAifPostTaxGain) * 100) / 100,
      carriedForwardLosses: {
        stclBroughtForward: Math.round(totalStclBroughtForward * 100) / 100,
        ltclBroughtForward: Math.round(totalLtclBroughtForward * 100) / 100,
        stclUtilized: Math.round(totalStclUtilized * 100) / 100,
        ltclUtilized: Math.round(totalLtclUtilized * 100) / 100,
        stclRemaining: Math.round(totalStclRemaining * 100) / 100,
        ltclRemaining: Math.round(totalLtclRemaining * 100) / 100,
        taxSaved: totalTaxSaved
      },
      sec112aExemptionApplied: totalSec112aExemption,
      panBreakdowns
    };
  }

  private getEmptyTaxBreakdown(fy: string, portList: string[]): TaxProvisionBreakdown {
    return {
      financialYear: fy,
      portfolios: portList,
      grossValuation: 0,
      postTaxValuation: 0,
      totalAifPostTaxValuation: 0,
      totalAifPostTaxGain: 0,
      totalTaxProvision: 0,
      baseTax: 0,
      surchargeRate: 0,
      surchargeAmount: 0,
      cessAmount: 0,
      realized: { total: 0, stcg: 0, ltcg: 0, tax: 0 },
      unrealized: { total: 0, totalWithAif: 0, stcg: 0, ltcg: 0, tax: 0 },
      totalGains: 0,
      carriedForwardLosses: {
        stclBroughtForward: 0,
        ltclBroughtForward: 0,
        stclUtilized: 0,
        ltclUtilized: 0,
        stclRemaining: 0,
        ltclRemaining: 0,
        taxSaved: 0
      },
      sec112aExemptionApplied: 0,
      panBreakdowns: []
    };
  }

  /**
   * Calculates the Post-Tax XIRR by subtracting the current FY net tax provision from the terminal cash flow.
   */
  public calculatePostTaxXIRR(
    preTaxFlows: CashFlow[],
    totalTaxProvision: number
  ): number {
    if (!preTaxFlows || preTaxFlows.length < 2) return 0;

    const postTaxFlows = preTaxFlows.map(cf => {
      if (cf.type === 'end') {
        const netAmount = Math.max(0, cf.amount - totalTaxProvision);
        return {
          ...cf,
          amount: netAmount
        };
      }
      return { ...cf };
    });

    const postTaxXirr = calculateXIRR(postTaxFlows);
    return Math.round(postTaxXirr * 100) / 100;
  }
}
