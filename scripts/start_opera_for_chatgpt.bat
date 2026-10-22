@echo off
REM ====================================================================
REM  LAUNCH OPERA WITH REMOTE DEBUGGING FOR CHATGPT PLAYWRIGHT AUTOMATION
REM ====================================================================
echo Starting Opera Explorer with remote debugging enabled on port 9222...
start "" "%LOCALAPPDATA%\Programs\Opera\opera.exe" --remote-debugging-port=9222 https://chatgpt.com
echo Opera launched! You can log in, and then run:
echo    npm run chatgpt-review
