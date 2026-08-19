@echo off
REM ===========================================================================
REM  Double-click this to register the monthly Orbiwise scheduled task.
REM
REM  It asks Windows for administrator rights itself, so there is no need to
REM  find an "admin PowerShell" first. Registering a scheduled task requires
REM  elevation; without it Windows refuses.
REM
REM  To REMOVE the task instead, run from a command window:
REM      register-orbiwise-task.bat /remove
REM ===========================================================================
title Register Orbiwise Monthly Report task
cd /d "%~dp0"

set "PSARGS="
if /i "%~1"=="/remove"    set "PSARGS=-Unregister"
if /i "%~1"=="-remove"    set "PSARGS=-Unregister"
if /i "%~1"=="/unregister" set "PSARGS=-Unregister"

REM --- already elevated? then just run it ---
net session >nul 2>&1
if %errorlevel%==0 goto :run

echo.
echo  Asking for administrator rights...
echo  (Click "Yes" on the Windows prompt.)
echo.
REM Re-launch this same .bat elevated, keeping the argument.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs"
exit /b

:run
echo =========================================
echo    Orbiwise Monthly Report - scheduler
echo =========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  ERROR: Node.js is not installed or not on PATH.
  echo  Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-orbiwise-task.ps1" %PSARGS%

echo.
echo =========================================
if errorlevel 1 (
  echo  Something went wrong - see the messages above.
) else (
  echo  Done.
)
echo =========================================
echo.
pause
