"""
fetch_tv_universe.py
====================
Reusable pre-step for ANY alphanumeric scan, F-filter run, or fundamental dossier.

Run this once before a scan session to refresh the TradingView data cache.
Covers NSE + BSE; deduplicates by symbol (NSE preferred).

Outputs (all in same directory as this script, or OUTPUT_DIR override):
  tv_universe.json      — dict {symbol: {...}} with full TV data
  tv_peers.json         — dict {symbol: {sector, industry, n_peers, medians, percentiles, top_peers}}
  tv_universe_meta.json — run metadata (timestamp, counts, exchanges)

Usage:
  python fetch_tv_universe.py                    # saves to script dir
  python fetch_tv_universe.py --out /path/to/dir  # custom output dir
  python fetch_tv_universe.py --no-peers          # skip peer computation

Run at start of each scan session (data is live; no auth needed for screener).
"""
import sys, json, os, argparse, math
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


# (cache key, TradingView screener column, kind, round digits, divisor)
# Column names verified live (tradingview-screener 3.2.2, tvscreener StockField catalogue). Names that
# silently return null (e.g. 'price_to_book_fq', 'total_debt_to_equity_fq', '52 Week High') are NOT used.
# ROIC (return_on_invested_capital) is deliberately NOT fetched as ROCE: different metric.
COLUMN_SPEC = [
    ('close',         'close',                            'num', 2, None),
    ('mkt_cap_cr',    'market_cap_basic',                 'num', 0, 1e7),
    ('pe',            'price_earnings_ttm',               'num', 1, None),
    ('pb',            'price_book_fq',                    'num', 2, None),
    ('roe',           'return_on_equity',                 'num', 1, None),
    ('roa',           'return_on_assets',                 'num', 1, None),
    ('de_ratio',      'debt_to_equity',                   'num', 2, None),
    ('opm',           'operating_margin_ttm',             'num', 1, None),
    ('net_margin',    'net_margin_ttm',                   'num', 1, None),
    ('ebitda_margin', 'ebitda_margin_ttm',                'num', 1, None),
    ('eps',           'earnings_per_share_diluted_ttm',   'num', 2, None),
    ('div_yield',     'dividends_yield_current',          'num', 2, None),
    ('revenue_cr',    'revenue_ttm',                      'num', 0, 1e7),
    ('net_income_cr', 'net_income_ttm',                   'num', 1, 1e7),
    ('ebitda_ttm_cr', 'ebitda',                           'num', 1, 1e7),
    ('cfo_ttm_cr',    'cash_f_operating_activities_ttm',  'num', 1, 1e7),
    ('borrowings_cr', 'total_debt',                       'num', 1, 1e7),
    ('total_assets_cr', 'total_assets',                   'num', 1, 1e7),
    ('isin',          'isin',                             'text', None, None),
    ('sector',        'sector',                           'text', None, None),
    ('industry',      'industry',                         'text', None, None),
    ('rsi',           'RSI',                              'num', 1, None),
    ('rel_vol',       'relative_volume_10d_calc',         'num', 2, None),
    ('rec_all',       'Recommend.All',                    'num', 3, None),
    ('perf_w',        'Perf.W',                           'num', 1, None),
    ('perf_1m',       'Perf.1M',                          'num', 1, None),
    ('perf_3m',       'Perf.3M',                          'num', 1, None),
    ('high_52w',      'price_52_week_high',               'num', 2, None),
    ('low_52w',       'price_52_week_low',                'num', 2, None),
    ('sma20',         'SMA20',                            'num', 2, None),
    ('sma50',         'SMA50',                            'num', 2, None),
    ('sma200',        'SMA200',                           'num', 2, None),
    ('ema20',         'EMA20',                            'num', 2, None),
    ('ema50',         'EMA50',                            'num', 2, None),
    ('ema200',        'EMA200',                           'num', 2, None),
    ('beta_1y',       'beta_1_year',                      'num', 3, None),
    ('avg_vol',       'average_volume_10d_calc',          'num', 0, None),
    ('avg_vol_30d',   'average_volume_30d_calc',          'num', 0, None),
    ('volume',        'volume',                           'num', 0, None),
    ('value_traded',  'Value.Traded',                     'num', 0, None),  # one session's turnover, NOT ADTV
    ('float_shares',  'float_shares_outstanding',         'num', 0, None),
    # Annual (FY) / quarterly-statement variants. TV's MRQ/TTM fundamentals are sparse for India (~20%);
    # FY ones are ~90%. They are DIFFERENT periods, so they get separate explicit keys, never fallbacks.
    ('pb_fy',         'price_book_ratio',                 'num', 2, None),
    ('roe_fy',        'return_on_equity_fy',              'num', 1, None),
    ('roa_fy',        'return_on_assets_fy',              'num', 1, None),
    ('roce_fq',       'return_on_capital_employed_fq',    'num', 1, None),  # TV's own ROCE column (not ROIC)
    ('roce_fy',       'return_on_capital_employed_fy',    'num', 1, None),
    ('de_fy',         'debt_to_equity_fy',                'num', 2, None),
    ('borrowings_fy_cr', 'total_debt_fy',                 'num', 1, 1e7),
    ('total_assets_fy_cr', 'total_assets_fy',             'num', 1, 1e7),
    ('cfo_fy_cr',     'cash_f_operating_activities_fy',   'num', 1, 1e7),
    ('equity_fy_cr',  'shrhldrs_equity_fy',               'num', 1, 1e7),
    ('sales_fy_cr',   'total_revenue_fy',                 'num', 1, 1e7),
    ('ebitda_fy_cr',  'ebitda_fy',                        'num', 1, 1e7),
    ('net_income_fy_cr', 'net_income_fy',                 'num', 1, 1e7),
    ('sales_fq_cr',   'total_revenue_fq',                 'num', 1, 1e7),
    ('ebitda_fq_cr',  'ebitda_fq',                        'num', 1, 1e7),
    ('net_income_fq_cr', 'net_income_fq',                 'num', 1, 1e7),
    ('revenue_cagr_5y', 'total_revenue_cagr_5y',          'num', 2, None),
    ('piotroski_f_ttm', 'piotroski_f_score_ttm',          'num', 0, None),  # TV's own computation
    ('piotroski_f_fy', 'piotroski_f_score_fy',            'num', 0, None),
    ('altman_z_ttm',  'altman_z_score_ttm',               'num', 2, None),
    ('altman_z_fy',   'altman_z_score_fy',                'num', 2, None),
    ('mrq_epoch',     'most_recent_quarter_date',         'num', 0, None),  # period end of MRQ fields (epoch s)
]

