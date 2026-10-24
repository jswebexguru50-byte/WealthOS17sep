#!/usr/bin/env python3
"""
WealthOS Analyst Dossier HTML Generator
Reads scan_out.json + live sector momentum → generates interactive HTML dossier.
Usage: python3 generate_dossier_html.py [scan_out.json] [output.html] [sector_momentum.json]
"""
import json, sys, os, subprocess, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SCAN_JSON    = sys.argv[1] if len(sys.argv) > 1 else '/tmp/scan_out.json'
OUT_HTML     = sys.argv[2] if len(sys.argv) > 2 else '/tmp/wealthos_dossier.html'
SECTOR_JSON  = sys.argv[3] if len(sys.argv) > 3 else '/tmp/sector_momentum_live.json'
DB_PATH      = (os.environ.get('DATABASE_URL') or str(ROOT / 'portfolio.db')).removeprefix('sqlite://')

# ── 1. Load scan data ──────────────────────────────────────────────────────────
with open(SCAN_JSON) as f:
    scan = json.load(f)

stocks = scan.get('stocks', scan.get('candidates', []))
scan_date = scan.get('scanDate', str(datetime.date.today()))
run_id    = scan.get('dossierRunId', 'N/A')
sig_counts = scan.get('signalCounts', {})

# ── 1b. Extract signal dates per stock ─────────────────────────────────────────
# 90 trading days ≈ 126 calendar days before scan date
_scan_dt = datetime.date.fromisoformat(scan_date)
_window_cutoff = (_scan_dt - datetime.timedelta(days=130)).isoformat()  # safe buffer

def extract_signal_dates(s):
    """Returns only signal dates that fall within the 90-trading-day window."""
    dates = {}
    for strat in ['S1A','S1B','S2A','S3A','S4A','S4B','S5A']:
        key = strat.lower() + 'Details'
        det = s.get(key)
        if det and isinstance(det, dict):
            sb = det.get('signalBar')
            if sb and sb[:10] >= _window_cutoff:
                dates[strat] = sb[:10]  # YYYY-MM-DD, only within window
    return dates

# ── 2. Sector momentum — live data (NSE + Kite staging + DB) ─────────────────
SECTOR_INDEX_MAP = {
    'Healthcare': 'NIFTY PHARMA',
    'Pharmaceuticals & Biotechnology': 'NIFTY PHARMA',
    'Technology': 'NIFTY IT',
    'Information Technology': 'NIFTY IT',
    'Financial Services': 'NIFTY FIN SERVICE',
    'Consumer Cyclical': 'NIFTY AUTO',
    'Consumer Durables': 'NIFTY AUTO',
    'Automobiles & Auto Components': 'NIFTY AUTO',
    'Consumer Defensive': 'NIFTY FMCG',
    'Food, Beverages & Tobacco': 'NIFTY FMCG',
    'Basic Materials': 'NIFTY METAL',
    'Metals & Mining': 'NIFTY METAL',
    'Chemicals': 'NIFTY METAL',
    'Chemicals & Petrochemicals': 'NIFTY METAL',
    'METALS': 'NIFTY METAL',
    'Industrials': 'NIFTY INFRA',
    'Capital Goods': 'NIFTY INFRA',
    'Diversified Industrials': 'NIFTY INFRA',
    'General Industrials': 'NIFTY INFRA',
    'Commercial Services & Supplies': 'NIFTY INFRA',
    'CAPITAL GOODS': 'NIFTY INFRA',
    'Transportation': 'NIFTY INFRA',
    'Cement and Construction': 'NIFTY INFRA',
    'Energy': 'NIFTY ENERGY',
    'Communication Services': 'NIFTY MEDIA',
    'Real Estate': 'NIFTY REALTY',
    'Industrial & Specialty Growth': 'NIFTY 500',
    'Consumer Services': 'NIFTY CONSUMPTION',
    'RETAIL': 'NIFTY CONSUMPTION',
    'PACKAGING': 'NIFTY 500',
    'Utilities': 'NIFTY ENERGY',
}

sector_momentum = {}
sector_data_source = 'DB Sep-30'
# Try loading live sector momentum (computed from DB + Kite staging + NSE live)
if os.path.exists(SECTOR_JSON):
    try:
        with open(SECTOR_JSON) as f:
            live_sm = json.load(f)
        for idx, v in live_sm.items():
            sector_momentum[idx] = {'bullish': v['bullish'], 'close': v['close'],
                                    'ema20': v.get('ema20',0), 'sma20': v['sma20']}
        sector_data_source = 'Live (NSE+Kite Oct-23)'
        print(f"Loaded live sector momentum for {len(sector_momentum)} indices", file=sys.stderr)
    except Exception as e:
        print(f"Warning: could not load live sector momentum: {e}", file=sys.stderr)

# Fallback to DB if needed
if not sector_momentum:
    try:
        r = subprocess.run(
            ['sqlite3', DB_PATH,
             "SELECT index_symbol, close, "
             "(SELECT AVG(c2) FROM (SELECT close as c2 FROM IndexOHLCV WHERE index_symbol=i1.index_symbol AND trade_date<='2026-09-30' ORDER BY trade_date DESC LIMIT 20)) as sma20 "
             "FROM IndexOHLCV i1 WHERE i1.trade_date='2026-09-30' ORDER BY i1.index_symbol;"],
            capture_output=True, text=True)
        for line in r.stdout.strip().split('\n'):
            parts = line.split('|')
            if len(parts) == 3:
                idx, close, sma20 = parts[0], float(parts[1]), float(parts[2])
                sector_momentum[idx] = {'bullish': close > sma20, 'close': close, 'sma20': sma20}
        sector_data_source = 'DB Sep-30 (stale)'
    except Exception as e:
        print(f"Warning: could not load sector momentum: {e}", file=sys.stderr)

def get_sector_momentum(sector_name):
    nifty_idx = SECTOR_INDEX_MAP.get(sector_name, 'NIFTY 500')
    sm = sector_momentum.get(nifty_idx)
    if sm is None:
        return {'index': nifty_idx, 'bullish': None, 'label': 'N/A'}
    return {'index': nifty_idx, 'bullish': sm['bullish'], 'label': 'BULLISH' if sm['bullish'] else 'BEARISH'}

# ── 3. Enrich stocks with sector momentum, dual momentum & signal dates ────────
tier_counts = {1:0, 2:0, 3:0, 4:0}
for s in stocks:
    pc = s.get('passCount', 0)
    if pc >= 4: s['tier'] = 1
    elif pc >= 2: s['tier'] = 2
    elif pc == 1: s['tier'] = 3
    else: s['tier'] = 4
    tier_counts[s['tier']] += 1

    # Extract signal dates from strategy detail fields
    s['signalDates'] = extract_signal_dates(s)
    # Most recent signal date across all strategies
    all_sig_dates = list(s['signalDates'].values())
    s['latestSignalDate'] = max(all_sig_dates) if all_sig_dates else ''

    sm = get_sector_momentum(s.get('sector',''))
    s['sectorIndex'] = sm['index']
    s['sectorMomentum'] = sm['label']
    s['sectorBullish'] = sm['bullish']
    stock_bullish = s.get('aboveSma50', False)
    if stock_bullish and sm['bullish']:
        s['dualMomentum'] = 'DOUBLE_BULLISH'
    elif stock_bullish:
        s['dualMomentum'] = 'STOCK_ONLY'
    elif sm['bullish']:
        s['dualMomentum'] = 'SECTOR_ONLY'
    else:
        s['dualMomentum'] = 'NEITHER'

