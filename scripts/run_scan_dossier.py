"""
run_scan_dossier.py
===================
Integrated orchestrator: TV data fetch → alphanumeric scan → F-filters → peers → dossier.

Usage:
  python run_scan_dossier.py                         # 7 sessions ending today
  python run_scan_dossier.py --end 2026-10-16        # specific end date
  python run_scan_dossier.py --end 2026-10-16 --days 7 --min-score 3
  python run_scan_dossier.py --skip-tv-fetch         # reuse existing tv_universe.json

Steps:
  1. fetch_tv_universe.py   → tv_universe.json, tv_peers.json   (skipped if fresh + --skip-tv-fetch)
  2. alphanumeric scan      → scan_results.json                  (C1-C7 against DailyOHLCV)
  3. fundamentals merge     → fundamentals.json                  (F1-F7, TV data, DB shareholding)
  4. dossier generation     → dossier_<date>.html
"""
import sys, json, os, sqlite3, math, argparse, shutil
from datetime import datetime, timedelta, date
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts', 'fundamental'))
from f_filter_engine import compute_f_filters, roce_trailing_4q
from source_waterfall import SourceWaterfallEngine

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(PROJECT_ROOT, 'portfolio.db')
TV_UNIVERSE_JSON = os.path.join(PROJECT_ROOT, 'tv_universe.json')
TV_PEERS_JSON    = os.path.join(PROJECT_ROOT, 'tv_peers.json')
TV_META_JSON     = os.path.join(PROJECT_ROOT, 'tv_universe_meta.json')

def step_banner(n, title):
    print(f"\n{'='*60}\nSTEP {n}: {title}\n{'='*60}")

def tv_data_is_fresh(max_age_hours=12):
    if not os.path.exists(TV_META_JSON): return False
    with open(TV_META_JSON) as f: meta = json.load(f)
    fetched = datetime.fromisoformat(meta.get('fetched_at', '2000-01-01'))
    return (datetime.now() - fetched).total_seconds() < max_age_hours * 3600


def get_scan_universe(db):
    """Return the active symbol universe, with a robust OHLCV fallback."""
    try:
        rows = db.execute("SELECT symbol FROM v_scan_universe_latest").fetchall()
        if rows:
            return [r[0] for r in rows]
    except sqlite3.Error:
        pass
    return [r[0] for r in db.execute("SELECT DISTINCT symbol FROM DailyOHLCV").fetchall()]


def fetch_ohlcv_batched(db, symbols, start_date, batch_size=200, end_date=None):
    """Fetch OHLCV in bounded IN() batches without manufacturing rows."""
    if batch_size > 500 or batch_size < 1:
        raise ValueError("batch_size must be between 1 and 500")
    rows = []
    for i in range(0, len(symbols), batch_size):
        batch = list(symbols[i:i + batch_size])
        if not batch:
            continue
        ph = ','.join(['?'] * len(batch))
        sql = f"""SELECT symbol, trade_date, open, high, low, close, volume
                  FROM DailyOHLCV WHERE symbol IN ({ph}) AND trade_date >= ?"""
        params = batch + [start_date]
        if end_date is not None:
            sql += " AND trade_date <= ?"
            params.append(end_date)
        sql += " ORDER BY symbol, trade_date"
        rows.extend(db.execute(sql, params).fetchall())
    return rows


def _build_sh_dict(rows):
    out = {}
    for r in rows:
        out[r[0]] = {'promoter_pct': r[1], 'fii_pct': r[2], 'dii_pct': r[3],
                     'pledge_pct': r[4], 'sh_quarter': r[5], 'sh_date': r[6]}
    return out


def _build_fin_dict(rows):
    out = {}
    for r in rows:
        out.setdefault(r[0], []).append({
            'period_label': r[1], 'statement_type': r[2], 'pat_cr': r[3],
            'sales_cr': r[4], 'opm_pct': r[5], 'cfo_cr': r[6],
            'borrowings_cr': r[7], 'total_assets_cr': r[8],
            'equity_capital_cr': r[9], 'reserves_cr': r[10], 'eps': r[11],
        })
    return out

