"""
run_29q_with_tv.py
==================
29Q research runner with TradingView context enrichment.

For each symbol, assembles:
  • 29 research questions (informational, not threshold-elimination)
  • F-filter scorecard (F1–F7, from DB shareholding + DB financials + TV proxies)
  • TV market context (sector, peers, valuation, technical, percentile ranks)

Source waterfall for shareholding fields (F1 promoter, F5 pledge, F6 institutional):
  Layer 1 — HistoricalShareholdingPattern (primary; most recent row per symbol)
  Layer 2 — canonical_fact_store (Trendlyne MCP conf=1.0, TV conf=0.9; automatic)
  Layer 3 — Trendlyne MCP live fetch via --enrich (stores to CFS for all future runs)

Reads from:
  • portfolio.db            — shareholding, financials, canonical_fact_store
  • tv_universe.json        — TradingView universe (run fetch_tv_universe.py first)
  • tv_peers.json           — TV peer groups
  • <scan>.json             — optional scan results (--from-scan)

Output:
  • 29q_results_<date>.json    — structured per-symbol research output
  • 29q_summary_<date>.md      — human-readable markdown summary

Usage:
  python scripts/fundamental/run_29q_with_tv.py --symbols YUKEN TATATECH VMART
  python scripts/fundamental/run_29q_with_tv.py --from-scan oct16_scan_results.json --min-score 6
  python scripts/fundamental/run_29q_with_tv.py --from-scan oct16_scan_results.json --top 10

  # Auto-fetch missing shareholding data (requires WealthOS server on localhost:3000):
  python scripts/fundamental/run_29q_with_tv.py --symbols YUKEN VMART --enrich
  python scripts/fundamental/run_29q_with_tv.py --from-scan scan.json --enrich --server http://localhost:3000
"""
import os
import sys
import json
import sqlite3
import argparse
from datetime import datetime, date

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORTFOLIO_DB = os.path.join(ROOT_DIR, 'portfolio.db')
TV_UNIVERSE_JSON = os.path.join(ROOT_DIR, 'tv_universe.json')
TV_PEERS_JSON    = os.path.join(ROOT_DIR, 'tv_peers.json')
TV_META_JSON     = os.path.join(ROOT_DIR, 'tv_universe_meta.json')

# Add scripts/fundamental to path so tv_context can be imported
sys.path.insert(0, os.path.join(ROOT_DIR, 'scripts', 'fundamental'))
from tv_context import load_tv_data, get_tv_context, format_for_29q, f_filter_from_tv


# ── DB helpers ────────────────────────────────────────────────────────────────

def _fetch_cfs_shareholding(conn, symbols):
    """
    Waterfall layer 2: read promoter/FII/DII/pledge from canonical_fact_store.
    Used for any symbol not found in HistoricalShareholdingPattern (primary source).
    Returns the same dict shape as fetch_shareholding so callers are source-agnostic.
    """
    has_cfs = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='canonical_fact_store'"
    ).fetchone()[0]
    if not has_cfs or not symbols:
        return {}

    fields = ('promoter_pct', 'fii_pct', 'dii_pct', 'pledge_pct', 'institutional_pct')
    placeholders = ','.join(['?'] * len(symbols))
    field_phs = ','.join([f"'{f}'" for f in fields])
    rows = conn.execute(f"""
        SELECT symbol, field, value, source
        FROM canonical_fact_store
        WHERE symbol IN ({placeholders})
          AND field IN ({field_phs})
    """, symbols).fetchall()

    by_sym = {}
    for sym, field, val_json, src in rows:
        if sym not in by_sym:
            by_sym[sym] = {'_sources': set()}
        try:
            by_sym[sym][field] = json.loads(val_json)
            by_sym[sym]['_sources'].add(src)
        except (ValueError, TypeError):
            pass

    result = {}
    for sym, data in by_sym.items():
        # Only useful if we have at least one ownership field
        if not any(k in data for k in ('promoter_pct', 'fii_pct', 'institutional_pct')):
            continue
        sources = ','.join(sorted(data['_sources']))
        result[sym] = {
            'promoter_pct':   data.get('promoter_pct'),
            'fii_pct':        data.get('fii_pct'),
            'dii_pct':        data.get('dii_pct'),
            'pledge_pct':     data.get('pledge_pct'),
            'inst_total_pct': data.get('institutional_pct'),  # aggregate when FII+DII not split
            'public_pct':     None,
            'free_float_pct': None,
            'sh_quarter':     f'canonical_fact_store ({sources})',
            'sh_date':        None,
        }
    return result


