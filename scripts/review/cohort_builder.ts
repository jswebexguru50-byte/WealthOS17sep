import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const db = new Database('portfolio.db', { readonly: true });

export const CANONICAL_SECTORS = [
  'IT_SERVICES',
  'BANKS_NBFC_INSURANCE',
  'PHARMA_HEALTHCARE',
  'CAPITAL_GOODS_INDUSTRIALS',
  'AUTO_AUTO_ANCILLARY',
  'ENERGY_UTILITIES',
  'METALS_MINING',
  'CHEMICALS',
  'CONSUMER_RETAIL',
  'FMCG',
  'REAL_ESTATE',
  'TELECOM_MEDIA',
  'INFRASTRUCTURE_LOGISTICS',
  'TEXTILES',
  'AGRICULTURE_COMMODITIES'
] as const;

export type CanonicalSector = typeof CANONICAL_SECTORS[number];

export function mapRawToCanonicalSector(sectorStr?: string | null, industryStr?: string | null): CanonicalSector | null {
  const text = `${sectorStr || ''} ${industryStr || ''}`.toUpperCase().trim();
  if (!text) return null;

  if (text.includes('SOFTWARE') || text.includes('TECHNOLOGY') || text.includes('IT - SOFTWARE') || text.includes('IT ') || text.includes('SERVICES - IT') || text.includes('INTERNET')) {
    return 'IT_SERVICES';
  }
  if (text.includes('BANK') || text.includes('FINANCIAL') || text.includes('FINANCE') || text.includes('NBFC') || text.includes('INSURANCE') || text.includes('INVESTMENT') || text.includes('HOUSING FINANCE')) {
    return 'BANKS_NBFC_INSURANCE';
  }
  if (text.includes('PHARMA') || text.includes('HEALTHCARE') || text.includes('BIOTECH') || text.includes('HOSPITAL') || text.includes('DRUGS')) {
    return 'PHARMA_HEALTHCARE';
  }
  if (text.includes('AUTO') || text.includes('AUTOMOBILE') || text.includes('VEHICLE') || text.includes('TYRES')) {
    return 'AUTO_AUTO_ANCILLARY';
  }
  if (text.includes('POWER') || text.includes('ENERGY') || text.includes('UTILITIES') || text.includes('OIL') || text.includes('GAS') || text.includes('PETROLEUM')) {
    return 'ENERGY_UTILITIES';
  }
  if (text.includes('METAL') || text.includes('MINING') || text.includes('STEEL') || text.includes('ALUMINIUM') || text.includes('COPPER') || text.includes('ZINC') || text.includes('IRON')) {
    return 'METALS_MINING';
  }
  if (text.includes('CHEMICAL') || text.includes('PETROCHEM') || text.includes('SPECIALITY CHEM') || text.includes('CARBON')) {
    return 'CHEMICALS';
  }
  if (text.includes('FMCG') || text.includes('FOOD') || text.includes('BEVERAGE') || text.includes('TOBACCO') || text.includes('CONSUMER DEFENSIVE') || text.includes('CONSUMER FOOD') || text.includes('EDIBLE OIL')) {
    return 'FMCG';
  }
  if (text.includes('REAL ESTATE') || text.includes('REALTY') || text.includes('CONSTRUCTION - RESIDENTIAL') || text.includes('HOUSING')) {
    return 'REAL_ESTATE';
  }
  if (text.includes('TELECOM') || text.includes('MEDIA') || text.includes('COMMUNICATION') || text.includes('BROADCAST') || text.includes('ENTERTAINMENT') || text.includes('PUBLISHING')) {
    return 'TELECOM_MEDIA';
  }
  if (text.includes('INFRASTRUCTURE') || text.includes('LOGISTICS') || text.includes('TRANSPORT') || text.includes('PORTS') || text.includes('SHIPPING') || text.includes('ROAD') || text.includes('AIRPORT') || text.includes('COURIER') || text.includes('FREIGHT')) {
    return 'INFRASTRUCTURE_LOGISTICS';
  }
  if (text.includes('TEXTILE') || text.includes('APPAREL') || text.includes('GARMENT') || text.includes('FABRIC') || text.includes('COTTON') || text.includes('JUTE') || text.includes('SILK')) {
    return 'TEXTILES';
  }
  if (text.includes('AGRICULTURE') || text.includes('AGRO') || text.includes('FERTILIZER') || text.includes('SUGAR') || text.includes('COMMODIT') || text.includes('SEED') || text.includes('TEA') || text.includes('COFFEE') || text.includes('PLANTATION')) {
    return 'AGRICULTURE_COMMODITIES';
  }
  if (text.includes('CAPITAL GOODS') || text.includes('INDUSTRIAL') || text.includes('ENGINEERING') || text.includes('MACHINERY') || text.includes('ELECTRICAL EQUIPMENT') || text.includes('CONSTRUCTION') || text.includes('CEMENT') || text.includes('CERAMICS') || text.includes('PLASTIC PRODUCTS') || text.includes('PACKAGING') || text.includes('PAPER')) {
    return 'CAPITAL_GOODS_INDUSTRIALS';
  }
  if (text.includes('RETAIL') || text.includes('CONSUMER CYCLICAL') || text.includes('CONSUMER DURABLES') || text.includes('CONSUMER GOODS') || text.includes('FOOTWEAR') || text.includes('JEWELLERY') || text.includes('HOTEL') || text.includes('HOSPITALITY') || text.includes('RESTAURANT') || text.includes('TRADING') || text.includes('DIVERSIFIED')) {
    return 'CONSUMER_RETAIL';
  }

  return null;
}

