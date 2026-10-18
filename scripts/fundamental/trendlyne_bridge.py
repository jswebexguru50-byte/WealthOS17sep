"""
trendlyne_bridge.py — Python HTTP bridge to the Express TrendlyneMcpClient.

Calls POST /api/trendlyne-mcp/batch-fetch on the running WealthOS Express
server (default http://localhost:3000), which delegates to TrendlyneMcpClient.ts
via the MCP transport.  Translates WealthOS canonical field names to Trendlyne
tokens server-side — callers use WealthOS names throughout.

Usage (as module):
    from trendlyne_bridge import fetch, fetch_and_store

    # Raw fetch — no DB write
    result = fetch(["RELIANCE", "HDFCBANK"], ["promoter_pct", "pledge_pct", "roce"])
    # {"RELIANCE": {"promoter_pct": 50.1, "pledge_pct": 0.0, "roce": 11.2}, ...}

    # Fetch + upsert into canonical_fact_store (respects source-waterfall confidence)
    result = fetch_and_store(db, ["RELIANCE"], ["promoter_pct", "pledge_pct"])

Usage (CLI):
    python trendlyne_bridge.py --symbols RELIANCE,HDFCBANK --fields promoter_pct,pledge_pct
    python trendlyne_bridge.py --symbols RELIANCE --fields promoter_pct,roce --store --db ../../portfolio.db
"""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

# ── Configuration ──────────────────────────────────────────────────────────────
_DEFAULT_SERVER = "http://localhost:3000"
SERVER_URL = os.environ.get("WEALTHOS_SERVER", _DEFAULT_SERVER)
_ENDPOINT  = f"{SERVER_URL}/api/trendlyne-mcp/batch-fetch"

TIMEOUT_S           = 90    # Trendlyne MCP can be slow for large batches
MAX_SYMBOLS_PER_CALL = 50   # enforced by trendlyneMcp.ts:MAX_BATCH_SYMBOLS
MAX_FIELDS_PER_CALL  = 50   # enforced by trendlyneMcp.ts:MAX_FIELDS
SOURCE               = "trendlyne_mcp"
CONFIDENCE           = 1.0  # highest in source waterfall

# TTL rules (mirrors source_waterfall.py DEFAULT_TTL_RULES)
_TTL_RULES: tuple[tuple[tuple[str, ...], int], ...] = (
    (("pledge", "promoter", "fii", "dii", "institutional", "mf", "shareholding"), 30 * 86400),
    (("roce", "roe", "pat", "ebitda", "cfo", "revenue", "sales"), 30 * 86400),
    (("pe_ttm", "market_cap", "price_to_book", "eps_ttm"), 6 * 3600),
    (("net_debt", "debt_equity"), 30 * 86400),
)
_DEFAULT_TTL = 86400


def _ttl(field: str) -> int:
    fl = field.lower()
    for keys, ttl in _TTL_RULES:
        if any(k in fl for k in keys):
            return ttl
    return _DEFAULT_TTL


# ── Exceptions ─────────────────────────────────────────────────────────────────
class TrendlyneBridgeError(Exception):
    """General bridge error (validation, server error)."""

class TrendlyneUnavailableError(TrendlyneBridgeError):
    """Server reports 503: MCP transport not configured."""


# Historical callers use these names; keep them as aliases during the API
# migration so source-waterfall imports remain backward compatible.
BridgeUnavailable = TrendlyneUnavailableError


# ── Internal chunk call ────────────────────────────────────────────────────────
def _post_chunk(
    symbols: list[str],
    fields: list[str],
    endpoint: str,
) -> dict[str, dict[str, Any]]:
    """POST one chunk. Returns {SYM: {field: value_or_None, '_error'?: str}}."""
    resp = requests.post(
        endpoint,
        json={"symbols": symbols, "fields": fields},
        timeout=TIMEOUT_S,
    )
    if resp.status_code == 503:
        body = resp.json()
        raise TrendlyneUnavailableError(
            body.get("message", "Trendlyne MCP transport not configured on server")
        )
    if resp.status_code == 400:
        body = resp.json()
        raise TrendlyneBridgeError(f"Bad request: {body.get('message', resp.text)}")
    resp.raise_for_status()

    body = resp.json()
    if not body.get("success"):
        raise TrendlyneBridgeError(f"Server error: {body.get('message', 'unknown')}")

    raw    = body.get("data") or {}
    errors = body.get("errors") or {}

    result: dict[str, dict[str, Any]] = {}
    for sym in symbols:
        sym_u    = sym.upper()
        sym_data = raw.get(sym_u, {})
        result[sym_u] = {}
        for f in fields:
            cell = sym_data.get(f)
            # cell: null  →  None;   {"value": v, "as_of": "...", "source": "..."}  →  v
            result[sym_u][f] = (
                cell["value"] if isinstance(cell, dict) and "value" in cell else None
            )
        if sym_u in errors:
            result[sym_u]["_error"] = errors[sym_u]

    return result