def fetch_shareholding(conn, symbols):
    """
    Source waterfall for shareholding fields (F1/F5/F6):
      1. HistoricalShareholdingPattern — most recent row per symbol (primary)
      2. canonical_fact_store         — Trendlyne MCP (conf 1.0) or TV (0.9)
    Never defaults unknown values to 0.
    """
    sh_cols = {r[1] for r in conn.execute("PRAGMA table_info(HistoricalShareholdingPattern)")}
    pledge_sel = "h.pledge_pct" if 'pledge_pct' in sh_cols else "NULL"
    placeholders = ','.join(['?'] * len(symbols))
    rows = conn.execute(f"""
        SELECT h.symbol, h.promoter_pct, h.fii_pct, h.dii_pct, h.public_pct,
               h.free_float_pct, h.quarter_label, h.as_of_date, {pledge_sel} as pledge_pct
        FROM HistoricalShareholdingPattern h
        INNER JOIN (
            SELECT symbol, MAX(as_of_date) as max_date
            FROM HistoricalShareholdingPattern WHERE symbol IN ({placeholders})
            GROUP BY symbol
        ) latest ON h.symbol = latest.symbol AND h.as_of_date = latest.max_date
    """, symbols).fetchall()
    sh_dict = {r[0]: {
        'promoter_pct': r[1], 'fii_pct': r[2], 'dii_pct': r[3],
        'public_pct': r[4], 'free_float_pct': r[5],
        'sh_quarter': r[6], 'sh_date': r[7], 'pledge_pct': r[8],
    } for r in rows}

    # Waterfall layer 2: canonical_fact_store for any symbol not in SHP
    missing = [s for s in symbols if s not in sh_dict]
    if missing:
        cfs = _fetch_cfs_shareholding(conn, missing)
        if cfs:
            print(f"[29Q] CFS fallback: {len(cfs)}/{len(missing)} missing symbols resolved from canonical_fact_store")
        sh_dict.update(cfs)

    return sh_dict


def fetch_financials(conn, symbols):
    placeholders = ','.join(['?'] * len(symbols))
    rows = conn.execute(f"""
        SELECT symbol, period_label, statement_type,
               net_profit_pat_cr, sales_cr, opm_pct, cfo_cr,
               borrowings_cr, total_assets_cr, equity_capital_cr, reserves_cr, eps
        FROM HistoricalFinancialStatements
        WHERE symbol IN ({placeholders})
          AND (statement_type LIKE 'QUARTERLY%' OR statement_type LIKE 'Q%')
        ORDER BY symbol, period_label DESC
    """, symbols).fetchall()
    fin = {}
    for r in rows:
        sym = r[0]
        if sym not in fin:
            fin[sym] = []
        fin[sym].append({
            'period': r[1], 'pat_cr': r[3], 'sales_cr': r[4], 'opm_pct': r[5],
            'cfo_cr': r[6], 'borrowings_cr': r[7], 'total_assets_cr': r[8],
            'equity_cr': r[9], 'reserves_cr': r[10], 'eps': r[11],
        })
    return fin


def auto_enrich(conn, symbols, server='http://localhost:3000'):
    """
    Waterfall layer 3 (active): for symbols still missing F1/F5/F6 data after
    SHP + CFS lookups, fetch from Trendlyne MCP via the WealthOS server and
    persist to canonical_fact_store so all future runs benefit automatically.

    Skips gracefully if:
      • trendlyne_bridge module not found
      • WealthOS server not running
      • Trendlyne MCP not configured on the server

    Called only when --enrich flag is set.
    """
    try:
        import trendlyne_bridge as tb
    except ImportError:
        print("[29Q] --enrich: trendlyne_bridge not importable; skipping")
        return

    # Which symbols are still missing ALL shareholding data (SHP + CFS)?
    SHP_FIELDS = ('promoter_pct', 'institutional_pct', 'fii_pct')
    placeholders = ','.join(['?'] * len(symbols))
    shp_present = {r[0] for r in conn.execute(
        f"SELECT DISTINCT symbol FROM HistoricalShareholdingPattern WHERE symbol IN ({placeholders})",
        symbols
    ).fetchall()}

    has_cfs = conn.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='canonical_fact_store'"
    ).fetchone()[0]
    cfs_present = set()
    if has_cfs:
        fp = ','.join([f"'{f}'" for f in SHP_FIELDS])
        cfs_present = {r[0] for r in conn.execute(
            f"SELECT DISTINCT symbol FROM canonical_fact_store WHERE symbol IN ({placeholders}) AND field IN ({fp})",
            symbols
        ).fetchall()}

    need = [s for s in symbols if s not in shp_present and s not in cfs_present]
    if not need:
        print(f"[29Q] --enrich: all {len(symbols)} symbols already have shareholding data; no fetch needed")
        return

    print(f"[29Q] --enrich: {len(need)} symbols missing shareholding data — fetching from Trendlyne: {need}")
    fields = ['promoter_pct', 'pledge_pct', 'fii_pct', 'dii_pct', 'institutional_pct']
    try:
        result = tb.fetch_and_store(conn, need, fields, server=server)
        fetched = sum(
            1 for sym_data in result.values()
            for k, v in sym_data.items()
            if k != '_error' and v is not None
        )
        conn.commit()
        print(f"[29Q] --enrich: stored {fetched} facts for {len(need)} symbols → now in canonical_fact_store")
    except Exception as exc:
        # Enrichment is best-effort; don't abort the whole report
        print(f"[29Q] --enrich: could not fetch from Trendlyne ({exc}); proceeding with available data")


