@echo off
:: ============================================================
:: WealthOS M.4 Overnight Recovery — MANUAL STARTUP INSTRUCTIONS
:: ============================================================
::
:: To install the Windows Task Scheduler task (requires Admin):
::   1. Right-click "install_task_scheduler.bat" → Run as Administrator
::   OR
::   2. Open Task Scheduler manually:
::      - Trigger: At log on
::      - Action: Start a program
::      - Program/script: C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release\scripts\remediation\launch_m4_overnight.bat
::      - Start in: C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release
::      - Run with highest privileges: YES
::
:: To start MANUALLY (no admin required):
::   Open a terminal and run:
::   cd "C:\Users\gopal\OneDrive\Desktop\tesr\webapp_portable_release"
::   node scripts\remediation\phase10rm4_overnight_runtime.cjs
::
:: Recovery state is durable — if you close the terminal, 
:: restart the command above and it will resume exactly where it stopped.
::
:: Progress file: reports\readiness\agents\M4_OVERNIGHT.json
:: Events log:    reports\market-data\runtime\m4\events.jsonl
:: State DB:      reports\market-data\runtime\m4\state.sqlite

echo.
echo WealthOS M.4 Overnight Recovery
echo ================================
echo.
echo Task Scheduler install requires Administrator.
echo.
echo Option 1: Right-click install_task_scheduler.bat → Run as Administrator
echo.
echo Option 2: Start manually now:
echo   node scripts\remediation\phase10rm4_overnight_runtime.cjs
echo.
echo The runtime is already running as task-5811 in the AI session.
echo It will continue until queue exhaustion or a safety halt.
echo.
pause
