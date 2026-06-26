@echo off
REM ===== Connectivity Report — double-click launcher =====
cd /d "%~dp0"

echo ========================================================
echo   CONNECTIVITY REPORT  (30 min / 24 hr / 48 hr)
echo ========================================================
echo.

REM Check Node is installed
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Install it from https://nodejs.org  then run this again.
  echo.
  pause
  exit /b 1
)

REM Install dependencies the first time only
if not exist "node_modules" (
  echo First run - installing dependencies, please wait...
  call npm install
  echo.
)

echo Generating report using the CURRENT time...
echo.
node connectivityReport.js

echo.
echo ========================================================
echo Done. Each run is saved in its own dated folder under:
echo %cd%\Reports
echo ========================================================
echo.
REM Open the Reports folder for convenience
if exist "Reports" start "" "Reports"
pause
