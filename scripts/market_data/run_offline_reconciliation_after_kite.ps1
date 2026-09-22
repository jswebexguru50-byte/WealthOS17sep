param(
  [int]$ImporterPid
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtimePython = 'C:\Users\gopal\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$packagePath = Join-Path $workspace '.tools\hf_ohlcv_env'
$outputDir = Join-Path $workspace 'data\market_data\tejhq_hf_10y\kite_adjusted_backfill'

# The importer persists each symbol before moving to the next.  Waiting here
# means reconciliation only ever sees a completed, stable collection.
while (Get-Process -Id $ImporterPid -ErrorAction SilentlyContinue) {
  Start-Sleep -Seconds 60
}

$env:PYTHONPATH = $packagePath
$logPath = Join-Path $outputDir 'offline_reconciliation.log'
& $runtimePython (Join-Path $workspace 'scripts\market_data\finalize_adjusted_ohlcv_store.py') *> $logPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
