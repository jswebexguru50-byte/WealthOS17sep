@echo off
setlocal enabledelayedexpansion
title WealthOS Auto Sync & Push to GitHub
echo ================================================================
echo     WEALTHOS v6.3 - AUTO SYNC & PUSH TO GITHUB
echo     Keeps Code & Empty Schema 100%% Synchronized
echo ================================================================
echo.

set "PATH=%LOCALAPPDATA%\GitHubDesktop\app-3.6.3\resources\app\git\cmd;%PATH%"

:: Step 1: Automatically extract the latest database schema DDL
echo [Step 1/3] Exporting latest empty database schema from portfolio.db...
call npx tsx scripts/export_empty_schema_sql.ts
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Schema export had an issue, continuing with existing schema.sql...
)
echo.

:: Step 2: Stage all updated code and schema.sql
echo [Step 2/3] Staging modified code and schema...
git add .
git status -s
echo.

:: Step 3: Prompt for commit message or use default timestamp
set "MSG="
set /p MSG="Enter commit message (Press Enter for auto-timestamp): "
if "!MSG!"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
    set "MSG=Update WealthOS code & schema - !datetime:~0,8!-!datetime:~8,4!"
)

echo.
echo Committing: "!MSG!"
git commit -m "!MSG!"
if %ERRORLEVEL% neq 0 (
    echo [INFO] No new changes to commit.
)

:: Step 4: Push to GitHub
echo.
echo [Step 3/3] Pushing latest commits to GitHub (origin main)...
git push origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ================================================================
    echo [SUCCESS] Everything is up to date on GitHub!
    echo Target: https://github.com/jswebexguru50-byte/wealthos-core
    echo ================================================================
) else (
    echo [ERROR] Push failed. Please check your internet connection or credentials.
)

echo.
pause
