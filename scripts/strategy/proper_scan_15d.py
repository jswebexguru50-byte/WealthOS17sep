"""
Proper alphanumeric scan using DailyOHLCV (full OHLCV + volume, 3761 symbols).
Last 7 NSE trading sessions from DailyOHLCV. Real volume breakout criterion.
Enriches with HistoricalFinancialStatements (PAT/ROCE/CFO) and HistoricalShareholdingPattern.
"""
import sqlite3, json, sys, math
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DB = r'C:\Users\GopalSharma\Downloads\WealthOS 04 Oct\portfolio.db'
SP = r'C:\Users\GopalSharma\Downloads\WealthOS 04 Oct\outputs\proper_scan_15d'

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

# ── 1. Last 15 trading sessions from DailyOHLCV ───────────────────────────
cur.execute("SELECT DISTINCT trade_date FROM DailyOHLCV ORDER BY trade_date DESC LIMIT 15")
last7 = sorted([r[0] for r in cur.fetchall()])
FIRST_D, LAST_D = last7[0], last7[-1]
print(f'DailyOHLCV last 15 sessions: {FIRST_D} → {LAST_D}')

# ── 2. Candidates: symbols with >= 5 of 7 sessions ────────────────────────
cur.execute("""
    SELECT symbol, COUNT(DISTINCT trade_date) as days
    FROM DailyOHLCV WHERE trade_date BETWEEN ? AND ?
    GROUP BY symbol HAVING days >= 5 ORDER BY symbol
""", (FIRST_D, LAST_D))
candidates = [(r['symbol'], r['days']) for r in cur.fetchall()]
print(f'Eligible symbols: {len(candidates)} (sorted A-Z)')

results = []
skipped = 0

for sym, ndays in candidates:
    # 15-session OHLCV
    cur.execute("""
        SELECT trade_date, open, high, low, close, volume, delivery_qty, delivery_pct
        FROM DailyOHLCV WHERE symbol=? AND trade_date BETWEEN ? AND ?
        ORDER BY trade_date
    """, (sym, FIRST_D, LAST_D))
    sess = [dict(r) for r in cur.fetchall()]
    if len(sess) < 3:
        skipped += 1
        continue

    closes = [r['close'] for r in sess if r['close']]
    highs  = [r['high'] for r in sess if r['high']]
    vols   = [r['volume'] or 0 for r in sess]
    if not closes or closes[-1] is None:
        skipped += 1
        continue

    last_c = closes[-1]; first_c = closes[0]
    last_vol = vols[-1]

    # SMA20 (using DailyOHLCV)
    cur.execute("SELECT close FROM DailyOHLCV WHERE symbol=? AND trade_date<=? ORDER BY trade_date DESC LIMIT 20", (sym, LAST_D))
    s20 = [r[0] for r in cur.fetchall() if r[0]]
    sma20 = sum(s20)/len(s20) if s20 else None

    # SMA200
    cur.execute("SELECT close FROM DailyOHLCV WHERE symbol=? AND trade_date<=? ORDER BY trade_date DESC LIMIT 200", (sym, LAST_D))
    s200 = [r[0] for r in cur.fetchall() if r[0]]
    sma200 = sum(s200)/len(s200) if len(s200) >= 50 else None

    # 20-day avg volume
    cur.execute("SELECT volume FROM DailyOHLCV WHERE symbol=? AND trade_date<=? ORDER BY trade_date DESC LIMIT 20", (sym, LAST_D))
    vr = [r[0] for r in cur.fetchall() if r[0] and r[0] > 0]
    avg_vol20 = sum(vr)/len(vr) if vr else None

    # RSI-14 from closes
    cur.execute("SELECT close FROM DailyOHLCV WHERE symbol=? AND trade_date<=? ORDER BY trade_date DESC LIMIT 16", (sym, LAST_D))
    rc = list(reversed([r[0] for r in cur.fetchall() if r[0]]))
    rsi = None
    if len(rc) >= 14:
        g = [max(rc[i]-rc[i-1], 0) for i in range(1, len(rc))]
        l = [max(rc[i-1]-rc[i], 0) for i in range(1, len(rc))]
        ag = sum(g[:14])/14; al = sum(l[:14])/14
        rsi = round(100 - 100/(1+ag/al), 1) if al > 0 else 100.0

    ret7 = (last_c - first_c)/first_c*100 if first_c else 0
    high7 = max(highs) if highs else last_c

    # ── 7 CRITERIA (real OHLCV) ───────────────────────────────────────────
    C1 = bool(sma20  and last_c > sma20)
    C2 = bool(sma200 and last_c > sma200)
    C3 = ret7 > 0
    C4 = bool(rsi and 40 <= rsi <= 70)
    C5 = bool(avg_vol20 and last_vol > avg_vol20 * 1.2)   # REAL volume breakout
    C6 = (len(closes) >= 6 and min(closes[-5:]) > max(closes[:5]) * 0.97)
    C7 = bool(high7 and last_c >= high7 * 0.87)

    score = sum([C1, C2, C3, C4, C5, C6, C7])
    if score < 3:
        continue

    # MasterTickers
    cur.execute("SELECT name, sector, industry, exchange FROM MasterTickers WHERE symbol=? LIMIT 1", (sym,))
    mt = cur.fetchone()

    # Last delivery pct (quality of buying)
    last_deliv_pct = sess[-1].get('delivery_pct') if sess else None

    # Latest shareholding
    cur.execute("""SELECT promoter_pct, fii_pct, dii_pct, quarter_label FROM HistoricalShareholdingPattern
                   WHERE symbol=? ORDER BY as_of_date DESC LIMIT 1""", (sym,))
    sh = cur.fetchone()

    # 8Q PAT from HistoricalFinancialStatements
    cur.execute("""SELECT period_label, period_date, net_profit_pat_cr, sales_cr, opm_pct, cfo_cr,
                          borrowings_cr, total_assets_cr, equity_capital_cr, reserves_cr
                   FROM HistoricalFinancialStatements
                   WHERE symbol=? AND statement_type='quarterly'
                   ORDER BY period_date DESC LIMIT 8""", (sym,))
    financials_q = [dict(r) for r in cur.fetchall()]

    # Annual financials
    cur.execute("""SELECT period_label, period_date, net_profit_pat_cr, sales_cr, opm_pct, cfo_cr,
                          borrowings_cr, total_assets_cr, equity_capital_cr, reserves_cr
                   FROM HistoricalFinancialStatements
                   WHERE symbol=? AND statement_type='annual'
                   ORDER BY period_date DESC LIMIT 3""", (sym,))
    financials_a = [dict(r) for r in cur.fetchall()]

    results.append({
        'symbol': sym,
        'name': mt['name'] if mt else sym,
        'sector': mt['sector'] if mt else 'Unknown',
        'industry': mt['industry'] if mt else '',
        'exchange': mt['exchange'] if mt else 'NSE',
        'last_close': round(last_c, 2),
        'return_7d_pct': round(ret7, 2),
        'sma20': round(sma20, 2) if sma20 else None,
        'sma200': round(sma200, 2) if sma200 else None,
        'vs_sma20_pct': round((last_c/sma20-1)*100, 1) if sma20 else None,
        'vs_sma200_pct': round((last_c/sma200-1)*100, 1) if sma200 else None,
        'rsi': rsi,
        'last_vol': int(last_vol),
        'avg_vol20': int(avg_vol20) if avg_vol20 else None,
        'vol_ratio': round(last_vol/avg_vol20, 2) if avg_vol20 and avg_vol20 > 0 else None,
        'last_delivery_pct': last_deliv_pct,
        'high7d': round(high7, 2),
        'score': score,
        'criteria': {'C1':C1,'C2':C2,'C3':C3,'C4':C4,'C5':C5,'C6':C6,'C7':C7},
        'closes_15d': [round(c, 2) for c in closes],
        'dates_15d': [r['trade_date'] for r in sess],
        'shareholding': dict(sh) if sh else None,
        'financials_quarterly': financials_q,
        'financials_annual': financials_a,
    })

