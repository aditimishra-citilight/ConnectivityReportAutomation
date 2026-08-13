# 02 · Using and changing it

*The things you will actually want to do. Each one is a single file or a single
command — no code changes.*

Everything below happens in `D:\ConnectivityReport`.

---

## Change who gets the report

Open **`recipients.txt`**. One email address per line.

```
first.person@citilight.co
second.person@citilight.co
# third.person@citilight.co   <- on leave, skipped for now
```

A `#` at the start comments someone out without deleting them. Save the file —
**the next run picks it up.** Nothing to restart.

To change who gets the hourly *server up/down* alerts instead, edit
**`recipients-watch.txt`**. It is deliberately a shorter list: those mails only
go out while this laptop is awake, so they also reveal when the machine was
switched on and off.

Check what will actually be used — this sends nothing:

```powershell
node show-recipients.js
```

> These lists live in their own files, separate from `mail.env.bat`, so editing
> the mailing list can never break the email password.

---

## Run the report right now

Double-click **`run-report.bat`**. It generates the report, emails it, and opens
the Reports folder.

To generate it **without** emailing anyone:

```powershell
node connectivityReport.js --no-mail
```

To run it for a past moment rather than now:

```powershell
node connectivityReport.js "2026-06-25 12:00:00"
```

---

## Change the time it runs

```powershell
schtasks /Change /TN "Connectivity Report" /ST 18:00
```

Or open `taskschd.msc` and edit **Connectivity Report** by hand.

---

## Make it run even when you are logged off

By default both tasks run **only while you are logged in**. To change that you
must enter your Windows password, so it has to be done by hand:

1. `Win + R` → `taskschd.msc`
2. Right-click **Connectivity Report** → **Properties**
3. General tab → tick **Run whether user is logged on or not**
4. OK → enter your Windows password
5. Repeat for **Connectivity Server Watch**

The machine still has to be switched on. Only a move to an always-on machine
fixes that — see [05](05-move-to-another-machine.md).

---

## Change what counts as an alert

`cities.config.js`, near the bottom:

```js
const ALERTS = {
  window: "48hr",     // which window the rules judge
  lowPct: 0,          // absolute floor — 0 means off
  dropPoints: 10,     // points fallen vs the last run = alert
  minDevices: 1,
};
```

| I want… | Change |
|---|---|
| Fewer drop alerts | Raise `dropPoints` to `15` or `20` |
| More sensitive drop alerts | Lower it to `5` |
| "Anything under 60% is bad" back | Set `lowPct: 0.60` — works alongside the drop rule |
| Alerts judged on 24 Hrs instead | Set both `ALERTS.window` and `EMAIL.window` to `"24hr"` |

Keep `ALERTS.window` and `EMAIL.window` the same, or the banner will talk about
one window while the table below it shows another.

---

## Change which window the email table shows

`cities.config.js` → `EMAIL.window`. The attached Excel always contains **every**
window regardless — this only affects the table inside the mail body, which is
kept to one window so it stays readable in an inbox.

---

## Add a new project or city

1. Find its ID and what device types it actually has:
   ```powershell
   node discover.js
   ```
2. Add one line per device group to `REPORTS` in `cities.config.js`:
   ```js
   { project: "Jaipur", label: "Jaipur CCMS", type: "CCMS",
     server: "velociti", cityId: "79", deviceType: "1" },
   ```
3. **Skip device types that return 0.** Jaipur has no ILC or gateways, so those
   rows are deliberately absent — they would raise a false alert every run.

Full detail, including adding a whole new server, is in
[03 · Technical KT](03-technical-kt.md).

---

## Check things without sending anything

| Command | Tells you |
|---|---|
| `node show-recipients.js` | Who each mail will go to |
| `node serverWatch.js --status` | Which servers are up right now |
| `node probe.js` | Live connected/disconnected counts for every row |
| `cmd /c "call mail.env.bat && node test-mail.js --verify-only"` | Whether the email login still works |

---

## Where the output goes

```
Reports\<date_time>\Connectivity_Report_<date_time>.xlsx   the report
Reports\<date_time>\email.html                             exactly what was mailed
Reports\<date_time>\snapshot.json                          used to detect tomorrow's drops
Reports\run.log                                            what the daily task did
Reports\watch.log                                          what the hourly check did
```

A fresh folder per run — nothing is ever overwritten.

---

Something not working? → [04 · Troubleshooting](04-troubleshooting.md)
