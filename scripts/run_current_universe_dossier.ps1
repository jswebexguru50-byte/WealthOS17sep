$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
npx tsx scripts/run_current_universe_dossier.ts
