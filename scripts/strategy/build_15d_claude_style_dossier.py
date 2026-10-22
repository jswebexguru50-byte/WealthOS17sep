import json, sqlite3, html
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / 'portfolio.db'
SCAN = ROOT / 'outputs/proper_scan_15d/proper_scan_results.json'
OUT = ROOT / 'outputs/proper_scan_15d/wealthos_15d_dossier_20261016.html'

def esc(x): return html.escape(str(x)) if x is not None else '—'
def pct(x): return f'{x:.2f}%' if isinstance(x,(int,float)) else '—'

scan = json.loads(SCAN.read_text(encoding='utf-8'))
rows = scan['results']
detail = [r for r in rows if r.get('score') == 7][:18]
db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row

def fundamentals(sym):
    hfs = [dict(r) for r in db.execute('select period_label,period_date,sales_cr,operating_profit_cr,opm_pct,net_profit_pat_cr,eps,cfo_cr,borrowings_cr,primary_source from HistoricalFinancialStatements where symbol=? order by period_date desc limit 8',(sym,))]
    snaps = [dict(r) for r in db.execute('select endpoint,status,fetched_at,error from fundamental_endpoint_snapshots where symbol=? order by endpoint',(sym,))]
    ok = [s for s in snaps if s['status']=='SUCCESS']
    unavailable = [s for s in snaps if s['status'] != 'SUCCESS']
    return hfs, snaps, ok, unavailable

def narrative(r, hfs, ok, unavailable):
    name = r.get('name') or r['symbol']
    lines = [f"{name} ({r['symbol']}) is a technical candidate from the 15-session DailyOHLCV window {scan['session_range']['first']} to {scan['session_range']['last']}. It passed {r['score']} of 7 deterministic filters. The latest close was ₹{r.get('last_close','—')}, the window return field is {pct(r.get('return_7d_pct'))}, RSI was {r.get('rsi','—')}, and price stood {pct(r.get('vs_sma20_pct'))} above SMA20 and {pct(r.get('vs_sma200_pct'))} above SMA200."]
    lines.append(f"Momentum confirmation is present through the reported volume ratio of {r.get('vol_ratio','—')}x and a latest close of {pct((r.get('last_close',0)/r.get('high7d',1))*100) if r.get('high7d') else None} of the seven-day high. These are screening observations, not a forecast or an execution signal.")
    if hfs:
        latest = hfs[0]
        lines.append(f"The local HistoricalFinancialStatements table contains {len(hfs)} rows for this canonical symbol. The latest available row is labelled {latest.get('period_label') or 'unlabelled'} dated {latest.get('period_date') or 'undated'}; sales are {latest.get('sales_cr')}, operating profit {latest.get('operating_profit_cr')}, operating margin {latest.get('opm_pct')}, PAT {latest.get('net_profit_pat_cr')}, EPS {latest.get('eps')}, and CFO {latest.get('cfo_cr')}. Values retain the repository's original units and are not reinterpreted.")
    else:
        lines.append("No HistoricalFinancialStatements row was found under the canonical symbol at report time. The fundamental section is therefore a data-availability warning, not a fabricated company assessment.")
    lines.append(f"Trendlyne snapshot coverage is {len(ok)} successful endpoint(s) and {len(unavailable)} unavailable/non-success endpoint(s). Successful endpoints are preserved in portfolio.db with their fetch timestamp and source reference. Where the provider returned an error or no data, this report leaves the field unresolved.")
    lines.append("Risk interpretation: the technical setup is strongest when all seven checks remain true, but the scan does not establish liquidity quality, corporate-action adjustment quality beyond the imported Kite parquet provenance, valuation, governance, or cash conversion. Those questions require the cited fundamental evidence and independent review before any investment decision.")
    return ' '.join(lines)

css = '''body{margin:0;background:#0b1220;color:#dbe7f5;font:14px system-ui,Segoe UI,sans-serif;line-height:1.55}main{max-width:1180px;margin:auto;padding:28px}.hero,.card{background:#111c2e;border:1px solid #263853;border-radius:14px;padding:22px;margin:16px 0;box-shadow:0 8px 25px #0003}.hero{background:linear-gradient(135deg,#132b47,#111827)}h1{font-size:31px;margin:0 0 8px;color:#fff}h2{color:#74c0fc;border-bottom:1px solid #29415f;padding-bottom:8px}h3{color:#f0c674;margin-bottom:5px}.muted{color:#91a4bb}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.metric{background:#0c1626;border:1px solid #253a55;border-radius:10px;padding:12px}.big{font-size:24px;font-weight:700;color:#fff}.ok{color:#8ce99a}.warn{color:#ffd166}.bad{color:#ff8787}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border-bottom:1px solid #273b56;padding:8px;text-align:left;vertical-align:top}th{color:#9ec5f8;background:#16243a}.pill{display:inline-block;padding:3px 8px;border-radius:99px;background:#1d3c5c;margin:2px;font-size:12px}.small{font-size:12px}.pagebreak{page-break-before:always}.toc a{color:#9ec5f8;text-decoration:none;margin-right:14px}code{color:#b5f4a7}'''

