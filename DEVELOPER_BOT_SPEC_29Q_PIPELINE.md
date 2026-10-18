# WealthOS 29Q Scan Pipeline — Developer Bot Specification

> **Generated:** 2026-10-18  
> **Status:** Pending implementation — P1 (this week), P2 (2 weeks), P3 (1 month)  
> **Scope:** F-filter pipeline, source waterfall, scan performance, modularisation

---

## What Is Already Done

Do **not** re-implement any of these. Verify each before starting P1 work.

| Item | Verification |
|------|-------------|
| DB v16 migration: 6 indexes + 6 views + `pledge_pct` column + `canonical_fact_store` | `SELECT MAX(version) FROM db_migrations` → 16 |
| F5 pledge uses NULL (never defaults to 0) | Grep `pledge_sel` in `run_29q_with_tv.py` |
| F2 checks 8 full quarters | Grep `[:8]` and `len(pats) >= 8` in `run_29q_with_tv.py` |
| `trendlyne_bridge.py` — HTTP bridge + `fetch_and_store()` | `git log --oneline \| grep trendlyne` |
| 3-layer source waterfall in `run_29q_with_tv.py` | Functions `_fetch_cfs_shareholding`, `auto_enrich`, `--enrich` flag |
| C1-C7 derived from TV technicals when `--symbols` used | `else:` branch in `build_29q_record` |
| TV data in `canonical_fact_store` (~152K rows) | `SELECT COUNT(*) FROM canonical_fact_store` |

---

## Developer Bot Constitution — Absolute Rules (Non-Negotiable)

### 🔴 ZERO FABRICATION — Rule 1

**If a value is unavailable, store/return `None`/`NULL`. Never substitute 0, -1, a mean, or a median. No synthetic defaults, ever.**

- `row.get('field')` — correct
- `row.get('field') or 0` — **FORBIDDEN** (hides real missing data)
- `pledge_pct = 0` as default — **FORBIDDEN** (silent fabrication)

### Additional Absolute Rules

1. **NEVER write to `portfolio.db`** without the user's explicit approval in that specific turn.
2. **NEVER commit `.env` files** or any file containing credentials, API keys, or tokens.
3. **NEVER expose credential values** in logs or print statements — mask as `[REDACTED]`.
4. **ALWAYS run** `SELECT MAX(version) FROM db_migrations` before any migration. If version < expected, stop.
5. **NEVER overwrite higher-confidence data** with lower-confidence data in `canonical_fact_store`.
6. **NEVER start a server** (`npm start`, `npm run dev`) as part of a migration or data-loading script.

### Source Confidence Waterfall (strict priority)

```python
SOURCE_PRIORITY = {
    'trendlyne_mcp':  1.0,
    'tradingview':    0.9,
    'nse_bse':        0.8,
    'screener':       0.75,
    'manual':         0.7,
}
# Higher confidence ALWAYS wins. Equal confidence: keep existing.
```

### canonical_fact_store Upsert Pattern

```sql
INSERT INTO canonical_fact_store (symbol, field, value, source, confidence, fetched_at, ttl_seconds)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(symbol, field) DO UPDATE SET
    value       = excluded.value,
    source      = excluded.source,
    confidence  = excluded.confidence,
    fetched_at  = excluded.fetched_at,
    ttl_seconds = excluded.ttl_seconds
WHERE excluded.confidence > canonical_fact_store.confidence
```

### Operating Principles

- **Idempotency:** Every script must be safe to run twice. Use `INSERT OR IGNORE`, `CREATE INDEX IF NOT EXISTS`, etc.
- **Atomicity:** DB writes use transactions. Roll back everything if any step fails.
- **Source Labelling:** Every `canonical_fact_store` row must carry a valid `source` string and `confidence` float.
- **Backward Compatibility:** Do not remove or rename DB columns or Python function signatures. Add new parameters with defaults.

### F-Filter Thresholds — Immutable

