#!/bin/bash
# ============================================================
# WealthOS Analyst Dossier — Reusable Orchestrator
# Name: run_analyst_dossier
# Usage: ./run_analyst_dossier.sh [options]
#   --days N        Trading sessions to scan (default: 90)
#   --out PATH      Output HTML path (default: ~/Desktop/WealthOS_Dossier_YYYYMMDD.html)
#   --json PATH     Path to save raw scan JSON (default: /tmp/scan_out.json)
#   --skip-scan     Skip scan, use existing --json file
#   --open          Open HTML in browser after generation
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEALTHOS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATE_STR="$(date +%Y%m%d)"

# ── Defaults ──────────────────────────────────────────────
DAYS=90
SCAN_JSON="/tmp/scan_out_${DATE_STR}.json"
OUT_HTML="$HOME/Desktop/WealthOS_Dossier_${DATE_STR}.html"
SKIP_SCAN=false
OPEN_BROWSER=false

# ── Parse args ────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --days)     DAYS="$2"; shift 2 ;;
    --out)      OUT_HTML="$2"; shift 2 ;;
    --json)     SCAN_JSON="$2"; shift 2 ;;
    --skip-scan) SKIP_SCAN=true; shift ;;
    --open)     OPEN_BROWSER=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  WealthOS Analyst Dossier Generator"
echo "  Date: $(date '+%Y-%m-%d %H:%M')"
echo "  Strategies: S1A, S1B, S2A, S3A, S4A, S4B, S5A (all 7)"
echo "  Filters: F1-F7 (Promoter ≥66.6%, ROCE ≥35%, ROE ≥25%,"
echo "           8 profitable quarters, CFO/OP ≥0.5, no pledge, institutional)"
echo "  Window: ${DAYS} trading sessions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Run 7-strategy scan ──────────────────────────
if [ "$SKIP_SCAN" = false ]; then
  echo ""
  echo "▶ STEP 1: Running 7-strategy scan (${DAYS} sessions)..."
  cd "$WEALTHOS_DIR"

  # Run the orchestrator and capture JSON output
  npx ts-node --project tsconfig.json \
    scripts/fundamental/ScanToDossierOrchestrator.ts \
    --days "$DAYS" \
    > "$SCAN_JSON" 2>/tmp/scan_stderr.log

  if [ $? -ne 0 ]; then
    echo "❌ Scan failed! See /tmp/scan_stderr.log"
    cat /tmp/scan_stderr.log | tail -20
    exit 1
  fi

  HITS=$(python3 -c "import json; d=json.load(open('$SCAN_JSON')); print(len(d.get('stocks', d.get('candidates', []))))" 2>/dev/null || echo "?")
  SIGNALS=$(python3 -c "import json; d=json.load(open('$SCAN_JSON')); print(sum(d.get('signalCounts',{}).values()))" 2>/dev/null || echo "?")
  echo "  ✓ Scan complete: ${HITS} unique stocks, ${SIGNALS} signals"
  echo "  ✓ Saved to: $SCAN_JSON"
else
  echo ""
  echo "▶ STEP 1: Skipping scan, using: $SCAN_JSON"
fi

# Fetch cash flow for the actual scan candidates before assigning dossier tiers.
echo ""
echo "▶ Enriching annual CFO / operating EBITDA (Trendlyne)..."
node "$SCRIPT_DIR/enrich_dossier_cashflow.mjs" "$SCAN_JSON"

# ── Step 2: Generate HTML dossier ────────────────────────
echo ""
echo "▶ STEP 2: Generating interactive HTML dossier..."

HTML_GENERATOR="$SCRIPT_DIR/generate_dossier_html.py"

python3 "$HTML_GENERATOR" "$SCAN_JSON" "$OUT_HTML"

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$OUT_HTML" 2>/dev/null | cut -f1)
  echo "  ✓ HTML generated: $OUT_HTML ($SIZE)"
else
  echo "❌ HTML generation failed!"
  exit 1
fi

# ── Step 3: Open in browser ──────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ DOSSIER READY: $OUT_HTML"
echo "  📊 Scan JSON:    $SCAN_JSON"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$OPEN_BROWSER" = true ]; then
  echo ""
  echo "▶ Opening in browser..."
  open "$OUT_HTML" 2>/dev/null || xdg-open "$OUT_HTML" 2>/dev/null || echo "  (open manually)"
fi

echo ""
echo "  To regenerate with same scan data:"
echo "  ./run_analyst_dossier.sh --skip-scan --json $SCAN_JSON --out $OUT_HTML"
echo ""
echo "  To run fresh scan:"
echo "  ./run_analyst_dossier.sh --days 90 --out ~/Desktop/WealthOS_Dossier.html --open"
