"""
tv_context.py
=============
Reusable module: loads tv_universe.json + tv_peers.json from project root
and provides TV context for any research flow (29Q, alphanumeric scan, F-filter).

Public API
----------
load_tv_data(project_root=None)              -> (tv_universe, tv_peers)
get_tv_context(symbol, tv_universe, tv_peers) -> dict   (structured TV context)
format_for_29q(symbol, tv_universe, tv_peers) -> str    (LLM-ready narrative block)
f_filter_from_tv(symbol, tv_universe, tv_peers) -> dict (F3/F4/F5/F6 from TV)

Data source: fetch_tv_universe.py must have been run first (saves to project root).
Falls back gracefully with None/empty values when data is missing.
"""
import os
import json
import math
from typing import Optional, Dict, Any, Tuple

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TV_UNIVERSE_JSON = os.path.join(PROJECT_ROOT, 'tv_universe.json')
TV_PEERS_JSON    = os.path.join(PROJECT_ROOT, 'tv_peers.json')
TV_META_JSON     = os.path.join(PROJECT_ROOT, 'tv_universe_meta.json')


def load_tv_data(project_root: Optional[str] = None) -> Tuple[Dict, Dict]:
    """Load tv_universe.json and tv_peers.json. Returns (universe_dict, peers_dict)."""
    root = project_root or PROJECT_ROOT
    univ_path  = os.path.join(root, 'tv_universe.json')
    peers_path = os.path.join(root, 'tv_peers.json')
    meta_path  = os.path.join(root, 'tv_universe_meta.json')

    universe, peers = {}, {}

    if os.path.exists(univ_path):
        with open(univ_path, encoding='utf-8') as f:
            universe = json.load(f)
    else:
        print(f"[tv_context] WARNING: {univ_path} not found. Run fetch_tv_universe.py first.")

    if os.path.exists(peers_path):
        with open(peers_path, encoding='utf-8') as f:
            peers = json.load(f)

    if os.path.exists(meta_path):
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
        print(f"[tv_context] TV data: {meta.get('total',0)} stocks "
              f"(NSE:{meta.get('nse',0)} BSE:{meta.get('bse',0)}) "
              f"fetched {meta.get('fetched_at','?')[:16]}")

    return universe, peers


def _safe(val, digits=1):
    """Return rounded float or None."""
    if val is None:
        return None
    try:
        v = float(val)
        return None if (math.isnan(v) or math.isinf(v)) else round(v, digits)
    except (TypeError, ValueError):
        return None