| Filter | Threshold | Rule |
|--------|-----------|------|
| F1 | promoter ≥ 66.67% | |
| F2 | 8 consecutive quarters PAT > 0 | < 8Q available → UNKNOWN (not FAIL) |
| F3 | ROCE ≥ 35% | |
| F4 | ROE ≥ 25% | |
| F5 | pledge ≤ 0.01% | NULL → UNKNOWN; 0.0 → PASS (real zero) |
| F6 | institutional ≥ 5% | FII+DII or `inst_total_pct` |
| F7 | CFO/EBITDA ≥ 0.5 | |

---

## P1 — This Week

### P1-1: DailyOHLCV Symbol Batching in `run_scan()`

**Problem:** `run_scan()` loads all 4.2M rows from `DailyOHLCV` with no symbol filter → 40–50 s. With v16 covering index, a symbol-filtered query takes ~100 ms.

**File:** `run_scan_dossier.py`

```python
def get_scan_universe(db):
    """Use v_scan_universe_latest view (v16) for the active symbol list."""
    try:
        rows = db.execute("SELECT symbol FROM v_scan_universe_latest").fetchall()
        if rows:
            return [r[0] for r in rows]
    except Exception:
        pass
    return [r[0] for r in db.execute("SELECT DISTINCT symbol FROM DailyOHLCV").fetchall()]

def fetch_ohlcv_batched(db, symbols, start_date, batch_size=200):
    """Fetch DailyOHLCV in batches of batch_size to avoid SQLite IN() limits."""
    rows = []
    for i in range(0, len(symbols), batch_size):
        batch = symbols[i:i + batch_size]
        ph = ','.join(['?'] * len(batch))
        chunk = db.execute(f"""
            SELECT symbol, trade_date, open, high, low, close, volume
            FROM DailyOHLCV
            WHERE symbol IN ({ph}) AND trade_date >= ?
            ORDER BY symbol, trade_date
        """, batch + [start_date]).fetchall()
        rows.extend(chunk)
    return rows

# In run_scan():
universe = get_scan_universe(db)
rows = fetch_ohlcv_batched(db, universe, start_date)
```

**Guardrails:**
- Batch size ≤ 500 (SQLite IN() limit is 999; stay well below)
- Fallback to all symbols must be present for robustness
- Do not change C1-C7 calculations — only data loading

**Expected improvement:** 45–60 s → 3–5 s; memory 1.2 GB → ~120 MB

---

### P1-2: Filter `run_fundamentals()` to Qualifying Symbols

**Problem:** `run_fundamentals()` fetches shareholding and financials for all symbols; only qualifying ones (score ≥ threshold) need it.

**File:** `run_scan_dossier.py`

```python
def run_fundamentals(db, qualifying_symbols):
    """
    Fetch fundamentals only for symbols that passed C-score threshold.
    qualifying_symbols: list[str] — from run_scan() output
    """
    if not qualifying_symbols:
        return {}, {}

    ph = ','.join(['?'] * len(qualifying_symbols))

    # v_latest_shareholding (v16 view) — eliminates MAX(as_of_date) subquery
    sh_rows = db.execute(f"""
        SELECT symbol, promoter_pct, fii_pct, dii_pct, pledge_pct, quarter_label, as_of_date
        FROM v_latest_shareholding
        WHERE symbol IN ({ph})
    """, qualifying_symbols).fetchall()

    fin_rows = db.execute(f"""
        SELECT symbol, period_label, statement_type,
               net_profit_pat_cr, sales_cr, opm_pct, cfo_cr,
               borrowings_cr, total_assets_cr, equity_capital_cr, reserves_cr, eps
        FROM HistoricalFinancialStatements
        WHERE symbol IN ({ph})
          AND (statement_type LIKE 'QUARTERLY%' OR statement_type LIKE 'Q%')
        ORDER BY symbol, period_label DESC
    """, qualifying_symbols).fetchall()

    return _build_sh_dict(sh_rows), _build_fin_dict(fin_rows)

# Wire it:
qualifying = [r['symbol'] for r in scan_results if r['score'] >= min_score]
sh_dict, fin_dict = run_fundamentals(db, qualifying)  # filtered
```

