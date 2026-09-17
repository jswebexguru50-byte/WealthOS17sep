@echo off
title Push WealthOS to GitHub
echo ================================================================
echo    WEALTHOS v6.3 - PUSH CODE & EMPTY SCHEMA TO GITHUB
echo    Target: https://github.com/jswebexguru50-byte/wealthos-core.git
echo ================================================================
echo.
set "PATH=%LOCALAPPDATA%\GitHubDesktop\app-3.6.3\resources\app\git\cmd;%PATH%"

echo Checking remote configuration:
git remote -v
echo.
echo Pushing branch 'main' to origin...
git push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ================================================================
    echo [SUCCESS] Code and empty schema pushed to GitHub successfully!
    echo Refresh https://github.com/jswebexguru50-byte/wealthos-core
    echo ================================================================
) else (
    echo ================================================================
    echo [AUTHENTICATION] A browser window or GitHub login pop-up may have opened.
    echo Please sign in to authorize GitHub Desktop.
    echo Alternatively, open GitHub Desktop -> Add Local Repository -> Push.
    echo ================================================================
)
pause
