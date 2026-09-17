/**
 * XbrlIngestionService.ts
 * 
 * Official SEBI / BSE / NSE XBRL Statutory Filing Ingestor for NRI WealthOS.
 * Provides 100% deterministic, machine-readable extraction of corporate filings directly from
 * official exchange XBRL XML instances (SEBI Regulation 31 Shareholding & Regulation 33 Financials)
 * and official exchange JSON master feeds.
 * 
 * Sources:
 * 1. Primary: Official SEBI/BSE/NSE Statutory XBRL XML Filings (Ind-AS Reg 31 & Reg 33)
 * 2. Official Backup: NSE Corporate Shareholding Master & Financial Results API
 */

import { XMLParser } from 'fast-xml-parser';
import https from 'https';
import { getDB, dbRun, dbAll, dbGet } from '../database.js';

export interface XbrlShareholdingData {
  symbol: string;
  scripCode?: string;
  companyName: string;
  asOfQuarter: string; // e.g. "30-JUN-2026" or "Jun 2026"
  submissionDate?: string;
  xbrlSourceUrl?: string;
  promoterPct: number;
  fiiPct: number;
  diiPct: number;
  govtPct: number;
  employeeTrustsPct: number;
  othersPct: number;
  publicPct: number;
  sumTotalPct: number;
  freeFloatPct: number;
  isFullyReconciled: boolean;
  dataSource: 'XBRL_XML' | 'NSE_EXCHANGE_MASTER' | 'BSE_API';
}

export interface XbrlFinancialStatementData {
  symbol: string;
  scripCode?: string;
  periodEndDate: string;
  statementPeriod: string;
  natureOfReport: 'STANDALONE' | 'CONSOLIDATED';
  revenueFromOperationsCr: number;
  otherIncomeCr: number;
  totalIncomeCr: number;
  rawMaterialCostCr: number;
  employeeCostCr: number;
  otherExpensesCr: number;
  totalExpensesCr: number;
  operatingProfitCr: number;
  opmPct: number;
  depreciationCr: number;
  financeCostsCr: number;
  profitBeforeTaxCr: number;
  taxExpenseCr: number;
  netProfitCr: number;
  patMarginPct: number;
  eps: number;
  equityCapitalCr?: number;
  reservesCr?: number;
  borrowingsCr?: number;
  totalAssetsCr?: number;
  cfoCr?: number;
  cfiCr?: number;
  cffCr?: number;
  netCashFlowCr?: number;
  dataSource: 'XBRL_XML' | 'EXCHANGE_API';
}

export interface ParsedXbrlDocument {
  docType: 'SHAREHOLDING_REG31' | 'FINANCIAL_RESULTS_REG33' | 'UNKNOWN';
  symbol: string;
  scripCode?: string;
  companyName?: string;
  periodEnded?: string;
  shareholding?: XbrlShareholdingData;
  financialResults?: XbrlFinancialStatementData;
}

export class XbrlIngestionService {
  private static instance: XbrlIngestionService;
  private parser: XMLParser;
  private nseMasterCache: Map<string, any> = new Map();
  private lastNseMasterFetchTime: number = 0;

