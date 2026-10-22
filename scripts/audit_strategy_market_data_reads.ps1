$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$out = Join-Path $root 'reports\readiness\strategy_market_data_source_audit.csv'
$files = Get-ChildItem (Join-Path $root 'src\server\services') -Recurse -Filter '*.ts'
$rows = foreach ($file in $files) {
  $text = Get-Content $file.FullName -Raw
  $duck = ([regex]::Matches($text, 'DuckDbAdjustedOhlcvService|fetchTickerData\(')).Count
  $sqlite = ([regex]::Matches($text, 'DailyOHLCV|HistoricalPrices')).Count
  $upstox = ([regex]::Matches($text, 'historical-candle|UPSTOX')).Count
  if ($duck -gt 0 -or $sqlite -gt 0 -or $upstox -gt 0) {
    [pscustomobject]@{
      service = $file.FullName.Substring($root.Path.Length + 1).Replace('\','/')
      duckdb_or_gateway_references = $duck
      legacy_sqlite_ohlcv_references = $sqlite
      upstox_references = $upstox
      migration_status = if ($sqlite -eq 0 -and $duck -gt 0) {'DUCKDB_PRIORITY'} elseif ($sqlite -gt 0) {'MIGRATION_REQUIRED'} else {'NO_DAILY_OHLCV_READ'}
    }
  }
}
$rows | Sort-Object migration_status,service | Export-Csv -NoTypeInformation -Encoding utf8 $out
$rows | Group-Object migration_status | Select-Object Name,Count | ConvertTo-Json
