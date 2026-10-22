import Database from 'better-sqlite3';

const db = new Database('portfolio.db', { readonly: true });

// Check how many symbols in MasterTickers have market cap in FERE or OpportunityScan or FundamentalSnapshots
const query = `
  SELECT 
    m.symbol,
    m.name,
    m.sector as master_sector,
    m.industry as master_industry,
    m.listing_date,
    f.market_cap_cr as fere_mcap,
    o.market_cap_cr as opp_mcap,
    s.sector as snap_sector,
    s.industry as snap_industry,
    s.debt_to_equity,
    s.pledged_pct,
    s.fii_holding_pct,
    s.dii_holding_pct,
    s.promoter_holding_pct
  FROM MasterTickers m
  LEFT JOIN FEREEnrichedLedger f ON UPPER(m.symbol) = UPPER(f.symbol)
  LEFT JOIN FullUniverseComprehensiveOpportunityScan o ON UPPER(m.symbol) = UPPER(o.symbol)
  LEFT JOIN FundamentalSnapshots s ON UPPER(m.symbol) = UPPER(s.symbol)
`;

const rows = db.prepare(query).all();
console.log(`Total rows checked: ${rows.length}`);

let withMcap = 0;
let large = 0, mid = 0, small = 0;
for (const r of rows as any[]) {
  const mcap = r.fere_mcap ?? r.opp_mcap;
  if (mcap != null && !isNaN(mcap)) {
    withMcap++;
    if (mcap > 20000) large++;
    else if (mcap >= 5000) mid++;
    else small++;
  }
}

console.log(`With market cap: ${withMcap} (Large: ${large}, Mid: ${mid}, Small: ${small})`);

// Check sectors
const sectors = new Set<string>();
for (const r of rows as any[]) {
  const sec = r.master_sector || r.snap_sector;
  if (sec) sectors.add(sec);
}
console.log('Available sectors in DB:', Array.from(sectors));
