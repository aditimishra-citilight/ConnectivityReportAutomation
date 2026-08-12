@echo off
REM ===========================================================================
REM  Silent launcher for Windows Task Scheduler — no prompts, no pop-ups,
REM  nothing to click. Generates the report and emails it, then exits.
REM  Console output is appended to Reports\run.log for troubleshooting.
REM
REM  SET IT UP (one time):
REM    1. Copy mail.env.example.bat -> mail.env.bat and fill it in.
REM    2. Win+R -> taskschd.msc -> Create Basic Task
REM         Name    : Connectivity Report
REM         Trigger : Daily, e.g. 5:30 PM
REM         Action  : Start a program
REM         Program : D:\ConnectivityReport\run-report-scheduled.bat
REM         Start in: D:\ConnectivityReport
REM    3. In the task's Properties tick "Run whether user is logged on or not"
REM       and "Run with highest privileges".
REM ===========================================================================
cd /d "%~dp0"

if not exist "Reports" mkdir "Reports"
if exist "mail.env.bat" call "mail.env.bat"

echo. >> "Reports\run.log"
echo ===== %DATE% %TIME% ===== >> "Reports\run.log"
node connectivityReport.js >> "Reports\run.log" 2>&1
exit /b %ERRORLEVEL%