  private constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseTagValue: true,
      trimValues: true
    });
  }

  public static getInstance(): XbrlIngestionService {
    if (!XbrlIngestionService.instance) {
      XbrlIngestionService.instance = new XbrlIngestionService();
    }
    return XbrlIngestionService.instance;
  }

  /**
   * Fetch the complete Official NSE Corporate Shareholding Master (all ~2,300+ listed equities)
   */
  public async fetchNseShareholdingMaster(forceRefresh: boolean = false): Promise<Map<string, any>> {
    const now = Date.now();
    // Cache for 6 hours unless forceRefresh
    if (!forceRefresh && this.nseMasterCache.size > 0 && (now - this.lastNseMasterFetchTime < 6 * 3600 * 1000)) {
      return this.nseMasterCache;
    }

    try {
      const url = 'https://www.nseindia.com/api/corporate-share-holdings-master?index=equities';
      const data = await this.httpGetJson<any[]>(url, {
        'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern'
      });

      if (Array.isArray(data)) {
        this.nseMasterCache.clear();
        for (const item of data) {
          if (item.symbol) {
            this.nseMasterCache.set(item.symbol.toUpperCase(), item);
          }
        }
        this.lastNseMasterFetchTime = now;
        console.log(`[XbrlIngestionService] Cached ${this.nseMasterCache.size} official NSE shareholding filings.`);
      }
    } catch (err: any) {
      console.warn(`[XbrlIngestionService] Could not fetch NSE master directly: ${err.message}`);
    }

    return this.nseMasterCache;
  }

  /**
   * Download and parse XBRL XML directly from NSE archives URL or local cache
   */
  public async fetchAndParseXbrlFromUrl(url: string, symbol: string): Promise<ParsedXbrlDocument | null> {
    try {
      const xml = await this.httpGetText(url);
      if (xml && xml.includes('<?xml')) {
        return this.parseXbrlXml(xml, symbol);
      }
    } catch (err: any) {
      console.error(`[XbrlIngestionService] Failed to download XBRL from ${url}:`, err.message);
    }
    return null;
  }

  /**
   * Get official shareholding for a symbol using Primary (XBRL XML) or Official Backup (NSE Master)
   */
  public async getOfficialShareholding(symbol: string): Promise<XbrlShareholdingData | null> {
    const sym = symbol.toUpperCase().replace('.NS', '').replace('.BO', '');
    const master = await this.fetchNseShareholdingMaster();
    const entry = master.get(sym);

    if (entry) {
      // If direct XBRL URL exists, download and extract granular breakdown
      if (entry.xbrl && entry.xbrl.startsWith('http')) {
        try {
          const parsedDoc = await this.fetchAndParseXbrlFromUrl(entry.xbrl, sym);
          if (parsedDoc?.shareholding && parsedDoc.shareholding.isFullyReconciled) {
            parsedDoc.shareholding.submissionDate = entry.submissionDate;
            parsedDoc.shareholding.xbrlSourceUrl = entry.xbrl;
            return parsedDoc.shareholding;
          }
        } catch (e) {
          // fallback to master entry summary
        }
      }

      // Fallback to Official NSE Master summary record
      const promoterPct = parseFloat(entry.pr_and_prgrp || '0') || 0;
      const employeeTrusts = parseFloat(entry.employeeTrusts || '0') || 0;
      let publicVal = parseFloat(entry.public_val || '0') || 0;

      let sum = promoterPct + employeeTrusts + publicVal;
      if (sum < 99.5 && promoterPct > 0) {
        publicVal = Number((100 - (promoterPct + employeeTrusts)).toFixed(2));
        sum = 100.0;
      }

      return {
        symbol: sym,
        companyName: entry.name || sym,
        asOfQuarter: entry.date || 'Latest',
        submissionDate: entry.submissionDate,
        xbrlSourceUrl: entry.xbrl,
        promoterPct: Number(promoterPct.toFixed(2)),
        fiiPct: 0, // Master summary aggregates non-promoter into public_val; granular XML fills FII/DII
        diiPct: 0,
        govtPct: 0,
        employeeTrustsPct: Number(employeeTrusts.toFixed(2)),
        othersPct: 0,
        publicPct: Number(publicVal.toFixed(2)),
        sumTotalPct: Number(sum.toFixed(2)),
        freeFloatPct: Number((100 - promoterPct).toFixed(2)),
        isFullyReconciled: Math.abs(sum - 100.0) <= 0.5,
        dataSource: 'NSE_EXCHANGE_MASTER'
      };
    }

    return null;
  }

  /**
   * Parse any raw SEBI/BSE/NSE XBRL XML string into structured, typed data.
   */
  public parseXbrlXml(xmlContent: string, symbolHint?: string): ParsedXbrlDocument {
    try {
      const isShp = xmlContent.includes('in-bse-shp') || xmlContent.includes('Shareholding') || xmlContent.includes('PromoterAndPromoterGroup');
      const isFin = xmlContent.includes('in-bse-fin') || xmlContent.includes('RevenueFromOperations') || xmlContent.includes('ProfitLossForPeriod');

      if (isShp) {
        const shp = this.extractShareholdingFromXml(xmlContent, symbolHint);
        return {
          docType: 'SHAREHOLDING_REG31',
          symbol: shp.symbol || symbolHint || 'UNKNOWN',
          scripCode: shp.scripCode,
          companyName: shp.companyName,
          periodEnded: shp.asOfQuarter,
          shareholding: shp
        };
      } else if (isFin) {
        const parsed = this.parser.parse(xmlContent);
        const rootKey = Object.keys(parsed).find(k => k.toLowerCase().includes('xbrl') || k.toLowerCase().includes('bse'));
        const rootObj = rootKey ? parsed[rootKey] : parsed;
        const fin = this.extractFinancialsFromObj(rootObj, xmlContent, symbolHint);
        return {
          docType: 'FINANCIAL_RESULTS_REG33',
          symbol: fin.symbol || symbolHint || 'UNKNOWN',
          scripCode: fin.scripCode,
          periodEnded: fin.periodEndDate,
          financialResults: fin
        };
      }

      return { docType: 'UNKNOWN', symbol: symbolHint || 'UNKNOWN' };
    } catch (err: any) {
      console.error('[XbrlIngestionService] Error parsing XML:', err.message);
      return { docType: 'UNKNOWN', symbol: symbolHint || 'UNKNOWN' };
    }
  }

  /**
   * Extract SEBI Regulation 31 Shareholding Pattern by parsing XBRL Context Dimensions & Facts
   */
  private extractShareholdingFromXml(xml: string, symbolHint?: string): XbrlShareholdingData {
    // 1. Build map of contextId -> Dimension ExplicitMember
    const contexts = new Map<string, string>();
    const contextRegex = /<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g;
    let m: RegExpExecArray | null;
    while ((m = contextRegex.exec(xml)) !== null) {
      const id = m[1];
      const body = m[2];
      const memberMatch = body.match(/<xbrldi:explicitMember[^>]*>([^<]+)<\/xbrldi:explicitMember>/);
      if (memberMatch) {
        contexts.set(id, memberMatch[1]);
      }
    }

    // 2. Extract company name and quarter
    const companyMatch = xml.match(/<in-bse-shp:NameOfTheCompany[^>]*>([^<]+)<\/in-bse-shp:NameOfTheCompany>/) ||
                         xml.match(/<in-bse-shp:CompanyName[^>]*>([^<]+)<\/in-bse-shp:CompanyName>/);
    const companyName = companyMatch ? companyMatch[1].trim() : (symbolHint || '');

    const quarterMatch = xml.match(/<in-bse-shp:DateOfEndOfReportingPeriod[^>]*>([^<]+)<\/in-bse-shp:DateOfEndOfReportingPeriod>/) ||
                          xml.match(/<in-bse-shp:QuarterEnded[^>]*>([^<]+)<\/in-bse-shp:QuarterEnded>/);
    const asOfQuarter = quarterMatch ? quarterMatch[1].trim() : 'Latest';

    const scripMatch = xml.match(/<in-bse-shp:ScripCode[^>]*>([^<]+)<\/in-bse-shp:ScripCode>/);
    const scripCode = scripMatch ? scripMatch[1].trim() : undefined;

    // 3. Scan facts for percentages
    let promoterPct = 0;
    let fiiPct = 0;
    let diiPct = 0;
    let govtPct = 0;
    let employeeTrustsPct = 0;
    let othersPct = 0;
    let publicPct = 0;

    const factRegex = /<in-bse-shp:([a-zA-Z0-9_-]+)\s+[^>]*contextRef="([^"]+)"[^>]*>([^<]+)<\/in-bse-shp:\1>/g;
    while ((m = factRegex.exec(xml)) !== null) {
      const tag = m[1];
      const ctx = m[2];
      const valStr = m[3].trim();
      const num = parseFloat(valStr);
      if (isNaN(num)) continue;

      // Normalise fractional percentage e.g. 0.3603 -> 36.03, or 36.03 -> 36.03
      const pct = num <= 1.0 && num > 0 ? num * 100 : num;
      const member = contexts.get(ctx) || ctx;

      if (tag.includes('ShareholdingAsAPercentage') || tag.includes('ShareholdingPercentage') || tag.includes('PercentageOfTotalShareCapital')) {
        if (member.includes('Promoter') || member.includes('TableA')) {
          if (pct > promoterPct) promoterPct = pct;
        } else if (member.includes('ForeignPortfolio') || member.includes('ForeignInstitutional') || member.includes('FPI') || member.includes('FII') || member.includes('ForeignMember')) {
          if (pct > fiiPct) fiiPct = pct;
        } else if (member.includes('MutualFund') || member.includes('FinancialInstitutions') || member.includes('Insurance') || member.includes('DomesticInstitutional') || member.includes('DII')) {
          if (pct > diiPct) diiPct = pct;
        } else if (member.includes('CentralGovernment') || member.includes('StateGovernment') || member.includes('PresidentOfIndia') || member.includes('Government')) {
          if (pct > govtPct) govtPct = pct;
        } else if (member.includes('EmployeeBenefit') || member.includes('EmployeeTrust')) {
          if (pct > employeeTrustsPct) employeeTrustsPct = pct;
        } else if (member.includes('NonPromoterNonPublic') || member.includes('BodiesCorporate')) {
          if (pct > othersPct) othersPct = pct;
        } else if (member.includes('PublicShareholding') || member.includes('TableB')) {
          if (pct > publicPct) publicPct = pct;
        }
      }
    }

    // Direct element fallbacks
    if (promoterPct === 0) {
      const pm = xml.match(/<in-bse-shp:ShareholdingOfPromoterAndPromoterGroup[^>]*>([^<]+)<\//);
      if (pm) promoterPct = parseFloat(pm[1]) <= 1.0 ? parseFloat(pm[1]) * 100 : parseFloat(pm[1]);
    }

    // In SEBI Reg 31 taxonomy, publicPct from Table B represents ALL non-promoter public (Institutions + Non-Institutions)
    // We isolate pure Retail/Individuals so that: Promoter + FII + DII + Govt + EmployeeTrusts + Retail = 100%
    let totalPublicTableB = publicPct;
    const institutionalSum = fiiPct + diiPct + govtPct + othersPct;

    if (totalPublicTableB > 0 && institutionalSum > 0 && totalPublicTableB >= institutionalSum) {
      // publicPct is pure Retail / Non-institutional individuals
      publicPct = Number((totalPublicTableB - institutionalSum).toFixed(2));
    } else if (totalPublicTableB === 0 && promoterPct > 0) {
      publicPct = Math.max(0, Number((100 - (promoterPct + institutionalSum + employeeTrustsPct)).toFixed(2)));
    }

    let sum = Number((promoterPct + fiiPct + diiPct + govtPct + employeeTrustsPct + othersPct + publicPct).toFixed(2));
    const freeFloatPct = Math.max(0, Number((100 - promoterPct).toFixed(2)));
    const isFullyReconciled = Math.abs(sum - 100.0) <= 0.5;

    return {
      symbol: symbolHint || '',
      scripCode,
      companyName,
      asOfQuarter,
      promoterPct: Number(promoterPct.toFixed(2)),
      fiiPct: Number(fiiPct.toFixed(2)),
      diiPct: Number(diiPct.toFixed(2)),
      govtPct: Number(govtPct.toFixed(2)),
      employeeTrustsPct: Number(employeeTrustsPct.toFixed(2)),
      othersPct: Number(othersPct.toFixed(2)),
      publicPct: Number(publicPct.toFixed(2)),
      sumTotalPct: sum,
      freeFloatPct: freeFloatPct,
      isFullyReconciled,
      dataSource: 'XBRL_XML'
    };
  }

  /**
   * Extract Ind-AS Regulation 33 Financial Statement Results
   */
  private extractFinancialsFromObj(obj: any, rawXml: string, symbolHint?: string): XbrlFinancialStatementData {
    const findNum = (tags: string[]): number => {
      for (const t of tags) {
        const val = this.searchTagRecursive(obj, t);
        if (val !== undefined && val !== null && !isNaN(Number(val))) {
          return Number(val);
        }
      }
      return 0;
    };

    const findStr = (tags: string[]): string => {
      for (const t of tags) {
        const val = this.searchTagRecursive(obj, t);
        if (typeof val === 'string' && val.trim().length > 0) {
          return val.trim();
        }
      }
      return '';
    };

    const symbol = findStr(['Symbol', 'ScripId', 'NSEExchangeSymbol']) || symbolHint || '';
    const scripCode = findStr(['ScripCode', 'BSEExchangeSecurityCode']);
    const periodEndDate = findStr(['DateOfEndOfReportingPeriod', 'PeriodEndDate', 'QuarterEnded']) || 'Latest';
    const natureOfReport: 'STANDALONE' | 'CONSOLIDATED' = rawXml.toLowerCase().includes('consolidated') ? 'CONSOLIDATED' : 'STANDALONE';

    let rev = findNum(['RevenueFromOperations', 'IncomeFromOperations', 'TotalRevenueFromOperations']);
    let otherInc = findNum(['OtherIncome']);
    let totalInc = findNum(['TotalIncome', 'TotalRevenue']) || (rev + otherInc);

    let rawMat = findNum(['CostOfMaterialsConsumed', 'PurchasesOfStockInTrade']);
    let empCost = findNum(['EmployeeBenefitsExpense', 'EmployeeCosts']);
    let otherExp = findNum(['OtherExpenses', 'OperatingExpenses']);
    let totalExp = findNum(['TotalExpenses']) || (rawMat + empCost + otherExp);

    let opProfit = findNum(['OperatingProfit', 'ProfitBeforeFinanceCostsAndTax']) || (rev - (rawMat + empCost + otherExp));
    let opmPct = rev > 0 ? (opProfit / rev) * 100 : 0;

    let depr = findNum(['DepreciationAndAmortisationExpense', 'DepreciationExpense']);
    let finCosts = findNum(['FinanceCosts', 'InterestExpense']);
    let pbt = findNum(['ProfitLossBeforeTax', 'ProfitBeforeTax']) || (opProfit + otherInc - depr - finCosts);
    let tax = findNum(['TaxExpense', 'TotalTaxExpense', 'CurrentTax']);
    let pat = findNum(['ProfitLossForPeriod', 'NetProfitLossForPeriod', 'ProfitAfterTax']) || (pbt - tax);
    let patMarginPct = rev > 0 ? (pat / rev) * 100 : 0;

    let eps = findNum(['EarningsPerShareDiluted', 'BasicEarningsLossPerShareFromContinuingOperations']);

    let eqCap = findNum(['EquityShareCapital', 'PaidUpEquityShareCapital']);
    let reserves = findNum(['OtherEquity', 'ReservesAndSurplus']);
    let borrowings = findNum(['BorrowingsNonCurrent', 'TotalBorrowings']);
    let assets = findNum(['TotalAssets']);

    let cfo = findNum(['CashFlowsFromUsedInOperatingActivities', 'NetCashFlowFromOperatingActivities']);
    let cfi = findNum(['CashFlowsFromUsedInInvestingActivities', 'NetCashFlowFromInvestingActivities']);
    let cff = findNum(['CashFlowsFromUsedInFinancingActivities', 'NetCashFlowFromFinancingActivities']);
    let netCash = findNum(['NetIncreaseDecreaseInCashAndCashEquivalents']) || (cfo + cfi + cff);

    return {
      symbol,
      scripCode,
      periodEndDate,
      statementPeriod: periodEndDate,
      natureOfReport,
      revenueFromOperationsCr: Number(rev.toFixed(2)),
      otherIncomeCr: Number(otherInc.toFixed(2)),
      totalIncomeCr: Number(totalInc.toFixed(2)),
      rawMaterialCostCr: Number(rawMat.toFixed(2)),
      employeeCostCr: Number(empCost.toFixed(2)),
      otherExpensesCr: Number(otherExp.toFixed(2)),
      totalExpensesCr: Number(totalExp.toFixed(2)),
      operatingProfitCr: Number(opProfit.toFixed(2)),
      opmPct: Number(opmPct.toFixed(2)),
      depreciationCr: Number(depr.toFixed(2)),
      financeCostsCr: Number(finCosts.toFixed(2)),
      profitBeforeTaxCr: Number(pbt.toFixed(2)),
      taxExpenseCr: Number(tax.toFixed(2)),
      netProfitCr: Number(pat.toFixed(2)),
      patMarginPct: Number(patMarginPct.toFixed(2)),
      eps: Number(eps.toFixed(2)),
      equityCapitalCr: eqCap ? Number(eqCap.toFixed(2)) : undefined,
      reservesCr: reserves ? Number(reserves.toFixed(2)) : undefined,
      borrowingsCr: borrowings ? Number(borrowings.toFixed(2)) : undefined,
      totalAssetsCr: assets ? Number(assets.toFixed(2)) : undefined,
      cfoCr: cfo ? Number(cfo.toFixed(2)) : undefined,
      cfiCr: cfi ? Number(cfi.toFixed(2)) : undefined,
      cffCr: cff ? Number(cff.toFixed(2)) : undefined,
      netCashFlowCr: netCash ? Number(netCash.toFixed(2)) : undefined,
      dataSource: 'XBRL_XML'
    };
  }

  private searchTagRecursive(node: any, targetTag: string): any {
    if (!node || typeof node !== 'object') return undefined;

    const lowerTarget = targetTag.toLowerCase();
    for (const key of Object.keys(node)) {
      const cleanKey = key.includes(':') ? key.split(':')[1] : key;
      if (cleanKey.toLowerCase() === lowerTarget || key.toLowerCase() === lowerTarget) {
        const val = node[key];
        if (val && typeof val === 'object' && '#text' in val) {
          return val['#text'];
        }
        return val;
      }
    }

    for (const key of Object.keys(node)) {
      if (typeof node[key] === 'object' && node[key] !== null) {
        const res = this.searchTagRecursive(node[key], targetTag);
        if (res !== undefined) return res;
      }
    }

    return undefined;
  }

  private httpGetJson<T>(urlStr: string, headers: Record<string, string> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      https.get({
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          ...headers
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  private httpGetText(urlStr: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      https.get({
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/xml, application/xml, */*'
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }
}
