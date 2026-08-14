# 04 · Troubleshooting

*Find the symptom, work down the list. The first one or two steps cover almost
every case.*

---

## The report email did not arrive

**1 · Was the laptop on and logged in at 5:30 PM?**

This runs locally. If the machine was off, nothing ran. The task is set to catch
up when the machine next wakes, so a report arriving **late is normal, not a
bug** — you may simply get it when you next open the laptop.

**2 · Read the log — it says exactly what happened.**

```powershell
Get-Content D:\ConnectivityReport\Reports\run.log -Tail 40
```

**3 · Did the task fire at all?**

```powershell
schtasks /Query /TN "Connectivity Report" /FO LIST /V
```

| `Last Result` | Meaning |
|---|---|
| `0` | Success |
| `267009` | Still running right now — not an error |
| anything else | It failed; the log will say why |

**4 · Is it a report problem or only a mail problem?**

The Excel is always written **before** the mail is attempted. Look in
`Reports\<latest>\`:

- `.xlsx` present → the report worked, only the send failed. The exact mail that
  would have gone out is saved beside it as `email.html`.
- Nothing there → it failed earlier; go back to the log.

**5 · Test the email login on its own:**

```powershell
cmd /c "call mail.env.bat && node test-mail.js --verify-only"
```

If this fails, the Gmail app password has probably been revoked or expired. A
Google app password **cannot be viewed again** — create a new one
(`myaccount.google.com` → Security → App passwords) and put it in `mail.env.bat`.

---

## A server shows as DOWN but it looks fine to me

The watcher probes **3 times, 20 seconds apart** before believing it, so a single
blip will not trigger this. If it still says down, check the same way it does:

```powershell
Test-NetConnection 103.248.31.109 -Port 8080
node serverWatch.js --status
```

Read the result carefully — it tells you *who* has to fix it:

| Result | Meaning | Who fixes it |
|---|---|---|
| `PingSucceeded: True`, `TcpTestSucceeded: False` | Machine is alive, but the application on that port is not listening | Server team — restart the service |
| Both `False` | The machine or the network path is gone | Network team |
| Both `True` but login fails | Port is open, credentials or the app are rejecting us | Portal team |

Hand that distinction over — it saves them chasing the wrong thing.

---

## I got an alert saying several servers went down at once

Four independent servers do not fail in the same second. That almost always
means **this laptop** lost its network — going to sleep, WiFi dropping.

The watcher now detects this: if every server looks dead it first checks whether
this machine has internet at all, and stays silent if not. If you see such a mail
dated before that fix, disregard it.

---

## A whole project vanished from the report

It has not. Look for red **`SERVER DOWN — no data`** rows — unreachable rows are
kept visible on purpose so a project never silently disappears.

In the Excel their count cells are left *empty* rather than zero, so `SUM` skips
them and no total is polluted.

---

## The numbers look wrong

```powershell
node probe.js
```

Prints live connected/disconnected counts for every row, plus the **newest device
timestamp** per row — the quickest way to see whether "now" and the portal clock
agree.

If a specific field looks wrong, dump the raw device records:

```powershell
node inspect.js ndmc 3 1        # server, cityId, deviceType
```

---

## The email looks broken — no gridlines, or plain text

Check on a different client first (phone vs desktop). The table is drawn with
HTML `border` and `bgcolor` attributes precisely because Gmail's mobile apps
strip stylesheets. If someone has "tidied" the email code into CSS classes, that
is the cause — see gotcha 01 in [03 · Technical KT](03-technical-kt.md).

If the bottom of the table is cut off with **"[Message clipped]"**, the message
has grown past Gmail's ~102 KB limit.

---

## A black console window pops up at 5:30 PM

That was the report running. Both scheduled tasks now go through
`run-hidden.vbs`, which runs them with no window. If a window still appears, the
task action has been changed back to point at the `.bat` directly:

```powershell
schtasks /Query /TN "Connectivity Report" /FO LIST /V | Select-String "Task To Run"
```

It should read `wscript.exe ...run-hidden.vbs run-report-scheduled.bat`.

---

## The report ran but no alerts were detected, and I expected some

Drop detection needs a **previous run to compare against**. Right after moving to
a new machine, or on the very first run, there is no baseline, so no drop alerts
are possible. It works from the second run onward.

---

## Nothing runs at all after moving the folder

Both scheduled tasks store an absolute path. If the folder moved, recreate them —
the commands are in [05 · Moving to another machine](05-move-to-another-machine.md).

Also check the three files that git does **not** carry are present:
`cities.config.js`, `mail.env.bat`, `recipients.txt`. Without the first one
nothing starts at all.

---

## Still stuck

`Reports\run.log` and `Reports\watch.log` are appended to on every run and are
the fastest route to the truth. The full architecture, and the reasoning behind
the parts that look odd, is in [03 · Technical KT](03-technical-kt.md).