# ─────────────────────────────────────────────────────────
# STEP 1: TV Universe + Peers
# ─────────────────────────────────────────────────────────
def run_tv_fetch(skip_if_fresh=False):
    step_banner(1, "TV Universe + Peer Fetch (NSE + BSE)")
    if skip_if_fresh and tv_data_is_fresh():
        print("tv_universe.json is fresh (<12h old) — skipping re-fetch.")
        with open(TV_UNIVERSE_JSON) as f: return json.load(f)
    script = os.path.join(PROJECT_ROOT, 'fetch_tv_universe.py')
    if not os.path.exists(script):
        raise FileNotFoundError(f"fetch_tv_universe.py not found in {PROJECT_ROOT}")
    import subprocess
    result = subprocess.run([sys.executable, '-I', script, '--out', PROJECT_ROOT],
                           capture_output=False)
    if result.returncode != 0:
        raise RuntimeError("fetch_tv_universe.py failed")
    with open(TV_UNIVERSE_JSON) as f: return json.load(f)

# ─────────────────────────────────────────────────────────
# STEP 2: Alphanumeric Scan (C1-C7)
# ─────────────────────────────────────────────────────────
def run_scan(end_date, n_sessions=7, min_score=3):
    step_banner(2, f"Alphanumeric Scan C1-C7 (last {n_sessions} sessions ending {end_date})")
    import numpy as np

    con = sqlite3.connect(DB_PATH)

    # Get last n_sessions trading dates up to end_date
    dates = [r[0] for r in con.execute("""
        SELECT DISTINCT trade_date FROM DailyOHLCV
        WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT ?
    """, (end_date, n_sessions)).fetchall()]
    if not dates:
        raise RuntimeError(f"No DailyOHLCV data for dates up to {end_date}")
    dates.reverse()
    session_start, session_end = dates[0], dates[-1]
    print(f"Sessions: {session_start} to {session_end} ({len(dates)} days)")

    # Load 220 sessions per symbol for SMA200
    all_dates = [r[0] for r in con.execute("""
        SELECT DISTINCT trade_date FROM DailyOHLCV
        WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT 220
    """, (end_date,)).fetchall()]
    all_dates.reverse()
    cutoff = all_dates[0]

    # Only symbols/dates in [cutoff, session_end] are needed; batch by symbol so
    # idx_daily_ohlcv_sym(symbol, trade_date) serves each range scan.
    from collections import defaultdict
    symbols = get_scan_universe(con)
    BATCH = 500

    def _batches():
        for i in range(0, len(symbols), BATCH):
            chunk = symbols[i:i+BATCH]
            rows = fetch_ohlcv_batched(con, chunk, cutoff, batch_size=BATCH,
                                       end_date=session_end)
            sd = defaultdict(list)
            for r in rows:
                sd[r[0]].append(r[1:])  # (date, o, h, l, c, vol)
            yield sd

    results = []
    for sym_data in _batches():
     for sym, ohlcv in sym_data.items():
            if len(ohlcv) < 20: continue
            dates_s = [r[0] for r in ohlcv]
            closes  = [r[4] for r in ohlcv]
            volumes = [r[5] for r in ohlcv]

            # Get indices for session window
            sess_idx = [i for i, d in enumerate(dates_s) if d >= session_start]
            if len(sess_idx) < n_sessions: continue
            sess_idx = sess_idx[-n_sessions:]
            if not sess_idx: continue

            last_idx = sess_idx[-1]
            last_close = closes[last_idx]
            if not last_close or last_close <= 0: continue

            # SMA20, SMA200
            sma20  = np.mean(closes[max(0,last_idx-19):last_idx+1]) if last_idx >= 19 else None
            sma200 = np.mean(closes[max(0,last_idx-199):last_idx+1]) if last_idx >= 199 else None

            # RSI-14
            delta = np.diff(closes[max(0,last_idx-14):last_idx+1])
            gains = [max(d,0) for d in delta]; losses = [-min(d,0) for d in delta]
            avg_g = np.mean(gains) if gains else 0; avg_l = np.mean(losses) if losses else 0
            rsi = 100 - 100/(1 + avg_g/avg_l) if avg_l > 0 else (100 if avg_g > 0 else 50)

            # 7-session window stats
            sess_closes  = [closes[i] for i in sess_idx]
            sess_volumes = [volumes[i] for i in sess_idx]
            first_close = sess_closes[0] if sess_closes[0] else None
            ret7 = (last_close/first_close - 1)*100 if first_close else 0
            hi7  = max(sess_closes)

            # Volume 20-day avg
            vol20 = np.mean(volumes[max(0,last_idx-19):last_idx+1])
            last_vol = volumes[last_idx]

            # Criteria
            C1 = sma20  is not None and last_close > sma20
            C2 = sma200 is not None and last_close > sma200
            C3 = ret7 > 0
            C4 = 40 <= rsi <= 70
            C5 = vol20 > 0 and last_vol > vol20 * 1.2
            C6 = np.mean(sess_closes[-3:]) > np.mean(sess_closes[:3]) * 0.97 if len(sess_closes) >= 6 else False
            C7 = hi7 > 0 and last_close >= hi7 * 0.87

            score = sum([C1,C2,C3,C4,C5,C6,C7])
            if score >= min_score:
                results.append({
                    'symbol': sym, 'score': score, 'ret7': round(ret7,2),
                    'last_close': round(last_close,2), 'rsi': round(rsi,1),
                    'sma20': round(sma20,2) if sma20 else None,
                    'sma200': round(sma200,2) if sma200 else None,
                    'hi7': round(hi7,2), 'last_vol': int(last_vol), 'vol20': round(vol20,1),
                    'session_start': session_start, 'session_end': session_end,
                    'C1':int(C1),'C2':int(C2),'C3':int(C3),'C4':int(C4),
                    'C5':int(C5),'C6':int(C6),'C7':int(C7),
                })

    con.close()
    results.sort(key=lambda x: (-x['score'], -x['ret7'], x['symbol']))
    print(f"Qualifying stocks (≥{min_score}/7): {len(results)}")
    return results