# ── F-filter computation ─────────────────────────────────────────────────────

def compute_f_filters(symbol, tv_universe, tv_peers, sh, fin_quarters):
    """Compute F1–F7. TV proxies used where DB data missing."""
    tv = tv_universe.get(symbol, {})
    f = {}

    # F1: Promoter >= 66.67%
    prom = sh.get('promoter_pct') if sh else None
    f['F1_promoter_pct'] = prom
    f['F1_pass'] = None if prom is None else prom >= 66.67
    sh_src = sh.get('sh_quarter', '') if sh else ''
    _sh_label = 'canonical_fact_store' if sh and 'canonical' in sh_src else 'DB shareholding'
    f['F1_source'] = _sh_label if prom is not None else 'MISSING'

    # F2: Last 8 quarters PAT all positive — preserve None slots so engine logic applies correctly
    pats = [q['pat_cr'] for q in (fin_quarters or [])[:8]]
    known_pats = [p for p in pats if p is not None]
    f['F2_quarters_checked'] = len(known_pats)
    f['F2_pats'] = [round(p, 1) for p in known_pats]
    # False if any known quarter is <= 0; True only if all 8 slots present and all known positive;
    # None if < 8 slots or some slots unknown but none negative (matches f_filter_engine._f2)
    f['F2_pass'] = (None if not pats else
                    False if any(p is not None and p <= 0 for p in pats) else
                    True if len(pats) >= 8 and all(p is not None for p in pats) else
                    None)
    f['F2_source'] = 'DB quarterly PL'

    # F3: ROCE >= 35%  (missing opm/sales/total assets/borrowings => unknown, never 0)
    roce = None
    roce_source = None
    if fin_quarters:
        q = fin_quarters[0]
        opm, sales = q.get('opm_pct'), q.get('sales_cr')
        ta, borr = q.get('total_assets_cr'), q.get('borrowings_cr')
        if None not in (opm, sales, ta, borr):
            ce = ta - borr
            if ce > 0 and sales > 0:
                roce = round(((opm / 100) * sales * 4) / ce * 100, 1)
                roce_source = 'DB quarterly (annualised OPM×Sales/CE)'
    # TV waterfall: prefer roce_fy (annual), then roa_fy×1.5, then roa×1.5
    if roce is None and tv.get('roce_fy') is not None:
        roce = round(tv['roce_fy'], 1)
        roce_source = 'TV ROCE FY'
    elif roce is None and tv.get('roa_fy') is not None:
        roce = round(tv['roa_fy'] * 1.5, 1)
        roce_source = 'TV ROA_FY × 1.5 proxy'
    elif roce is None and tv.get('roa') is not None:
        roce = round(tv['roa'] * 1.5, 1)
        roce_source = 'TV ROA × 1.5 proxy'
    f['F3_roce'] = roce
    f['F3_pass'] = None if roce is None else roce >= 35
    f['F3_source'] = roce_source or 'MISSING'

    # F4: ROE >= 25% — prefer roe_fy over roe (ttm can be null in TV)
    roe_tv = tv.get('roe') if tv.get('roe') is not None else tv.get('roe_fy')
    roe_db = None
    if fin_quarters:
        q = fin_quarters[0]
        pat, e_, r_ = q.get('pat_cr'), q.get('equity_cr'), q.get('reserves_cr')
        if None not in (pat, e_, r_) and (e_ + r_) > 0:
            roe_db = round(pat * 4 / (e_ + r_) * 100, 1)
    roe = roe_db if roe_db is not None else roe_tv
    f['F4_roe'] = roe
    f['F4_pass'] = None if roe is None else roe >= 25
    f['F4_source'] = 'DB computed' if roe_db is not None else ('TV screener' if roe_tv is not None else 'MISSING')

    # F5: Pledge <= 0.01% (unknown pledge => unknown, never defaulted to 0)
    pledge = sh.get('pledge_pct') if sh else None
    f['F5_pledge_pct'] = pledge
    f['F5_pass'] = None if pledge is None else pledge <= 0.01
    f['F5_source'] = f'{_sh_label} (no pledge in TV screener)' if pledge is not None else 'MISSING'

    # F6: Institutional >= 5%
    # Prefer FII+DII separately; fall back to inst_total_pct if only aggregate available (from CFS)
    fii = sh.get('fii_pct') if sh else None
    dii = sh.get('dii_pct') if sh else None
    inst = (fii + dii) if (fii is not None and dii is not None) else sh.get('inst_total_pct') if sh else None
    f['F6_inst_pct'] = None if inst is None else round(inst, 2)
    f['F6_pass'] = None if inst is None else inst >= 5
    f['F6_source'] = ('DB shareholding' if sh and sh.get('sh_quarter', '').startswith('20')
                      else 'canonical_fact_store' if sh and 'canonical' in sh.get('sh_quarter', '')
                      else 'DB shareholding' if sh else 'MISSING')

    # F7: CFO/EBITDA >= 0.5 (needs 4 quarters with known cfo, opm, sales; partial sums are not TTM)
    cfo_ebitda = None
    r4 = (fin_quarters or [])[:4]
    if len(r4) == 4 and all(None not in (q.get('cfo_cr'), q.get('opm_pct'), q.get('sales_cr')) for q in r4):
        cfo_sum = sum(q['cfo_cr'] for q in r4)
        ebitda_sum = sum((q['opm_pct'] / 100) * q['sales_cr'] for q in r4)
        if ebitda_sum > 0:
            cfo_ebitda = round(cfo_sum / ebitda_sum, 2)
    f['F7_cfo_ebitda'] = cfo_ebitda
    f['F7_pass'] = None if cfo_ebitda is None else cfo_ebitda >= 0.5
    f['F7_source'] = 'DB quarterly cash flow'

    f['f_score'] = sum(1 for k in ('F1','F2','F3','F4','F5','F6','F7') if f[k + '_pass'] is True)
    return f