def fetch_universe(exchanges=('NSE', 'BSE')):
    from tradingview_screener import Query, Column
    import pandas as pd

    FIELDS = ['name'] + [spec[1] for spec in COLUMN_SPEC]

    all_frames = []
    for exch in exchanges:
        print(f"  Fetching {exch}...", end=' ', flush=True)
        try:
            # tradingview-screener's range is [offset, end] (not [offset, count]); one call with a high
            # end covers the whole exchange. Completeness is asserted against the API's totalCount.
            cnt, df = (
                Query()
                .set_markets('india')
                .select(*FIELDS)
                .where(
                    Column('exchange').isin([exch]),
                    Column('type').isin(['stock']),
                )
                .limit(20000)
                .get_scanner_data()
            )
            if len(df) < cnt:
                print(f"INCOMPLETE ({len(df)}/{cnt})", end=' ')
            # Normalise symbol column
            if 'ticker' in df.columns:
                df['symbol'] = df['ticker'].str.split(':').str[-1]
            elif df.index.name and 'ticker' in str(df.index.name).lower():
                df = df.reset_index()
                df['symbol'] = df.iloc[:, 0].astype(str).str.split(':').str[-1]
            else:
                df = df.reset_index(drop=True)
                df['symbol'] = df.get('ticker', '').astype(str).str.split(':').str[-1]
            df['exchange'] = exch
            all_frames.append(df)
            print(f"{len(df)} stocks")
        except Exception as e:
            print(f"FAILED: {e}")

    if not all_frames:
        raise RuntimeError("No data fetched from any exchange")

    import pandas as pd
    combined = pd.concat(all_frames, ignore_index=True)

    # Deduplicate: if same symbol on both NSE and BSE, keep NSE
    combined['_exch_rank'] = combined['exchange'].map({'NSE': 0, 'BSE': 1}).fillna(2)
    combined = combined.sort_values('_exch_rank').drop_duplicates(subset='symbol', keep='first')
    combined = combined.drop(columns=['_exch_rank'])

    NUMERIC_COLS = [spec[1] for spec in COLUMN_SPEC if spec[2] != 'text']
    for col in NUMERIC_COLS:
        if col in combined.columns:
            combined[col] = pd.to_numeric(combined[col], errors='coerce')

    print(f"  Combined (deduped): {len(combined)} unique symbols")
    return combined