parts = [f'''<!doctype html><html><head><meta charset="utf-8"><title>WealthOS 15-Session F1–F7 Dossier</title><style>{css}</style></head><body><main>
<section class="hero"><h1>NRI WealthOS — 15-Session Intelligence Dossier</h1><p class="muted">As-of 16 Oct 2026 · NSE + BSE Kite-adjusted OHLCV · canonical F1–F7 scan</p><p>This report is generated from the repository scan and stored evidence. It is an analytical research artifact, not investment advice. Status: <b class="warn">AWAITING_INDEPENDENT_REVIEW</b>.</p></section>
<section class="card toc"><h2>Executive Summary</h2><div class="grid"><div class="metric"><div class="big">{len(rows):,}</div><div class="muted">broad candidates retained for audit</div></div><div class="metric"><div class="big">{sum(1 for r in rows if r.get('score')==7)}</div><div class="muted">strict all-7-filter passes</div></div><div class="metric"><div class="big">{scan['session_range']['first']} → {scan['session_range']['last']}</div><div class="muted">15 trading sessions</div></div><div class="metric"><div class="big">{len(detail)}</div><div class="muted">detailed pages in this dossier</div></div></div><p>The full machine-readable result set is retained alongside this HTML. The detailed section uses the first 18 strict 7/7 candidates sorted by the scan output, matching the supplied sample’s compact dossier convention; the 1,532 figure is not presented as a strict strategy result.</p></section>
<section class="card"><h2>F1–F7 Filter Definition</h2><table><tr><th>Filter</th><th>Test</th></tr><tr><td>F1 / C1</td><td>Latest close above SMA20</td></tr><tr><td>F2 / C2</td><td>Latest close above SMA200</td></tr><tr><td>F3 / C3</td><td>Positive return over the scan window</td></tr><tr><td>F4 / C4</td><td>RSI between 40 and 70</td></tr><tr><td>F5 / C5</td><td>Latest volume at least 1.2× average volume</td></tr><tr><td>F6 / C6</td><td>Last five closes hold at least 97% of the first-five maximum</td></tr><tr><td>F7 / C7</td><td>Latest close at least 87% of the seven-day high</td></tr></table><p class="small muted">OHLCV source: DailyOHLCV populated from verified NSE/BSE Kite parquet through 2026-10-16. The output’s original field is named <code>return_7d_pct</code>; it is retained verbatim for provenance even though the eligibility window is 15 sessions.</p></section>
<section class="card"><h2>Top 18 Symbol–Filter Matrix</h2><table><tr><th>Symbol</th><th>Name</th><th>Score</th><th>Return field</th><th>RSI</th><th>Volume ratio</th><th>Sector</th></tr>''']
for r in detail:
    parts.append(f"<tr><td><b>{esc(r['symbol'])}</b></td><td>{esc(r.get('name'))}</td><td class='ok'>{r['score']}/7</td><td>{pct(r.get('return_7d_pct'))}</td><td>{esc(r.get('rsi'))}</td><td>{esc(r.get('vol_ratio'))}×</td><td>{esc(r.get('sector'))}</td></tr>")
parts.append('</table></section>')

for i,r in enumerate(detail,1):
    hfs,snaps,ok,bad = fundamentals(r['symbol'])
    crit=' '.join("<span class='pill {cls}'>{key}: {state}</span>".format(cls='ok' if v else 'bad', key=k, state='PASS' if v else 'FAIL') for k,v in r['criteria'].items())
    parts.append(f'''<section class="card {'pagebreak' if i>1 else ''}" id="{esc(r['symbol'])}"><h2>{i}. {esc(r['symbol'])} — {esc(r.get('name'))}</h2><p class="muted">{esc(r.get('sector'))} · {esc(r.get('exchange'))} · detailed status: <b class="{'ok' if hfs and ok else 'warn'}">{'EVIDENCE_AVAILABLE' if hfs and ok else 'DATA_INSUFFICIENT'}</b></p><div>{crit}</div><div class="grid"><div class="metric"><b>Close</b><div class="big">₹{esc(r.get('last_close'))}</div></div><div class="metric"><b>RSI</b><div class="big">{esc(r.get('rsi'))}</div></div><div class="metric"><b>vs SMA20 / 200</b><div class="big">{pct(r.get('vs_sma20_pct'))} / {pct(r.get('vs_sma200_pct'))}</div></div><div class="metric"><b>Volume ratio</b><div class="big">{esc(r.get('vol_ratio'))}×</div></div></div><h3>Technical detail</h3><p>{esc(narrative(r,hfs,ok,bad))}</p><h3>Fundamental evidence and 1,000-word-summary status</h3><p>{esc(narrative(r,hfs,ok,bad))}</p><p class="small muted">This is intentionally evidence-bounded. A full 1,000-word company narrative is only publishable when the required Trendlyne/company evidence is successfully fetched and reconciled; unavailable endpoints are not filled with inference.</p><h3>Source coverage</h3><table><tr><th>HFS rows</th><td>{len(hfs)}</td></tr><tr><th>Trendlyne successful endpoints</th><td>{len(ok)}</td></tr><tr><th>Trendlyne unavailable/non-success</th><td>{len(bad)}</td></tr></table></section>''')

parts.append(f'''<section class="card"><h2>Provenance and limitations</h2><p>Generated {datetime.now().isoformat(timespec='seconds')} from <code>{SCAN}</code> and <code>{DB}</code>. The full result JSON is the audit source for all 1,532 qualifying rows. Fundamentals are read from local repository tables and Trendlyne snapshot records; missing or provider-error data remain missing. The historical symbol mismatch remains a data-quality issue for names whose canonical HFS row count is zero and must be resolved before any semantic review or investment publication.</p><p class="warn">No live order execution was performed. No external publication was performed.</p></section></main></body></html>''')
OUT.write_text(''.join(parts),encoding='utf-8')
print(OUT)
