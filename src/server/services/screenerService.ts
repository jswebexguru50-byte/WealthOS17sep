import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
import { parse as parseHTML } from 'node-html-parser';
import { getDB, dbGet, dbRun } from '../database.js';

export interface ScreenerRatios {
  market_cap?: string;
  current_price?: string;
  high_low?: string;
  stock_pe?: string;
  book_value?: string;
  dividend_yield?: string;
  roce?: string;
  roe?: string;
  face_value?: string;
  debt_to_equity?: string;
}

export interface ScreenerDocument {
  title: string;
  url: string;
  type: 'CONCALL' | 'PRESENTATION' | 'ANNUAL_REPORT' | 'CREDIT_RATING' | 'OTHER';
  date?: string;
}

export interface ScreenerPeer {
  name: string;
  symbol: string;
  cmp: string;
  pe: string;
  market_cap: string;
  roce: string;
  roe: string;
  revenue_growth?: string;
  net_profit?: string;
  return_1y?: string;
}

export interface ScreenerQuarterlyResults {
  latestQuarter: string;
  latestOpmPct?: number;
  opmPctHistory?: number[];
  latestSalesCr?: number;
  latestPatCr?: number;
  latestOperatingProfitCr?: number;
  latestOtherIncomeCr?: number;
  latestInterestCr?: number;
  latestDepreciationCr?: number;
  latestPbtCr?: number;
  latestTaxPct?: number;
  latestEps?: number;
  salesYoYGrowthPct?: number;
  patYoYGrowthPct?: number;
  salesQoQGrowthPct?: number;
  patQoQGrowthPct?: number;
}

export interface ScreenerCompoundedGrowth {
  sales10Yr?: string;
  sales5Yr?: string;
  sales3Yr?: string;
  salesTtm?: string;
  profit10Yr?: string;
  profit5Yr?: string;
  profit3Yr?: string;
  profitTtm?: string;
  stockPrice10Yr?: string;
  stockPrice5Yr?: string;
  stockPrice3Yr?: string;
  stockPrice1Yr?: string;
  roe10Yr?: string;
  roe5Yr?: string;
  roe3Yr?: string;
  roeLastYr?: string;
}

export interface ScreenerCashFlows {
  asOfYear?: string;
  cfo?: number;
  cfi?: number;
  cff?: number;
  netCashFlow?: number;
  cfoToPatRatio?: number;
}

export interface ScreenerBalanceSheet {
  asOfYear?: string;
  equityCapital?: number;
  reserves?: number;
  borrowings?: number;
  otherLiabilities?: number;
  totalLiabilities?: number;
  fixedAssets?: number;
  cwip?: number;
  investments?: number;
  otherAssets?: number;
  totalAssets?: number;
}

export interface ScreenerBfsiMetrics {
  nimPct?: number;
  gnpaPct?: number;
  nnpaPct?: number;
  roaPct?: number;
  carPct?: number;
}

export interface ScreenerShareholding {
  promoters?: string;
  fiis?: string;
  diis?: string;
  govt?: string;
  others?: string;
  public_holding?: string;
  noOfShareholders?: string;
  asOfQuarter?: string;
  dataIntegrityPassed?: boolean;
  sumTotalPct?: number;
  promoters_change?: string;
  fiis_change?: string;
  diis_change?: string;
}

export interface HistoricalQuarterlyRow {
  quarterLabel: string;
  salesCr?: number;
  expensesCr?: number;
  operatingProfitCr?: number;
  opmPct?: number;
  otherIncomeCr?: number;
  interestCr?: number;
  depreciationCr?: number;
  pbtCr?: number;
  taxPct?: number;
  netProfitCr?: number;
  eps?: number;
}

export interface HistoricalAnnualPlRow {
  periodLabel: string;
  salesCr?: number;
  expensesCr?: number;
  operatingProfitCr?: number;
  opmPct?: number;
  otherIncomeCr?: number;
  interestCr?: number;
  depreciationCr?: number;
  pbtCr?: number;
  taxPct?: number;
  netProfitCr?: number;
  eps?: number;
}

export interface HistoricalBalanceSheetRow {
  periodLabel: string;
  equityCapital?: number;
  reserves?: number;
  borrowings?: number;
  otherLiabilities?: number;
  totalLiabilities?: number;
  fixedAssets?: number;
  cwip?: number;
  investments?: number;
  otherAssets?: number;
  totalAssets?: number;
}

export interface HistoricalCashFlowRow {
  periodLabel: string;
  cfo?: number;
  cfi?: number;
  cff?: number;
  netCashFlow?: number;
}

export interface HistoricalShareholdingRow {
  quarterLabel: string;
  promoterPct: number;
  fiiPct: number;
  diiPct: number;
  govtPct: number;
  othersPct: number;
  publicPct: number;
  sumTotalPct: number;
  isSumValid: boolean;
}

