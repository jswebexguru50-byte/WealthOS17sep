@echo off
:: Installs the M.4 overnight recovery as a Windows Task Scheduler task.
:: Run this script ONCE as Administrator to register the task.
:: The task will run at system startup and after login.

setlocal
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "LAUNCHER=%ROOT%\launch_m4_overnight.bat"
set "TASK_NAME=WealthOS_M4_OvernightRecovery"
set "TASK_DESC=WealthOS Phase 10R-M.4 Overnight Market Data Recovery"

echo Installing Windows Task Scheduler task: %TASK_NAME%...

:: Delete existing task if present
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

:: Create new task: run at logon, repeat every 30 minutes, no end date
schtasks /Create /TN "%TASK_NAME%" /TR "\"%LAUNCHER%\"" ^
  /SC ONLOGON ^
  /RL HIGHEST ^
  /F ^
  /ST 00:00 ^
  /DELAY 0002:00 ^
  /IT /NP

if errorlevel 1 (
    echo [ERROR] Failed to create scheduled task. Run as Administrator.
    exit /b 1
)

echo.
echo Task "%TASK_NAME%" installed successfully.
echo   - Triggers: At logon (2-minute delay)
echo   - Run level: HIGHEST
echo   - Script: %LAUNCHER%
echo.
echo The recovery will start automatically after the next Windows login.
echo To run immediately: schtasks /Run /TN "%TASK_NAME%"
echo To remove: schtasks /Delete /TN "%TASK_NAME%" /F