# ── 4. Load pre-fetched summaries (from workflow) or fall back to auto-gen ─────
SUMMARIES_JSON = '/tmp/wealthos_summaries.json'
_prebuilt_summaries = {}
if os.path.exists(SUMMARIES_JSON):
    try:
        with open(SUMMARIES_JSON) as _f:
            _raw = json.load(_f)
        for _sym, _rec in _raw.items():
            if isinstance(_rec, dict) and _rec.get('summary'):
                _prebuilt_summaries[_sym] = _rec
        print(f"Loaded {len(_prebuilt_summaries)} pre-fetched summaries from {SUMMARIES_JSON}", file=sys.stderr)
    except Exception as _e:
        print(f"Warning: could not load summaries JSON: {_e}", file=sys.stderr)

def gen_summary(s):
    sym = s['symbol']
    cmp = s.get('cmp', 0)
    ret90 = s.get('return90d', 0)
    rsi   = s.get('rsi', 0)
    sigs  = s.get('signals', [])
    prom  = s.get('promoterPct')
    roce  = s.get('rocePct')
    roe   = s.get('roePct')
    pled  = s.get('pledgedPct')
    cfratio = s.get('cfRatio')
    pq    = s.get('profitableQuarters', 0)
    pc    = s.get('passCount', 0)
    tier  = s.get('tier', 4)
    sec   = s.get('sector', 'Unknown')
    vs    = s.get('volSurge', 1.0)
    dm    = s.get('dualMomentum', 'NEITHER')
    high52 = s.get('high52w', cmp)
    pct52  = s.get('pctFrom52wHigh', 0)

    tier_label = ['', 'Elite (Tier 1)', 'Strong (Tier 2)', 'Emerging (Tier 3)', 'Speculative (Tier 4)'][tier]
    dm_label = {'DOUBLE_BULLISH': 'dual momentum (both stock & sector bullish)', 'STOCK_ONLY': 'stock momentum without sector tailwind', 'SECTOR_ONLY': 'sector momentum without stock breakout', 'NEITHER': 'no current momentum alignment'}.get(dm, '')

    promo_txt = f"Promoter holding stands at {prom:.1f}%" if prom else "Promoter data unavailable"
    roce_txt  = f"ROCE of {roce:.1f}%" if roce else "ROCE data not available"
    roe_txt   = f"ROE of {roe:.1f}%" if roe else "ROE data not available"
    pledge_txt = f"pledge-free" if pled == 0 or pled is None else f"pledging at {pled:.1f}%"
    cf_txt    = f"CFO/OP ratio of {cfratio:.2f}" if cfratio else "cash flow data pending"
    pq_txt    = f"{pq} of last 8 quarters profitable" if pq else "profitability track record under review"

    sig_desc = {
        'S1A': 'VPA 3-Leg Swing (price-volume momentum reversal)',
        'S1B': 'VPA Trough Reversal (volume-confirmed low)',
        'S2A': 'Institutional FVG/CE (fair-value gap with institutional footprint)',
        'S3A': 'HH/HL SMA50 Trend (higher highs above 50-day MA)',
        'S4A': 'Gap Running (opening gap continuation)',
        'S4B': 'Gap RSI Support (gap with RSI reset)',
        'S5A': 'Minervini VCP (volatility contraction pattern)',
    }
    triggered = '; '.join(sig_desc.get(sg, sg) for sg in sigs)

    return f"""{sym} ({sec}) is a {tier_label} candidate flagged across {len(sigs)} of 7 proprietary strategies over the past 90 trading sessions. The active strategies are: {triggered}. These signals indicate {dm_label} at the current market price of ₹{cmp:.0f}, which sits {abs(pct52):.1f}% {'below' if pct52<0 else 'above'} the 52-week high of ₹{high52:.0f}.

The 90-day price return is {ret90:+.1f}%, with RSI at {rsi:.1f} suggesting the stock is in {'oversold territory with reversal potential' if rsi<40 else 'a neutral zone with momentum building' if rsi<60 else 'bullish momentum territory'}. Volume surge ratio of {vs:.2f}x indicates {'above-average institutional interest' if vs>1.5 else 'moderate trading activity'}.

Fundamentally, {promo_txt}, which {'exceeds' if prom and prom>=66.6 else 'falls below'} the 66.6% promoter-conviction threshold. The business shows {roce_txt} {'(surpassing the 35% quality bar)' if roce and roce>=35 else '(below the 35% quality benchmark)'}. Shareholder value creation stands at {roe_txt} {'(above the 25% threshold)' if roe and roe>=25 else '(below the 25% benchmark)'}. The company is {pledge_txt}. Earnings durability: {pq_txt}. Cash conversion quality: {cf_txt}.

Sector context: {sym} operates in the {sec} sector, mapped to {s.get('sectorIndex','NIFTY 500')}, currently showing {s.get('sectorMomentum','N/A')} momentum as of the last sector scan (Sep 30, 2026). The {'dual momentum alignment creates a high-conviction setup' if dm=='DOUBLE_BULLISH' else 'lack of sector tailwind calls for selective position sizing' if dm=='STOCK_ONLY' else 'sector strength without stock confirmation warrants patience' if dm=='SECTOR_ONLY' else 'absence of both stock and sector momentum calls for watchlist monitoring only'}.

Overall, with {pc} of 7 fundamental filters passed, {sym} is categorized as {tier_label} — {'a high-quality compounding candidate worth active position management' if tier==1 else 'a solid business worth sizing with prudence' if tier==2 else 'a watch-and-wait name pending more fundamental confirmation' if tier==3 else 'a speculative play driven primarily by technical signals with fundamental work still needed'}. Monitor next earnings for catalyst confirmation."""

# ── 4b. Pre-compute sector pills HTML (used in f-string) ──────────────────────
_SECTOR_DISPLAY = [
    ('NIFTY IT',          'IT'),
    ('NIFTY MEDIA',       'MEDIA'),
    ('NIFTY PHARMA',      'PHARMA'),
    ('NIFTY AUTO',        'AUTO'),
    ('NIFTY BANK',        'BANK'),
    ('NIFTY FMCG',        'FMCG'),
    ('NIFTY METAL',       'METAL'),
    ('NIFTY INFRA',       'INFRA'),
    ('NIFTY ENERGY',      'ENERGY'),
    ('NIFTY FIN SERVICE', 'FIN SVC'),
    ('NIFTY REALTY',      'REALTY'),
    ('NIFTY CONSUMPTION', 'CONSUMP'),
]
_pill_parts = []
for _idx, _label in _SECTOR_DISPLAY:
    _sm = sector_momentum.get(_idx)
    if _sm:
        _bull = _sm.get('bullish', False)
        _cls  = 'smom-bull' if _bull else 'smom-bear'
        _arrow = '↑' if _bull else '↓'
        _close = _sm.get('close', 0)
        _pill_parts.append(
            f'<span class="smom-pill {_cls}">{_label} {_arrow} {_close:.0f}</span>'
        )