def get_tv_context(symbol: str, tv_universe: Dict, tv_peers: Dict) -> Dict[str, Any]:
    """
    Return a structured TV context dict for one symbol.

    Keys
    ----
    found            bool   — symbol exists in tv_universe
    exchange         str    — NSE or BSE
    tv_name          str    — full name from TV
    sector / industry str

    technicals:
      close, rsi, sma20, sma200, above_sma20, above_sma200
      rel_vol, perf_w, perf_1m, perf_3m
      high_52w, low_52w, pct_from_52w_high
      recommend        str   — 'Strong Buy'|'Buy'|'Neutral'|'Sell'|'Strong Sell'
      rec_score        float — raw Recommend.All (-1 to +1)

    valuation:
      pe, pb, roe, roa, opm, de_ratio, eps, div_yield
      mkt_cap_cr, market_cap_tier  — 'Large'|'Mid'|'Small'|'Micro'
      revenue_cr, net_income_cr

    peers (from tv_peers.json):
      peer_pool        str   — 'industry'|'sector'
      n_peers          int
      peer_median_pe, peer_median_roe, peer_median_opm, peer_median_pb, peer_median_de
      roe_percentile, opm_percentile, pe_value_percentile (higher=cheaper)
      mc_rank, mc_total
      top_peers        list  — [{sym, name, exchange, mkt_cap_cr, pe, roe, opm, perf_1m, rec}]

    f_filter_tv:
      F3_roce_tv       float|None  — TV return_on_capital_employed_fy (FY basis); None if absent
      F4_roe_tv        float|None  — TV ROE
      F5_pledge_tv     None        — TV screener doesn't carry pledge; always None
      F6_inst_tv       float|None  — not available from TV screener (use DB shareholding)
    """
    u = tv_universe.get(symbol, {})
    p = tv_peers.get(symbol, {})

    found = bool(u)
    close = _safe(u.get('close'), 2)
    high52 = _safe(u.get('high_52w'), 2)
    mc = _safe(u.get('mkt_cap_cr'), 0)

    # Recommend label
    rec_score = _safe(u.get('rec_all'), 3)
    if rec_score is None:
        recommend = 'N/A'
    elif rec_score >= 0.5:
        recommend = 'Strong Buy'
    elif rec_score >= 0.1:
        recommend = 'Buy'
    elif rec_score > -0.1:
        recommend = 'Neutral'
    elif rec_score > -0.5:
        recommend = 'Sell'
    else:
        recommend = 'Strong Sell'

    # Market cap tier
    if mc is None:
        mc_tier = 'Unknown'
    elif mc >= 20000:
        mc_tier = 'Large-cap'
    elif mc >= 5000:
        mc_tier = 'Mid-cap'
    elif mc >= 500:
        mc_tier = 'Small-cap'
    else:
        mc_tier = 'Micro-cap'

    # Peer medians & percentiles
    med = p.get('medians') or {}
    pct = p.get('percentiles') or {}

    return {
        'found':    found,
        'exchange': u.get('exchange'),
        'tv_name':  u.get('tv_name'),
        'sector':   u.get('sector'),
        'industry': u.get('industry'),

        'technicals': {
            'close':       close,
            'rsi':         _safe(u.get('rsi'), 1),
            'sma20':       _safe(u.get('sma20'), 2),
            'sma200':      _safe(u.get('sma200'), 2),
            'above_sma20': (close > u['sma20']) if (close and u.get('sma20')) else None,
            'above_sma200':(close > u['sma200']) if (close and u.get('sma200')) else None,
            'rel_vol':     _safe(u.get('rel_vol'), 2),
            'perf_w':      _safe(u.get('perf_w'), 1),
            'perf_1m':     _safe(u.get('perf_1m'), 1),
            'perf_3m':     _safe(u.get('perf_3m'), 1),
            'high_52w':    high52,
            'low_52w':     _safe(u.get('low_52w'), 2),
            'pct_from_52w_high': round((close / high52 - 1) * 100, 1) if (close and high52 and high52 > 0) else None,
            'recommend':   recommend,
            'rec_score':   rec_score,
        },

        'valuation': {
            'pe':          _safe(u.get('pe'), 1),
            'pb':          _safe(u.get('pb'), 2),
            'roe':         _safe(u.get('roe'), 1),
            'roa':         _safe(u.get('roa'), 1),
            'opm':         _safe(u.get('opm'), 1),
            'de_ratio':    _safe(u.get('de_ratio'), 2),
            'eps':         _safe(u.get('eps'), 2),
            'div_yield':   _safe(u.get('div_yield'), 2),
            'mkt_cap_cr':  mc,
            'market_cap_tier': mc_tier,
            'revenue_cr':  _safe(u.get('revenue_cr'), 0),
            'net_income_cr': _safe(u.get('net_income_cr'), 1),
        },

        'peers': {
            'sector':   p.get('sector') or u.get('sector'),
            'industry': p.get('industry') or u.get('industry'),
            'peer_pool': p.get('peer_pool'),
            'n_peers':   p.get('n_peers'),
            'peer_median_pe':  _safe(med.get('pe'), 1),
            'peer_median_roe': _safe(med.get('roe'), 1),
            'peer_median_opm': _safe(med.get('opm'), 1),
            'peer_median_pb':  _safe(med.get('pb'), 2),
            'peer_median_de':  _safe(med.get('de'), 2),
            'roe_percentile':       pct.get('roe_pct'),
            'opm_percentile':       pct.get('opm_pct'),
            'pe_value_percentile':  pct.get('pe_pct'),
            'mc_rank':  pct.get('mc_rank'),
            'mc_total': pct.get('mc_total'),
            'top_peers': p.get('top_peers') or [],
        },

        'f_filter_tv': {
            # TV's own ROCE column (FY); never a proxy such as 1.5*ROA. None when TV has no value.
            'F3_roce_tv':  _safe(u.get('roce_fy'), 1),
            'F4_roe_tv':   _safe(u.get('roe'), 1),
            'F5_pledge_tv': None,  # TV screener doesn't carry pledge data; unknown stays None, never 0
            'F6_inst_tv':  None,  # Not in TV screener; use DB shareholding
        },
    }