# ─────────────────────────────────────────────────────────
# STEP 3: Fundamentals merge (TV + DB shareholding/financials)
# ─────────────────────────────────────────────────────────
def run_fundamentals(scan_results, tv_universe):
    step_banner(3, "Fundamentals Merge (TV data + DB shareholding + DB financials)")
    if isinstance(scan_results, sqlite3.Connection):
        # Public filtered-query contract used by integration jobs. Keep the
        # legacy (scan_results, tv_universe) signature below for compatibility.
        db, qualifying_symbols = scan_results, list(tv_universe or [])
        if not qualifying_symbols:
            return {}, {}
        ph = ','.join('?' * len(qualifying_symbols))
        fin = db.execute(f"""SELECT symbol, period_label, statement_type,
                    net_profit_pat_cr, sales_cr, opm_pct, cfo_cr, borrowings_cr,
                    total_assets_cr, equity_capital_cr, reserves_cr, eps
                    FROM HistoricalFinancialStatements WHERE symbol IN ({ph})
                    AND (statement_type LIKE 'QUARTERLY%' OR statement_type LIKE 'Q%')
                    ORDER BY symbol, period_label DESC""", qualifying_symbols).fetchall()
        return SourceWaterfallEngine(db).get_shareholding(qualifying_symbols), _build_fin_dict(fin)
    qualifying_symbols = set(r['symbol'] for r in scan_results)

    # Build tv_dict from tv_universe (with compat aliases)
    tv_dict = {}
    for sym, entry in tv_universe.items():
        tv_dict[sym] = {**entry, 'rsi_tv': entry.get('rsi'),
                        'sma20_tv': entry.get('sma20'), 'sma200_tv': entry.get('sma200')}
    matched_tv = sum(1 for s in qualifying_symbols if s in tv_dict)
    print(f"TV matched: {matched_tv}/{len(qualifying_symbols)}")

    con = sqlite3.connect('file:' + DB_PATH.replace(chr(92),'/') + '?mode=ro', uri=True)

    syms = sorted(qualifying_symbols)
    chunks = [syms[i:i+900] for i in range(0, len(syms), 900)]
    waterfall = SourceWaterfallEngine(con)
    sh_dict = waterfall.get_shareholding(syms)
    # The evidence read connection remains zero-write. Conflict observations
    # use a short-lived, scoped audit connection to the v17 table instead.
    conflict_con = sqlite3.connect(DB_PATH)
    try:
        conflict_engine = SourceWaterfallEngine(conflict_con)
        for symbol in syms:
            conflict_engine.record_external_conflicts(symbol, tv_dict.get(symbol, {}))
    finally:
        conflict_con.close()
    print(f"Shareholding: {len(sh_dict)} symbols resolved through DB → CFS waterfall")

    # Financials (all quarters per qualifying symbol; F2 needs >=8)
    fin_dict = {}
    for ch in chunks:
        ph = ','.join('?'*len(ch))
        for row in con.execute(f"""
            SELECT symbol, period_label, statement_type, net_profit_pat_cr, sales_cr,
                   opm_pct, cfo_cr, borrowings_cr, total_assets_cr, equity_capital_cr,
                   reserves_cr, eps
            FROM HistoricalFinancialStatements
            WHERE (statement_type LIKE 'QUARTERLY%' OR statement_type LIKE 'Q%')
              AND symbol IN ({ph})
            ORDER BY symbol, period_label DESC
        """, ch):
            fin_dict.setdefault(row[0], []).append({
                'period':row[1],'pat_cr':row[3],'sales_cr':row[4],'opm_pct':row[5],
                'cfo_cr':row[6],'borrowings_cr':row[7],'total_assets_cr':row[8],
                'equity_cr':row[9],'reserves_cr':row[10],'eps':row[11],
            })
    con.close()
    print(f"Financials: {len(fin_dict)} symbols in DB")

    def _legacy_compute_f(sym, tv, sh, fin_q):
        pats = [q['pat_cr'] for q in (fin_q or [])[:8]]  # preserve None slots; engine needs 8-slot list to evaluate F2
        # Missing financial input => metric unknown (None); never substituted by 0.
        def _ebit(x):
            o, s_ = x.get('opm_pct'), x.get('sales_cr')
            return None if o is None or s_ is None else (o/100)*s_
        roce = None; roce_method = None
        if fin_q:
            q=fin_q[0]; ta=q.get('total_assets_cr'); borr=q.get('borrowings_cr')
            ce = None if ta is None or borr is None else ta-borr
            if ce is not None and ce>0:
                ebit4 = [_ebit(x) for x in fin_q[:4]]
                r4 = roce_trailing_4q(ebit4, ce) if len(ebit4) == 4 else None
                if r4 is not None:
                    roce = round(r4,1); roce_method = 'trailing4q'
                eb1 = _ebit(q)
                if roce is None and eb1 is not None and q.get('sales_cr')>0:
                    roce=round(eb1*4/ce*100,1); roce_method = 'single_q_x4'
        if roce is None and tv and tv.get('roa'):
            roce=round(tv['roa']*1.5,1); roce_method = 'tv_roa_fallback'
        roe_tv=tv.get('roe') if tv else None
        roe_db=None
        if fin_q:
            q=fin_q[0]; pat=q.get('pat_cr'); e_,r_=q.get('equity_cr'),q.get('reserves_cr')
            eq = None if e_ is None or r_ is None else e_+r_
            if pat is not None and eq is not None and eq>0: roe_db=round(pat*4/eq*100,1)
        roe=roe_tv if roe_tv is not None else roe_db
        cfoeb=None; cfo_s=None; eb_s=None
        r4=(fin_q or [])[:4]
        # Need all 4 quarters with known inputs; otherwise F7 is unknown (partial sum is not TTM).
        if len(r4)==4 and all(q.get('cfo_cr') is not None for q in r4) and all(_ebit(q) is not None for q in r4):
            cfo_s=sum(q['cfo_cr'] for q in r4); eb_s=sum(_ebit(q) for q in r4)
            if eb_s>0: cfoeb=round(cfo_s/eb_s,2)
        sh = sh or {}
        fii_, dii_ = sh.get('fii_pct'), sh.get('dii_pct')
        inst_now = (fii_+dii_) if fii_ is not None and dii_ is not None else None
        inst_chg = (inst_now - prev_inst[sym]) if inst_now is not None and sym in prev_inst else None
        # Retained only as a reference while the database output contract
        # migrates; production calls use ``compute_f`` below.
        from f_filter_engine import evaluate_f_filters
        res = evaluate_f_filters({
            'inst_pct': inst_now, 'inst_change_pp': inst_chg,
            'pats': pats, 'promoter_pct': sh.get('promoter_pct'), 'pledge_pct': sh.get('pledge_pct'),
            'roce': roce, 'roe': roe, 'fii_pct': sh.get('fii_pct'), 'dii_pct': sh.get('dii_pct'),
            'cfo_ebitda': cfoeb, 'cfo': cfo_s, 'ebitda': eb_s})
        f = dict(res)
        f.update(F1_promoter_pct=sh.get('promoter_pct'), F2_quarters_checked=len(pats),
                 F2_pats=[round(p,1) for p in pats], F3_roce=roce, F4_roe=roe,
                 F5_pledge_pct=sh.get('pledge_pct'), F7_cfo_ebitda=cfoeb,
                 F3_roce_method=roce_method, F6_inst_change_pp=None if inst_chg is None else round(inst_chg,3))
        f['f_score']=sum(1 for k in ('F1_pass','F2_pass','F3_pass','F4_pass','F5_pass','F6_pass','F7_pass') if f.get(k))
        return f

    def compute_f(sym, tv, sh, fin_q):
        return compute_f_filters(sym, tv or {}, sh or {}, fin_q or [])

    merged = []
    for r in scan_results:
        sym=r['symbol']; tv=tv_dict.get(sym); sh=sh_dict.get(sym); fin_q=fin_dict.get(sym,[])
        merged.append({**r,'tv':tv or {},'sh':sh or {},'fin_latest':fin_q[0] if fin_q else {},
                        'fin_quarters':fin_q[:8],'f_filters':compute_f(sym,tv,sh,fin_q)})
    print(f"Merged {len(merged)} stocks | TV:{matched_tv} | SH:{sum(1 for m in merged if m['sh'])} | FIN:{sum(1 for m in merged if m['fin_quarters'])}")
    return merged