export interface ScreenerData {
  symbol: string;
  company_name: string;
  about: string;
  sector?: string;
  industry?: string;
  ratios: ScreenerRatios;
  pros: string[];
  cons: string[];
  documents: ScreenerDocument[];
  concalls: ScreenerDocument[];
  presentations: ScreenerDocument[];
  peers: ScreenerPeer[];
  shareholding: ScreenerShareholding;
  growthMetrics?: {
    sales5Yr?: string;
    profit5Yr?: string;
    roe3Yr?: string;
  };
  compoundedGrowth?: ScreenerCompoundedGrowth;
  quarterlyResults?: ScreenerQuarterlyResults;
  cashFlows?: ScreenerCashFlows;
  balanceSheet?: ScreenerBalanceSheet;
  bfsiMetrics?: ScreenerBfsiMetrics;
  quarterlySeries?: HistoricalQuarterlyRow[];
  annualPlSeries?: HistoricalAnnualPlRow[];
  balanceSheetSeries?: HistoricalBalanceSheetRow[];
  cashFlowSeries?: HistoricalCashFlowRow[];
  shareholdingSeries?: HistoricalShareholdingRow[];
  dataQualityAudit?: {
    isFullyVerified: boolean;
    auditTimestamp: string;
    violationFlags: string[];
  };
  cached_at: string;
}

export class ScreenerService {
  private static instance: ScreenerService;

  public static getInstance(): ScreenerService {
    if (!ScreenerService.instance) {
      ScreenerService.instance = new ScreenerService();
    }
    return ScreenerService.instance;
  }

