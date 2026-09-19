@echo off
title WealthOS Live Cloudflare Tunnel - Laptop Database Bridge
echo ================================================================
echo    WEALTHOS v6.3 - CLOUDFLARE SECURE TUNNEL FOR AI ACCESS
echo    Connects Claude & Google AI Studio to Your Live Laptop DB
echo ================================================================
echo.

echo [1/2] Starting local SQLite database API bridge on port 3005...
start /b npx tsx scripts/wealthos_ai_studio_api_bridge.ts
timeout /t 2 /nobreak >nul

echo [2/2] Launching Cloudflare Tunnel (HTTPS, Zero Login/Zero Reminder)...
echo.
.\cloudflared.exe tunnel --protocol http2 --url http://localhost:3005
pause
