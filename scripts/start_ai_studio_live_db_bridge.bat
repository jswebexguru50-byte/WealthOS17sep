@echo off
title WealthOS Live Full Database Bridge for Google AI Studio
echo ================================================================
echo    WEALTHOS v6.3 - LIVE FULL DB BRIDGE FOR GOOGLE AI STUDIO
echo    Connecting entire 165-table portfolio.db to Gemini 3.1 Pro
echo ================================================================
echo.
echo Starting local API bridge on port 3005 and public tunnel...
start /b npx tsx scripts/wealthos_ai_studio_api_bridge.ts
timeout /t 3 /nobreak >nul
npx localtunnel --port 3005
pause