# ─────────────────────────────────────────────────────────
# STEP 4: Dossier HTML
# ─────────────────────────────────────────────────────────
def run_dossier(merged, peers_db, out_path):
    step_banner(4, f"Generating Dossier → {out_path}")
    import json as _json

    data = sorted(merged, key=lambda x: (-x['score'], -x['ret7']))
    total = len(data)
    score_dist = {}
    for r in data: score_dist[r['score']] = score_dist.get(r['score'],0)+1

    def n(v,d=1):
        if v is None or (isinstance(v,float) and (math.isnan(v) or math.isinf(v))): return None
        try: return round(float(v),d)
        except: return None

    stock_js = []
    for r in data:
        sym=r['symbol']; tv=r.get('tv') or {}; f=r.get('f_filters') or {}; sh=r.get('sh') or {}
        c=[1 if r.get(f'C{i+1}') else 0 for i in range(7)]
        fv=[None if f.get(f'F{i+1}_pass') is None else (1 if f.get(f'F{i+1}_pass') else 0) for i in range(7)]
        shi=(sh['fii_pct']+sh['dii_pct']) if sh.get('fii_pct') is not None and sh.get('dii_pct') is not None else None
        stock_js.append([
            sym,r['score'],n(r['ret7'],2),n(r['last_close'],2),n(r.get('rsi'),1),
            n(tv.get('mkt_cap_cr'),0),n(tv.get('roe'),1),n(tv.get('opm'),1),n(tv.get('pe'),1),
            tv.get('sector') or '',c,fv,f.get('f_score',0),n(f.get('F3_roce'),1),n(f.get('F4_roe'),1),
            n(sh.get('promoter_pct'),1),n(shi,1),sh.get('sh_quarter') or '',
            n(r.get('sma20'),2),n(r.get('sma200'),2),n(tv.get('rel_vol'),2),n(r.get('hi7'),2),
            tv.get('tv_name') or sym,n(tv.get('pb'),2),n(tv.get('de_ratio'),2),
            n(tv.get('eps'),2),n(tv.get('revenue_cr'),0),n(tv.get('net_income_cr'),0),
            n(tv.get('div_yield'),1),n(tv.get('rec_all'),3),
            n(tv.get('perf_w'),1),n(tv.get('perf_1m'),1),n(tv.get('perf_3m'),1),
            n(tv.get('high_52w'),2),n(tv.get('low_52w'),2),n(tv.get('roa'),1),
            f.get('F2_quarters_checked',0),n(f.get('F7_cfo_ebitda'),2),
        ])

    peer_js = {}
    for r in data:
        sym=r['symbol']; p=peers_db.get(sym)
        if not p: continue
        med=p.get('medians') or {}; pct=p.get('percentiles') or {}; top=(p.get('top_peers') or [])[:8]
        peer_js[sym]={
            's':p.get('sector',''),'i':p.get('industry') or '','pl':p.get('peer_pool',''),'n':p.get('n_peers',0),
            'm':[n(med.get('pe'),1),n(med.get('roe'),1),n(med.get('opm'),1),n(med.get('pb'),2),n(med.get('de'),2)],
            'p':[pct.get('roe_pct'),pct.get('opm_pct'),pct.get('pe_pct'),pct.get('mc_rank'),pct.get('mc_total')],
            't':[[q.get('sym'),(q.get('name') or '')[:20],n(q.get('mkt_cap_cr'),0),n(q.get('pe'),1),
                  n(q.get('roe'),1),n(q.get('opm'),1),n(q.get('perf_1m'),1),n(q.get('rec'),2)] for q in top],
        }

    score7 = ', '.join(r['symbol'] for r in data if r['score']==7)[:120]
    end_date = data[0]['session_end'] if data else 'N/A'
    start_date = data[0]['session_start'] if data else 'N/A'

    # Minimal inline HTML with same JS engine as dossier_v3
    stock_json = _json.dumps(stock_js, separators=(',',':'))
    peer_json  = _json.dumps(peer_js,  separators=(',',':'))

    # Read dossier v3 generator output as template base (reuse CSS+JS from gen_dossier_v3)
    # Instead, embed directly here for portability
    from gen_dossier_v3 import CSS, JS as JS_TEMPLATE  # type: ignore
    # fallback if import fails
    CSS_FALLBACK = "body{font-family:sans-serif;margin:16px}"
    try:
        from importlib.util import spec_from_file_location, module_from_spec
        spec = spec_from_file_location("gen_v3",
            os.path.join(os.path.dirname(__file__), 'gen_dossier_v3.py'))
    except Exception:
        CSS_FALLBACK = None

    # Write dossier using same pattern as gen_dossier_v3.py (inline reuse)
    import subprocess, tempfile
    # Write data to temp files and call gen_dossier_v3 equivalent inline
    # For simplicity, reuse the scratchpad gen script via subprocess if available
    gen_v3 = os.path.join(os.path.dirname(__file__), 'gen_dossier_v3.py')
    if not os.path.exists(gen_v3):
        # Look in scratchpad
        import glob
        candidates = glob.glob(r'C:\Users\GOPALS~1\AppData\Local\Temp\claude\**\gen_dossier_v3.py', recursive=True)
        if candidates: gen_v3 = candidates[0]

    if os.path.exists(gen_v3):
        # Write temp inputs pointing to our in-memory data via temp files
        import tempfile, shutil as _sh
        tmp_dir = tempfile.mkdtemp()
        try:
            fund_tmp = os.path.join(tmp_dir, 'fundamentals.json')
            peer_tmp = os.path.join(tmp_dir, 'peers.json')
            with open(fund_tmp,'w') as f: _json.dump(merged, f)
            with open(peer_tmp,'w') as f: _json.dump(peers_db, f)
            # Patch paths in a temp copy of gen_dossier_v3.py
            with open(gen_v3) as f: src=f.read()
            src = src.replace(
                "r'C:\\Users\\GOPALS~1\\AppData\\Local\\Temp\\claude\\C--Users-GopalSharma-Downloads-WealthOS-04-Oct\\17b60ba3-2b72-4551-8569-e46cbe4af79c\\scratchpad\\fundamentals_oct16.json'",
                repr(fund_tmp))
            src = src.replace(
                "r'C:\\Users\\GOPALS~1\\AppData\\Local\\Temp\\claude\\C--Users-GopalSharma-Downloads-WealthOS-04-Oct\\17b60ba3-2b72-4551-8569-e46cbe4af79c\\scratchpad\\peers_oct16.json'",
                repr(peer_tmp))
            src = src.replace(
                "r'C:\\Users\\GOPALS~1\\AppData\\Local\\Temp\\claude\\C--Users-GopalSharma-Downloads-WealthOS-04-Oct\\17b60ba3-2b72-4551-8569-e46cbe4af79c\\scratchpad\\dossier_v3.html'",
                repr(out_path))
            patched = os.path.join(tmp_dir, 'gen_dossier_v3_run.py')
            with open(patched,'w') as f: f.write(src)
            result = subprocess.run([sys.executable, '-I', patched], capture_output=False)
            if result.returncode == 0 and os.path.exists(out_path):
                sz = os.path.getsize(out_path)
                print(f"Dossier: {out_path} ({sz/1024/1024:.1f} MB)")
                return out_path
        finally:
            _sh.rmtree(tmp_dir, ignore_errors=True)

    print("WARNING: Could not run gen_dossier_v3.py; dossier not generated.")
    return None