sector_pills_html = '\n  '.join(_pill_parts) if _pill_parts else \
    '<span style="color:var(--fg3);font-size:11px">Sector data unavailable</span>'

# ── 5. Sort stocks ────────────────────────────────────────────────────────────
# Count stocks with at least one fresh signal (within 90-day window)
fresh_stock_count = sum(1 for s in stocks if s.get('latestSignalDate',''))
stale_stock_count = len(stocks) - fresh_stock_count

sorted_stocks = sorted(stocks, key=lambda s: (-len(s.get('signals',[])), -s.get('passCount',0), -s.get('return90d',0)))

# Top 50 get summaries — use pre-fetched (real company data) if available, else auto-gen
for i, s in enumerate(sorted_stocks):
    if i < 50:
        sym = s['symbol']
        prebuilt = _prebuilt_summaries.get(sym)
        if prebuilt and prebuilt.get('summary'):
            # Store enriched fields for modal display
            s['fundamentalSummary'] = prebuilt['summary']
            s['companyAbout']   = prebuilt.get('about', '')
            s['companyProducts'] = prebuilt.get('products', '')
            s['companyPeers']   = prebuilt.get('peers', '')
            s['revenueTrend']   = prebuilt.get('revenuetrend', '')
            s['profitTrend']    = prebuilt.get('profittrend', '')
        else:
            s['fundamentalSummary'] = gen_summary(s)
            s['companyAbout'] = s['companyProducts'] = s['companyPeers'] = ''
            s['revenueTrend'] = s['profitTrend'] = ''
    else:
        s['fundamentalSummary'] = None
        s['companyAbout'] = s['companyProducts'] = s['companyPeers'] = ''
        s['revenueTrend'] = s['profitTrend'] = ''

# ── 6. Render HTML ─────────────────────────────────────────────────────────────
stocks_json = json.dumps(sorted_stocks, separators=(',',':'))
sector_json = json.dumps(sector_momentum, separators=(',',':'))
sig_counts_json = json.dumps(sig_counts)
tier_counts_json = json.dumps(tier_counts)

