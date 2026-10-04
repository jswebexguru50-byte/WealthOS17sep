import csv
import json
import os
from pathlib import Path

csv_dir = Path("outputs/alphanumeric_7d_20260930/reports")
files = [
    "s1b_full_universe_7d_20260930_20261001T054219Z.csv",
    "s2a_full_universe_7d_20260930_20261001T055049Z.csv",
    "vpa_three_leg_full_universe_7d_20260930_20261001T053305Z.csv"
]

symbols = set()

for filename in files:
    filepath = csv_dir / filename
    if not filepath.exists():
        print(f"File {filename} not found")
        continue
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sym = None
            if "symbol" in row: sym = row["symbol"]
            elif "Symbol" in row: sym = row["Symbol"]
            
            if sym:
                symbols.add(sym.strip().upper())

print(f"Extracted {len(symbols)} unique symbols: {sorted(list(symbols))}")

manifest = {
    "sourceExcel": "Seven_Strategies_7_Days_Technical_20260930.csv",
    "cutoffDate": "2026-09-30",
    "totalSymbols": len(symbols),
    "convergenceSymbolsCount": 0,
    "symbols": sorted(list(symbols)),
    "details": {}
}

manifest_path = Path("data/fundamental_enrichment/excel_strategy_manifest.json")
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"Wrote manifest to {manifest_path}")