con.close()
results.sort(key=lambda x: (-x['score'], -x['return_7d_pct']))

print(f'\nQualifying stocks (score >= 3): {len(results)}  (skipped: {skipped})')
print(f'\n{"#":<4} {"Symbol":<12} {"Sc":>3} {"Ret7d%":>7} {"RSI":>6} {"vsSMA20":>8} {"vsSMA200":>9} {"VolRat":>7} C1 C2 C3 C4 C5 C6 C7  Sector')
print('-'*120)
for i, r in enumerate(results[:50], 1):
    cr = r['criteria']
    cc = ['Y' if cr[k] else 'n' for k in ['C1','C2','C3','C4','C5','C6','C7']]
    vs20  = f"+{r['vs_sma20_pct']}%" if r['vs_sma20_pct'] is not None and r['vs_sma20_pct'] >= 0 else f"{r['vs_sma20_pct']}%" if r['vs_sma20_pct'] is not None else 'N/A'
    vs200 = f"+{r['vs_sma200_pct']}%" if r['vs_sma200_pct'] is not None and r['vs_sma200_pct'] >= 0 else f"{r['vs_sma200_pct']}%" if r['vs_sma200_pct'] is not None else 'N/A'
    vrat  = str(r['vol_ratio']) if r['vol_ratio'] else '?'
    print(f"{i:<4} {r['symbol']:<12} {r['score']:>3} {r['return_7d_pct']:>7.1f}% {str(r['rsi'] or '?'):>6} {vs20:>8} {vs200:>9} {vrat:>7}  {' '.join(cc)}  {r['sector'][:18]}")

out = SP + r'\proper_scan_results.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump({
        'session_range': {'first': FIRST_D, 'last': LAST_D,
                          'source': 'DailyOHLCV (NSE Bhavcopy)',
                          'note': 'DailyOHLCV refreshed from verified NSE/BSE Kite Parquet through 2026-10-16'},
        'criteria_note': 'C5 = REAL volume breakout (last session vol > 20d avg × 1.2)',
        'results': results
    }, f, indent=2, default=str)
print(f'\nSaved {len(results)} qualifying stocks → {out}')
