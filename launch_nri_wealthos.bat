@echo off
title NRI WealthOS — Global Wealth & Tax
echo ========================================================
echo   NRI WealthOS — Global Wealth & Tax (Port 3000)
echo ========================================================
echo.
echo [1/3] Clearing Port 3000 of any conflicting processes...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo [INFO] Clearing Port 3000 (PID: %%a)...
    taskkill /F /PID %%a 2>nul
)
timeout /t 1 /nobreak >nul
echo [2/3] Opening NRI WealthOS in your browser (http://localhost:3000)...
start "" http://localhost:3000
echo [3/3] Starting NRI WealthOS server (npm run dev)...
npm run dev
pause