# ── Public: fetch ──────────────────────────────────────────────────────────────
def fetch(
    symbols: list[str],
    fields: list[str],
    *,
    server: str = SERVER_URL,
) -> dict[str, dict[str, Any]]:
    """
    Fetch Trendlyne data via the Express server.

    Both WealthOS canonical names (promoter_pct, pledge_pct, roce …) and raw
    Trendlyne tokens (prompct, prompledge, rocea …) are accepted; translation
    happens server-side.

    Returns:
        {SYMBOL: {field: value_or_None}}
        A symbol that errored has a '_error' key alongside nulled fields.

    Raises:
        TrendlyneUnavailableError  — server reports MCP transport unconfigured.
        TrendlyneBridgeError       — validation or server error.
        requests.RequestException  — network failure.
    """
    if not symbols or not fields:
        return {}
    if server == SERVER_URL and not os.getenv('TRENDLYNE_MCP_URL'):
        raise TrendlyneUnavailableError('TRENDLYNE_MCP_URL is not configured')

    syms     = [s.strip().upper() for s in symbols if s.strip()]
    endpoint = f"{server.rstrip('/')}/api/trendlyne-mcp/batch-fetch"
    result: dict[str, dict[str, Any]] = {s: {} for s in syms}

    # Chunk both dimensions to stay within server caps
    sym_chunks = [syms[i : i + MAX_SYMBOLS_PER_CALL]
                  for i in range(0, len(syms), MAX_SYMBOLS_PER_CALL)]
    fld_chunks = [fields[i : i + MAX_FIELDS_PER_CALL]
                  for i in range(0, len(fields), MAX_FIELDS_PER_CALL)]

    for sc in sym_chunks:
        chunk_result: dict[str, dict[str, Any]] = {s: {} for s in sc}
        for fc in fld_chunks:
            partial = _post_chunk(sc, fc, endpoint)
            for sym, vals in partial.items():
                chunk_result[sym].update(vals)
        result.update(chunk_result)

    return result


def fetch_batch(symbols: list[str], fields: list[str], *, base_url: str = SERVER_URL,
                timeout: int = TIMEOUT_S) -> dict[str, dict[str, Any]]:
    """Compatibility API returning provenance-bearing cells.

    Unlike ``fetch``, this preserves the server's ``source``/``as_of`` fields
    for callers that need audit metadata. Failed symbols are represented with
    explicit ``None`` cells; no fallback values are introduced.
    """
    if not symbols or not fields:
        return {}
    old_timeout = globals()['TIMEOUT_S']
    globals()['TIMEOUT_S'] = timeout
    try:
        endpoint = f"{base_url.rstrip('/')}/api/trendlyne-mcp/batch-fetch"
        out = {}
        for i in range(0, len(symbols), MAX_SYMBOLS_PER_CALL):
            chunk = [s.strip().upper() for s in symbols[i:i + MAX_SYMBOLS_PER_CALL]]
            try:
                raw = _post_chunk(chunk, fields, endpoint)
            except requests.RequestException as exc:
                raise BridgeUnavailable(str(exc)) from exc
            for sym in chunk:
                out[sym] = {}
                for field in fields:
                    value = raw.get(sym, {}).get(field)
                    out[sym][field] = None if value is None else {
                        'value': value, 'source': SOURCE, 'as_of': None
                    }
        return dict(sorted(out.items()))
    finally:
        globals()['TIMEOUT_S'] = old_timeout


