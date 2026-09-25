@echo off
setlocal
echo ======================================================
echo WealthOS - Six Strategies 90-Day Scan & Excel Pipeline
echo ======================================================
echo Strategies: S1A, S1B, S2A, S3A, S4A, S5A
echo Mode: Deterministic local scan over adjusted DuckDB/Parquet
echo.

node scripts/market_data/run_six_strategies_90d_pipeline.mjs %*

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Pipeline encountered an error. Check logs above.
  pause
  exit /b %ERRORLEVEL%
)

echo.
echo [SUCCESS] Pipeline completed successfully!
echo Excel report is ready in outputs/
pause