**Expected improvement:** F-filter step 8–12 s → ~0.5 s

---

## P2 — Two Weeks

### P2-3: `f_filter_engine.py` — Single Authoritative Module

**Problem:** F-filter logic (F1-F7) duplicated in 3+ files with diverging thresholds.

**File to create:** `scripts/fundamental/f_filter_engine.py`

```python
from typing import Optional

F_THRESHOLDS = {
    'F1_promoter_min':    66.67,
    'F2_quarters':        8,
    'F3_roce_min':        35.0,
    'F4_roe_min':         25.0,
    'F5_pledge_max':      0.01,
    'F6_inst_min':        5.0,
    'F7_cfo_ebitda_min':  0.5,
}

def compute_f_filters(
    symbol: str,
    tv: dict,
    sh: Optional[dict],
    fin_quarters: list,
    thresholds: dict = F_THRESHOLDS,
) -> dict:
    """
    Compute F1-F7 pass/fail/None for one symbol.

    Return shape — all keys always present:
    {
        'F1_promoter_pct': float|None, 'F1_pass': bool|None, 'F1_source': str,
        'F2_quarters_checked': int,     'F2_pats': list,     'F2_pass': bool|None,
        'F3_roce': float|None,          'F3_pass': bool|None, 'F3_source': str,
        'F4_roe':  float|None,          'F4_pass': bool|None, 'F4_source': str,
        'F5_pledge_pct': float|None,    'F5_pass': bool|None, 'F5_source': str,
        'F6_inst_pct':   float|None,    'F6_pass': bool|None, 'F6_source': str,
        'F7_cfo_ebitda': float|None,    'F7_pass': bool|None, 'F7_source': str,
        'f_score': int,
        'f_unknowns': int,
    }

    Rules:
      - pass=None  → data unavailable (never treated as FAIL)
      - pass=False → data available and threshold not met
      - ZERO synthetic defaults — missing data stays None
    """
    ...
```

**Migration plan:** After creating, remove local F-filter blocks from:
- `scripts/fundamental/run_29q_with_tv.py`
- `scripts/fundamental/sync_verified_fundamentals_package.py`
- `run_scan_dossier.py`

**Verification:** Run both old and new code on 5 test symbols; diff must be empty before merging.

---

### P2-4: `source_waterfall.py` — Reusable Waterfall Engine

**Problem:** 3-layer waterfall embedded in `run_29q_with_tv.py`; not importable by other scripts.

**File to create:** `scripts/fundamental/source_waterfall.py`

```python
class SourceWaterfallEngine:
    """
    Deterministic data resolution: primary DB tables → canonical_fact_store → live fetch.
    Importable by any scan or analysis script.
    """

    def __init__(self, db, server: str = 'http://localhost:3000'):
        self.db = db
        self.server = server

    def get_shareholding(self, symbols: list, enrich: bool = False) -> dict:
        """
        Layer 1: HistoricalShareholdingPattern (most recent row)
        Layer 2: canonical_fact_store (cached data)
        Layer 3: live Trendlyne fetch (only if enrich=True)

        Never returns synthetic values. Missing fields remain None.
        """
        ...

    def get_field(self, symbol: str, field: str) -> tuple:
        """Get a single field. Returns (value, source_name)."""
        ...

    def put_field(self, symbol, field, value, source, confidence, ttl_days=30):
        """Write to canonical_fact_store using confidence-guarded upsert."""
        ...
```

---

### P2-5: Configure `TRENDLYNE_MCP_URL`

**Problem:** F1/F5/F6 are UNKNOWN for every new symbol until Trendlyne MCP is configured.

**Bot rules:**
- DO NOT create, edit, or read `.env` files
- DO NOT ask the user for the URL value
- DO check `os.getenv('TRENDLYNE_MCP_URL')` and raise `TrendlyneUnavailableError` if missing
- NEVER log or print the URL value (may contain auth tokens)

