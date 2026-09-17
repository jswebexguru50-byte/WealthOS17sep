@echo off
title Portfolio Tracker - Local Production Server
echo ========================================================
echo   Starting Portfolio Tracker Local Server
echo ========================================================
echo.
if not exist node_modules (
    echo [INFO] Installing required dependencies...
    npm install --omit=dev
)
echo [INFO] Starting production server on http://localhost:3000 ...
node dist/server.cjs
pause