def df_to_universe_dict(df):
    """Convert DataFrame to compact dict keyed by symbol."""
    import pandas as pd
    result = {}

    def safe(val, digits=None):
        if val is None: return None
        try:
            v = float(val)
            if math.isnan(v) or math.isinf(v): return None
            return round(v, digits) if digits is not None else v
        except: return None

    for _, row in df.iterrows():
        sym = str(row.get('symbol', ''))
        if not sym or sym == 'nan': continue
        rec = {'exchange': row.get('exchange'), 'tv_name': row.get('name')}
        for key, col, kind, digits, div in COLUMN_SPEC:
            v = row.get(col)
            if kind == 'text':
                rec[key] = v if isinstance(v, str) and v.strip() else None
            else:
                x = safe(v)
                if x is not None and div:
                    x = x / div
                rec[key] = None if x is None else (round(x, digits) if digits is not None else x)
        result[sym] = rec
    return result

def build_peers(df):
    """Build sector peer groups with percentile rankings."""
    import pandas as pd

    def pct_rank(series, value):
        if value is None or pd.isna(value): return None
        valid = series.dropna()
        return round(float((valid <= value).mean() * 100), 1) if len(valid) > 0 else None

    def pct_rank_inv(series, value):
        if value is None or pd.isna(value): return None
        valid = series.dropna()
        return round(float((valid >= value).mean() * 100), 1) if len(valid) > 0 else None

    def safe_med(series, d=1):
        v = series.dropna()
        return round(float(v.median()), d) if len(v) >= 3 else None

    df_s = df[df['sector'].notna() & (df['sector'] != '')].copy()
    peers_out = {}

    for sector in df_s['sector'].unique():
        sec_df = df_s[df_s['sector'] == sector].copy()

        for industry in list(sec_df['industry'].dropna().unique()) + [None]:
            if industry is not None:
                ind_df = sec_df[sec_df['industry'] == industry].copy()
                if ind_df.empty: continue
                pool = ind_df if len(ind_df) >= 5 else sec_df
                pool_label = 'industry' if len(ind_df) >= 5 else 'sector'
                target_df = ind_df
            else:
                target_df = sec_df[sec_df['industry'].isna()]
                pool = sec_df
                pool_label = 'sector'
                if target_df.empty: continue

            pool_sorted = pool.sort_values('market_cap_basic', ascending=False)
            med_pe  = safe_med(pool['price_earnings_ttm'])
            med_roe = safe_med(pool['return_on_equity'])
            med_opm = safe_med(pool['operating_margin_ttm'])
            med_pb  = safe_med(pool['price_book_fq'], 2)
            med_de  = safe_med(pool['debt_to_equity'], 2)
            n_peers = len(pool)

            top_peers = []
            for _, pr in pool_sorted.head(12).iterrows():
                psym = str(pr.get('symbol', ''))
                mc2 = pr.get('market_cap_basic')
                top_peers.append({
                    'sym':       psym,
                    'name':      pr.get('name', psym),
                    'exchange':  pr.get('exchange'),
                    'mkt_cap_cr': round(mc2 / 1e7, 0) if pd.notna(mc2) else None,
                    'pe':        round(pr['price_earnings_ttm'], 1) if pd.notna(pr.get('price_earnings_ttm')) else None,
                    'roe':       round(pr['return_on_equity'], 1) if pd.notna(pr.get('return_on_equity')) else None,
                    'opm':       round(pr['operating_margin_ttm'], 1) if pd.notna(pr.get('operating_margin_ttm')) else None,
                    'perf_1m':   round(pr['Perf.1M'], 1) if pd.notna(pr.get('Perf.1M')) else None,
                    'rec':       round(pr['Recommend.All'], 2) if pd.notna(pr.get('Recommend.All')) else None,
                })

            for _, row in target_df.iterrows():
                sym = str(row.get('symbol', ''))
                if not sym or sym in peers_out: continue
                mc_val = row.get('market_cap_basic')
                mc_rank = int((pool['market_cap_basic'] > (mc_val or 0)).sum()) + 1
                peers_out[sym] = {
                    'sector':    sector,
                    'industry':  industry,
                    'peer_pool': pool_label,
                    'n_peers':   n_peers,
                    'medians':   {'pe': med_pe, 'roe': med_roe, 'opm': med_opm, 'pb': med_pb, 'de': med_de},
                    'percentiles': {
                        'roe_pct': pct_rank(pool['return_on_equity'], row.get('return_on_equity')),
                        'opm_pct': pct_rank(pool['operating_margin_ttm'], row.get('operating_margin_ttm')),
                        'pe_pct':  pct_rank_inv(pool['price_earnings_ttm'], row.get('price_earnings_ttm')),
                        'mc_rank': mc_rank, 'mc_total': n_peers,
                    },
                    'top_peers': top_peers,
                }

    return peers_out