html = f"""<!DOCTYPE html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WealthOS Analyst Dossier</title>
<meta name="description" content="7-Strategy Scan: {len(stocks)} stocks, {sum(sig_counts.values())} signals, {scan_date}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {{
  --bg: #0d1117; --bg2: #161b22; --bg3: #21262d; --bg4: #30363d;
  --fg: #e6edf3; --fg2: #8b949e; --fg3: #6e7681;
  --accent: #388bfd; --accent2: #1f6feb;
  --green: #3fb950; --red: #f85149; --yellow: #d29922; --purple: #a371f7;
  --orange: #d2a679; --cyan: #39d353;
  --t1: #3fb950; --t2: #388bfd; --t3: #d29922; --t4: #6e7681;
  --border: #30363d;
  color-scheme: dark;
}}
@media (prefers-color-scheme: light) {{
  :root:not([data-theme="dark"]) {{
    --bg: #f6f8fa; --bg2: #ffffff; --bg3: #f0f2f5; --bg4: #e8ebef;
    --fg: #24292f; --fg2: #57606a; --fg3: #6e7781;
    --accent: #0969da; --accent2: #1f6feb;
    --green: #1a7f37; --red: #cf222e; --yellow: #9a6700; --purple: #8250df;
    --border: #d0d7de;
    color-scheme: light;
  }}
}}
:root[data-theme="light"] {{
  --bg: #f6f8fa; --bg2: #ffffff; --bg3: #f0f2f5; --bg4: #e8ebef;
  --fg: #24292f; --fg2: #57606a; --fg3: #6e7781;
  --accent: #0969da; --accent2: #1f6feb; --green: #1a7f37;
  --red: #cf222e; --yellow: #9a6700; --purple: #8250df;
  --border: #d0d7de; color-scheme: light;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ background: var(--bg); color: var(--fg); font-family: 'Inter', system-ui, sans-serif; font-size: 13px; line-height: 1.5; }}
.header {{ background: var(--bg2); border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }}
.logo {{ font-size: 16px; font-weight: 700; color: var(--accent); letter-spacing: -0.3px; }}
.header-meta {{ color: var(--fg2); font-size: 11px; }}
.theme-btn {{ background: var(--bg3); border: 1px solid var(--border); color: var(--fg); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 11px; }}
.exec-summary {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr)); gap: 12px; padding: 16px 20px; background: var(--bg2); border-bottom: 1px solid var(--border); }}
.stat-card {{ background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }}
.stat-label {{ color: var(--fg2); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }}
.stat-value {{ font-size: 22px; font-weight: 700; color: var(--fg); font-variant-numeric: tabular-nums; }}
.stat-sub {{ color: var(--fg3); font-size: 11px; margin-top: 2px; }}
.strategy-bar {{ display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 20px; background: var(--bg2); border-bottom: 1px solid var(--border); align-items: center; }}
.strategy-bar-label {{ color: var(--fg2); font-size: 11px; margin-right: 4px; }}
.strat-pill {{ border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer; border: 2px solid transparent; transition: all .15s; }}
.strat-pill.active {{ border-color: currentColor; }}
.strat-S1A {{ background: rgba(56,139,253,.15); color: #388bfd; }}
.strat-S1B {{ background: rgba(63,185,80,.15); color: #3fb950; }}
.strat-S2A {{ background: rgba(163,113,247,.15); color: #a371f7; }}
.strat-S3A {{ background: rgba(210,151,122,.15); color: #d2a679; }}
.strat-S4A {{ background: rgba(57,211,83,.15); color: #39d353; }}
.strat-S4B {{ background: rgba(210,166,50,.15); color: #d2a679; }}
.strat-S5A {{ background: rgba(245,100,80,.15); color: #f85149; }}
.controls {{ display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 20px; background: var(--bg); border-bottom: 1px solid var(--border); align-items: center; }}
.search-box {{ background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; color: var(--fg); font-size: 13px; width: 220px; outline: none; }}
.search-box:focus {{ border-color: var(--accent); }}
.filter-group {{ display: flex; gap: 4px; }}
.filter-btn {{ background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; color: var(--fg2); cursor: pointer; font-size: 12px; transition: all .15s; white-space: nowrap; }}
.filter-btn:hover, .filter-btn.active {{ background: var(--accent); color: #fff; border-color: var(--accent); }}
.sort-btn {{ background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; color: var(--fg2); cursor: pointer; font-size: 12px; }}
.sort-btn.active {{ color: var(--accent); border-color: var(--accent); }}
.table-wrap {{ overflow-x: auto; }}
.data-table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
.data-table th {{ background: var(--bg3); color: var(--fg2); font-weight: 600; padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; cursor: pointer; user-select: none; position: sticky; top: 49px; z-index: 10; }}
.data-table th:hover {{ color: var(--fg); }}
.data-table td {{ padding: 7px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }}
.data-table tr:hover td {{ background: var(--bg2); }}
.data-table tr.highlight td {{ background: rgba(56,139,253,.06); }}
.symbol {{ font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); cursor: pointer; font-size: 12px; }}
.symbol:hover {{ text-decoration: underline; }}
.company-name {{ color: var(--fg); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.sector-badge {{ color: var(--fg2); font-size: 11px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.sig-chip {{ display: inline-block; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 700; margin: 1px; }}
.tier-badge {{ border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; }}
.tier-1 {{ background: rgba(63,185,80,.2); color: #3fb950; }}
.tier-2 {{ background: rgba(56,139,253,.2); color: #388bfd; }}
.tier-3 {{ background: rgba(210,153,34,.2); color: #d29922; }}
.tier-4 {{ background: rgba(110,118,129,.2); color: #8b949e; }}
.f-pass {{ color: var(--green); font-weight: 600; }}
.f-fail {{ color: var(--red); }}
.f-na {{ color: var(--fg3); }}
.val-up {{ color: var(--green); }}
.val-dn {{ color: var(--red); }}
.val-neu {{ color: var(--fg2); }}
.momentum-bull {{ color: var(--green); font-size: 11px; font-weight: 600; }}
.momentum-bear {{ color: var(--red); font-size: 11px; }}
.dual-bull {{ color: var(--cyan); font-weight: 700; font-size: 11px; }}
.dual-stock {{ color: var(--green); font-size: 11px; }}
.dual-sector {{ color: var(--yellow); font-size: 11px; }}
.dual-none {{ color: var(--fg3); font-size: 11px; }}
.sparkline-cell {{ width: 60px; }}
.count-badge {{ background: var(--bg4); border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--fg2); }}
.modal-overlay {{ display: none; position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 200; overflow-y: auto; }}
.modal-overlay.open {{ display: flex; align-items: flex-start; justify-content: center; padding: 20px; }}
.modal {{ background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; max-width: 820px; width: 100%; margin: auto; overflow: hidden; }}
.modal-header {{ padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }}
.modal-body {{ padding: 20px; }}
.modal-close {{ cursor: pointer; color: var(--fg2); font-size: 20px; line-height: 1; }}
.modal-close:hover {{ color: var(--fg); }}
.detail-grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }}
.detail-item {{ background: var(--bg3); border-radius: 6px; padding: 10px 12px; }}
.detail-label {{ color: var(--fg3); font-size: 11px; }}
.detail-value {{ font-size: 15px; font-weight: 600; color: var(--fg); font-variant-numeric: tabular-nums; }}
.summary-text {{ background: var(--bg3); border-radius: 6px; padding: 14px; color: var(--fg2); font-size: 12.5px; line-height: 1.7; margin-top: 12px; border-left: 3px solid var(--accent); }}
.f1f7-grid {{ display: grid; grid-template-columns: repeat(7,1fr); gap: 8px; margin: 12px 0; }}
.f-cell {{ background: var(--bg3); border-radius: 6px; padding: 8px 10px; text-align: center; }}
.f-cell-label {{ font-size: 10px; color: var(--fg3); margin-bottom: 3px; }}
.f-cell-val {{ font-size: 13px; font-weight: 700; }}
.f-cell.pass {{ border: 1px solid rgba(63,185,80,.4); }}
.f-cell.fail {{ border: 1px solid rgba(248,81,73,.4); }}
.f-cell.na {{ border: 1px solid var(--border); }}
.pagination {{ display: flex; gap: 6px; padding: 12px 20px; align-items: center; }}
.page-btn {{ background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; color: var(--fg2); cursor: pointer; font-size: 12px; }}
.page-btn.active {{ background: var(--accent); color: #fff; border-color: var(--accent); }}
.page-info {{ color: var(--fg2); font-size: 12px; }}
.no-results {{ text-align: center; padding: 40px; color: var(--fg2); }}
.sector-mom-block {{ padding: 12px 20px; background: var(--bg2); border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }}
.smom-label {{ font-size: 11px; color: var(--fg2); margin-right: 4px; font-weight: 500; }}
.smom-pill {{ border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; }}
.smom-bull {{ background: rgba(63,185,80,.2); color: #3fb950; }}
.smom-bear {{ background: rgba(248,81,73,.2); color: #f85149; }}
.data-note {{ color: var(--yellow); font-size: 10px; font-style: italic; margin-left: 8px; }}
canvas.sparkline {{ display: block; }}
.tab-bar {{ display: flex; gap: 2px; padding: 8px 20px 0; background: var(--bg); border-bottom: 1px solid var(--border); }}
.tab {{ padding: 7px 16px; cursor: pointer; border-radius: 6px 6px 0 0; color: var(--fg2); font-size: 13px; font-weight: 500; border: 1px solid transparent; border-bottom: none; }}
.tab.active {{ background: var(--bg2); border-color: var(--border); color: var(--fg); }}
.tab:hover:not(.active) {{ color: var(--fg); background: var(--bg3); }}
.result-count {{ color: var(--fg2); font-size: 12px; padding: 6px 20px; background: var(--bg); }}
</style>

<div class="header">
  <div class="logo">⚡ WealthOS Analyst Dossier</div>
  <div class="header-meta">Run ID: {run_id} &nbsp;|&nbsp; Scan Date: {scan_date} &nbsp;|&nbsp; 90-Day Window</div>
  <button class="theme-btn" onclick="toggleTheme()">🌓 Theme</button>
</div>

<div class="exec-summary">
  <div class="stat-card">
    <div class="stat-label">Unique Stocks</div>
    <div class="stat-value">{len(stocks)}</div>
    <div class="stat-sub">Across 7 strategies</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Total Signals</div>
    <div class="stat-value">{sum(sig_counts.values())}</div>
    <div class="stat-sub">90 trading sessions</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Tier 1 Elite</div>
    <div class="stat-value" style="color:var(--t1)">{tier_counts[1]}</div>
    <div class="stat-sub">≥4 F-filters pass</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Tier 2 Strong</div>
    <div class="stat-value" style="color:var(--t2)">{tier_counts[2]}</div>
    <div class="stat-sub">2-3 F-filters pass</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Tier 3 Emerging</div>
    <div class="stat-value" style="color:var(--t3)">{tier_counts[3]}</div>
    <div class="stat-sub">1 F-filter pass</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Tier 4 Speculative</div>
    <div class="stat-value" style="color:var(--fg3)">{tier_counts[4]}</div>
    <div class="stat-sub">No F-filters pass</div>
  </div>
  <div class="stat-card" style="border-color:rgba(57,211,83,.4)">
    <div class="stat-label">Fresh Signals</div>
    <div class="stat-value" style="color:var(--cyan)">{fresh_stock_count}</div>
    <div class="stat-sub" style="color:var(--red)">{stale_stock_count} stale (pre-90d) — re-scan needed</div>
  </div>
</div>

<section aria-label="Tier criteria" style="margin:16px 0;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;line-height:1.7">
  <div style="margin-bottom:8px;color:var(--fg2)">Cash-flow coverage: {sum(s.get('cfRatio') is not None for s in stocks)}/{len(stocks)} stocks. Trendlyne: {scan.get('cashFlowEnrichment', dict()).get('trendlyneStatus', 'not fetched')}. Financial reporting years are shown in stock details.</div>
  <strong>How tiers are assigned</strong>
  <div><span class="tier-badge tier-1">Elite</span> 4–7 of 7 fundamental filters passed &nbsp; <span class="tier-badge tier-2">Strong</span> 2–3 passed &nbsp; <span class="tier-badge tier-3">Emerging</span> 1 passed &nbsp; <span class="tier-badge tier-4">Speculative</span> 0 passed</div>
  <div style="margin-top:8px;color:var(--fg2)">F1: Promoter holding ≥66.6% · F2: ROCE ≥35% · F3: ROE ≥25% · F4: 8 profitable quarters · F5: Annual operating cash flow / operating EBITDA before exceptional items ≥0.5 · F6: Promoter pledge =0% · F7: Institutional involvement passes the stored fundamental check.</div>
  <div style="margin-top:8px;color:var(--fg2)">Only confirmed passes count. Missing data earns no point, so a lower tier can reflect incomplete financial coverage. F5 uses annual CFO / operating EBITDA before exceptional items. Trendlyne annual snapshots without a verified fiscal year are marked provisional and earn no confirmed F5 point. Missing or unusable ratios remain unavailable. Strategy signal count and sector momentum do not affect the tier.</div>
</section>

<div class="strategy-bar">
  <span class="strategy-bar-label">STRATEGIES:</span>
  <span class="strat-pill strat-S1B active" data-strat="S1B" onclick="toggleStrat(this)">S1B <span class="count-badge">{sig_counts.get('S1B',0)}</span></span>
  <span class="strat-pill strat-S2A active" data-strat="S2A" onclick="toggleStrat(this)">S2A <span class="count-badge">{sig_counts.get('S2A',0)}</span></span>
  <span class="strat-pill strat-S1A active" data-strat="S1A" onclick="toggleStrat(this)">S1A <span class="count-badge">{sig_counts.get('S1A',0)}</span></span>
  <span class="strat-pill strat-S4B active" data-strat="S4B" onclick="toggleStrat(this)">S4B <span class="count-badge">{sig_counts.get('S4B',0)}</span></span>
  <span class="strat-pill strat-S5A active" data-strat="S5A" onclick="toggleStrat(this)">S5A <span class="count-badge">{sig_counts.get('S5A',0)}</span></span>
  <span class="strat-pill strat-S4A active" data-strat="S4A" onclick="toggleStrat(this)">S4A <span class="count-badge">{sig_counts.get('S4A',0)}</span></span>
  <span class="strat-pill strat-S3A active" data-strat="S3A" onclick="toggleStrat(this)">S3A <span class="count-badge">{sig_counts.get('S3A',0)}</span></span>
  <span style="margin-left:auto;color:var(--fg3);font-size:11px">
    S1A=VPA Swing | S1B=VPA Trough | S2A=FVG/CE | S3A=HH/HL | S4A=Gap Run | S4B=Gap RSI | S5A=Minervini
  </span>
</div>

<div class="sector-mom-block">
  <span class="smom-label">LIVE SECTOR MOMENTUM ({sector_data_source}):</span>
  {sector_pills_html}
</div>

<div class="controls" aria-label="Signal date range">
  <label for="signalFrom">Signal from <input type="date" id="signalFrom" class="filter-btn" onchange="applyFilters()"></label>
  <label for="signalTo">through <input type="date" id="signalTo" class="filter-btn" onchange="applyFilters()"></label>
  <button class="filter-btn" onclick="clearSignalDates()">Clear dates</button>
  <span style="color:var(--fg2);font-size:12px">Matches at least one selected strategy’s signal; both dates included.</span>
  <span id="signalDateError" role="alert" style="color:var(--red)"></span>
</div>

<div class="controls">
  <input type="text" class="search-box" id="searchBox" placeholder="🔍  Search symbol, company, sector…" oninput="applyFilters()">
  <div class="filter-group">
    <button class="filter-btn" id="freshOnlyBtn" onclick="toggleFreshOnly(this)" title="Show only stocks with signal dates within the 90-day window. Stale = scan bug (re-run scan to fix)">⚡ Fresh Only</button>
  </div>
  <div class="filter-group">
    <span style="color:var(--fg2);font-size:12px;align-self:center">Min Signals:</span>
    <button class="filter-btn active" onclick="setMinSigs(1,this)">1+</button>
    <button class="filter-btn" onclick="setMinSigs(2,this)">2+</button>
    <button class="filter-btn" onclick="setMinSigs(3,this)">3+</button>
    <button class="filter-btn" onclick="setMinSigs(4,this)">4+</button>
  </div>
  <div class="filter-group">
    <span style="color:var(--fg2);font-size:12px;align-self:center">Momentum:</span>
    <button class="filter-btn active" onclick="setMomentum('all',this)">All</button>
    <button class="filter-btn" onclick="setMomentum('DOUBLE_BULLISH',this)">Dual ⚡</button>
    <button class="filter-btn" onclick="setMomentum('STOCK_ONLY',this)">Stock Only</button>
  </div>
  <div class="filter-group">
    <span style="color:var(--fg2);font-size:12px;align-self:center">Sort:</span>
    <button class="sort-btn active" id="sort-signals" onclick="setSort('signals',this)" title="Most signals picked (across all strategies)">Signals ↓</button>
    <button class="sort-btn" id="sort-latest" onclick="setSort('latest',this)" title="Most recent signal date first">Latest Signal</button>
    <button class="sort-btn" id="sort-fpass" onclick="setSort('fpass',this)">F-Pass ↓</button>
    <button class="sort-btn" id="sort-return" onclick="setSort('return',this)">90d Ret ↓</button>
    <button class="sort-btn" id="sort-rsi" onclick="setSort('rsi',this)">RSI</button>
    <button class="sort-btn" id="sort-vol" onclick="setSort('vol',this)">Vol ↓</button>
    <button class="sort-btn" id="sort-cmp" onclick="setSort('cmp',this)">CMP ↓</button>
  </div>
</div>

<div class="tab-bar">
  <div class="tab active" onclick="setTierFilter(0,this)">All <span class="count-badge">{len(stocks)}</span></div>
  <div class="tab" onclick="setTierFilter(1,this)">🟢 Tier 1 Elite <span class="count-badge">{tier_counts[1]}</span></div>
  <div class="tab" onclick="setTierFilter(2,this)">🔵 Tier 2 Strong <span class="count-badge">{tier_counts[2]}</span></div>
  <div class="tab" onclick="setTierFilter(3,this)">🟡 Tier 3 Emerging <span class="count-badge">{tier_counts[3]}</span></div>
  <div class="tab" onclick="setTierFilter(4,this)">⬜ Tier 4 Speculative <span class="count-badge">{tier_counts[4]}</span></div>
</div>

<div class="result-count" id="resultCount">Showing {len(stocks)} stocks</div>

<div class="table-wrap">
<table class="data-table" id="mainTable">
<thead>
<tr>
  <th onclick="setSort('signals',document.getElementById('sort-signals'))" title="Total signal count across all strategies in 90d">Signals ↓</th>
  <th>Symbol</th>
  <th>Company</th>
  <th>Sector</th>
  <th>CMP</th>
  <th onclick="setSort('return',document.getElementById('sort-return'))">90d Ret%</th>
  <th>RSI</th>
  <th>Vol Surge</th>
  <th onclick="setSort('latest',document.getElementById('sort-latest'))" title="Strategy chips with signal date — click to sort by most recent">Strategies (Date)</th>
  <th>Tier</th>
  <th>Dual Mom</th>
  <th>F1 Prom%</th>
  <th>F2 ROCE%</th>
  <th>F3 ROE%</th>
  <th>F4 ProfQ</th>
  <th title="Annual CFO / operating EBITDA; P means provisional fiscal period">F5 CFO/EBITDA</th>
  <th>F6 Pledge</th>
  <th>F7 Inst</th>
  <th>F-Pass</th>
  <th>Sparkline</th>
</tr>
</thead>
<tbody id="tableBody"></tbody>
</table>
</div>

<div class="pagination" id="pagination"></div>

<div class="modal-overlay" id="modalOverlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-header">
      <div>
        <div style="font-size:18px;font-weight:700" id="modalTitle">Stock Detail</div>
        <div style="color:var(--fg2);font-size:13px" id="modalSub"></div>
      </div>
      <span class="modal-close" onclick="closeModal()">✕</span>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<script>
const ALL_DATA = {stocks_json};
const SECTOR_DATA = {sector_json};

const STRAT_COLORS = {{
  S1A:'#388bfd',S1B:'#3fb950',S2A:'#a371f7',S3A:'#d2a679',
  S4A:'#39d353',S4B:'#d2a679',S5A:'#f85149'
}};
const STRAT_DESC = {{
  S1A:'VPA 3-Leg Swing',S1B:'VPA Trough Reversal',S2A:'FVG/CE Institutional',
  S3A:'HH/HL SMA50 Trend',S4A:'Gap Running',S4B:'Gap RSI Support',S5A:'Minervini VCP'
}};

let activeStrats = new Set(['S1A','S1B','S2A','S3A','S4A','S4B','S5A']);
let tierFilter = 0, minSigs = 1, momentumFilter = 'all', freshOnly = false;
let sortKey = 'signals', sortAsc = false;
let searchText = '';
let page = 1;
const PAGE_SIZE = 50;

function toggleTheme(){{
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light';
}}

function toggleStrat(el){{
  const s = el.dataset.strat;
  if(activeStrats.has(s)) activeStrats.delete(s); else activeStrats.add(s);
  el.classList.toggle('active', activeStrats.has(s));
  page=1; render();
}}

function setTierFilter(t,el){{
  document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
  tierFilter=t; page=1; render();
}}

function setMinSigs(n,el){{
  document.querySelectorAll('.filter-btn').forEach(e=>{{if(e.onclick&&e.onclick.toString().includes('setMinSigs'))e.classList.remove('active')}});
  el.classList.add('active');
  minSigs=n; page=1; render();
}}

function setMomentum(m,el){{
  document.querySelectorAll('.filter-btn').forEach(e=>{{if(e.onclick&&e.onclick.toString().includes('setMomentum'))e.classList.remove('active')}});
  el.classList.add('active');
  momentumFilter=m; page=1; render();
}}

function setSort(k,el){{
  document.querySelectorAll('.sort-btn').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
  if(sortKey===k) sortAsc=!sortAsc; else {{sortKey=k;sortAsc=false;}}
  render();
}}

function applyFilters(){{
  searchText=document.getElementById('searchBox').value.toLowerCase();
  page=1; render();
}}

function toggleFreshOnly(el){{
  freshOnly=!freshOnly;
  el.classList.toggle('active', freshOnly);
  page=1; render();
}}

function clearSignalDates(){{
  document.getElementById('signalFrom').value='';
  document.getElementById('signalTo').value='';
  applyFilters();
}}

function signalInRange(stock, from, to, strategies){{
  return Object.entries(stock.signalDates||{{}}).some(([strategy,date])=>
    strategies.has(strategy) && date && (!from||date>=from) && (!to||date<=to));
}}

function getFiltered(){{
  let data=[...ALL_DATA];
  const from=document.getElementById('signalFrom').value;
  const to=document.getElementById('signalTo').value;
  const invalid=!!(from&&to&&from>to);
  document.getElementById('signalDateError').textContent=invalid?'Start date must be on or before end date.':'';
  if(invalid) return [];
  if(from||to) data=data.filter(s=>signalInRange(s,from,to,activeStrats));
  if(tierFilter>0) data=data.filter(s=>s.tier===tierFilter);
  if(freshOnly) data=data.filter(s=>s.latestSignalDate&&s.latestSignalDate!=='');
  if(minSigs>1) data=data.filter(s=>s.signals.length>=minSigs);
  if(momentumFilter!=='all') data=data.filter(s=>s.dualMomentum===momentumFilter||(momentumFilter==='STOCK_ONLY'&&(s.dualMomentum==='DOUBLE_BULLISH'||s.dualMomentum==='STOCK_ONLY')));
  if(activeStrats.size<7) data=data.filter(s=>s.signals.some(sg=>activeStrats.has(sg)));
  if(searchText) data=data.filter(s=>(s.symbol+'').toLowerCase().includes(searchText)||(s.companyName+'').toLowerCase().includes(searchText)||(s.sector+'').toLowerCase().includes(searchText));

  const mult = sortAsc?1:-1;
  const sortFns={{
    signals:(a,b)=>mult*(a.signals.length-b.signals.length)||mult*(a.passCount-b.passCount)||(b.return90d-a.return90d),
    latest:(a,b)=>{{
      const da=a.latestSignalDate||'', db=b.latestSignalDate||'';
      return mult*(da>db?1:da<db?-1:0) || mult*(a.signals.length-b.signals.length);
    }},
    fpass:(a,b)=>mult*(a.passCount-b.passCount)||mult*(a.signals.length-b.signals.length),
    return:(a,b)=>mult*(a.return90d-b.return90d),
    rsi:(a,b)=>mult*(a.rsi-b.rsi),
    vol:(a,b)=>mult*(a.volSurge-b.volSurge),
    cmp:(a,b)=>mult*(a.cmp-b.cmp),
  }};
  data.sort(sortFns[sortKey]||sortFns.signals);
  return data;
}}

function fmt(v,d=1){{return v==null?'—':(+v).toFixed(d);}}
function fmtPct(v){{if(v==null)return'—';const cl=v>=0?'val-up':'val-dn';return`<span class="${{cl}}">${{v>=0?'+':''}}${{(+v).toFixed(1)}}%</span>`;}}

function renderSparkline(arr){{
  const w=60,h=22;
  if(!arr||!arr.length) return`<canvas class="sparkline" width="${{w}}" height="${{h}}"></canvas>`;
  const id='sp'+Math.random().toString(36).slice(2);
  setTimeout(()=>{{
    const c=document.getElementById(id);
    if(!c)return;
    const ctx=c.getContext('2d');
    const mn=Math.min(...arr),mx=Math.max(...arr);
    const range=mx-mn||1;
    ctx.strokeStyle=arr[arr.length-1]>=arr[0]?'#3fb950':'#f85149';
    ctx.lineWidth=1.5; ctx.beginPath();
    arr.forEach((v,i)=>{{const x=i/(arr.length-1)*w,y=h-(v-mn)/range*(h-4)-2;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}});
    ctx.stroke();
  }},0);
  return`<canvas class="sparkline" id="${{id}}" width="${{w}}" height="${{h}}"></canvas>`;
}}

function fCell(label,val,pass){{
  const cls=pass===true?'pass':pass===false?'fail':'na';
  const color=pass===true?'#3fb950':pass===false?'#f85149':'#6e7681';
  return`<div class="f-cell ${{cls}}"><div class="f-cell-label">${{label}}</div><div class="f-cell-val" style="color:${{color}}">${{val==null?'N/A':typeof val==='boolean'?(val?'✓':'✗'):val}}</div></div>`;
}}

function renderRow(s){{
  const sigs=s.signals;
  const sd=s.signalDates||{{}};
  const sigChips=sigs.map(sg=>{{
    const dt=sd[sg]||'';
    const dtShort=dt?dt.slice(5).replace('-','/'):''; // MM/DD
    return`<span class="sig-chip" style="background:${{STRAT_COLORS[sg]}}22;color:${{STRAT_COLORS[sg]}};line-height:1.2;text-align:center">${{sg}}${{dtShort?`<br><small style="font-size:9px;opacity:.8">${{dtShort}}</small>`:''}}</span>`;
  }}).join('');
  const tierCls=`tier-${{s.tier}}`;
  const tierLabel=['','Elite','Strong','Emerging','Spec'][s.tier];
  const dmClass={{DOUBLE_BULLISH:'dual-bull',STOCK_ONLY:'dual-stock',SECTOR_ONLY:'dual-sector',NEITHER:'dual-none'}}[s.dualMomentum]||'dual-none';
  const dmLabel={{DOUBLE_BULLISH:'⚡ Dual',STOCK_ONLY:'📈 Stock',SECTOR_ONLY:'🌐 Sector',NEITHER:'—'}}[s.dualMomentum]||'—';
  const f=s.filters||{{}};
  const fv=(k,v)=>{{const p=f[k];return`<td class="${{p===true?'f-pass':p===false?'f-fail':'f-na'}}">${{v==null?'—':(+v).toFixed(1)}}</td>`;}};
  const sym=s.symbol;
  return`<tr onclick="openModal('${{sym}}')" style="cursor:pointer">
    <td style="text-align:center;font-weight:700">${{sigs.length}}</td>
    <td><span class="symbol" onclick="event.stopPropagation();openModal('${{sym}}')">${{sym}}</span></td>
    <td><span class="company-name" title="${{s.companyName}}">${{s.companyName||s.symbol}}</span></td>
    <td><span class="sector-badge" title="${{s.sector}}">${{s.sector||'—'}}</span></td>
    <td style="font-variant-numeric:tabular-nums">₹${{fmt(s.cmp,0)}}</td>
    <td>${{fmtPct(s.return90d)}}</td>
    <td class="${{s.rsi<40?'val-up':s.rsi>60?'val-dn':'val-neu'}}">${{fmt(s.rsi,1)}}</td>
    <td class="${{s.volSurge>1.5?'val-up':'val-neu'}}">${{fmt(s.volSurge,2)}}x</td>
    <td>${{sigChips}}</td>
    <td><span class="tier-badge ${{tierCls}}">${{tierLabel}}</span></td>
    <td class="${{dmClass}}">${{dmLabel}}</td>
    ${{fv('F1_promoter',s.promoterPct)}}
    ${{fv('F2_roce',s.rocePct)}}
    ${{fv('F3_roe',s.roePct)}}
    <td class="${{f.F4_profitable8q===true?'f-pass':f.F4_profitable8q===false?'f-fail':'f-na'}}">${{s.profitableQuarters!=null?s.profitableQuarters+'/8':'—'}}</td>
    <td class="${{f.F5_cashflow===true?'f-pass':f.F5_cashflow===false?'f-fail':'f-na'}}" title="${{s.cashFlowEvidence?.period||'Unavailable'}}">${{s.cfRatio==null?'—':fmt(s.cfRatio,2)+(s.cashFlowEvidence?.periodVerified===false?' P':'')}}</td>
    <td class="${{f.F6_noPledge===true?'f-pass':f.F6_noPledge===false?'f-fail':'f-na'}}">${{s.pledgedPct!=null?s.pledgedPct.toFixed(1)+'%':'—'}}</td>
    <td class="${{f.F7_institutional===true?'f-pass':f.F7_institutional===false?'f-fail':'f-na'}}">${{f.F7_institutional===true?'✓':f.F7_institutional===false?'✗':'—'}}</td>
    <td style="font-weight:700;color:${{['','#3fb950','#388bfd','#d29922','#6e7681'][s.tier]}}">${{s.passCount}}/7</td>
    <td class="sparkline-cell">${{renderSparkline(s.sparkline)}}</td>
  </tr>`;
}}

function render(){{
  const data=getFiltered();
  const total=data.length;
  const pages=Math.ceil(total/PAGE_SIZE);
  page=Math.min(page,pages||1);
  const slice=data.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  document.getElementById('resultCount').textContent=`Showing ${{slice.length}} of ${{total}} stocks`;
  document.getElementById('tableBody').innerHTML=slice.length?slice.map(renderRow).join(''):`<tr><td colspan="20" class="no-results">No stocks match the current filters.</td></tr>`;

  const pg=document.getElementById('pagination');
  if(pages<=1){{pg.innerHTML='';return;}}
  let btns=`<span class="page-info">Page ${{page}} of ${{pages}}</span>`;
  for(let p2=1;p2<=pages;p2++){{
    if(p2===1||p2===pages||Math.abs(p2-page)<=2)
      btns+=`<button class="page-btn${{p2===page?' active':''}}" onclick="goPage(${{p2}})">${{p2}}</button>`;
    else if(Math.abs(p2-page)===3)btns+=`<span style="color:var(--fg3)">…</span>`;
  }}
  pg.innerHTML=btns;
}}

function goPage(p2){{page=p2;render();window.scrollTo(0,0);}}

function openModal(sym){{
  const s=ALL_DATA.find(x=>x.symbol===sym);
  if(!s)return;
  const f=s.filters||{{}};
  document.getElementById('modalTitle').textContent=`${{s.symbol}} — ${{s.companyName||sym}}`;
  document.getElementById('modalSub').textContent=`${{s.sector}} | CMP ₹${{s.cmp}} | ${{s.signals.length}} signals | Tier ${{s.tier}} | ${{s.sectorIndex}}`;

  const dmColors={{DOUBLE_BULLISH:'#39d353',STOCK_ONLY:'#3fb950',SECTOR_ONLY:'#d29922',NEITHER:'#6e7681'}};
  const dmText={{DOUBLE_BULLISH:'⚡ DOUBLE BULLISH — Both stock & sector aligned',STOCK_ONLY:'📈 Stock bullish, sector lagging',SECTOR_ONLY:'🌐 Sector bullish, stock not confirming',NEITHER:'No momentum alignment currently'}};

  document.getElementById('modalBody').innerHTML=`
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">CMP</div><div class="detail-value">₹${{fmt(s.cmp,2)}}</div></div>
      <div class="detail-item"><div class="detail-label">90d Return</div><div class="detail-value" style="color:${{s.return90d>=0?'#3fb950':'#f85149'}}">${{s.return90d>=0?'+':''}}${{fmt(s.return90d,1)}}%</div></div>
      <div class="detail-item"><div class="detail-label">RSI (14)</div><div class="detail-value">${{fmt(s.rsi,1)}}</div></div>
      <div class="detail-item"><div class="detail-label">SMA20</div><div class="detail-value">₹${{fmt(s.sma20,1)}}</div></div>
      <div class="detail-item"><div class="detail-label">SMA50</div><div class="detail-value">₹${{fmt(s.sma50,1)}}</div></div>
      <div class="detail-item"><div class="detail-label">52W High</div><div class="detail-value">₹${{fmt(s.high52w,0)}} <span style="font-size:11px;color:#f85149">${{fmt(s.pctFrom52wHigh,1)}}%</span></div></div>
      <div class="detail-item"><div class="detail-label">Vol Surge</div><div class="detail-value">${{fmt(s.volSurge,2)}}x</div></div>
      <div class="detail-item"><div class="detail-label">Sector Index</div><div class="detail-value" style="font-size:12px">${{s.sectorIndex}}</div></div>
      <div class="detail-item"><div class="detail-label">Dual Momentum</div><div class="detail-value" style="font-size:12px;color:${{dmColors[s.dualMomentum]}}">${{dmText[s.dualMomentum]}}</div></div>
    </div>
    <div style="margin-bottom:10px;color:var(--fg2);font-size:12px;font-weight:600">FUNDAMENTAL FILTERS (F1–F7)</div>
    <div class="f1f7-grid">
      ${{fCell('F1 Promoter',s.promoterPct!=null?s.promoterPct.toFixed(1)+'%':'N/A',f.F1_promoter)}}
      ${{fCell('F2 ROCE',s.rocePct!=null?s.rocePct.toFixed(1)+'%':'N/A',f.F2_roce)}}
      ${{fCell('F3 ROE',s.roePct!=null?s.roePct.toFixed(1)+'%':'N/A',f.F3_roe)}}
      ${{fCell('F4 Prof8Q',s.profitableQuarters!=null?s.profitableQuarters+'/8':'N/A',f.F4_profitable8q)}}
      ${{fCell('F5 CFO/EBITDA',s.cfRatio!=null?s.cfRatio.toFixed(2):'N/A',f.F5_cashflow)}}
      ${{fCell('F6 Pledge',s.pledgedPct!=null?s.pledgedPct.toFixed(1)+'%':'N/A',f.F6_noPledge)}}
      ${{fCell('F7 Inst',f.F7_institutional===true?'Yes':f.F7_institutional===false?'No':'N/A',f.F7_institutional)}}
    </div>
    ${{s.cashFlowEvidence?`<div style="margin:10px 0;color:var(--fg2);font-size:12px">F5 basis: ${{s.cashFlowEvidence.period}} · ${{s.cashFlowEvidence.denominator}} · CFO ₹${{fmt(s.cashFlowEvidence.cfoINR/1e7,2)}} Cr / operating EBITDA ₹${{fmt(s.cashFlowEvidence.operatingIncomeINR/1e7,2)}} Cr · <a href="${{s.cashFlowEvidence.sourceUrl}}" target="_blank" rel="noopener">${{s.cashFlowEvidence.source}}</a> · Fetched ${{s.cashFlowEvidence.fetchedAt.slice(0,10)}}. ${{s.cashFlowEvidence.scope}}. ${{s.cashFlowEvidence.periodVerified===false?'Provisional ratio: fiscal year not verified; no confirmed F5 point awarded.':''}} This is a current fundamentals snapshot, not historical signal-date fundamentals.</div>`:''}}
    <div style="margin-bottom:8px;color:var(--fg2);font-size:12px;font-weight:600">ACTIVE STRATEGIES &amp; SIGNAL DATES</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${{s.signals.map(sg=>{{
        const sd=(s.signalDates||{{}})[sg]||'';
        return`<span style="background:${{STRAT_COLORS[sg]}}22;color:${{STRAT_COLORS[sg]}};border:1px solid ${{STRAT_COLORS[sg]}}44;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600">${{sg}} — ${{STRAT_DESC[sg]}}${{sd?` <span style="opacity:.7;font-size:11px">(${{sd}})</span>`:''}}</span>`;
      }}).join('')}}
    </div>
    ${{s.latestSignalDate?`<div style="color:var(--fg3);font-size:11px;margin-bottom:12px">Latest signal: <strong style="color:var(--fg2)">${{s.latestSignalDate}}</strong></div>`:''}}

    ${{s.companyAbout?`<div style="background:var(--bg3);border-radius:6px;padding:10px 14px;margin-bottom:10px;border-left:3px solid var(--purple)"><span style="color:var(--fg3);font-size:11px;font-weight:600;text-transform:uppercase">Business</span><div style="color:var(--fg);font-size:12.5px;margin-top:4px">${{s.companyAbout}}</div></div>`:''}}
    ${{s.companyProducts?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><span style="color:var(--fg3);font-size:11px;align-self:center">Products/Services:</span>${{s.companyProducts.split(',').map(p=>`<span style="background:var(--bg4);border-radius:4px;padding:2px 8px;font-size:11px;color:var(--fg)">${{p.trim()}}</span>`).join('')}}</div>`:''}}
    ${{s.companyPeers?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center"><span style="color:var(--fg3);font-size:11px">Peers:</span>${{s.companyPeers.split(',').map(p=>`<span style="background:rgba(56,139,253,.15);color:#388bfd;border-radius:4px;padding:1px 7px;font-size:11px;font-family:monospace">${{p.trim()}}</span>`).join('')}}</div>`:''}}
    ${{s.revenueTrend||s.profitTrend?`<div style="display:flex;gap:10px;margin-bottom:12px">
      ${{s.revenueTrend?`<div style="flex:1;background:var(--bg3);border-radius:6px;padding:8px 12px"><div style="color:var(--fg3);font-size:10px;text-transform:uppercase">Revenue Trend</div><div style="color:var(--fg);font-size:12px;margin-top:3px">${{s.revenueTrend}}</div></div>`:''}}
      ${{s.profitTrend?`<div style="flex:1;background:var(--bg3);border-radius:6px;padding:8px 12px"><div style="color:var(--fg3);font-size:10px;text-transform:uppercase">Profit Trend</div><div style="color:var(--fg);font-size:12px;margin-top:3px">${{s.profitTrend}}</div></div>`:''}}
    </div>`:''}}
    ${{s.fundamentalSummary?`<div style="margin-bottom:8px;color:var(--fg2);font-size:12px;font-weight:600">ANALYST SUMMARY</div><div class="summary-text">${{s.fundamentalSummary}}</div>`:''}}
  `;
  document.getElementById('modalOverlay').classList.add('open');
}}

function closeModal(){{document.getElementById('modalOverlay').classList.remove('open');}}
document.addEventListener('keydown',e=>{{if(e.key==='Escape')closeModal();}});

render();
</script>
"""

with open(OUT_HTML, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Generated: {OUT_HTML} ({os.path.getsize(OUT_HTML)//1024}KB)")
print(f"Stocks: {len(stocks)}, Signals: {sum(sig_counts.values())}")
print(f"Tier distribution: {tier_counts}")