def format_for_29q(symbol: str, tv_universe: Dict, tv_peers: Dict) -> str:
    """
    Return a formatted text block suitable for including in a 29Q LLM research prompt.
    Covers: valuation, technicals, peer comparison, F-filter TV proxies.
    """
    ctx = get_tv_context(symbol, tv_universe, tv_peers)

    if not ctx['found']:
        return f"[TV Context for {symbol}]\nNot found in TV Screener universe. Run fetch_tv_universe.py to refresh.\n"

    tv = ctx['technicals']
    v  = ctx['valuation']
    p  = ctx['peers']
    name = ctx['tv_name'] or symbol
    exch = ctx['exchange'] or 'N/A'

    lines = [f"[TV Market Context — {symbol} ({name}) — {exch}]"]

    # Identity
    sec = ctx['sector'] or 'N/A'
    ind = ctx['industry'] or ''
    lines.append(f"Sector: {sec}" + (f" / {ind}" if ind else ""))
    lines.append(f"Market Cap: ₹{v['mkt_cap_cr']:,.0f} Cr ({v['market_cap_tier']})" if v['mkt_cap_cr'] else "Market Cap: N/A")

    # Valuation
    val_parts = []
    if v['pe']:    val_parts.append(f"P/E {v['pe']:.1f}x")
    if v['pb']:    val_parts.append(f"P/B {v['pb']:.2f}x")
    if v['roe']:   val_parts.append(f"ROE {v['roe']:.1f}%")
    if v['opm']:   val_parts.append(f"OPM {v['opm']:.1f}%")
    if v['de_ratio'] is not None: val_parts.append(f"D/E {v['de_ratio']:.2f}x")
    if v['div_yield']: val_parts.append(f"Div {v['div_yield']:.1f}%")
    if val_parts: lines.append("Valuation: " + " | ".join(val_parts))

    # Financials
    fin_parts = []
    if v['revenue_cr']:     fin_parts.append(f"Rev ₹{v['revenue_cr']:,.0f} Cr")
    if v['net_income_cr']:  fin_parts.append(f"PAT ₹{v['net_income_cr']:,.1f} Cr")
    if v['eps']:            fin_parts.append(f"EPS ₹{v['eps']:.2f}")
    if fin_parts: lines.append("Financials (TTM): " + " | ".join(fin_parts))

    # Technical
    tech_parts = []
    if tv['rsi']:     tech_parts.append(f"RSI {tv['rsi']:.1f}")
    if tv['above_sma20'] is not None:
        tech_parts.append(f"{'Above' if tv['above_sma20'] else 'Below'} SMA20")
    if tv['above_sma200'] is not None:
        tech_parts.append(f"{'Above' if tv['above_sma200'] else 'Below'} SMA200")
    if tv['rel_vol']: tech_parts.append(f"RelVol {tv['rel_vol']:.1f}x")
    if tv['recommend'] != 'N/A': tech_parts.append(f"TV: {tv['recommend']}")
    if tv['pct_from_52w_high'] is not None:
        tech_parts.append(f"{tv['pct_from_52w_high']:.1f}% from 52W high")
    if tech_parts: lines.append("Technical: " + " | ".join(tech_parts))

    # Performance
    perf_parts = []
    for label, key in [('1W', 'perf_w'), ('1M', 'perf_1m'), ('3M', 'perf_3m')]:
        val = tv.get(key)
        if val is not None:
            perf_parts.append(f"{label}: {'+' if val >= 0 else ''}{val:.1f}%")
    if perf_parts: lines.append("Performance: " + " | ".join(perf_parts))

    # Peer comparison
    if p['n_peers']:
        pool_label = p['peer_pool'] or 'group'
        lines.append(f"\nPeer Group ({p['sector']}" + (f"/{p['industry']}" if p['industry'] else '') +
                     f", {p['n_peers']} stocks, {pool_label} pool):")

        cmp_parts = []
        if v['pe'] and p['peer_median_pe']:
            diff = v['pe'] - p['peer_median_pe']
            cmp_parts.append(f"P/E {v['pe']:.1f}x vs peer med {p['peer_median_pe']:.1f}x "
                             f"({'premium' if diff > 0 else 'discount'} {abs(diff):.1f}x)")
        if v['roe'] and p['peer_median_roe']:
            diff = v['roe'] - p['peer_median_roe']
            cmp_parts.append(f"ROE {v['roe']:.1f}% vs peer med {p['peer_median_roe']:.1f}% "
                             f"({'above' if diff >= 0 else 'below'} by {abs(diff):.1f}pp)")
        if v['opm'] and p['peer_median_opm']:
            diff = v['opm'] - p['peer_median_opm']
            cmp_parts.append(f"OPM {v['opm']:.1f}% vs peer med {p['peer_median_opm']:.1f}% "
                             f"({'above' if diff >= 0 else 'below'} by {abs(diff):.1f}pp)")
        for part in cmp_parts:
            lines.append(f"  {part}")

        pct_parts = []
        if p['roe_percentile']:  pct_parts.append(f"ROE rank: {p['roe_percentile']:.0f}th pct")
        if p['opm_percentile']:  pct_parts.append(f"OPM rank: {p['opm_percentile']:.0f}th pct")
        if p['pe_value_percentile']: pct_parts.append(f"P/E value rank: {p['pe_value_percentile']:.0f}th pct")
        if p['mc_rank']:         pct_parts.append(f"Mkt cap #{p['mc_rank']} of {p['mc_total']}")
        if pct_parts: lines.append("  Percentiles: " + " | ".join(pct_parts))

        if p['top_peers']:
            top_names = [f"{q['sym']} (₹{q['mkt_cap_cr']:,.0f}Cr)" if q.get('mkt_cap_cr') else q['sym']
                         for q in p['top_peers'][:5]]
            lines.append(f"  Top peers by mkt cap: {', '.join(top_names)}")

    # F-filter TV proxies
    ff = ctx['f_filter_tv']
    ff_parts = []
    if ff['F3_roce_tv']: ff_parts.append(f"F3 ROCE (TV FY): {ff['F3_roce_tv']:.1f}%")
    if ff['F4_roe_tv']:  ff_parts.append(f"F4 ROE (TV): {ff['F4_roe_tv']:.1f}%")
    ff_parts.append("F5 Pledge: not in TV screener (use FERE/DB)")
    ff_parts.append("F6 Institutional: not in TV screener (use DB shareholding)")
    lines.append("\nF-filter TV proxies: " + "; ".join(ff_parts[:2]))

    return '\n'.join(lines) + '\n'


