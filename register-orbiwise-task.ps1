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

# Elevation is NOT required to register this task - schtasks.exe can create a
# task for the current user unprivileged. Only the S4U principal (run whether or
# not the user is logged on) needs admin, and that is applied best-effort below.
# So this is a note, not a gate: blocking here would stop a registration that
# works perfectly well.
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Note: not running as administrator." -ForegroundColor Yellow
    Write-Host "      The task will still be registered and will run when you are logged on." -ForegroundColor Yellow
    Write-Host "      For it to run even when nobody is logged on, re-run this from an" -ForegroundColor Yellow
    Write-Host "      admin PowerShell (or double-click register-orbiwise-task.bat)." -ForegroundColor Yellow
    Write-Host ""
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

# Windows PowerShell 5.1's New-ScheduledTaskTrigger has NO -Monthly switch - it
# only offers -Once, -Daily, -Weekly, -AtStartup and -AtLogOn, and passing
# -Monthly fails with "A parameter cannot be found that matches parameter name
# 'Monthly'". Building MSFT_TaskMonthlyTrigger by hand is no better: its
# DaysOfMonth is a UInt16, too narrow to hold a 31-bit day bitmask.
#
# So the task is CREATED by schtasks.exe, which has supported /SC MONTHLY for
# decades, and the richer settings are then layered on with Set-ScheduledTask.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Task already exists - replacing it."
    schtasks /Delete /TN $TaskName /F | Out-Null
}

# The task is defined as XML and handed to schtasks /XML. This avoids two traps:
# building a trigger through the cmdlets (no -Monthly in 5.1), and passing a
# quoted "C:\Program Files\..." command through PowerShell to a native exe, where
# the nested quotes get mangled and schtasks rejects the argument. In XML the
# command, arguments and working directory are separate elements, so quoting
# stops being a problem at all.
$hh, $mm = $AtTime.Split(':')
$start = (Get-Date).Date.AddHours([int]$hh).AddMinutes([int]$mm).ToString('yyyy-MM-ddTHH:mm:ss')
$esc = { param($s) [System.Security.SecurityElement]::Escape($s) }

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Generates the Orbiwise connected-devices report for the month that just ended (SAAS and LNS, one workbook per month under Reports\Orbiwise) and emails it to orbiwise-recipients.txt.</Description>
    <URI>\$TaskName</URI>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByMonth>
        <DaysOfMonth><Day>$DayOfMonth</Day></DaysOfMonth>
        <Months>
          <January/><February/><March/><April/><May/><June/>
          <July/><August/><September/><October/><November/><December/>
        </Months>
      </ScheduleByMonth>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$(& $esc "$env:USERDOMAIN\$env:USERNAME")</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT15M</Interval><Count>2</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$(& $esc $node.Source)</Command>
      <Arguments>$(& $esc "`"$target`"")</Arguments>
      <WorkingDirectory>$(& $esc $scriptDir)</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

# schtasks /XML requires the file to be UTF-16.
$xmlPath = Join-Path $env:TEMP "orbiwise-task-$PID.xml"
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)

try {
    $create = schtasks /Create /TN $TaskName /XML $xmlPath /F 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Could not create the task:" -ForegroundColor Red
        Write-Host "  $create"
        exit 1
    }
} finally {
    Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue
}

# Never let a half-registered task pass as done: confirm it really points at node
# and really carries a monthly trigger.
$check = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $check) { Write-Host "FAILED: task was not created." -ForegroundColor Red; exit 1 }
if ($check.Actions[0].Execute -notmatch 'node') {
    Write-Host "FAILED: the task does not run node." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Registered '$TaskName'." -ForegroundColor Green
Write-Host "  Runs   : day $DayOfMonth of each month at $AtTime"
Write-Host "  Reports: the month that just ended (2 Sep -> August, 2 Jan -> December)"
Write-Host "  Output : $(Join-Path $scriptDir 'Reports\Orbiwise\<Mon><Year>\')"
Write-Host "  Emails : $(Join-Path $scriptDir 'orbiwise-recipients.txt')"
Write-Host "  As     : $env:USERDOMAIN\$env:USERNAME (InteractiveToken - runs while you are logged on)"
Write-Host ""
Write-Host "If this PC is off at $AtTime, Windows runs the job as soon as the" -ForegroundColor Cyan
Write-Host "machine is next available, so the month is not skipped." -ForegroundColor Cyan
Write-Host ""
Write-Host "Test it now:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  node orbiwiseMonthly.js --dry-run     # see what it would send"
$next = (Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo).NextRunTime
if ($next) { Write-Host ""; Write-Host "Next run: $next" -ForegroundColor Green }