# cache key -> staged canonical field (registry ids where the metric is identical; otherwise the TV-native name).
STAGE_FIELDS = {
    'close': 'ltp', 'mkt_cap_cr': 'market_cap_cr', 'pe': 'pe_ttm', 'pb': 'pb', 'roe': 'roe', 'roa': 'roa',
    'de_ratio': 'debt_to_equity', 'opm': 'opm', 'net_margin': 'net_margin', 'ebitda_margin': 'ebitda_margin',
    'eps': 'eps', 'div_yield': 'dividend_yield', 'revenue_cr': 'revenue_ttm_cr', 'net_income_cr': 'net_income_ttm_cr',
    'ebitda_ttm_cr': 'ebitda_ttm_cr', 'cfo_ttm_cr': 'cfo_ttm_cr', 'borrowings_cr': 'borrowings',
    'total_assets_cr': 'total_assets', 'sector': 'sector', 'industry': 'industry', 'rsi': 'rsi',
    'rel_vol': 'rel_volume', 'rec_all': 'recommend_all', 'perf_w': 'perf_1w', 'perf_1m': 'perf_1m',
    'perf_3m': 'perf_3m', 'high_52w': 'high_52w', 'low_52w': 'low_52w', 'sma20': 'sma20', 'sma50': 'sma50',
    'sma200': 'sma200', 'ema20': 'ema20', 'ema50': 'ema50', 'ema200': 'ema200', 'beta_1y': 'beta_1y',
    'avg_vol': 'avg_volume', 'avg_vol_30d': 'avg_volume_30d', 'volume': 'volume_day',
    'value_traded': 'value_traded_day', 'float_shares': 'float_shares',
    'pb_fy': 'pb_fy', 'roe_fy': 'roe_fy', 'roa_fy': 'roa_fy', 'roce_fq': 'roce_fq', 'roce_fy': 'roce_fy',
    'de_fy': 'debt_to_equity_fy', 'borrowings_fy_cr': 'borrowings_fy', 'total_assets_fy_cr': 'total_assets_fy',
    'cfo_fy_cr': 'cfo_annual_fy', 'equity_fy_cr': 'shareholders_equity_fy', 'sales_fy_cr': 'sales_fy',
    'ebitda_fy_cr': 'ebitda_annual', 'net_income_fy_cr': 'net_income_fy', 'sales_fq_cr': 'sales_quarterly',
    'ebitda_fq_cr': 'ebitda_quarterly', 'net_income_fq_cr': 'pat_quarterly_latest',
    'revenue_cagr_5y': 'sales_growth_5y', 'piotroski_f_ttm': 'piotroski_f_ttm', 'piotroski_f_fy': 'piotroski_f_fy',
    'altman_z_ttm': 'altman_z_ttm', 'altman_z_fy': 'altman_z_fy',
}
# staged fields that are as-of the most recent reported quarter (get period_end from TV's own date column)
MRQ_KEYS = {'roe', 'roa', 'de_ratio', 'pb', 'roce_fq', 'borrowings_cr', 'total_assets_cr', 'sales_fq_cr',
            'ebitda_fq_cr', 'net_income_fq_cr', 'pe', 'opm', 'net_margin', 'ebitda_margin', 'eps',
            'revenue_cr', 'net_income_cr', 'ebitda_ttm_cr', 'cfo_ttm_cr', 'piotroski_f_ttm', 'altman_z_ttm'}


def load_universe_symbols(db_path):
    """The 3,183-symbol audit universe (read-only DB; definition lives in scripts/qa/coverage_audit.py).
    Returns [(symbol, isin)]. BSE rows are keyed by numeric scrip code, which TradingView does not use,
    so the ISIN is the exact-identifier join key for those."""
    sys.path.insert(0, os.path.join(SCRIPT_DIR, 'scripts', 'qa'))
    import coverage_audit
    c = coverage_audit.connect(db_path)
    try:
        syms = coverage_audit.universe(c)[0]
        isin = {}
        for sym, i in c.execute("SELECT symbol, isin FROM MasterTickers WHERE status='ACTIVE'"):
            if i and sym not in isin:
                isin[sym] = i
        return [(s_, isin.get(s_)) for s_ in syms]
    finally:
        c.close()


def resolve_aliases(universe, pairs):
    """audit symbol -> TV symbol. Direct symbol match first; else unique ISIN match (NSE preferred already)."""
    by_isin = {}
    for tv_sym, rec in universe.items():
        if rec.get('isin'):
            by_isin.setdefault(rec['isin'], tv_sym)
    out = {}
    for sym, isin in pairs:
        if sym in universe:
            out[sym] = sym
        elif isin and isin in by_isin:
            out[sym] = by_isin[isin]
    return out


