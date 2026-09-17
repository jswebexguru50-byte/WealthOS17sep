@echo off
title Portfolio Tracker - Dev Server
echo ========================================================
echo   Starting Portfolio Tracker DEV Server (Auto-Clean)
echo ========================================================
echo.
echo [INFO] Finding and killing any orphaned Node processes on Port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do taskkill /F /PID %%a 2>nul
echo [INFO] Starting development server (npm run dev)...
npm run dev
pause