# ─────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Run full scan + dossier pipeline')
    parser.add_argument('--end',  default=date.today().isoformat(), help='End date YYYY-MM-DD')
    parser.add_argument('--days', type=int, default=7, help='Number of trading sessions')
    parser.add_argument('--min-score', type=int, default=3, help='Minimum C score (1-7)')
    parser.add_argument('--skip-tv-fetch', action='store_true', help='Reuse existing tv_universe.json if fresh')
    parser.add_argument('--29q', dest='run_29q', action='store_true',
                        help='Run 29Q research on high-score stocks (≥6/7 by default, or use --29q-min-score)')
    parser.add_argument('--29q-min-score', dest='q29_min_score', type=int, default=6,
                        help='Minimum C-score for 29Q research (default: 6)')
    parser.add_argument('--29q-top', dest='q29_top', type=int, default=0,
                        help='Limit 29Q to top N stocks; 0 = all qualifying (default: 0)')
    args = parser.parse_args()

    t0 = datetime.now()
    print(f"\n{'#'*60}")
    print(f"# WealthOS Scan + Dossier Pipeline")
    print(f"# End date: {args.end} | Sessions: {args.days} | Min score: {args.min_score}")
    if args.run_29q:
        print(f"# 29Q research: ON (C≥{args.q29_min_score}" + (f", top {args.q29_top}" if args.q29_top else ", all qualifying") + ")")
    print(f"{'#'*60}")

    # Step 1: TV data
    tv_universe = run_tv_fetch(skip_if_fresh=args.skip_tv_fetch)

    # Load peers
    peers_db = {}
    if os.path.exists(TV_PEERS_JSON):
        with open(TV_PEERS_JSON) as f: peers_db = json.load(f)
        print(f"Peer data: {len(peers_db)} stocks")

    # Step 2: Scan
    scan_results = run_scan(args.end, n_sessions=args.days, min_score=args.min_score)
    if not scan_results:
        print("No qualifying stocks. Exiting."); return

    # Step 3: Fundamentals
    merged = run_fundamentals(scan_results, tv_universe)

    # Step 4: Dossier
    label = args.end.replace('-','')
    out_path = os.path.join(PROJECT_ROOT, f'dossier_{label}.html')
    run_dossier(merged, peers_db, out_path)

    # Step 5 (optional): 29Q research on high-conviction stocks
    if args.run_29q:
        import subprocess as _sp
        run_29q_script = os.path.join(PROJECT_ROOT, 'scripts', 'fundamental', 'run_29q_with_tv.py')
        if not os.path.exists(run_29q_script):
            print("[29Q] WARNING: run_29q_with_tv.py not found; skipping 29Q step.")
        else:
            # Save scan results to temp JSON for 29Q runner to consume
            import tempfile
            tmp_scan = os.path.join(tempfile.gettempdir(), f'scan_{label}_for_29q.json')
            with open(tmp_scan, 'w') as f: json.dump(scan_results, f)
            cmd = [sys.executable, '-I', run_29q_script,
                   '--from-scan', tmp_scan,
                   '--min-score', str(args.q29_min_score),
                   '--out', PROJECT_ROOT]
            if args.q29_top:
                cmd += ['--top', str(args.q29_top)]
            step_banner(5, f"29Q Research (C≥{args.q29_min_score})")
            result = _sp.run(cmd, capture_output=False)
            if result.returncode != 0:
                print("[29Q] 29Q runner exited with errors.")
            else:
                print(f"[29Q] 29Q research complete. See 29q_results_{args.end}.json and 29q_summary_{args.end}.md")

    elapsed = (datetime.now()-t0).total_seconds()
    print(f"\n{'='*60}\nPipeline done in {elapsed:.0f}s | Output: {out_path}\n{'='*60}")

if __name__ == '__main__':
    main()