# ── 29 Questions framework ────────────────────────────────────────────────────

_29Q_TEMPLATE = """\
=== 29Q Research Scorecard: {symbol} ({tv_name}) ===
Date: {run_date}  |  Exchange: {exchange}  |  Sector: {sector}  |  Industry: {industry}
Market Cap: {market_cap}  |  TV Signal: {recommend}

── TECHNICAL QUALITY (C1–C7) ─────────────────────────────────────────────────
C1 Close > SMA20:    {C1}
C2 Close > SMA200:   {C2}
C3 7D Return > 0:    {C3}
C4 RSI 40-70:        {C4}
C5 Volume spike:     {C5}
C6 Price trajectory: {C6}
C7 Near 7D high:     {C7}
Technical score: {tech_score}/7

── FUNDAMENTAL FILTERS (F1–F7) [informational, not elimination] ──────────────
F1 Promoter ≥66.67%: {F1} ({F1_val})  [{F1_src}]
F2 8Q PAT positive:  {F2} ({F2_val})
F3 ROCE ≥35%:        {F3} ({F3_val})  [{F3_src}]
F4 ROE ≥25%:         {F4} ({F4_val})  [{F4_src}]
F5 Pledge ≤0.01%:    {F5} ({F5_val})  [{F5_src}]
F6 Institutional ≥5%:{F6} ({F6_val})
F7 CFO/EBITDA ≥0.5:  {F7} ({F7_val})
Fundamental score: {f_score}/7

── TV MARKET CONTEXT ─────────────────────────────────────────────────────────
{tv_context_block}

── OPEN RESEARCH QUESTIONS (29Q) ─────────────────────────────────────────────
Q1.  What is the core business and primary revenue drivers?
     → Use: sector={sector}, industry={industry}, revenue={revenue_cr} Cr TTM

Q2.  Has revenue grown consistently over the last 3 years?
     → Verify with: DB HistoricalFinancialStatements ANNUAL records

Q3.  Is valuation reasonable vs peers?
     → P/E {pe}x vs sector median {peer_pe}x | P/B {pb}x | TV signal: {recommend}

Q4.  What is the technical trend strength?
     → RSI {rsi} | {sma_status} | RelVol {rel_vol}x | Perf 1M {perf_1m}%, 3M {perf_3m}%

Q5.  Has PAT grown for 8+ consecutive quarters?
     → {F2_status}: {F2_quarters} quarters checked, pats={F2_pats_str}

Q6.  Is promoter holding high and stable?
     → {F1_status}: promoter={F1_val}, trend requires shareholding history

Q7.  Is there any promoter pledge concern?
     → {F5_status}: pledge={F5_val} (source: {F5_src}; TV screener lacks pledge)

Q8.  What is the capital efficiency (ROCE)?
     → {F3_status}: ROCE~{F3_val} [{F3_src}]

Q9.  Is there a high ROE business model?
     → {F4_status}: ROE={F4_val}, peer median ROE={peer_roe}%

Q10. Is the operating margin competitive vs peers?
     → OPM={opm}%, peer median={peer_opm}%

Q11. What is the D/E ratio and debt trajectory?
     → D/E={de_ratio}x (peer median={peer_de}x), borrowings trend requires DB annual

Q12. Does the company convert earnings to cash?
     → {F7_status}: CFO/EBITDA={F7_val}

Q13. What is the institutional conviction?
     → {F6_status}: FII={fii}% + DII={dii}% = {inst}% institutional

Q14. Are there any major related-party or governance flags?
     → Requires: SEBI filings, BSE announcements (external research needed)

Q15. What is the competitive moat (pricing power, switching cost, scale)?
     → Sector context: {sector} / {industry}; requires qualitative analysis

Q16. Has the company maintained OPM above 15% over cycles?
     → Latest OPM={opm}% (TV). Multi-year trend requires DB annual statements

Q17. How does it rank among its peers on key metrics?
     → Mkt cap rank #{mc_rank} of {mc_total} in {peer_pool} ({n_peers} peers)
     → ROE {roe_pct}th pct | OPM {opm_pct}th pct | P/E value {pe_val_pct}th pct

Q18. Is the stock within a reasonable distance from 52W high?
     → {pct_from_high}% from 52W high of {high_52w}; low={low_52w}

Q19. What is the earnings yield vs risk-free rate?
     → E/P = {ep_yield}% (P/E={pe}x). Compare to 10Y G-Sec ~7.0%

Q20. Is the sector in a structural growth phase?
     → Sector: {sector}; requires macro/sectoral analysis

Q21. Are there upcoming catalysts (result date, capex plan, order wins)?
     → Requires: BSE announcements, investor presentations

Q22. What is the free cash flow generation capability?
     → CFO={cfo_latest} Cr (latest Q). FCF = CFO - Capex (capex not in DB)

Q23. Are auditor qualifications or regulatory actions present?
     → Requires: Auditor report, MCA filings

Q24. Has EPS been growing consistently?
     → DB EPS (latest Q): {eps_latest}; multi-year trend from DB annual

Q25. Is the promoter actively buying or selling shares?
     → Requires: Bulk/block deal data, SAST disclosures from BSE

Q26. Is there a history of dividend distribution?
     → Div yield: {div_yield}%; requires multi-year dividend history

Q27. Does the company have a defensible market position (top-3 in segment)?
     → Sector: {sector} / {industry}; requires market share research

Q28. What is the exit strategy (trigger for selling)?
     → Based on: C-score degradation, F-score decline, or 20% drawdown rule

Q29. What is the overall conviction score (1–10) and investment hypothesis?
     → Technical: {tech_score}/7 | Fundamental: {f_score}/7 | TV: {recommend}
     → Conviction = (({tech_score} + {f_score}) / 14) × 10 = {conviction:.1f}/10
"""


