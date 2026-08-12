# Moving this to an always-on machine

The scheduler is local: it runs on whatever Windows machine it is installed on, so the
report only appears if **that machine is on**. Moving it to a server or an always-on PC
is the fix — nothing in the code changes.

## 1. What the new machine needs

- **Windows** (the launchers are `.bat`; Task Scheduler runs them)
- **Node.js** — https://nodejs.org
- **Internet access to all four portals.** Check before anything else:
  ```powershell
  Test-NetConnection smartlight.citilight.co -Port 446
  Test-NetConnection velociti.citilight.co   -Port 444
  Test-NetConnection 103.248.31.109          -Port 8080
  Test-NetConnection dc.citilight.co         -Port 443
  ```
  All must show `TcpTestSucceeded : True`. A server-room machine behind a stricter
  firewall may not reach these even though a laptop does.
- **Outbound SMTP on port 587** to `smtp.gmail.com` — many corporate networks block it.
  ```powershell
  Test-NetConnection smtp.gmail.com -Port 587
  ```

## 2. Get the code

```powershell
git clone https://github.com/aditimishra-citilight/ConnectivityReportAutomation.git
cd ConnectivityReportAutomation
npm install
```

## 3. Copy the three files git does NOT carry

These hold passwords, so they are gitignored on purpose. Copy them **by hand** from the
old machine (USB stick or a secure file transfer — **not** email or chat):

| File | Why it is not in the repo | Without it |
|---|---|---|
| `cities.config.js` | portal password + every server / project / cityId | **Nothing runs** — `Cannot find module './cities.config'` |
| `mail.env.bat` | Gmail app password | Report is generated but never mailed |
| `recipients.txt` | real email addresses | Nobody is mailed |

If you would rather not move `cities.config.js`, rebuild it from
`cities.config.example.js` and set `CITILIGHT_USER` / `CITILIGHT_PASS` as environment
variables instead. `mail.env.bat` can likewise be regenerated with `node setup-mail.js`
if that machine has the source `.env`.

Check it before going further — this sends nothing:

```powershell
node show-recipients.js
cmd /c "call mail.env.bat && node test-mail.js --verify-only"
node serverWatch.js --status
```

## 4. Carry the history over (optional but worth it)

Drop alerts compare against the previous run, and that baseline lives in
`Reports\<stamp>\snapshot.json`. A fresh machine has none, so **the first run there
raises no drop alerts** — it has nothing to compare with. Copy the newest run folder
from the old machine into `Reports\` and the very first run already has a baseline.

## 5. Create the two scheduled tasks

Adjust the path if you cloned somewhere else:

```powershell
schtasks /Create /TN "Connectivity Report" /TR "C:\ConnectivityReport\run-report-scheduled.bat" /SC DAILY /ST 17:30 /F
schtasks /Create /TN "Connectivity Server Watch" /TR "C:\ConnectivityReport\run-watch.bat" /SC HOURLY /MO 1 /F
```

Then fix the Windows defaults that silently skip runs — **a laptop on battery will not
run a task at all** unless the first line below is applied:

```powershell
foreach ($n in @("Connectivity Report","Connectivity Server Watch")) {
  $t = Get-ScheduledTask -TaskName $n
  $t.Settings.DisallowStartIfOnBatteries = $false   # run on battery too
  $t.Settings.StopIfGoingOnBatteries     = $false   # don't stop mid-run when unplugged
  $t.Settings.StartWhenAvailable         = $true    # catch up a missed run
  Set-ScheduledTask -InputObject $t | Out-Null
}
# only worth it on the daily one — waking the machine every hour is not
$t = Get-ScheduledTask -TaskName "Connectivity Report"
$t.Settings.WakeToRun = $true
Set-ScheduledTask -InputObject $t | Out-Null
```

## 6. Make it run without anyone logged in

Created as above, a task runs **only while a user is logged on**. On a server you want
it to run regardless. This step needs the Windows account password, so do it by hand:

`taskschd.msc` → the task → **Properties** → General →
tick **Run whether user is logged on or not** → OK → enter the password.

Do it for both tasks.

## 7. Turn the old machine off — really

If both machines keep their tasks, **everyone gets two of every email** and the two
machines build separate, conflicting snapshot histories, which makes drop alerts
compare against the wrong run. On the old machine:

```powershell
Disable-ScheduledTask -TaskName "Connectivity Report"
Disable-ScheduledTask -TaskName "Connectivity Server Watch"
```

Disabled rather than deleted, so it is one command to fall back if the new machine has
a problem.

## 8. Confirm it actually works

```powershell
schtasks /Run /TN "Connectivity Report"
```

Wait a couple of minutes, then check the mail arrived and look at `Reports\run.log`.
`Last Result: 0` in `schtasks /Query /TN "Connectivity Report" /FO LIST /V` means the
run succeeded.
