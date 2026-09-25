#!/usr/bin/env python3
"""Promote corporate-action-safe Upstox staging files into the app catalog."""
from __future__ import annotations
import json
from pathlib import Path
import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "data" / "market_data" / "tejhq_hf_10y"
STAGING = STORE / "upstox_targeted_backfill"
VETTED = STAGING / "verified_no_structural_actions"
MANIFEST = STAGING / "manifest.json"
REPORT = ROOT / "reports" / "readiness" / "upstox_targeted_promotion_report.json"

def structural_actions(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8")).get("data", [])
    return [str(x.get("name", "")).upper() for x in data
            if any(term in str(x.get("name", "")).upper() for term in ("SPLIT", "BONUS", "RIGHT", "DEMERGER", "MERGER", "AMALGAM"))]

def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["symbols"]
    promoted, held = [], []
    for symbol, record in manifest.items():
        if record.get("status") != "STAGED": continue
        # A broker response with no listed action is not evidence of a complete
        # ten-year adjustment chain. Promotion requires a separate verified
        # corporate-action reconciliation record, absent for current staging.
        if record.get("adjustment_status") != "VERIFIED_CORPORATE_ACTION_ADJUSTED":
            held.append({"symbol": symbol, "reason": "ADJUSTMENT_NOT_VERIFIED"}); continue
        actions = structural_actions(STAGING / record["corporate_actions_path"])
        if actions:
            held.append({"symbol": symbol, "actions": actions}); continue
        source = STAGING / record["path"]
        df = pd.read_parquet(source).rename(columns={
            "open_raw":"open_adjusted", "high_raw":"high_adjusted", "low_raw":"low_adjusted", "close_raw":"close_adjusted"})
        df["data_source"] = "UPSTOX_CA_RECONCILED_NO_STRUCTURAL_ACTION"
        dest = VETTED / f"symbol={symbol}" / "part-0.parquet"; dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_suffix(".parquet.partial"); df.to_parquet(temp, index=False, compression="zstd"); temp.replace(dest)
        promoted.append(symbol)
    con = duckdb.connect(str(STORE / "ohlcv.duckdb"))
    try:
        if promoted:
            glob = (VETTED / "symbol=*" / "*.parquet").as_posix().replace("'", "''")
            allowed = ",".join("'" + symbol.replace("'", "''") + "'" for symbol in promoted)
            con.execute(f"CREATE OR REPLACE VIEW upstox_verified_ohlcv AS SELECT * FROM read_parquet('{glob}', union_by_name=true) WHERE symbol IN ({allowed})")
            con.execute("""CREATE OR REPLACE VIEW app_adjusted_ohlcv AS
              SELECT p.* FROM primary_adjusted_ohlcv p
              UNION ALL
              SELECT u.trade_date, u.symbol, u.isin, u.upstox_key_nse,
                     u.open_adjusted, u.high_adjusted, u.low_adjusted,
                     u.close_adjusted, u.volume_raw, u.data_source
              FROM upstox_verified_ohlcv u
              WHERE NOT EXISTS (
                  SELECT 1 FROM primary_adjusted_ohlcv p
                  WHERE p.upstox_key_nse=u.upstox_key_nse AND p.trade_date=u.trade_date
              )""")
        else:
            con.execute("CREATE OR REPLACE VIEW app_adjusted_ohlcv AS SELECT * FROM primary_adjusted_ohlcv")
    finally: con.close()
    payload={"promoted_no_structural_actions":len(promoted), "held_for_structural_action_adjustment":held,
             "invalid_key_worklist": "reports/readiness/upstox_invalid_instrument_keys_42.csv"}
    REPORT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))
if __name__ == "__main__": main()