export interface CandidateCompany {
  symbol: string;
  name: string;
  isin: string;
  sector: CanonicalSector;
  rawSector: string;
  rawIndustry: string;
  marketCapCr: number;
  marketCapBucket: 'LARGE' | 'MID' | 'SMALL';
  isSevenStrategy: boolean;
  isHeld: boolean;
  isPledged: boolean;
  pledgedPct: number;
  hasCorpAction: boolean;
  hasDeal: boolean;
  isRecentListed: boolean;
  isShortHistory: boolean;
  isLowLiquidity: boolean;
  avgVolume: number;
  isHighDebt: boolean;
  isLowDebtNetCash: boolean;
  debtToEquity: number | null;
  isHighInst: boolean;
  isLowInst: boolean;
  instPct: number | null;
  isPosCfo: boolean;
  isNegCfo: boolean;
  cfoValue: number | null;
  isDataChallenged: boolean;
  hasTrendlyneMcp: boolean;
}

export function buildUniverseCandidates(): CandidateCompany[] {
  // 1. Seven strategy symbols
  const reportDir = path.resolve('reports/readiness/vpa_three_leg');
  const specs = [
    ['S1a', 'vpa_three_leg_full_universe_90_'],
    ['S1b', 's1b_full_universe_90_'],
    ['S2a', 's2a_full_universe_90_'],
    ['S3a', 's3a_full_universe_90_'],
    ['S4a', 's4a_full_universe_90_'],
    ['S4b', 's4b_full_universe_90_'],
    ['S5a', 's5a_full_universe_90_'],
  ];

  function sanitizeJson(raw: string) {
    return raw
      .replace(/(^|[^A-Za-z0-9_])(-?Infinity|NaN)(?=\s*[,}\]])/g, '$1null')
      .replace(/:\s*,/g, ': null,')
      .replace(/:\s*}/g, ': null}');
  }

  const sevenStrategySyms = new Set<string>();
  for (const [_, prefix] of specs) {
    if (fs.existsSync(reportDir)) {
      const files = fs.readdirSync(reportDir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort();
      const file = files.at(-1);
      if (file) {
        try {
          const raw = fs.readFileSync(path.join(reportDir, file), 'utf8');
          const matches = JSON.parse(sanitizeJson(raw)).matches || [];
          for (const m of matches) {
            const sym = String(m?.symbol ?? m?.Symbol ?? '').trim().toUpperCase();
            if (/^[A-Z0-9&.-]+$/.test(sym)) sevenStrategySyms.add(sym);
          }
        } catch {}
      }
    }
  }

  // 2. Holdings
  const holdingsSyms = new Set(
    db.prepare('SELECT DISTINCT symbol FROM Holdings').all().map((r: any) => r.symbol.toUpperCase())
  );

  // 3. Corporate Actions & Deals
  const corpActionSyms = new Set(
    db.prepare('SELECT DISTINCT symbol FROM CorporateActions').all().map((r: any) => r.symbol.toUpperCase())
  );
  const dealSyms = new Set(
    db.prepare('SELECT DISTINCT symbol FROM InstitutionalDeals').all().map((r: any) => r.symbol.toUpperCase())
  );

  // 4. Trendlyne MCP symbols
  const trSyms = new Set(
    db.prepare("SELECT DISTINCT symbol FROM fundamental_endpoint_snapshots WHERE provider = 'TRENDLYNE_MCP'").all().map((r: any) => r.symbol.toUpperCase())
  );

  // 5. Volume and history length from HistoricalPrices / MarketSnapshots
  const volMap = new Map<string, { avgVol: number; count: number; minDate: string }>();
  try {
    const volRows = db.prepare(`
      SELECT symbol, AVG(volume) as avg_vol, COUNT(*) as days, MIN(date) as min_date
      FROM HistoricalPrices
      GROUP BY symbol
    `).all() as any[];
    for (const v of volRows) {
      volMap.set(v.symbol.toUpperCase(), {
        avgVol: v.avg_vol || 0,
        count: v.days || 0,
        minDate: v.min_date || ''
      });
    }
  } catch {}

  // 6. Profiles from fundamental_endpoint_snapshots
  const profileRows = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'profile'").all() as any[];
  const profileMap = new Map<string, { sector: string; marketCapCr: number; profileText: string }>();
  for (const p of profileRows) {
    try {
      const json = JSON.parse(p.response_json);
      const mcap = json.data?.sector_market_cap_inr?.value;
      const sec = json.data?.sector || '';
      const text = json.data?.company_profile || '';
      if (typeof mcap === 'number' && !isNaN(mcap)) {
        profileMap.set(p.symbol.toUpperCase(), { sector: sec, marketCapCr: mcap, profileText: text });
      }
    } catch {}
  }

  // 7. Cash flows from fundamental_endpoint_snapshots
  const cfRows = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'cash-flow'").all() as any[];
  const cfoMap = new Map<string, number>();
  for (const c of cfRows) {
    try {
      const json = JSON.parse(c.response_json);
      const hist = json.data?.cash_flow?.find((cat: any) => cat.category === 'operating')?.history;
      if (Array.isArray(hist) && hist.length > 0) {
        const val = Number(hist[0]?.value);
        if (!isNaN(val)) {
          cfoMap.set(c.symbol.toUpperCase(), val);
        }
      }
    } catch {}
  }

  // 8. Share-holdings from fundamental_endpoint_snapshots
  const shRows = db.prepare("SELECT symbol, response_json FROM fundamental_endpoint_snapshots WHERE endpoint = 'share-holdings'").all() as any[];
  const shMap = new Map<string, { fii: number; dii: number; promoter: number }>();
  for (const s of shRows) {
    try {
      const json = JSON.parse(s.response_json);
      if (Array.isArray(json.data)) {
        const fiiHist = json.data.find((c: any) => c.category === 'fii')?.history?.[0]?.value || 0;
        const diiHist = json.data.find((c: any) => c.category === 'other_dii')?.history?.[0]?.value || 0;
        const promHist = json.data.find((c: any) => c.category === 'promoters')?.history?.[0]?.value || 0;
        shMap.set(s.symbol.toUpperCase(), { fii: Number(fiiHist), dii: Number(diiHist), promoter: Number(promHist) });
      }
    } catch {}
  }

  // 9. FundamentalSnapshots for debt, pledge, etc.
  const snapRows = db.prepare('SELECT * FROM FundamentalSnapshots').all() as any[];
  const snapMap = new Map<string, any>();
  for (const s of snapRows) {
    snapMap.set(s.symbol.toUpperCase(), s);
  }

  // 10. MasterTickers
  const tickers = db.prepare('SELECT symbol, isin, name, sector, industry, listing_date FROM MasterTickers').all() as any[];

  const candidates: CandidateCompany[] = [];

  for (const t of tickers) {
    const sym = t.symbol.toUpperCase();
    const isin = t.isin;
    const name = t.name || sym;

    const prof = profileMap.get(sym);
    const snap = snapMap.get(sym);
    const cfVal = cfoMap.get(sym) ?? null;
    const shVal = shMap.get(sym);
    const volInfo = volMap.get(sym);

    // Determine market cap
    let mcap = prof?.marketCapCr ?? snap?.market_cap_cr ?? null;
    if (mcap == null || isNaN(mcap)) continue; // Must have verified market cap

    // Determine sector
    const rawSector = prof?.sector || t.sector || snap?.sector || '';
    const rawIndustry = t.industry || snap?.industry || '';
    const canSector = mapRawToCanonicalSector(rawSector, rawIndustry);
    if (!canSector) continue; // Must cleanly map to canonical sector

    // Market cap bucket
    const bucket = mcap > 20000 ? 'LARGE' : mcap >= 5000 ? 'MID' : 'SMALL';

    // Pledge
    const pledgePct = snap?.pledged_pct ?? 0;
    const isPledged = pledgePct > 0;

    // Debt to equity
    const dToE = snap?.debt_to_equity ?? null;
    const isHighDebt = dToE != null && dToE > 1.0;
    const isLowDebtNetCash = dToE === 0 || (dToE != null && dToE < 0.1);

    // Institutional holdings
    const fiiPct = snap?.fii_holding_pct ?? shVal?.fii ?? 0;
    const diiPct = snap?.dii_holding_pct ?? shVal?.dii ?? 0;
    const instPct = fiiPct + diiPct;
    const isHighInst = instPct > 25;
    const isLowInst = instPct < 5;

    // CFO
    const isPosCfo = cfVal != null && cfVal > 0;
    const isNegCfo = cfVal != null && cfVal < 0;

    // Liquidity
    const avgVol = volInfo?.avgVol ?? 50000;
    const isLowLiquidity = avgVol > 0 && avgVol < 15000;

    // Listing history
    const listingDate = t.listing_date || '';
    const daysHistory = volInfo?.count ?? 500;
    const isRecentListed = listingDate >= '2022-01-01';
    const isShortHistory = daysHistory < 200;

    // Incomplete or data challenged
    const isDataChallenged = cfVal == null || snap == null || snap.debt_to_equity == null || snap.pe_ratio == null;

    candidates.push({
      symbol: sym,
      name,
      isin,
      sector: canSector,
      rawSector,
      rawIndustry,
      marketCapCr: mcap,
      marketCapBucket: bucket,
      isSevenStrategy: sevenStrategySyms.has(sym),
      isHeld: holdingsSyms.has(sym),
      isPledged,
      pledgedPct: pledgePct,
      hasCorpAction: corpActionSyms.has(sym),
      hasDeal: dealSyms.has(sym),
      isRecentListed,
      isShortHistory,
      isLowLiquidity,
      avgVolume: Math.round(avgVol),
      isHighDebt,
      isLowDebtNetCash,
      debtToEquity: dToE,
      isHighInst,
      isLowInst,
      instPct: Math.round(instPct * 100) / 100,
      isPosCfo,
      isNegCfo,
      cfoValue: cfVal,
      isDataChallenged,
      hasTrendlyneMcp: trSyms.has(sym)
    });
  }

  return candidates;
}