```python
# In trendlyne_bridge.py — before any HTTP call:
url = os.getenv('TRENDLYNE_MCP_URL')
if not url:
    raise TrendlyneUnavailableError(
        "TRENDLYNE_MCP_URL not set in .env. "
        "Contact admin to configure the Trendlyne MCP endpoint."
    )
```

**Post-configuration backfill (user runs once):**
```bash
python scripts/fundamental/trendlyne_bridge.py \
    --symbols "$(sqlite3 portfolio.db 'SELECT GROUP_CONCAT(symbol) FROM MasterTickers')" \
    --fields promoter_pct,pledge_pct,fii_pct,dii_pct,institutional_pct \
    --store
```

---

## P3 — One Month

### P3-6: NSE/BSE Shareholding Bulk Download

Auto-populate `HistoricalShareholdingPattern` from NSE XBRL quarterly files.  
**File:** `scripts/fundamental/nse_shp_ingest.py`  
**Guardrail:** Never overwrite existing rows with same `(symbol, as_of_date)`. `pledge_pct` from NSE is authoritative.

### P3-7: F6 Institutional Trend Check (4Q)

Add F6 trend: institutional ≥ 5% AND stable/increasing over 4 quarters (no sudden exits).  
`F6_trend_pass` as supplementary field alongside existing `F6_pass`.

### P3-8: ROCE Trailing 4Q Average

Replace `single_quarter_opm × 4` with trailing 4Q sum. Label source as `'DB TTM (4Q avg)'`.

### P3-9: Cross-Source Conflict Detection

Flag when TV and Trendlyne differ > 20% on the same field. Write to `data_conflicts` table — do not fail silently.

```python
def detect_conflicts(symbol, field, val_a, src_a, val_b, src_b, threshold=0.20):
    if val_a is not None and val_b is not None:
        diff = abs(val_a - val_b) / max(abs(val_a), abs(val_b), 1e-6)
        if diff > threshold:
            return {'conflict': True, 'diff_pct': round(diff*100, 1), 'sources': [src_a, src_b]}
    return None
```

---

## Test Plan

**Three tiers — always run against test copy of portfolio.db (never the live DB).**

| Tier | Scope | Command | Speed |
|------|-------|---------|-------|
| Unit | Pure functions, no DB | `pytest tests/unit/` | < 5 s |
| Integration | Real DB, seed data, no network | `pytest tests/integration/` | < 30 s |
| E2E | Full pipeline, no network | `pytest tests/e2e/ -m "not network"` | < 90 s |

### Test DB Setup

```python
# tests/conftest.py
import pytest, sqlite3, shutil

@pytest.fixture(scope='session')
def test_db(tmp_path_factory):
    dst = tmp_path_factory.mktemp('db') / 'test.db'
    shutil.copy('portfolio.db', dst)
    db = sqlite3.connect(str(dst))
    _seed_test_data(db)
    db.commit()
    yield db
    db.close()

TEST_SYMBOLS = [
    # symbol, promoter%, pledge%, fii%, dii%, q_pat×8
    ('TEST_PASS_ALL', 70.0, 0.0,  4.0,  3.0, [10.0]*8),  # all 7 pass
    ('TEST_FAIL_F1',  60.0, 0.0,  4.0,  3.0, [10.0]*8),  # F1 fail
    ('TEST_FAIL_F2',  70.0, 0.0,  4.0,  3.0, [10.0]*7),  # F2 None (7Q)
    ('TEST_FAIL_F5',  70.0, 5.0,  4.0,  3.0, [10.0]*8),  # F5 fail
    ('TEST_NO_DATA',  None, None, None, None, []),         # all UNKNOWN
]
```

### Test Cases (30 total)

#### Unit Tests — F-filter Engine