def build_29q_record(symbol, scan_data, tv_universe, tv_peers, sh, fin_quarters, run_date):
    """Build structured 29Q research record for one symbol."""
    f = compute_f_filters(symbol, tv_universe, tv_peers, sh, fin_quarters)
    tv_ctx = get_tv_context(symbol, tv_universe, tv_peers)
    tv_narrative = format_for_29q(symbol, tv_universe, tv_peers)

    tech = tv_ctx['technicals']
    val  = tv_ctx['valuation']
    peers = tv_ctx['peers']

    # C1-C7 from scan_data when available; otherwise derived from TV technicals so
    # --symbols mode produces real scores, not zeroes.
    if scan_data:
        c_scores = scan_data.get('criteria', {})
        tech_score = scan_data.get('score', 0)
    else:
        rsi = tech.get('rsi')
        perf_w = tech.get('perf_w') or 0
        c_scores = {
            'C1': tech.get('above_sma20'),                       # close > SMA20
            'C2': tech.get('above_sma200'),                      # close > SMA200
            'C3': perf_w > 0,                                    # 7D return > 0
            'C4': rsi is not None and 40 <= rsi <= 70,           # RSI in momentum zone
            'C5': (tech.get('rel_vol') or 0) > 1.2,             # relative volume > 120%
            'C6': perf_w > -3,                                   # price trajectory (no >3% drop in 7D)
            'C7': perf_w >= -13,                                 # near 7D high (within ~13%)
        }
        tech_score = sum(1 for v in c_scores.values() if v is True)

    def yn(val): return 'UNKNOWN' if val is None else ('✓ PASS' if val else '✗ FAIL')
    def na(v, fmt='{}'): return fmt.format(v) if v is not None else 'N/A'

    fii = sh.get('fii_pct') if sh else None
    dii = sh.get('dii_pct') if sh else None
    inst = (fii + dii) if fii is not None and dii is not None else None
    ep_yield = round(100 / val['pe'], 1) if val.get('pe') and val['pe'] > 0 else None
    conviction = ((tech_score + f['f_score']) / 14) * 10

    fin_latest = fin_quarters[0] if fin_quarters else {}

    sma_parts = []
    if tech.get('above_sma20') is not None:
        sma_parts.append(f"{'Above' if tech['above_sma20'] else 'Below'} SMA20")
    if tech.get('above_sma200') is not None:
        sma_parts.append(f"{'Above' if tech['above_sma200'] else 'Below'} SMA200")
    sma_status = ' | '.join(sma_parts) if sma_parts else 'N/A'

    mc_cr = val.get('mkt_cap_cr')
    mc_str = f"₹{mc_cr:,.0f} Cr ({val['market_cap_tier']})" if mc_cr else 'N/A'

    text = _29Q_TEMPLATE.format(
        symbol=symbol,
        tv_name=tv_ctx.get('tv_name') or symbol,
        run_date=run_date,
        exchange=tv_ctx.get('exchange') or 'N/A',
        sector=tv_ctx.get('sector') or 'N/A',
        industry=tv_ctx.get('industry') or '',
        market_cap=mc_str,
        recommend=tech.get('recommend', 'N/A'),
        # C-scores from scan
        C1=yn(c_scores.get('C1')), C2=yn(c_scores.get('C2')), C3=yn(c_scores.get('C3')),
        C4=yn(c_scores.get('C4')), C5=yn(c_scores.get('C5')), C6=yn(c_scores.get('C6')),
        C7=yn(c_scores.get('C7')),
        tech_score=tech_score,
        # F-filters
        F1=yn(f['F1_pass']), F1_val=na(f['F1_promoter_pct'], '{:.1f}%'), F1_src=f['F1_source'],
        F1_status='UNKNOWN' if f['F1_pass'] is None else ('PASS' if f['F1_pass'] else 'FAIL'),
        F2=yn(f['F2_pass']), F2_val=f"last {f['F2_quarters_checked']}Q",
        F2_quarters=f['F2_quarters_checked'],
        F2_pats_str=str([p for p in f['F2_pats'][:4]]),
        F2_status='UNKNOWN' if f['F2_pass'] is None else ('PASS' if f['F2_pass'] else 'FAIL'),
        F3=yn(f['F3_pass']), F3_val=na(f['F3_roce'], '{:.1f}%'), F3_src=f['F3_source'],
        F3_status='UNKNOWN' if f['F3_pass'] is None else ('PASS' if f['F3_pass'] else 'FAIL'),
        F4=yn(f['F4_pass']), F4_val=na(f['F4_roe'], '{:.1f}%'), F4_src=f['F4_source'],
        F4_status='UNKNOWN' if f['F4_pass'] is None else ('PASS' if f['F4_pass'] else 'FAIL'),
        F5=yn(f['F5_pass']), F5_val=na(f['F5_pledge_pct'], '{:.2f}%'), F5_src=f['F5_source'],
        F5_status='UNKNOWN' if f['F5_pass'] is None else ('PASS' if f['F5_pass'] else 'FAIL'),
        F6=yn(f['F6_pass']), F6_val=na(f['F6_inst_pct'], '{:.1f}%'),
        F6_status='UNKNOWN' if f['F6_pass'] is None else ('PASS' if f['F6_pass'] else 'FAIL'),
        F7=yn(f['F7_pass']), F7_val=na(f['F7_cfo_ebitda'], '{:.2f}'),
        F7_status='UNKNOWN' if f['F7_pass'] is None else ('PASS' if f['F7_pass'] else 'FAIL'),
        f_score=f['f_score'],
        tv_context_block=tv_narrative,
        # Q-level variables
        pe=na(val.get('pe'), '{:.1f}'), pb=na(val.get('pb'), '{:.2f}'),
        peer_pe=na(peers.get('peer_median_pe'), '{:.1f}'),
        peer_roe=na(peers.get('peer_median_roe'), '{:.1f}'),
        peer_opm=na(peers.get('peer_median_opm'), '{:.1f}'),
        peer_de=na(peers.get('peer_median_de'), '{:.2f}'),
        revenue_cr=na(val.get('revenue_cr'), '{:,.0f}'),
        rsi=na(tech.get('rsi'), '{:.1f}'),
        rel_vol=na(tech.get('rel_vol'), '{:.2f}'),
        perf_1m=na(tech.get('perf_1m'), '{:.1f}'),
        perf_3m=na(tech.get('perf_3m'), '{:.1f}'),
        sma_status=sma_status,
        opm=na(val.get('opm'), '{:.1f}'),
        de_ratio=na(val.get('de_ratio'), '{:.2f}'),
        fii=na(fii, '{:.1f}'), dii=na(dii, '{:.1f}'), inst=na(inst, '{:.1f}'),
        mc_rank=peers.get('mc_rank') or 'N/A',
        mc_total=peers.get('mc_total') or 'N/A',
        peer_pool=peers.get('peer_pool') or 'N/A',
        n_peers=peers.get('n_peers') or 0,
        roe_pct=na(peers.get('roe_percentile'), '{:.0f}'),
        opm_pct=na(peers.get('opm_percentile'), '{:.0f}'),
        pe_val_pct=na(peers.get('pe_value_percentile'), '{:.0f}'),
        pct_from_high=na(tech.get('pct_from_52w_high'), '{:.1f}'),
        high_52w=na(tech.get('high_52w'), '{:.2f}'),
        low_52w=na(tech.get('low_52w'), '{:.2f}'),
        ep_yield=na(ep_yield, '{:.1f}'),
        cfo_latest=na(fin_latest.get('cfo_cr'), '{:.1f}'),
        eps_latest=na(fin_latest.get('eps'), '{:.2f}'),
        div_yield=na(val.get('div_yield'), '{:.1f}'),
        conviction=conviction,
    )

    return {
        'symbol': symbol,
        'run_date': run_date,
        'exchange': tv_ctx.get('exchange'),
        'sector': tv_ctx.get('sector'),
        'industry': tv_ctx.get('industry'),
        'mkt_cap_cr': val.get('mkt_cap_cr'),
        'market_cap_tier': val.get('market_cap_tier'),
        'tech_score': tech_score,
        'f_score': f['f_score'],
        'conviction': round(conviction, 1),
        'recommend_tv': tech.get('recommend'),
        'f_filters': f,
        'tv_context': tv_ctx,
        'narrative_29q': text,
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='29Q research runner with TV context enrichment')
    parser.add_argument('--symbols', nargs='+', help='Explicit list of symbols to research')
    parser.add_argument('--from-scan', help='Path to scan results JSON (oct16_scan_results.json)')
    parser.add_argument('--min-score', type=int, default=6, help='Minimum C-score filter from scan (default: 6)')
    parser.add_argument('--top', type=int, default=0, help='Limit to top N stocks by C-score (default: all qualifying)')
    parser.add_argument('--out', default=None, help='Output directory (default: project root)')
    parser.add_argument('--tv-root', default=None, help='Directory containing tv_universe.json (default: project root)')
    # Source waterfall enrichment: auto-fetch missing shareholding data from Trendlyne MCP.
    # When set, any symbol not in HistoricalShareholdingPattern or canonical_fact_store
    # is fetched and stored before F-filters are computed — all future runs then hit the cache.
    parser.add_argument('--enrich', action='store_true',
                        help='Auto-fetch missing shareholding data from Trendlyne (requires WealthOS server running)')
    parser.add_argument('--server', default='http://localhost:3000',
                        help='WealthOS server URL for --enrich (default: http://localhost:3000)')
    args = parser.parse_args()

    out_dir = args.out or ROOT_DIR
    tv_root = args.tv_root or ROOT_DIR
    run_date = date.today().isoformat()

    # Load TV data
    tv_root_univ = os.path.join(tv_root, 'tv_universe.json')
    tv_root_peers = os.path.join(tv_root, 'tv_peers.json')
    tv_universe, tv_peers = {}, {}

    if os.path.exists(tv_root_univ):
        with open(tv_root_univ, encoding='utf-8') as f:
            tv_universe = json.load(f)
        print(f"[29Q] TV universe: {len(tv_universe)} stocks loaded")
    else:
        print(f"[29Q] WARNING: tv_universe.json not found at {tv_root}. Run fetch_tv_universe.py first.")

    if os.path.exists(tv_root_peers):
        with open(tv_root_peers, encoding='utf-8') as f:
            tv_peers = json.load(f)
        print(f"[29Q] TV peers: {len(tv_peers)} stocks loaded")

    # Determine symbol list
    scan_by_sym = {}
    if args.from_scan:
        with open(args.from_scan, encoding='utf-8') as f:
            scan_data = json.load(f)
        qualifying = [r for r in scan_data if r.get('score', 0) >= args.min_score]
        qualifying.sort(key=lambda r: -r.get('score', 0))
        if args.top:
            qualifying = qualifying[:args.top]
        scan_by_sym = {r['symbol']: r for r in qualifying}
        symbols = list(scan_by_sym.keys())
        print(f"[29Q] From scan: {len(qualifying)} stocks with score≥{args.min_score}")
    elif args.symbols:
        symbols = [s.upper() for s in args.symbols]
        print(f"[29Q] Explicit symbols: {symbols}")
    else:
        parser.error("Provide --symbols or --from-scan")

    if not symbols:
        print("[29Q] No symbols to process.")
        return

    # Fetch DB data — source waterfall: SHP → canonical_fact_store → (Trendlyne if --enrich)
    conn = sqlite3.connect(PORTFOLIO_DB)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")

    if args.enrich:
        # Layer 3 (active): fetch + store before SHP/CFS lookups so waterfall below finds it
        auto_enrich(conn, symbols, server=args.server)

    print(f"[29Q] Fetching DB data for {len(symbols)} symbols...")
    sh_dict  = fetch_shareholding(conn, symbols)   # layers 1 + 2 applied inside
    fin_dict = fetch_financials(conn, symbols)
    conn.close()
    print(f"[29Q] Shareholding: {len(sh_dict)} | Financials: {len(fin_dict)}")

    # Build 29Q records
    results = []
    for i, sym in enumerate(symbols, 1):
        scan_rec = scan_by_sym.get(sym)
        sh = sh_dict.get(sym)
        fin_q = fin_dict.get(sym, [])
        rec = build_29q_record(sym, scan_rec, tv_universe, tv_peers, sh, fin_q, run_date)
        results.append(rec)
        print(f"  [{i}/{len(symbols)}] {sym}: tech={rec['tech_score']}/7 f={rec['f_score']}/7 "
              f"conviction={rec['conviction']:.1f}/10 ({rec['recommend_tv']})")

    # Save JSON
    json_path = os.path.join(out_dir, f'29q_results_{run_date}.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n[29Q] Saved JSON: {json_path} ({len(results)} stocks)")

    # Save markdown summary
    md_path = os.path.join(out_dir, f'29q_summary_{run_date}.md')
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(f"# 29Q Research Summary — {run_date}\n\n")
        f.write(f"Stocks researched: {len(results)}\n\n")
        f.write("| # | Symbol | Sector | MktCap Cr | C-score | F-score | Conviction | TV Signal |\n")
        f.write("|---|--------|--------|-----------|---------|---------|------------|----------|\n")
        for i, r in enumerate(sorted(results, key=lambda x: -x['conviction']), 1):
            mc = f"₹{r['mkt_cap_cr']:,.0f}" if r.get('mkt_cap_cr') else 'N/A'
            f.write(f"| {i} | **{r['symbol']}** | {r['sector'] or 'N/A'} | {mc} | "
                    f"{r['tech_score']}/7 | {r['f_score']}/7 | **{r['conviction']:.1f}**/10 | {r['recommend_tv'] or 'N/A'} |\n")
        f.write("\n---\n\n")
        for r in sorted(results, key=lambda x: -x['conviction']):
            f.write(r['narrative_29q'])
            f.write('\n\n' + '─' * 80 + '\n\n')

    print(f"[29Q] Saved markdown: {md_path}")
    print(f"\n[29Q] Done. Top 5 by conviction:")
    for r in sorted(results, key=lambda x: -x['conviction'])[:5]:
        print(f"  {r['symbol']:15} conviction={r['conviction']:.1f}/10  "
              f"C={r['tech_score']}/7  F={r['f_score']}/7  {r['recommend_tv']}")


if __name__ == '__main__':
    main()
