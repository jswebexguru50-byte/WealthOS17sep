#!/usr/bin/env bash
# run_tests.sh — runs the WealthOS e2e pipeline acceptance test suite
# Exits 0 on all tests passing, non-zero on any failure.

set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== WealthOS E2E Pipeline Acceptance Tests ==="
echo "Working directory: $(pwd)"
echo "Test file: tests/e2e/pipeline.test.ts"
echo ""

# Use the project's local vitest binary
VITEST="./node_modules/.bin/vitest"
if [ ! -f "$VITEST" ]; then
  echo "ERROR: vitest not found at $VITEST — run 'npm install' first" >&2
  exit 1
fi

# Run only the e2e pipeline test file.
# --config=/dev/null bypasses the project vitest config which excludes tests/e2e/**
"$VITEST" run tests/e2e/pipeline.test.ts --config=/dev/null --reporter=verbose
STATUS=$?

if [ $STATUS -eq 0 ]; then
  echo ""
  echo "=== ALL E2E PIPELINE TESTS PASSED ==="
else
  echo ""
  echo "=== E2E PIPELINE TESTS FAILED (exit $STATUS) ===" >&2
fi

exit $STATUS
