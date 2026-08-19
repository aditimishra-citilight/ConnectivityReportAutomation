<#
================================================================================
  REGISTER THE MONTHLY ORBIWISE SCHEDULED TASK
================================================================================
  Creates a Windows Task Scheduler job that runs orbiwiseMonthly.js on the 2nd
  of every month, generating the Orbiwise connected-devices report for the month
  that just ended and emailing it to everyone in orbiwise-recipients.txt.

  RUN ONCE, FROM AN ADMIN POWERSHELL:
      cd "D:\ConnectivityReport"
      .\register-orbiwise-task.ps1

  Remove it:
      .\register-orbiwise-task.ps1 -Unregister

  Check it / run it now without waiting:
      Get-ScheduledTaskInfo -TaskName 'Orbiwise Monthly Report'
      Start-ScheduledTask   -TaskName 'Orbiwise Monthly Report'

  WHY THIS IS SIMPLER THAN THE NDMC SCHEDULER: this job reads the local history
  file that the daily connectivity run already fills in — it makes no portal
  calls and finishes in seconds. There is no multi-hour download to be
  interrupted, so it needs no resume logic and no keep-awake handling.

  It does still need StartWhenAvailable: this is a desktop, and a monthly job
  only gets 12 chances a year. Without it, a machine that happens to be off at
  09:00 on the 2nd would skip the month entirely.

  DEPENDENCY: the figures come from the daily "Connectivity Report" task. If
  that stops running, this still produces a report — just one based on fewer
  days. The report states how many days it used, so a thin month is visible.
================================================================================
#>

[CmdletBinding()]
param(
    [switch]$Unregister,
    [int]$DayOfMonth = 2,
    [string]$AtTime = '09:00'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Orbiwise Monthly Report'
$scriptDir = $PSScriptRoot
$target = Join-Path $scriptDir 'orbiwiseMonthly.js'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "This must be run from an ADMIN PowerShell window." -ForegroundColor Red
    Write-Host "  Right-click PowerShell -> 'Run as administrator', then re-run this script."
    exit 1
}

if ($Unregister) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "No scheduled task named '$TaskName' found."
    }
    exit 0
}

if (-not (Test-Path $target)) { Write-Host "orbiwiseMonthly.js not found next to this script." -ForegroundColor Red; exit 1 }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host "Node.js is not on PATH." -ForegroundColor Red; exit 1 }

foreach ($f in @('mail.env.bat', 'orbiwise-recipients.txt')) {
    if (-not (Test-Path (Join-Path $scriptDir $f))) {
        Write-Host "Warning: $f not found - the run would generate the report but fail to email it." -ForegroundColor Yellow
    }
}

$action = New-ScheduledTaskAction -Execute $node.Source -Argument "`"$target`"" -WorkingDirectory $scriptDir
$trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth $DayOfMonth -At $AtTime

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 15)

# S4U: runs whether or not the user is logged on, without storing a password.
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Task already exists - replacing it."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Generates the Orbiwise connected-devices report for the month that just ended (SAAS and LNS, one workbook per month under Reports\Orbiwise) and emails it to orbiwise-recipients.txt." | Out-Null

Write-Host ""
Write-Host "Registered '$TaskName'." -ForegroundColor Green
Write-Host "  Runs   : day $DayOfMonth of each month at $AtTime"
Write-Host "  Reports: the month that just ended (2 Sep -> August, 2 Jan -> December)"
Write-Host "  Output : $(Join-Path $scriptDir 'Reports\Orbiwise\<Mon><Year>\')"
Write-Host "  Emails : $(Join-Path $scriptDir 'orbiwise-recipients.txt')"
Write-Host "  As     : $env:USERDOMAIN\$env:USERNAME (whether logged on or not, no password stored)"
Write-Host ""
Write-Host "If this PC is off at $AtTime, Windows runs the job as soon as the" -ForegroundColor Cyan
Write-Host "machine is next available, so the month is not skipped." -ForegroundColor Cyan
Write-Host ""
Write-Host "Test it now:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  node orbiwiseMonthly.js --dry-run     # see what it would send"
$next = (Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo).NextRunTime
if ($next) { Write-Host ""; Write-Host "Next run: $next" -ForegroundColor Green }
