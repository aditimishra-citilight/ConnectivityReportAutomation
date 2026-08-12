@echo off
REM ===========================================================================
REM  Hourly server health check — silent, for Windows Task Scheduler.
REM  Mails ONLY when a server changes state (down->up or up->down).
REM  Output is appended to Reports\watch.log.
REM ===========================================================================
cd /d "%~dp0"

if not exist "Reports" mkdir "Reports"
if exist "mail.env.bat" call "mail.env.bat"

echo ===== %DATE% %TIME% ===== >> "Reports\watch.log"
node serverWatch.js >> "Reports\watch.log" 2>&1
exit /b %ERRORLEVEL%
