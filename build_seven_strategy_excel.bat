@echo off
setlocal
echo ======================================================
echo WealthOS - Rebuild 7-Tab Six-Strategy Excel Report
echo ======================================================
echo.

node scripts/market_data/build_seven_strategy_90d_excel.mjs %*

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [ERROR] Excel generation failed.
  pause
  exit /b %ERRORLEVEL%
)

echo.
echo [SUCCESS] Excel workbook generated successfully in outputs/
pause
