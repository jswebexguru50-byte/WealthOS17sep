import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
const root=process.cwd(), db=new Database(path.join(root,'portfolio.db'),{readonly:true});
const symbols=process.argv.slice(2).length?process.argv.slice(2).map(s=>s.toUpperCase()):['AZAD','RRKABEL'];
const requirements=[
 ['Business description / segments','Annual report, investor presentation','FERE/XBRL; Trendlyne documents','30–90d'],
 ['Catalysts / order book / guidance','Exchange filings, investor presentation, concall','Trendlyne documents; FERE filing DB','7–30d'],
 ['Revenue/PAT/operating profit history','FERE/XBRL','Trendlyne F01/F02; NSE/BSE results','Quarterly'],
 ['Balance sheet and borrowings','FERE/XBRL','Trendlyne F03; NSE/BSE results','Quarterly'],
 ['CFO, capex, working capital and FCF','FERE/XBRL','Trendlyne F04; NSE/BSE results','Quarterly'],
 ['Margins, ROE, ROCE and efficiency','Canonical derivations from dated facts','Trendlyne F05; XBRL','Quarterly'],
 ['Valuation and per-share data','Canonical market cap + dated price/actions','Trendlyne F06; Upstox/Kite quote','Daily'],
 ['Promoter/FII/DII/pledge history','Exchange shareholding/XBRL','Trendlyne F07; FERE evidence','Quarterly'],
 ['Business quality / industry / TAM','Annual report, investor presentation, official industry filings','Trendlyne F08; NSE/BSE documents','Quarterly/event'],
 ['Peer comparison','Canonical MasterTickers sector/industry universe','Screener/Trendlyne peer data','Monthly'],
 ['Adjusted OHLCV and technicals','DuckDB adjusted OHLCV','Kite/Upstox/NSE/BSE','Daily'],
 ['Corporate actions and event risks','NSE/BSE exchange filings','Trendlyne events; FERE documents','Daily/event'],
 ['Forensic scores','Derived only from dated XBRL facts','FERE reconciliation','On new filing'],
 ['Point-in-time backtest inputs','Available-at timestamps on all facts and prices','NSE/BSE publication metadata','Every ingest']
];
const factStmt=db.prepare(`SELECT COUNT(*) c FROM company_facts WHERE symbol=? AND metric IN (${Array(1).fill('?')}) AND value IS NOT NULL`);
const endpointStmt=db.prepare(`SELECT COUNT(*) c FROM fundamental_endpoint_snapshots WHERE symbol=? AND provider='TRENDLYNE_MCP' AND endpoint=? AND status='SUCCESS'`);
const metricMap={'Revenue/PAT/operating profit history':['revenue','pat','operating_profit'],'Balance sheet and borrowings':['debt_to_equity_reported'],'CFO, capex, working capital and FCF':['cfo','capex_cash_outflow','working_capital'],'Margins, ROE, ROCE and efficiency':['roe_pct','roce_reported'],'Valuation and per-share data':['market_cap_cr','pe_ttm'],'Promoter/FII/DII/pledge history':['promoter_holding','fii_holding','dii_holding']};
function status(s,label){const ms=metricMap[label]; if(ms){const present=ms.filter(m=>factStmt.get(s,m).c>0).length; return `${present}/${ms.length} canonical metrics`; } const ep={'Business description / segments':'overview','Catalysts / order book / guidance':'corporate_events','Business quality / industry / TAM':'documents'}[label]; if(ep) return endpointStmt.get(s,ep).c?'provider snapshot present':'provider snapshot missing'; return 'requires source-specific audit';}
const out=['# Complete research-input acquisition audit','', 'This report identifies what must be acquired to produce a business-ready fundamental and technical dossier. Existing facts are not deleted or replaced. Preferred source is used first; fallbacks are evidence-qualified only.', '', '| Research requirement | Preferred source | Fallbacks | Freshness | AZAD | RRKABEL |','|---|---|---|---|---|---|'];
for(const [label,primary,fb,freq] of requirements) out.push(`| ${label} | ${primary} | ${fb} | ${freq} | ${status('AZAD',label)} | ${status('RRKABEL',label)} |`);
out.push('', '## Acquisition order', '', '1. Consume existing canonical facts and persisted source documents.', '2. Fill dated statutory gaps from FERE/XBRL and NSE/BSE filings.', '3. Use Trendlyne packs F01–F08 for provider coverage and qualitative context, preserving raw snapshots.', '4. Use DuckDB adjusted OHLCV for technicals; Kite/Upstox only for current quote or missing candles.', '5. Use Screener/peer data only as a labelled comparative source, never as a replacement for statutory facts.', '6. Recompute forensic scores, QGLP and valuation only after period/scope/provenance checks pass.', '', '## Completion rule', '', 'A dossier is complete only when every material claim has a value or an explicit evidence-bounded explanation, with source, period, freshness and conflict status. Missing evidence must not be converted to zero, latest-period assumptions or narrative certainty.');
const outPath=path.join(root,'reports/fundamental_complete_research_inputs_AZAD_RRKABEL.md'); fs.mkdirSync(path.dirname(outPath),{recursive:true}); fs.writeFileSync(outPath,out.join('\n')); console.log(outPath); db.close();