def write_stage(universe, aliases, symbols, as_of, path):
    """JSONL staging file: one row per non-null (symbol, field). Nothing is imputed; nulls are omitted."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    col_of = {k: c for k, c, *_ in COLUMN_SPEC}
    fills, n = {}, 0
    with open(path, 'w', encoding='utf-8') as f:
        for sym in symbols:
            u = universe.get(aliases.get(sym))
            if not u:
                continue
            for key, field in STAGE_FIELDS.items():
                v = u.get(key)
                if v is None:
                    continue
                pe = None
                if key in MRQ_KEYS and u.get('mrq_epoch'):
                    pe = datetime.fromtimestamp(u['mrq_epoch'], timezone.utc).strftime('%Y-%m-%d')
                f.write(json.dumps({'symbol': sym, 'field': field, 'value': v, 'as_of': as_of,
                                    'period_end': pe, 'source': 'tradingview', 'tv_column': col_of[key],
                                    'exchange': u.get('exchange')}, separators=(',', ':')) + '\n')
                fills[field] = fills.get(field, 0) + 1
                n += 1
    return n, fills

def main():
    parser = argparse.ArgumentParser(description='Fetch TV universe for NSE+BSE')
    parser.add_argument('--out', default=SCRIPT_DIR, help='Output directory')
    parser.add_argument('--db', default=None, help='portfolio.db (read-only) to resolve the audit universe')
    parser.add_argument('--stage', default=None, help='write JSONL staging file for the audit universe')
    parser.add_argument('--no-peers', action='store_true', help='Skip peer computation')
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    t0 = datetime.now()
    print(f"[{t0:%Y-%m-%d %H:%M}] Fetching TradingView universe (NSE + BSE)...")

    df = fetch_universe(exchanges=('NSE', 'BSE'))
    universe = df_to_universe_dict(df)

    # Save universe
    univ_path = os.path.join(args.out, 'tv_universe.json')
    with open(univ_path, 'w') as f:
        json.dump(universe, f, separators=(',', ':'))
    print(f"Saved tv_universe.json: {len(universe)} stocks ({os.path.getsize(univ_path)/1024:.0f} KB)")

    # Build peers
    peers = {}
    if not args.no_peers:
        print("Building sector peer groups...")
        peers = build_peers(df)
        peers_path = os.path.join(args.out, 'tv_peers.json')
        with open(peers_path, 'w') as f:
            json.dump(peers, f, separators=(',', ':'))
        print(f"Saved tv_peers.json: {len(peers)} stocks ({os.path.getsize(peers_path)/1024:.0f} KB)")

    # Staging (never touches portfolio.db)
    stage_info = {}
    if args.stage:
        pairs = load_universe_symbols(args.db or os.path.join(SCRIPT_DIR, 'portfolio.db'))
        syms = [p_[0] for p_ in pairs]
        aliases = resolve_aliases(universe, pairs)
        n_rows, fills = write_stage(universe, aliases, syms, t0.astimezone().isoformat(), args.stage)
        matched = len(aliases)
        with open(os.path.join(args.out, 'tv_symbol_aliases.json'), 'w', encoding='utf-8') as f:
            json.dump({k: v for k, v in aliases.items() if k != v}, f, indent=0)
        stage_info = {'universe_size': len(syms), 'universe_matched_in_tv': matched, 'stage_rows': n_rows,
                      'fill_by_field': fills,
                      'fill_pct_by_field': {k: round(100.0 * v / len(syms), 1) for k, v in sorted(fills.items())}}
        print(f"Staged {n_rows} rows for {matched}/{len(syms)} universe symbols -> {args.stage}")

    # Meta
    nse_cnt = sum(1 for v in universe.values() if v.get('exchange') == 'NSE')
    bse_cnt = sum(1 for v in universe.values() if v.get('exchange') == 'BSE')
    meta = {
        'fetched_at': t0.astimezone().isoformat(),
        'duration_s': round((datetime.now() - t0).total_seconds(), 1),
        'total': len(universe),
        'nse': nse_cnt,
        'bse': bse_cnt,
        'with_sector': sum(1 for v in universe.values() if v.get('sector')),
        'peers_computed': not args.no_peers,
        'peers_count': len(peers),
        'columns': [c for _, c, *_ in COLUMN_SPEC],
        **stage_info,
    }
    with open(os.path.join(args.out, 'tv_universe_meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"\nDone in {meta['duration_s']}s — NSE: {nse_cnt}, BSE: {bse_cnt}, peers: {len(peers)}")

if __name__ == '__main__':
    main()