const allCand = buildUniverseCandidates();
console.log(`Total valid categorized candidates: ${allCand.length}`);

const byBucket = {
  LARGE: allCand.filter(c => c.marketCapBucket === 'LARGE'),
  MID: allCand.filter(c => c.marketCapBucket === 'MID'),
  SMALL: allCand.filter(c => c.marketCapBucket === 'SMALL')
};

console.log(`LARGE: ${byBucket.LARGE.length}, MID: ${byBucket.MID.length}, SMALL: ${byBucket.SMALL.length}`);
console.log('Seven strategy candidates:', allCand.filter(c => c.isSevenStrategy).length);
console.log('Held candidates:', allCand.filter(c => c.isHeld).length);
console.log('Pledged candidates:', allCand.filter(c => c.isPledged).length);
console.log('Unpledged candidates:', allCand.filter(c => !c.isPledged).length);
console.log('High inst:', allCand.filter(c => c.isHighInst).length);
console.log('Low inst:', allCand.filter(c => c.isLowInst).length);
console.log('Positive CFO:', allCand.filter(c => c.isPosCfo).length);
console.log('Negative CFO:', allCand.filter(c => c.isNegCfo).length);
console.log('Data challenged:', allCand.filter(c => c.isDataChallenged).length);
console.log('Low liquidity:', allCand.filter(c => c.isLowLiquidity).length);
console.log('Corp action or deal:', allCand.filter(c => c.hasCorpAction || c.hasDeal).length);
console.log('Short history / recent listed:', allCand.filter(c => c.isShortHistory || c.isRecentListed).length);