def f_filter_from_tv(symbol: str, tv_universe: Dict, tv_peers: Dict) -> Dict:
    """
    Return F-filter TV proxy values for a symbol.
    These supplement (not replace) DB-sourced F-filter values.

    Returns dict with keys: F3_roce_tv, F4_roe_tv, sector, industry, mkt_cap_cr,
    pe, pb, peer_median_pe, peer_median_roe, peer_median_opm, roe_pct, opm_pct, pe_val_pct
    """
    ctx = get_tv_context(symbol, tv_universe, tv_peers)
    return {
        'symbol':         symbol,
        'found_in_tv':    ctx['found'],
        'exchange':       ctx['exchange'],
        'sector':         ctx['sector'],
        'industry':       ctx['industry'],
        'mkt_cap_cr':     ctx['valuation']['mkt_cap_cr'],
        'market_cap_tier': ctx['valuation']['market_cap_tier'],
        'F3_roce_tv':     ctx['f_filter_tv']['F3_roce_tv'],
        'F4_roe_tv':      ctx['f_filter_tv']['F4_roe_tv'],
        'F4_roe_exact':   ctx['valuation']['roe'],
        'pe':             ctx['valuation']['pe'],
        'pb':             ctx['valuation']['pb'],
        'opm':            ctx['valuation']['opm'],
        'peer_median_pe':  ctx['peers']['peer_median_pe'],
        'peer_median_roe': ctx['peers']['peer_median_roe'],
        'peer_median_opm': ctx['peers']['peer_median_opm'],
        'roe_percentile':  ctx['peers']['roe_percentile'],
        'opm_percentile':  ctx['peers']['opm_percentile'],
        'pe_value_percentile': ctx['peers']['pe_value_percentile'],
        'mc_rank':         ctx['peers']['mc_rank'],
        'mc_total':        ctx['peers']['mc_total'],
        'n_peers':         ctx['peers']['n_peers'],
        'recommend':       ctx['technicals']['recommend'],
        'rec_score':       ctx['technicals']['rec_score'],
    }


# ── CLI quick-check ──────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys
    syms = sys.argv[1:] or ['YUKEN', 'TATATECH', 'VMART', 'BECTORFOOD', 'OPTIEMUS', 'ARROWGREEN']
    print(f"Loading TV data from {PROJECT_ROOT}...")
    univ, peers = load_tv_data()
    print(f"Universe: {len(univ)} | Peers: {len(peers)}\n")
    for sym in syms:
        print(format_for_29q(sym, univ, peers))
        print('-' * 60)
