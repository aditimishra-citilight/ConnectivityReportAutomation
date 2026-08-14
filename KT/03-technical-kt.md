# Connectivity Report — Knowledge Transfer

Everything needed to own this system: what it does, how it works, how to run it,
how to fix it when it breaks, and why several odd-looking decisions are
deliberate.

Read §1–§3 to understand it. Read §9 before changing anything. Keep §8 open the
first time something goes wrong.

| | |
|---|---|
| 1 | [What this is and why it exists](#1-what-this-is-and-why-it-exists) |
| 2 | [The whole thing in one picture](#2-the-whole-thing-in-one-picture) |
| 3 | [What happens automatically, every day](#3-what-happens-automatically-every-day) |
| 4 | [Code map — every file](#4-code-map--every-file) |
| 5 | [How connectivity is actually counted](#5-how-connectivity-is-actually-counted) |
| 6 | [What raises an alert](#6-what-raises-an-alert) |
| 7 | [Configuration reference](#7-configuration-reference) |
| 8 | [Runbook — when something breaks](#8-runbook--when-something-breaks) |
| 9 | [Gotchas — do not "fix" these](#9-gotchas--do-not-fix-these) |
| 10 | [How to extend it](#10-how-to-extend-it) |
| 11 | [Security and credentials](#11-security-and-credentials) |
| 12 | [Handover checklist](#12-handover-checklist) |

---

## 1. What this is and why it exists

Someone used to log into four different Citilight street-lighting portals every
evening, count how many devices were still reporting, and hand-fill an Excel
sheet. That is the job this replaces.

It now:

- pulls every device from **4 servers / 11 projects / 36 device groups**,
- counts connected vs disconnected over a 24-hour and 48-hour window,
- writes the same styled Excel the team already knows,
- emails it with the table rendered inside the mail body,
- shouts when a site's connectivity **drops** or a server stops answering,
- and separately watches the servers every hour.

Two people receive the daily report. Server up/down alerts go to one person only
(see §7).

**It runs locally.** There is no cloud, no server-side job. Windows Task
Scheduler on one laptop drives everything, which is the single biggest
operational weakness — see §8 and [05 · Moving to another machine](05-move-to-another-machine.md).

---

## 2. The whole thing in one picture

```
                    ┌──────────────── cities.config.js ────────────────┐
                    │  SERVERS (4)   REPORTS (36 rows)   WINDOWS        │
                    │  EMAIL         ALERTS             CREDENTIALS     │
                    └───────────────────────┬──────────────────────────┘
                                            │
  Task Scheduler                            ▼
  daily 17:30  ──►  run-report-scheduled.bat  ──►  connectivityReport.js
                          │                              │
                          │  loads mail.env.bat          │  lib.js  ── login + fetch ──►  4 portals
                          │  (SMTP password)             │              (getListViewData_v1,
                          ▼                              │               getDeviceList_V2)
                    Reports\run.log                      │
                                                         ▼
                                              countConnectivity()   ── per row: total,
                                                         │             connected, meterQty
                                          ┌──────────────┼──────────────┐
                                          ▼              ▼              ▼
                                   ExcelJS sheets   history.js     alerts.js
                                   (3 sheets)       snapshot.json  DROP / NODATA
                                          │              │         (vs previous run)
                                          └──────┬───────┴──────────────┘
                                                 ▼
                                            mailer.js  ── HTML table + Excel attached
                                                 ▼
                                    recipients.txt  ──►  Gmail SMTP  ──►  inboxes


  Task Scheduler                                 ┌── recipients-watch.txt (private list)
  hourly     ──►  run-watch.bat  ──►  serverWatch.js ──► mails ONLY on state change
                                          │
                                          └── Reports\server-status.json, watch.log
```

Both `.bat` files are launched through `run-hidden.vbs` so no console window
appears on screen.

---

## 3. What happens automatically, every day

**17:30 — the report**

1. Log into all four servers (3 retries each; a server that still fails is
   skipped, not fatal).
2. Fetch each of the 36 rows. Failures are recorded, not dropped.
3. Count connectivity for 24 hr and 48 hr from one device pull.
4. Write `Reports\<timestamp>\Connectivity_Report_<timestamp>.xlsx` — three
   sheets: `24 & 48 Hrs`, `24 Hrs`, `48 Hrs`.
5. Write `snapshot.json` (the baseline for tomorrow's drop detection).
6. Compare against the previous snapshot → alerts.
7. Build the email, save a copy as `email.html`, send it with the Excel attached.

**Every hour — the server watch**

1. TCP-probe then log into each server, **3 attempts, 20 s apart**.
2. If *every* server fails, check whether this machine has internet at all. If
   not, do nothing (see §9).
3. Mail **only if a server changed state** — up→down or down→up. A server that
   stays down never mails again.

---

## 4. Code map — every file

### The report path

| File | Lines | What it owns |
|---|---:|---|
| `connectivityReport.js` | 567 | The main program. Fetch loop, both Excel sheet builders, the email hand-off. Start here. |
| `lib.js` | 191 | Login, HTTP with retries, timestamp parsing, `countConnectivity()`. All portal quirks live here. |
| `cities.config.js` | 186 | **The only file you normally edit.** Servers, projects, windows, alert thresholds, email settings. Gitignored (holds the portal password). |
| `mailer.js` | 346 | Builds the HTML email and sends it. |
| `alerts.js` | 101 | The alert rules and the averages. Pure logic, no I/O — easy to reason about. |
| `history.js` | 54 | Writes each run's `snapshot.json`, finds the previous one. |
| `theme.js` | 29 | Per-project colours, shared by Excel and email so they match. |

### The watcher

| File | Lines | What it owns |
|---|---:|---|
| `serverWatch.js` | 252 | Hourly health check + its own state file + its own mail. |

### Setup and diagnostics

| File | What it is for |
|---|---|
| `test-mail.js` | Prove SMTP works. `--verify-only` logs in without sending. |
| `setup-mail.js` | Writes `mail.env.bat` by copying SMTP settings from another project's `.env`, without printing the password. |
| `show-recipients.js` | Prints exactly who each mail will go to, and from which file. |
| `probe.js` | Live connected/disconnected counts in the console, no Excel. |
| `inspect.js` | Dump raw device fields for one server/city/deviceType. Use when a field name looks wrong. |
| `discover.js` | Find cityIds and device counts for a server. Use when adding a project. |

### Launchers

| File | What it does |
|---|---|
| `run-report.bat` | Double-click, interactive, opens the Reports folder afterwards. |
| `run-report-scheduled.bat` | Silent version for Task Scheduler; logs to `Reports\run.log`. |
| `run-watch.bat` | Silent hourly watcher; logs to `Reports\watch.log`. |
| `run-hidden.vbs` | Runs a `.bat` with no console window. Both scheduled tasks go through this. |

### Documents

| File | What it holds |
|---|---|
| `README.md` | Entry point that routes to every other document. |
| `KT/03-technical-kt.md` | This document. |
| `KT/05-move-to-another-machine.md` | Moving it to an always-on machine. |
| `KT/06-server-api-reference.md` | Captured API details per server — base URLs, paths, cityIds, userIds. |
| `KT/07-excel-column-reference.md` | Which Excel column is fetched vs computed, decoded from the original workbook. |

### Generated (never edit, all gitignored)

```
Reports\<timestamp>\Connectivity_Report_*.xlsx   the report
Reports\<timestamp>\snapshot.json                counts, the baseline for the next run
Reports\<timestamp>\email.html                   exact copy of what was mailed
Reports\server-status.json                       watcher state
Reports\run.log  /  Reports\watch.log            what the scheduled tasks did
```

---

## 5. How connectivity is actually counted

**One device pull answers both windows.** The portals return every device with a
last-reported timestamp; the windows are just two different cutoffs over the same
list.

```
connected(window)  =  count of devices where  last_update >= now − window
disconnected       =  total − connected
Connected %        =  connected / total
```

`now` is the moment the report runs, or a timestamp passed as an argument:
`node connectivityReport.js "2026-06-25 12:00:00"`.

### The messy parts `lib.js` absorbs

These are real differences between the portals, not defensive noise:

| Problem | How it is handled |
|---|---|
| Timestamps come in two formats | ILC sends `"2026-06-25 15:16:12"`, CCMS sends unix **seconds** (`1782377129`). `parseTimestamp()` accepts both. |
| The field name differs by device type | CCMS/ILC use `last_update`, gateways use `lastUpdate`, some use `lstUpdt`. `parseLastUpdate()` tries all three. |
| Meter time is a different field again | ILC uses `meterTime`, CCMS uses `dateTime`, fallback `bill_data_time`. |
| Gateways use a different endpoint | `deviceType 10` → `getDeviceList_V2`; everything else → `getListViewData_v1`. |
| Portal clocks run slightly ahead | A device timestamp up to **1 hour in the future** still counts as connected, otherwise clock skew would show devices as disconnected. |

**Device types:** `1` = CCMS, `2` = ILC, `10` = Gateway.

**Meter columns are CCMS-only.** ILC / Gateway / Warehouse rows leave them blank,
matching the original hand-made sheet. Do not "fill in" zeros there — blank and
zero mean different things to the person reading it.

**Totals are ratio-of-sums, never an average of averages:**

```
Project %  =  Σ connected  /  Σ total
```

A 6-device group and a 2,410-device group must not carry equal weight.

---

## 6. What raises an alert

The **current level is treated as normal**. The report only shouts when something
*changes*. All rules are judged on `ALERTS.window` (currently `48hr`).

| Rule | Fires when | Config |
|---|---|---|
| **DROP** | Connected % fell N+ percentage points vs the previous run | `dropPoints: 10` |
| **NODATA** | The fetch succeeded but the device list came back **empty** | — |
| **NOT FETCHED** | The row could not be read at all (login/server failure) | — |
| **LOW** | Connected % below an absolute floor — **currently off** | `lowPct: 0` |

### Why the absolute floor is off

`lowPct` was `0.80`. On real data that flagged **27 of 31 rows every single run** —
sites that have simply always been low. The one site that actually moved that day
was buried in the noise. Setting it to `0` leaves only genuine changes. Turn it
back on with `lowPct: 0.60` if you want a floor alongside the drop rule.

### Rows that could not be fetched

They are excluded from the averages, from NODATA and from drop comparison — they
are already reported as "not fetched". If they counted, a dead KDMC would drag
the overall average down and look like a network collapse.

The previous snapshot's `failed` flag matters for the same reason: a failed row
was stored with placeholder zeros, and comparing today's real 94% against
yesterday's placeholder 0% would invent a drop (or hide one).

---

## 7. Configuration reference

Everything is in `cities.config.js`. **No code changes are needed for normal
tuning.**

```js
WINDOWS = [ { key: "24hr", label: "24 Hrs", minutes: 1440 },
            { key: "48hr", label: "48 Hrs", minutes: 2880 } ]

ALERTS  = { window: "48hr",   // which window the rules judge
            lowPct: 0,        // absolute floor, 0 = off
            dropPoints: 10,   // points fallen vs last run = alert
            minDevices: 1 }   // ignore groups smaller than this

EMAIL   = { window: "48hr",   // which window the MAIL table shows
            host, port, user, pass, from,   // from mail.env.bat
            attachExcel: true }
```

`EMAIL.window` and `ALERTS.window` are kept the same on purpose — a banner
talking about 24 Hrs above a 48 Hrs table confuses everyone.

The Excel always contains **every** window regardless of these settings.

### Who receives what

| File | Feeds | Currently |
|---|---|---|
| `recipients.txt` | daily report + Excel | 2 people |
| `recipients-watch.txt` | hourly server up/down mail | 1 person |
| `recipients-cc.txt` | optional CC on the report | not used |

One address per line, `#` to comment someone out, effective on the next run.

**Why the watch list is separate:** the watcher only runs while this machine is
awake, so its up/down mails also reveal when the laptop was switched on and off.
That is deliberately not broadcast to the whole distribution list.

Verify at any time — this sends nothing:

```powershell
node show-recipients.js
```

### Credentials

`mail.env.bat` holds the Gmail **app password** (a normal Google password is
rejected). Both scheduled launchers `call` it before running node. It contains no
recipients — only credentials — so editing the mailing list can never break the
password.

---

## 8. Runbook — when something breaks

### "No report email arrived"

Work down this list; the first two cover almost every case.

1. **Was the laptop on and logged in at 17:30?** It runs locally. If the machine
   was off, nothing ran. The task is set to catch up when the machine next wakes,
   so a late report is normal, not a bug.
2. **Read the log** — it says exactly what happened:
   ```powershell
   Get-Content D:\ConnectivityReport\Reports\run.log -Tail 40
   ```
3. **Did the task fire at all?**
   ```powershell
   schtasks /Query /TN "Connectivity Report" /FO LIST /V
   ```
   `Last Result: 0` = success. `267009` = still running, not an error.
4. **Was it a mail problem rather than a report problem?** The Excel is always
   written *before* the mail is attempted, so check
   `Reports\<timestamp>\` — if the `.xlsx` is there, the report worked and only
   the send failed. The exact mail that would have gone out is saved as
   `email.html` in the same folder.
5. **Test SMTP on its own:**
   ```powershell
   cmd /c "call mail.env.bat && node test-mail.js --verify-only"
   ```

### "A server shows as down but it looks fine to me"

The watcher probes **3 times, 20 s apart** before believing it. If it still says
down, check the same way it does:

```powershell
Test-NetConnection <host> -Port <port>      # TcpTestSucceeded tells you a lot
node serverWatch.js --status                # current state, mails nothing
```

**`PingSucceeded: True` but `TcpTestSucceeded: False`** means the machine is
alive but the application on that port is not listening. That is the message to
give whoever fixes it — it saves them chasing the network.

### "The numbers look wrong"

```powershell
node probe.js                    # live counts for every row, no Excel
node inspect.js ndmc 3 1         # raw device fields for one server/city/type
```

`probe.js` also prints the newest device timestamp per row, which is the quickest
sanity check on whether "now" and the portal clock agree.

### "A project disappeared from the report"

It has not — look for red `SERVER DOWN — no data` rows. Unreadable rows are kept
visible on purpose. In the Excel their count cells are left *empty* so `SUM`
skips them and no total is polluted.

### "Everything went down at once"

Almost certainly this machine's own network, not four independent servers. Since
the internet-check was added the watcher detects this and stays quiet, so if you
see such a mail dated before that change, disregard it.

---

## 9. Gotchas — do not "fix" these

Each of these looks wrong until you know why. All were found the hard way.

**1. The email uses `border="1"` and `bgcolor`, not CSS classes.**
Gmail's mobile apps strip the `<style>` block entirely, which left the table with
no visible gridlines at all. HTML-4 attributes survive every client. Tidying this
into a stylesheet will silently break the table for phone users.

**2. Inline styles on every cell blew past Gmail's size limit.**
An earlier version inline-styled ~900 cells and produced a 105 KB message. Gmail
clips at ~102 KB, so the grand total row was cut off with "[Message clipped]".
Keep the message small.

**3. The mail shows one window, the Excel shows all.**
18 columns do not fit in an inbox. This is a readability decision, not an
oversight.

**4. `DisallowStartIfOnBatteries` must stay `false`.**
Windows sets it to `true` by default, which means **a laptop on battery skips the
task entirely** — no error, no report, no clue. This bit us once already.

**5. Login failure must never abort the run.**
The original code let one dead server kill the whole report; three healthy
servers' data was thrown away. Login now retries 3×, then that server's rows are
marked `SERVER DOWN` and everything else continues.

**6. The watcher retries 3× before declaring a server down.**
It used to probe once. A single dropped packet or a two-second restart produced a
false "SERVER WENT DOWN" mail.

**7. The watcher checks whether *this machine* has internet.**
Without it, the laptop going to sleep reported all four servers as down — and the
alert mail could not be sent either, because the network was gone.

**8. Watch mails carry absolute timestamps, not just a duration.**
"after 6 h 50 m" never answered the only question that matters — *when* did it
break. And when the machine has been asleep, no checks ran, so the mail now says
so explicitly instead of implying precision it does not have.

**9. Meter columns are blank, not zero, for non-CCMS rows.**
Blank means "not applicable". Zero would mean "no meters connected".

**10. `Reports/`, `cities.config.js`, `mail.env.bat`, `recipients*.txt` are
gitignored.**
They hold passwords, personal email addresses, or generated output. A fresh
`git clone` therefore **cannot run** until `cities.config.js` is copied across —
see [05 · Moving to another machine](05-move-to-another-machine.md).

---

## 10. How to extend it

### Add a project

1. Find its `cityId` and which device types it actually has:
   ```powershell
   node discover.js
   ```
2. Add one row per device group to `REPORTS` in `cities.config.js`:
   ```js
   { project: "Jaipur", label: "Jaipur CCMS", type: "CCMS",
     server: "velociti", cityId: "79", deviceType: "1" },
   ```
3. **Do not add rows for device types that return 0.** Jaipur has no ILC or
   gateways, so those rows are deliberately absent — they would raise a NODATA
   alert every single run.
4. If you do not know the `cityId`, use `cityId: null` with
   `cityName: "JAIPUR"` and it is resolved from the server's geography call.
5. Check `PALETTE` in `theme.js` has at least as many colours as you have
   projects, or two projects will share one.

### Add a server

Add an entry to `SERVERS` with its `base`, `loginPath`, `listPath`,
`gatewayPath`, `geoPath` and `userId`, then reference it by key from `REPORTS`.
The hourly watcher picks it up automatically — it iterates `SERVERS`.

### Change the schedule

```powershell
schtasks /Change /TN "Connectivity Report" /ST 18:00
```

### Change thresholds or the judged window

`ALERTS` / `EMAIL` in `cities.config.js`. Nothing else to touch.

---

## 11. Security and credentials

| Secret | Lives in | In git? |
|---|---|---|
| Portal password | `cities.config.js` (or `CITILIGHT_PASS` env var) | **No** |
| Gmail app password | `mail.env.bat` (or `MAIL_PASS` env var) | **No** |
| Recipient addresses | `recipients*.txt` | **No** |

Committed templates: `cities.config.example.js`, `mail.env.example.bat`,
`recipients.example.txt`.

Rules that must hold:

- Never commit a real password or a real address. Scan before pushing.
- Move the secret files between machines by hand — USB or a secure transfer, not
  email or chat.
- Gmail requires 2-Step Verification plus a 16-character **App Password**
  (`myaccount.google.com` → Security → App passwords). A Google password will be
  rejected.
- A Google app password cannot be viewed again after it is created. If it is
  lost, delete it and generate a new one.

---

## 12. Handover checklist

Anyone taking this over should be able to do all of these:

- [ ] Explain where `cities.config.js` lives and why it is not in git
- [ ] Run `node probe.js` and read the output
- [ ] Run `node show-recipients.js` and say who gets what
- [ ] Run `node serverWatch.js --status` and interpret UP/DOWN
- [ ] Generate a report without mailing it: `node connectivityReport.js --no-mail`
- [ ] Find yesterday's Excel, snapshot and sent-mail copy under `Reports\`
- [ ] Read `Reports\run.log` and `Reports\watch.log`
- [ ] Add a recipient and prove it took effect
- [ ] Change the alert threshold and explain what it will do
- [ ] Add a new project end to end (`discover.js` → `REPORTS` row → run)
- [ ] Say what happens if a server is down at 17:30 (report still runs, rows
      marked `SERVER DOWN`)
- [ ] Say what happens if the laptop is off at 17:30 (nothing runs; it catches up
      when the machine next wakes)
- [ ] Recreate both scheduled tasks from [05 · Moving to another machine](05-move-to-another-machine.md)

### The known weakness, stated plainly

This runs on one laptop. If that laptop is off, there is no report and no
monitoring for that period — and the gap is invisible unless you read the logs.
Moving it to an always-on machine is the single highest-value improvement
available, and [05 · Moving to another machine](05-move-to-another-machine.md) is written for exactly that.