# ── Public: fetch + store ──────────────────────────────────────────────────────
def fetch_and_store(
    db: sqlite3.Connection,
    symbols: list[str],
    fields: list[str],
    *,
    server: str = SERVER_URL,
    force: bool = False,
) -> dict[str, dict[str, Any]]:
    """
    Fetch from Trendlyne and upsert non-null values into canonical_fact_store.

    ZERO FABRICATION: None values are never written to the fact store.
    Source-waterfall rule: only replaces an existing row when our confidence
    is strictly greater, or the stored row has expired its TTL.

    Args:
        db:      Open sqlite3 connection to portfolio.db.
        symbols: NSE/BSE symbols.
        fields:  WealthOS field names or raw Trendlyne tokens.
        server:  Override WealthOS server URL.
        force:   Deprecated compatibility argument; never bypasses confidence.

    Returns:
        Same shape as fetch(): {SYMBOL: {field: value_or_None}}
    """
    now  = datetime.now(timezone.utc).isoformat()
    data = fetch(symbols, fields, server=server)

    rows: list[tuple] = []
    for sym, vals in data.items():
        for field, value in vals.items():
            if field == "_error":
                continue
            if value is None:
                continue   # unknown stays NULL — never store fabricated zero
            rows.append((
                sym,
                field,
                json.dumps(value),
                SOURCE,
                CONFIDENCE,
                now,
                _ttl(field),
            ))

    if rows:
        # Never overwrite a higher- or equal-confidence value. The ``force``
        # parameter is intentionally ignored: it cannot waive the evidence
        # integrity invariant.
        db.executemany(
                """INSERT INTO canonical_fact_store
                   (symbol, field, value, source, confidence, fetched_at, ttl_seconds)
                   VALUES (?,?,?,?,?,?,?)
                   ON CONFLICT(symbol, field) DO UPDATE SET
                     value       = excluded.value,
                     source      = excluded.source,
                     confidence  = excluded.confidence,
                     fetched_at  = excluded.fetched_at,
                     ttl_seconds = excluded.ttl_seconds
                   WHERE excluded.confidence > canonical_fact_store.confidence
                      OR (julianday('now') - julianday(canonical_fact_store.fetched_at))
                         * 86400 > canonical_fact_store.ttl_seconds""",
                rows,
        )
        db.commit()

    return data


# ── CLI entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(
        description="Fetch Trendlyne data via the WealthOS Express server."
    )
    ap.add_argument("--symbols", required=True,
                    help="Comma-separated NSE symbols, e.g. RELIANCE,HDFCBANK")
    ap.add_argument("--fields", required=True,
                    help="Comma-separated WealthOS field names, e.g. promoter_pct,pledge_pct,roce")
    ap.add_argument("--store", action="store_true",
                    help="Upsert results into canonical_fact_store in portfolio.db")
    ap.add_argument("--db",
                    default=str(Path(__file__).parents[2] / "portfolio.db"),
                    help="Path to portfolio.db (default: ../../portfolio.db relative to this file)")
    ap.add_argument("--server", default=SERVER_URL,
                    help=f"WealthOS server base URL (default: {SERVER_URL}; "
                         "or set WEALTHOS_SERVER env var)")
    ap.add_argument("--force", action="store_true",
                    help="Overwrite canonical_fact_store rows regardless of existing confidence")

    args = ap.parse_args()

    syms   = [s.strip() for s in args.symbols.split(",") if s.strip()]
    fields = [f.strip() for f in args.fields.split(",") if f.strip()]

    try:
        if args.store:
            con = sqlite3.connect(args.db)
            con.execute("PRAGMA journal_mode=WAL")
            con.execute("PRAGMA busy_timeout=15000")
            result = fetch_and_store(con, syms, fields, server=args.server, force=args.force)
            n_stored = sum(
                1
                for sym_vals in result.values()
                for k, v in sym_vals.items()
                if k != "_error" and v is not None
            )
            print(f"Stored {n_stored} facts to canonical_fact_store.", file=sys.stderr)
            con.close()
        else:
            result = fetch(syms, fields, server=args.server)

        print(json.dumps(result, indent=2, default=str))

    except TrendlyneUnavailableError as e:
        print(f"ERROR [503]: {e}", file=sys.stderr)
        sys.exit(2)
    except TrendlyneBridgeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except requests.RequestException as e:
        print(f"NETWORK ERROR: {e}", file=sys.stderr)
        print(f"Is the WealthOS server running at {args.server}?", file=sys.stderr)
        sys.exit(3)
