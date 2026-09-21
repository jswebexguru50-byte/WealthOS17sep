@echo off
:: PHASE 10R-M.4 OVERNIGHT RECOVERY LAUNCHER
:: Zero-AI dependency. Single-instance. Auto-resume on restart.
:: Install as Windows Task Scheduler task via install_task_scheduler.bat

setlocal
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

:: Navigate to webapp root (2 levels up from scripts/remediation)
cd /d "%ROOT%\..\.."

echo [%DATE% %TIME%] M.4 Overnight Recovery Launcher started.
echo [%DATE% %TIME%] Working directory: %CD%

:: Check for Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH.
    exit /b 1
)

:: Single-instance check via lock file
set "LOCK_FILE=%CD%\reports\market-data\runtime\m4\runtime.lock"
if exist "%LOCK_FILE%" (
    echo [WARNING] Lock file exists. Checking age...
    :: Let the Node runtime handle stale lock detection
)

:: Set year argument (default to 2026 if not provided)
set "ARGS=%*"
if "%ARGS%"=="" set "ARGS=--year 2026"

:: Launch the durable runtime
echo [%DATE% %TIME%] Launching phase10rm4_overnight_runtime.cjs %ARGS%...
node "%CD%\scripts\remediation\phase10rm4_overnight_runtime.cjs" %ARGS%

set "EXIT_CODE=%ERRORLEVEL%"
echo [%DATE% %TIME%] Runtime exited with code %EXIT_CODE%.

:: Exit code handling
if %EXIT_CODE%==0 echo [%DATE% %TIME%] Recovery completed successfully.
if %EXIT_CODE%==1 echo [%DATE% %TIME%] Fatal error — check events.jsonl for details.
if %EXIT_CODE%==2 echo [%DATE% %TIME%] Protected state violation — SAFE HALT.
if %EXIT_CODE%==3 echo [%DATE% %TIME%] Watchdog violation — SAFE HALT.
if %EXIT_CODE%==4 echo [%DATE% %TIME%] RATE_LIMIT_HALTED — requires human review.
if %EXIT_CODE%==5 echo [%DATE% %TIME%] AUTH_HALTED — requires human review.

exit /b %EXIT_CODE%