| ID | Test | Expected |
|----|------|----------|
| U01 | F1 PASS when promoter = 66.67% | `F1_pass=True` |
| U02 | F1 FAIL when promoter = 66.66% | `F1_pass=False` |
| U03 | **F1 UNKNOWN when promoter is None — no synthetic 0** | `F1_pass=None`, `F1_promoter_pct=None` |
| U04 | F2 PASS requires exactly 8 quarters all positive | `F2_pass=True`, `F2_quarters_checked=8` |
| U05 | **F2 UNKNOWN when only 7 quarters available** | `F2_pass=None` (insufficient data, not False) |
| U06 | F2 FAIL when one quarter has `pat_cr=0` | `F2_pass=False` |
| U07 | F5 pledge=0.0% passes (zero is a real value) | `F5_pass=True` |
| U08 | **F5 UNKNOWN when pledge is None — not treated as 0** | `F5_pass=None`, `F5_pledge_pct=None` |
| U09 | F6 uses `inst_total_pct` when FII/DII not split | `F6_inst_pct=8.0`, `F6_pass=True` |
| U10 | `f_score` counts only True passes, not None | `f_score=3`, `f_unknowns=3` |
| U11 | F3 TV waterfall: `roce_fy` preferred over `roa_fy` proxy | `F3_source` contains 'ROCE FY' |
| U12 | F7 requires all 4 quarters with CFO/EBITDA present | `F7_pass=None` for 3Q |

#### Integration Tests — Source Waterfall

| ID | Test | Expected |
|----|------|----------|
| I01 | Layer 1: SHP present → used, CFS not queried | `sh_quarter` is real date, not 'canonical_fact_store' |
| I02 | Layer 2: No SHP → CFS fallback used | `sh_quarter` contains 'canonical_fact_store' |
| I03 | Layer 2: High-confidence CFS not overwritten by lower-confidence upsert | 70% (conf 1.0) survives 65% (conf 0.9) upsert |
| I04 | **No SHP, no CFS → symbol absent from result (not fabricated)** | Symbol absent or all fields None |
| I05 | 600 symbols handled without SQLite IN() error | No exception |
| I06 | CFS upsert is idempotent — no duplicate rows | Exactly 1 row for (symbol, field) |
| I07 | `v_latest_shareholding` returns only most recent quarter | 1 row per symbol |
| I08 | `fetch_ohlcv_batched` returns same rows as unfiltered query | Set equality |

#### Integration Tests — 29Q Pipeline

| ID | Test | Expected |
|----|------|----------|
| I09 | `--symbols` mode produces non-zero C-scores for TV-listed stocks | `tech_score > 0` |
| I10 | `--from-scan` uses scan-provided C-scores, not TV derivation | `tech_score = 7` from scan JSON |
| I11 | 29Q JSON output has all required top-level keys | All keys present |
| I12 | `--enrich` skips gracefully when server not running | `returncode == 0` |

#### Performance Tests

| ID | Test | Expected |
|----|------|----------|
| P01 | `fetch_ohlcv_batched` ≤ 5 s for 500 symbols | < 5 s |
| P02 | `run_fundamentals(qualifying)` ≤ 0.5 s | < 0.5 s |

#### Negative / Guardrail Tests

| ID | Test | Expected |
|----|------|----------|
| N01 | **CFS never stores None values** | Row count unchanged after None-returning fetch |
| N02 | Migration script safe to run twice | Second run completes, DB version still 16 |
| N03 | `TrendlyneUnavailableError` raised (not crash) when URL unset | `TrendlyneUnavailableError` raised |
| N04 | `batch_size > 500` clamped or raises `ValueError` | `ValueError` raised |
| N05 | `run_fundamentals([])` returns `({}, {})` without querying DB | `sh == {} and fin == {}` |
| N06 | F-filter result always has all 7 keys even for unknown symbol | All `F*_pass = None`, `f_unknowns = 7` |

#### E2E Tests

| ID | Test | Expected |
|----|------|----------|
| E01 | Full scan → fundamentals → 29Q pipeline produces output files | `scan_results.json` and `29q_results_*.json` exist |
| E02 | Conviction score always in [0, 10] | `0.0 <= conviction <= 10.0` for every record |
| E03 | Pipeline produces identical output on second run (determinism) | `f_score` and `tech_score` identical across runs |

---

*WealthOS Dev Spec · Generated 2026-10-18 · 9 pending items · 30 test cases*