  public async fetchScreenerData(symbol: string): Promise<ScreenerData | null> {
    const cleanSym = symbol.trim().toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
    
    // Screener.in only covers Indian NSE/BSE equities. Instantly bypass US ETFs/stocks and cash.
    const US_AND_NON_EQUITY = new Set([
      'VNQ', 'QQQ', 'VTI', 'SCHG', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
      'BND', 'BNDX', 'DESCO', 'MRP', 'VT', 'VOO', 'SPY', 'IVV', 'IWM', 'EEM', 'VEA', 'VWO', 'AGG', 'TLT',
      'CASH', 'FD', 'USD', 'AED', 'EUR', 'GBP'
    ]);
    if (US_AND_NON_EQUITY.has(cleanSym) || cleanSym.includes('FOLIO') || cleanSym.includes('UL-') || cleanSym.length > 14) {
      return null;
    }

    const db = getDB();

    // 1. Check local SQLite cache first (valid for 24 hours, must have real metrics)
    try {
      const cachedRow = await dbGet(
        db,
        "SELECT value FROM AppConfig WHERE key = ?",
        [`screener_cache_${cleanSym}`]
      );
      if (cachedRow?.value) {
        const parsed = JSON.parse(cachedRow.value) as ScreenerData;
        const cacheAgeMs = Date.now() - new Date(parsed.cached_at).getTime();
        const hasRealMetrics = Boolean(
          (parsed.ratios?.roce && parsed.ratios.roce !== '—') ||
          (parsed.ratios?.roe && parsed.ratios.roe !== '—') ||
          (parsed.shareholding?.promoters && parsed.shareholding.promoters !== '—')
        );
        const hasHistoricalSeries = Boolean(parsed.quarterlySeries && parsed.quarterlySeries.length > 0);
        // Only return cache if within 24h AND passed integrity gate AND has full multi-year historical series
        if (cacheAgeMs < 24 * 3600 * 1000 && hasRealMetrics && hasHistoricalSeries && parsed.shareholding?.asOfQuarter && parsed.shareholding?.dataIntegrityPassed) {
          if (!parsed.sector || parsed.sector === 'Indian Equities' || !parsed.company_name || parsed.company_name === cleanSym) {
            try {
              const tickerRow = await dbGet<any>(db, "SELECT sector, industry, company_name FROM MasterTickers WHERE symbol = ?", [cleanSym]);
              if (tickerRow?.sector && (!parsed.sector || parsed.sector === 'Indian Equities')) parsed.sector = tickerRow.sector;
              if (tickerRow?.industry && !parsed.industry) parsed.industry = tickerRow.industry;
              if (tickerRow?.company_name && (!parsed.company_name || parsed.company_name === cleanSym)) parsed.company_name = tickerRow.company_name;
            } catch {}
          }
          return parsed;
        }
      }
    } catch (e) {}

    // 2. Fetch live from Screener.in
    try {
      console.log(`[Screener] Fetching live data for ${cleanSym} from screener.in...`);
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      };

      let html = '';
      const consolidatedUrl = `https://www.screener.in/company/${encodeURIComponent(cleanSym)}/consolidated/`;
      let res = await fetch(consolidatedUrl, {
        headers: defaultHeaders,
        signal: AbortSignal.timeout(1500)
      }).catch(() => null);

      if (res && res.ok) {
        html = await res.text();
      } else {
        // Fallback to standalone company page
        const standaloneUrl = `https://www.screener.in/company/${encodeURIComponent(cleanSym)}/`;
        let standaloneRes = await fetch(standaloneUrl, {
          headers: defaultHeaders,
          signal: AbortSignal.timeout(1500)
        }).catch(() => null);

        if (standaloneRes && standaloneRes.ok) {
          html = await standaloneRes.text();
        }
      }

      if (!html || html.length < 500) return null;

      const data = this.parseScreenerHTML(cleanSym, html);
      
      // Save to SQLite cache
      await dbRun(
        db,
        "INSERT OR REPLACE INTO AppConfig (key, value) VALUES (?, ?)",
        [`screener_cache_${cleanSym}`, JSON.stringify(data)]
      ).catch(() => {});

      return data;
    } catch (err) {
      console.warn(`[Screener] Failed to fetch data for ${cleanSym}:`, err);
      return null;
    }
  }

  public parseScreenerHTML(symbol: string, html: string): ScreenerData {
    const root = parseHTML(html);

    // ── 1. Company Name & Description ───────────────────────────────────────────
    const titleEl = root.querySelector('h1');
    const companyName = titleEl ? titleEl.text.trim() : symbol;

    const aboutEl = root.querySelector('.about') || root.querySelector('#company-profile');
    const about = aboutEl ? aboutEl.text.replace(/\s+/g, ' ').trim() : `${companyName} is a publicly traded company on Indian stock exchanges.`;

    // ── 2. Key Valuation & Return Ratios (Top Header) ───────────────────────────
    const ratios: ScreenerRatios = {};
    const ratioItems = root.querySelectorAll('#top-ratios li, .company-ratios li, ul.top-ratios li');
    for (const item of ratioItems) {
      const nameEl = item.querySelector('.name');
      const valEl = item.querySelector('.number, .value');
      if (!nameEl || !valEl) continue;
      const key = nameEl.text.trim().toLowerCase();
      const val = valEl.text.trim();

      if (key.includes('market cap')) ratios.market_cap = `₹${val} Cr`;
      else if (key.includes('current price')) ratios.current_price = `₹${val}`;
      else if (key.includes('high / low')) ratios.high_low = `₹${val}`;
      else if (key.includes('stock p/e')) ratios.stock_pe = val;
      else if (key.includes('book value')) ratios.book_value = `₹${val}`;
      else if (key.includes('dividend yield')) ratios.dividend_yield = `${val}%`;
      else if (key.includes('roce')) ratios.roce = `${val}%`;
      else if (key.includes('roe')) ratios.roe = `${val}%`;
      else if (key.includes('face value')) ratios.face_value = `₹${val}`;
      else if (key.includes('debt to equity')) ratios.debt_to_equity = val;
    }

    // ── 3. Shareholding Pattern (Time-Aligned + 100% Sum Gate + Full Quarter Series) ───
    const shareholding: ScreenerShareholding = {
      promoters: '—',
      fiis: '—',
      diis: '—',
      govt: '—',
      others: '—',
      public_holding: '—',
      asOfQuarter: undefined,
      dataIntegrityPassed: false,
      sumTotalPct: 0
    };
    const shareholdingSeries: HistoricalShareholdingRow[] = [];

    try {
      const shSection = root.querySelector('#quarterly-shp') || root.querySelector('#shareholding');
      if (shSection) {
        const table = shSection.querySelector('table');
        if (table) {
          const headerThs = table.querySelectorAll('th').map(th => th.text.trim()).filter(Boolean);
          const quarterLabels = headerThs.filter(h => /\b(Mar|Jun|Sep|Dec)\s+20\d{2}\b/i.test(h) || /\b20\d{2}\b/.test(h));
          const latestQuarter = quarterLabels.length > 0 ? quarterLabels[quarterLabels.length - 1] : 'LATEST';

          let rawPromoter = 0;
          let rawFii = 0;
          let rawDii = 0;
          let rawGovt = 0;
          let rawOthers = 0;
          let rawPublic = 0;

          const rows = table.querySelectorAll('tr');
          for (const r of rows) {
            const rowText = r.text.toLowerCase();
            const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/%/g, ''));
            if (cells.length === 0) continue;

            // Always select the rightmost column (latest available quarter)
            const cellValueStr = cells[cells.length - 1];
            const parsedVal = parseFloat(cellValueStr) || 0;

            if (rowText.includes('promoter')) {
              rawPromoter = parsedVal;
              shareholding.promoters = `${parsedVal}%`;
            } else if (rowText.includes('fii')) {
              rawFii = parsedVal;
              shareholding.fiis = `${parsedVal}%`;
            } else if (rowText.includes('dii')) {
              rawDii = parsedVal;
              shareholding.diis = `${parsedVal}%`;
            } else if (rowText.includes('government') || rowText.includes('govt')) {
              rawGovt = parsedVal;
              shareholding.govt = `${parsedVal}%`;
            } else if (rowText.includes('others') || rowText.includes('custodian') || rowText.includes('trust')) {
              rawOthers = parsedVal;
              shareholding.others = `${parsedVal}%`;
            } else if (rowText.includes('public')) {
              rawPublic = parsedVal;
              shareholding.public_holding = `${parsedVal}%`;
            } else if (rowText.includes('no. of shareholders') || rowText.includes('shareholders')) {
              shareholding.noOfShareholders = cellValueStr;
            }
          }

          // Extract all quarters into shareholdingSeries
          if (quarterLabels.length > 0) {
            for (let cIdx = 0; cIdx < quarterLabels.length; cIdx++) {
              const qLabel = quarterLabels[cIdx];
              let pVal = 0, fVal = 0, dVal = 0, gVal = 0, oVal = 0, pubVal = 0;

              for (const r of rows) {
                const rowText = r.text.toLowerCase();
                const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/%/g, ''));
                if (cells.length <= cIdx) continue;
                const v = parseFloat(cells[cIdx]) || 0;

                if (rowText.includes('promoter')) pVal = v;
                else if (rowText.includes('fii')) fVal = v;
                else if (rowText.includes('dii')) dVal = v;
                else if (rowText.includes('government') || rowText.includes('govt')) gVal = v;
                else if (rowText.includes('others') || rowText.includes('custodian') || rowText.includes('trust')) oVal = v;
                else if (rowText.includes('public')) pubVal = v;
              }

              const sTotal = Number((pVal + fVal + dVal + gVal + oVal + pubVal).toFixed(2));
              shareholdingSeries.push({
                quarterLabel: qLabel,
                promoterPct: pVal,
                fiiPct: fVal,
                diiPct: dVal,
                govtPct: gVal,
                othersPct: oVal,
                publicPct: pubVal,
                sumTotalPct: sTotal,
                isSumValid: sTotal >= 99.0 && sTotal <= 101.0
              });
            }
          }

          const sumPct = Number((rawPromoter + rawFii + rawDii + rawGovt + rawOthers + rawPublic).toFixed(2));
          const isSumValid = sumPct >= 99.0 && sumPct <= 101.0;

          shareholding.asOfQuarter = latestQuarter;
          shareholding.sumTotalPct = sumPct;
          shareholding.dataIntegrityPassed = isSumValid;

          if (!isSumValid && rawPromoter > 0) {
            console.warn(`[DataQualityAlert] ${symbol} Shareholding sum mismatch: Sum=${sumPct}% for ${latestQuarter}`);
          }
        }
      }
    } catch (parseErr) {
      console.warn(`[Screener] Error parsing shareholding DOM for ${symbol}:`, parseErr);
    }

    // ── 4. Quarterly Financial Results (#quarters + Full Historical Quarters) ────
    let quarterlyResults: ScreenerQuarterlyResults | undefined = undefined;
    const quarterlySeries: HistoricalQuarterlyRow[] = [];
    try {
      const qSection = root.querySelector('#quarters');
      if (qSection) {
        const table = qSection.querySelector('table');
        if (table) {
          const headerThs = table.querySelectorAll('th').map(th => th.text.trim()).filter(Boolean);
          const quarterLabels = headerThs.filter(h => /\b(Mar|Jun|Sep|Dec)\s+20\d{2}\b/i.test(h) || /\b20\d{2}\b/.test(h));
          const latestQuarter = quarterLabels.length > 0 ? quarterLabels[quarterLabels.length - 1] : 'Latest';

          const rows = table.querySelectorAll('tr');
          let opmRow: number[] = [];
          let salesRow: number[] = [];
          let patRow: number[] = [];
          let opProfitRow: number[] = [];
          let otherIncRow: number[] = [];
          let interestRow: number[] = [];
          let depRow: number[] = [];
          let pbtRow: number[] = [];
          let taxRow: number[] = [];
          let epsRow: number[] = [];

          for (const r of rows) {
            const rowText = r.text.toLowerCase();
            const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/,/g, '').replace(/%/g, ''));
            if (cells.length < 2) continue;
            const numVals = cells.slice(1).map(c => parseFloat(c)).filter(v => !isNaN(v));

            if (rowText.includes('opm') || rowText.includes('operating margin')) opmRow = numVals;
            else if (rowText.startsWith('sales') || rowText.includes('revenue')) salesRow = numVals;
            else if (rowText.includes('net profit') || rowText.startsWith('pat')) patRow = numVals;
            else if (rowText.includes('operating profit')) opProfitRow = numVals;
            else if (rowText.includes('other income')) otherIncRow = numVals;
            else if (rowText.includes('interest')) interestRow = numVals;
            else if (rowText.includes('depreciation')) depRow = numVals;
            else if (rowText.includes('profit before tax')) pbtRow = numVals;
            else if (rowText.includes('tax %')) taxRow = numVals;
            else if (rowText.includes('eps')) epsRow = numVals;
          }

          // Build full quarterlySeries
          if (quarterLabels.length > 0) {
            for (let cIdx = 0; cIdx < quarterLabels.length; cIdx++) {
              const qLabel = quarterLabels[cIdx];
              let sVal: number | undefined, expVal: number | undefined, opVal: number | undefined, opmVal: number | undefined;
              let othVal: number | undefined, intVal: number | undefined, depVal: number | undefined, pbtVal: number | undefined;
              let taxVal: number | undefined, patVal: number | undefined, epsVal: number | undefined;

              for (const r of rows) {
                const rowText = r.text.toLowerCase();
                const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/,/g, '').replace(/%/g, ''));
                if (cells.length <= cIdx + 1) continue;
                const v = parseFloat(cells[cIdx + 1]);
                if (isNaN(v)) continue;

                if (rowText.startsWith('sales') || rowText.includes('revenue')) sVal = v;
                else if (rowText.startsWith('expenses') || rowText.includes('raw material')) expVal = v;
                else if (rowText.includes('operating profit')) opVal = v;
                else if (rowText.includes('opm') || rowText.includes('operating margin')) opmVal = v;
                else if (rowText.includes('other income')) othVal = v;
                else if (rowText.includes('interest')) intVal = v;
                else if (rowText.includes('depreciation')) depVal = v;
                else if (rowText.includes('profit before tax')) pbtVal = v;
                else if (rowText.includes('tax %')) taxVal = v;
                else if (rowText.includes('net profit') || rowText.startsWith('pat')) patVal = v;
                else if (rowText.includes('eps')) epsVal = v;
              }

              quarterlySeries.push({
                quarterLabel: qLabel,
                salesCr: sVal,
                expensesCr: expVal,
                operatingProfitCr: opVal,
                opmPct: opmVal,
                otherIncomeCr: othVal,
                interestCr: intVal,
                depreciationCr: depVal,
                pbtCr: pbtVal,
                taxPct: taxVal,
                netProfitCr: patVal,
                eps: epsVal
              });
            }
          }

          if (salesRow.length > 0 || patRow.length > 0 || opmRow.length > 0) {
            const latestSalesCr = salesRow.length > 0 ? salesRow[salesRow.length - 1] : undefined;
            const latestPatCr = patRow.length > 0 ? patRow[patRow.length - 1] : undefined;
            const latestOpmPct = opmRow.length > 0 ? opmRow[opmRow.length - 1] : undefined;

            // YoY Growth: Compare current quarter vs 4 quarters ago
            let salesYoYGrowthPct: number | undefined = undefined;
            if (salesRow.length >= 5) {
              const cur = salesRow[salesRow.length - 1];
              const yAgo = salesRow[salesRow.length - 5];
              if (yAgo && yAgo > 0) salesYoYGrowthPct = Number((((cur - yAgo) / yAgo) * 100).toFixed(1));
            }

            let patYoYGrowthPct: number | undefined = undefined;
            if (patRow.length >= 5) {
              const cur = patRow[patRow.length - 1];
              const yAgo = patRow[patRow.length - 5];
              if (yAgo !== 0) patYoYGrowthPct = Number((((cur - yAgo) / Math.abs(yAgo)) * 100).toFixed(1));
            }

            // QoQ Growth: Compare current quarter vs previous quarter
            let salesQoQGrowthPct: number | undefined = undefined;
            if (salesRow.length >= 2) {
              const cur = salesRow[salesRow.length - 1];
              const prev = salesRow[salesRow.length - 2];
              if (prev && prev > 0) salesQoQGrowthPct = Number((((cur - prev) / prev) * 100).toFixed(1));
            }

            let patQoQGrowthPct: number | undefined = undefined;
            if (patRow.length >= 2) {
              const cur = patRow[patRow.length - 1];
              const prev = patRow[patRow.length - 2];
              if (prev !== 0) patQoQGrowthPct = Number((((cur - prev) / Math.abs(prev)) * 100).toFixed(1));
            }

            quarterlyResults = {
              latestQuarter,
              latestSalesCr,
              latestPatCr,
              latestOpmPct,
              latestOperatingProfitCr: opProfitRow.length > 0 ? opProfitRow[opProfitRow.length - 1] : undefined,
              latestOtherIncomeCr: otherIncRow.length > 0 ? otherIncRow[otherIncRow.length - 1] : undefined,
              latestInterestCr: interestRow.length > 0 ? interestRow[interestRow.length - 1] : undefined,
              latestDepreciationCr: depRow.length > 0 ? depRow[depRow.length - 1] : undefined,
              latestPbtCr: pbtRow.length > 0 ? pbtRow[pbtRow.length - 1] : undefined,
              latestTaxPct: taxRow.length > 0 ? taxRow[taxRow.length - 1] : undefined,
              latestEps: epsRow.length > 0 ? epsRow[epsRow.length - 1] : undefined,
              opmPctHistory: opmRow.slice(-6),
              salesYoYGrowthPct,
              patYoYGrowthPct,
              salesQoQGrowthPct,
              patQoQGrowthPct
            };
          }
        }
      }
    } catch (_) {}

    // ── 5. Annual Profit & Loss Statement (#profit-loss + Full Multi-Year Series) ──
    const annualPlSeries: HistoricalAnnualPlRow[] = [];
    try {
      const plSection = root.querySelector('#profit-loss');
      if (plSection) {
        const table = plSection.querySelector('table');
        if (table) {
          const headerThs = table.querySelectorAll('th').map(th => th.text.trim()).filter(Boolean);
          const periodLabels = headerThs.filter(h => /\b(Mar|Jun|Sep|Dec)\s+20\d{2}\b/i.test(h) || /\b20\d{2}\b/.test(h) || h.toUpperCase() === 'TTM');
          const rows = table.querySelectorAll('tr');

          for (let cIdx = 0; cIdx < periodLabels.length; cIdx++) {
            const pLabel = periodLabels[cIdx];
            let sVal: number | undefined, expVal: number | undefined, opVal: number | undefined, opmVal: number | undefined;
            let othVal: number | undefined, intVal: number | undefined, depVal: number | undefined, pbtVal: number | undefined;
            let taxVal: number | undefined, patVal: number | undefined, epsVal: number | undefined;

            for (const r of rows) {
              const rowText = r.text.toLowerCase();
              const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/,/g, '').replace(/%/g, ''));
              if (cells.length <= cIdx + 1) continue;
              const v = parseFloat(cells[cIdx + 1]);
              if (isNaN(v)) continue;

              if (rowText.startsWith('sales') || rowText.includes('revenue')) sVal = v;
              else if (rowText.startsWith('expenses') || rowText.includes('raw material')) expVal = v;
              else if (rowText.includes('operating profit')) opVal = v;
              else if (rowText.includes('opm') || rowText.includes('operating margin')) opmVal = v;
              else if (rowText.includes('other income')) othVal = v;
              else if (rowText.includes('interest')) intVal = v;
              else if (rowText.includes('depreciation')) depVal = v;
              else if (rowText.includes('profit before tax')) pbtVal = v;
              else if (rowText.includes('tax %')) taxVal = v;
              else if (rowText.includes('net profit') || rowText.startsWith('pat')) patVal = v;
              else if (rowText.includes('eps')) epsVal = v;
            }

            annualPlSeries.push({
              periodLabel: pLabel,
              salesCr: sVal,
              expensesCr: expVal,
              operatingProfitCr: opVal,
              opmPct: opmVal,
              otherIncomeCr: othVal,
              interestCr: intVal,
              depreciationCr: depVal,
              pbtCr: pbtVal,
              taxPct: taxVal,
              netProfitCr: patVal,
              eps: epsVal
            });
          }
        }
      }
    } catch (_) {}

    // ── 6. Compounded Growth Metrics Matrix ─────────────────────────────────────
    const compoundedGrowth: ScreenerCompoundedGrowth = {};
    try {
      const growthBoxes = root.querySelectorAll('.ranges-table, table.ranges-table');
      for (const box of growthBoxes) {
        const boxTitle = box.querySelector('th')?.text?.toLowerCase() || '';
        const rows = box.querySelectorAll('tr');

        for (const r of rows) {
          const cells = r.querySelectorAll('td').map(t => t.text.trim());
          if (cells.length < 2) continue;
          const label = cells[0].toLowerCase();
          const val = cells[1];

          if (boxTitle.includes('sales growth')) {
            if (label.includes('10 years')) compoundedGrowth.sales10Yr = val;
            else if (label.includes('5 years')) compoundedGrowth.sales5Yr = val;
            else if (label.includes('3 years')) compoundedGrowth.sales3Yr = val;
            else if (label.includes('ttm')) compoundedGrowth.salesTtm = val;
          } else if (boxTitle.includes('profit growth')) {
            if (label.includes('10 years')) compoundedGrowth.profit10Yr = val;
            else if (label.includes('5 years')) compoundedGrowth.profit5Yr = val;
            else if (label.includes('3 years')) compoundedGrowth.profit3Yr = val;
            else if (label.includes('ttm')) compoundedGrowth.profitTtm = val;
          } else if (boxTitle.includes('cagr') || boxTitle.includes('price')) {
            if (label.includes('10 years')) compoundedGrowth.stockPrice10Yr = val;
            else if (label.includes('5 years')) compoundedGrowth.stockPrice5Yr = val;
            else if (label.includes('3 years')) compoundedGrowth.stockPrice3Yr = val;
            else if (label.includes('1 year')) compoundedGrowth.stockPrice1Yr = val;
          } else if (boxTitle.includes('return on equity') || boxTitle.includes('roe')) {
            if (label.includes('10 years')) compoundedGrowth.roe10Yr = val;
            else if (label.includes('5 years')) compoundedGrowth.roe5Yr = val;
            else if (label.includes('3 years')) compoundedGrowth.roe3Yr = val;
            else if (label.includes('last year')) compoundedGrowth.roeLastYr = val;
          }
        }
      }
    } catch (_) {}

    // ── 7. Cash Flow Statement (#cash-flow + Multi-Year Cash Flow Series) ───────
    let cashFlows: ScreenerCashFlows | undefined = undefined;
    const cashFlowSeries: HistoricalCashFlowRow[] = [];
    try {
      const cfSection = root.querySelector('#cash-flow');
      if (cfSection) {
        const table = cfSection.querySelector('table');
        if (table) {
          const headerThs = table.querySelectorAll('th').map(th => th.text.trim()).filter(Boolean);
          const periodLabels = headerThs.filter(h => /\b(Mar|Jun|Sep|Dec)\s+20\d{2}\b/i.test(h) || /\b20\d{2}\b/.test(h));
          const asOfYear = periodLabels.length > 0 ? periodLabels[periodLabels.length - 1] : undefined;

          let cfoVal = 0;
          let cfiVal = 0;
          let cffVal = 0;
          let netCfVal = 0;

          const rows = table.querySelectorAll('tr');
          for (const r of rows) {
            const rowText = r.text.toLowerCase();
            const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/,/g, ''));
            if (cells.length < 2) continue;
            const parsed = parseFloat(cells[cells.length - 1]) || 0;

            if (rowText.includes('operating activity') || rowText.includes('cfo')) cfoVal = parsed;
            else if (rowText.includes('investing activity') || rowText.includes('cfi')) cfiVal = parsed;
            else if (rowText.includes('financing activity') || rowText.includes('cff')) cffVal = parsed;
            else if (rowText.includes('net cash flow')) netCfVal = parsed;
          }

          // Build multi-year cashFlowSeries
          if (periodLabels.length > 0) {
            for (let cIdx = 0; cIdx < periodLabels.length; cIdx++) {
              const pLabel = periodLabels[cIdx];
              const cfRow: HistoricalCashFlowRow = { periodLabel: pLabel };

              for (const r of rows) {
                const rowText = r.text.toLowerCase();
                const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/,/g, ''));
                if (cells.length <= cIdx + 1) continue;
                const v = parseFloat(cells[cIdx + 1]);
                if (isNaN(v)) continue;

                if (rowText.includes('operating activity') || rowText.includes('cfo')) cfRow.cfo = v;
                else if (rowText.includes('investing activity') || rowText.includes('cfi')) cfRow.cfi = v;
                else if (rowText.includes('financing activity') || rowText.includes('cff')) cfRow.cff = v;
                else if (rowText.includes('net cash flow')) cfRow.netCashFlow = v;
              }
              cashFlowSeries.push(cfRow);
            }
          }

          if (cfoVal !== 0 || cfiVal !== 0 || cffVal !== 0) {
            const pat = quarterlyResults?.latestPatCr || 0;
            const cfoToPatRatio = (pat > 0 && cfoVal > 0) ? Number((cfoVal / (pat * 4)).toFixed(2)) : 1.0;
            cashFlows = {
              asOfYear,
              cfo: cfoVal,
              cfi: cfiVal,
              cff: cffVal,
              netCashFlow: netCfVal,
              cfoToPatRatio
            };
          }
        }
      }
    } catch (_) {}

    // ── 8. Balance Sheet (#balance-sheet + Multi-Year Balance Sheet Series) ─────
    let balanceSheet: ScreenerBalanceSheet | undefined = undefined;
    const balanceSheetSeries: HistoricalBalanceSheetRow[] = [];
    try {
      const bsSection = root.querySelector('#balance-sheet');
      if (bsSection) {
        const table = bsSection.querySelector('table');
        if (table) {
          const headerThs = table.querySelectorAll('th').map(th => th.text.trim()).filter(Boolean);
          const periodLabels = headerThs.filter(h => /\b(Mar|Jun|Sep|Dec)\s+20\d{2}\b/i.test(h) || /\b20\d{2}\b/.test(h));
          const asOfYear = periodLabels.length > 0 ? periodLabels[periodLabels.length - 1] : undefined;

          const bs: ScreenerBalanceSheet = { asOfYear };
          const rows = table.querySelectorAll('tr');
          for (const r of rows) {
            const rowText = r.text.toLowerCase();
            const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/,/g, ''));
            if (cells.length < 2) continue;
            const val = parseFloat(cells[cells.length - 1]) || 0;

            if (rowText.startsWith('equity capital')) bs.equityCapital = val;
            else if (rowText.startsWith('reserves')) bs.reserves = val;
            else if (rowText.startsWith('borrowings')) bs.borrowings = val;
            else if (rowText.startsWith('other liabilities')) bs.otherLiabilities = val;
            else if (rowText.startsWith('total liabilities')) bs.totalLiabilities = val;
            else if (rowText.startsWith('fixed assets')) bs.fixedAssets = val;
            else if (rowText.startsWith('cwip')) bs.cwip = val;
            else if (rowText.startsWith('investments')) bs.investments = val;
            else if (rowText.startsWith('other assets')) bs.otherAssets = val;
            else if (rowText.startsWith('total assets')) bs.totalAssets = val;
          }
          if (bs.totalAssets || bs.borrowings) balanceSheet = bs;

          // Build multi-year balanceSheetSeries
          if (periodLabels.length > 0) {
            for (let cIdx = 0; cIdx < periodLabels.length; cIdx++) {
              const pLabel = periodLabels[cIdx];
              const bsRow: HistoricalBalanceSheetRow = { periodLabel: pLabel };

              for (const r of rows) {
                const rowText = r.text.toLowerCase();
                const cells = r.querySelectorAll('td').map(td => td.text.trim().replace(/,/g, ''));
                if (cells.length <= cIdx + 1) continue;
                const v = parseFloat(cells[cIdx + 1]);
                if (isNaN(v)) continue;

                if (rowText.startsWith('equity capital')) bsRow.equityCapital = v;
                else if (rowText.startsWith('reserves')) bsRow.reserves = v;
                else if (rowText.startsWith('borrowings')) bsRow.borrowings = v;
                else if (rowText.startsWith('other liabilities')) bsRow.otherLiabilities = v;
                else if (rowText.startsWith('total liabilities')) bsRow.totalLiabilities = v;
                else if (rowText.startsWith('fixed assets')) bsRow.fixedAssets = v;
                else if (rowText.startsWith('cwip')) bsRow.cwip = v;
                else if (rowText.startsWith('investments')) bsRow.investments = v;
                else if (rowText.startsWith('other assets')) bsRow.otherAssets = v;
                else if (rowText.startsWith('total assets')) bsRow.totalAssets = v;
              }
              balanceSheetSeries.push(bsRow);
            }
          }
        }
      }
    } catch (_) {}

    // ── 9. Sector & Industry Taxonomy ───────────────────────────────────────────
    let sector = '';
    let industry = '';

    const sectorLink = root.querySelector('a[title="Sector"], a[title="Broad Sector"]');
    if (sectorLink) sector = sectorLink.text.trim();

    const industryLink = root.querySelector('a[title="Industry"], a[title="Broad Industry"]');
    if (industryLink) industry = industryLink.text.trim();

    // ── 10. Peer Comparison Table ────────────────────────────────────────────────
    const peers: ScreenerPeer[] = this.parsePeers(html);

    // ── 11. Pros & Cons ─────────────────────────────────────────────────────────
    const pros: string[] = root.querySelectorAll('.pros li').map(li => li.text.trim()).filter(Boolean);
    const cons: string[] = root.querySelectorAll('.cons li').map(li => li.text.trim()).filter(Boolean);

    // ── 12. Documents & Concalls ────────────────────────────────────────────────
    const documents: ScreenerDocument[] = [];
    const concalls: ScreenerDocument[] = [];
    const presentations: ScreenerDocument[] = [];

    const docLinks = root.querySelectorAll('a[href]');
    for (const a of docLinks) {
      let docUrl = a.getAttribute('href')?.trim() || '';
      let text = a.text.replace(/\s+/g, ' ').trim();
      if (!text || text.length < 3) continue;

      if (docUrl.startsWith('/')) {
        docUrl = `https://www.screener.in${docUrl}`;
      }

      const textLower = text.toLowerCase();
      if (textLower.includes('concall') || textLower.includes('transcript') || textLower.includes('audio')) {
        concalls.push({ title: text, url: docUrl, type: 'CONCALL' });
        documents.push({ title: text, url: docUrl, type: 'CONCALL' });
      } else if (textLower.includes('presentation') || textLower.includes('ppt')) {
        presentations.push({ title: text, url: docUrl, type: 'PRESENTATION' });
        documents.push({ title: text, url: docUrl, type: 'PRESENTATION' });
      } else if (textLower.includes('annual report')) {
        documents.push({ title: text, url: docUrl, type: 'ANNUAL_REPORT' });
      }
    }

    // ── 13. Verification Flags ──────────────────────────────────────────────────
    const violationFlags: string[] = [];
    if (!shareholding.dataIntegrityPassed) violationFlags.push('SHAREHOLDING_SUM_MISMATCH');
    if (!ratios.market_cap) violationFlags.push('MISSING_MARKET_CAP');
    if (!quarterlyResults?.latestSalesCr) violationFlags.push('MISSING_QUARTERLY_SALES');

    return {
      symbol,
      company_name: companyName,
      about,
      sector,
      industry,
      ratios,
      pros,
      cons,
      documents: documents.slice(0, 10),
      concalls: concalls.slice(0, 5),
      presentations: presentations.slice(0, 5),
      peers: peers.slice(0, 12),
      shareholding,
      growthMetrics: {
        sales5Yr: compoundedGrowth.sales5Yr,
        profit5Yr: compoundedGrowth.profit5Yr,
        roe3Yr: compoundedGrowth.roe3Yr
      },
      compoundedGrowth,
      quarterlyResults,
      cashFlows,
      balanceSheet,
      bfsiMetrics: undefined,
      quarterlySeries,
      annualPlSeries,
      balanceSheetSeries,
      cashFlowSeries,
      shareholdingSeries,
      dataQualityAudit: {
        isFullyVerified: violationFlags.length === 0,
        auditTimestamp: new Date().toISOString(),
        violationFlags
      },
      cached_at: new Date().toISOString()
    };
  }

  private parsePeers(html: string): ScreenerPeer[] {
    const peers: ScreenerPeer[] = [];
    try {
      const root = parseHTML(html);
      const peersSection = root.querySelector('#peers') || root.querySelector('.peers');
      if (!peersSection) return peers;

      const rows = peersSection.querySelectorAll('table tr').slice(1);
      for (const r of rows) {
        const cells = r.querySelectorAll('td').map(td => td.text.trim());
        if (cells.length < 4) continue;
        const link = r.querySelector('a[href*="/company/"]');
        const linkHref = link?.getAttribute('href') || '';
        const symMatch = linkHref.match(/\/company\/([^/]+)/);
        const sym = symMatch ? symMatch[1].toUpperCase() : (cells[0] || '').toUpperCase();

        peers.push({
          name: cells[0] || sym,
          symbol: sym,
          cmp: cells[1] || '—',
          pe: cells[2] || '—',
          market_cap: cells[3] || '—',
          roce: cells[4] || '—',
          roe: cells[5] || '—',
          revenue_growth: cells[6] || '—',
          net_profit: cells[7] || '—',
          return_1y: cells[8] || '—'
        });
      }
    } catch (_) {}
    return peers;
  }
}
