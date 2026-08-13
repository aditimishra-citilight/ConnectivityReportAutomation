# Connectivity Report — Automation

Automates the **30 min / 24 hr / 48 hr connectivity report** (Connected vs Disconnected
devices) across all Citilight projects, pulling live data from each project's portal and
writing a styled Excel — replacing the manual login‑and‑count process.

## What it covers
11 projects across 4 servers (each server has its own base URL / cityId / userId):

| Server | Projects |
|---|---|
| smartlight.citilight.co:446 | **NDMC** (6 zones) |
| velociti.citilight.co:444 | GC BOT, KG BOT, Nalanda, Bhopal, JD, Puri, Jaipur, Dehradun |
| 103.248.31.109:8080 | KDMC |
| dc.citilight.co | Bhatinda |

## Run

```powershell
cd D:\ConnectivityReport
npm install            # first time only
node connectivityReport.js
```

- Uses the **current time** as "now" (dynamic) and computes all three windows from it.
- To use a different reference time:
  `node connectivityReport.js "2026-06-25 12:00:00"`
- Output: `Connectivity_Report_<date>_<time>.xlsx` — **three sheets**:
  - **`24 & 48 Hrs`** (first): both windows **side-by-side on one sheet** so you can read
    24 hr and 48 hr in a single view (no two screenshots). `Project / Site / Type / Total`
    appear once (Total is window-independent), then one colour-coded 7-column block per
    window (Connected, Connected %, Disconnected, Disconnected %, Meter QTY, Meter %…).
  - **`24 Hrs`** and **`48 Hrs`**: the original per-window sheets, unchanged.
  - All columns are the same set: Project, Site/Group, Type, Total, Connected, Connected %,
    Disconnected, Disconnected %, Meter QTY, Meter % (Connected/Total). Percent &
    Disconnected columns are **live Excel formulas**.
- Each project is shown in its **own colour** with a **gap row** between projects, and
  every project lists its device groups together: **CCMS, ILC, Warehouse, Gateway**.
- Each project ends with a **bold Total (subtotal) row**, and every sheet ends with a
  **GRAND TOTAL** row (gold). Count columns (Total / Connected / Disconnected / Meter QTY)
  are **SUM**s; the % columns are recomputed as the **ratio of the summed totals** (e.g.
  Connected % = ΣConnected ÷ ΣTotal), matching the manual NDMC footer. All totals are live
  Excel formulas, so editing a cell updates them. Meter totals stay blank for projects
  with no CCMS.
- **Meter** columns are filled **only for CCMS** (blank for ILC / Gateway / Warehouse),
  matching the original sheet.
- Time windows are set in `cities.config.js` (`WINDOWS`) — add 30 Min back anytime.

## Email + alerts

After the Excel is written, the report is **emailed automatically** with the workbook
attached and the same table rendered **inline in the mail body** — the layout of the
workbook's own sheet: title row, two-level header, one colour per project, per-project
subtotal, gap row, gold GRAND TOTAL.

The mail shows **one window** (`EMAIL.window`, default 48 Hrs) so the table stays
readable in an inbox; the attached workbook still carries every window and every column.

> **Gridlines and fills are HTML attributes (`border="1"`, `bgcolor`, `align`), never
> CSS classes.** Gmail's mobile apps strip the `<style>` block outright, which left the
> table with no visible lines at all. Do not "tidy" this into a stylesheet.

### What raises an alert

The current connectivity level is treated as **normal** — the report only shouts when
something *changes*. Judged on `ALERTS.window` (kept the same as `EMAIL.window`):

| Rule | Meaning | Default |
|---|---|---|
| **DROP** | Connected % fell N+ percentage points vs the **previous run** | `ALERTS.dropPoints` = 10 |
| **NODATA** | The device list came back **empty** for a group that should have devices | — |
| **NOT FETCHED** | The row could not be read at all (server down / login failed) | — |
| **LOW** | Connected % below an absolute floor — **off by default** | `ALERTS.lowPct` = 0 |

`lowPct: 0` disables the absolute floor. It was 0.80 originally and flagged ~27 sites
every single run — sites that have simply always been low — which buried the one site
that actually dropped that day. Set it to e.g. `0.60` to switch it back on alongside
the drop rule.

The banner names each offending site with exact numbers and states the **overall
average**. Rows that tripped a rule are also marked in the table (▼ with the points
lost, ✗ for an empty list).

**A server being down never stops the report** and never hides a project: unreadable
rows still appear, in red, reading `SERVER DOWN — no data`. In the Excel their count
cells are left *empty* (not zero) so `SUM` skips them and no total is polluted.

Drop detection needs history, so each run writes `Reports/<stamp>/snapshot.json` (counts
only, plus a `failed` flag so "unreadable" is never mistaken for "genuinely zero"). The
next run diffs against the newest earlier snapshot. The **first run has no baseline** —
drop alerts start from the run after it. A copy of exactly what was mailed is saved as
`Reports/<stamp>/email.html`.

## Hourly server watch

`serverWatch.js` checks every portal once an hour — TCP port first, then login, so it
can tell *"the machine is gone"* from *"the app on that port died"*. It mails **only on
a state change**:

- `▲ BACK UP` — the server you were waiting for is answering again
- `▼ WENT DOWN` — a server just failed, so you hear within the hour

A server that stays down does **not** mail again — no hourly spam. State lives in
`Reports/server-status.json`; the log is `Reports/watch.log`.

```powershell
node serverWatch.js            # normal: mails only if something changed
node serverWatch.js --status   # just print current state, never mails
```

### One-time setup (Gmail / Google Workspace)
1. Turn on 2-Step Verification, then create an **App Password**:
   `myaccount.google.com` → Security → 2-Step Verification → App passwords.
   A normal account password will be rejected.
2. `copy mail.env.example.bat mail.env.bat` and fill in `MAIL_USER` and `MAIL_PASS`
   (the 16-char app password). `mail.env.bat` is **gitignored** — the password stays
   on this machine. Recipients do **not** go here; see below.
   *If another local project already has working SMTP settings in a `.env`, point
   `SOURCE_ENV` in `setup-mail.js` at it and run `node setup-mail.js` — it copies the
   password file-to-file and never prints it.*
3. Verify without generating a report:
   ```powershell
   cmd /c "call mail.env.bat && node test-mail.js"              # sends one test mail
   cmd /c "call mail.env.bat && node test-mail.js --verify-only" # SMTP login only
   ```
4. `run-report.bat` loads `mail.env.bat` by itself. To skip sending for one run:
   `node connectivityReport.js --no-mail` (or set `MAIL_ENABLED=0`).

A mail failure never loses the Excel — the workbook is written first, and any SMTP error
is printed with the path to the saved `email.html`.

### Changing who gets the report
Recipients live in **`recipients.txt`** — one address per line, `#` to comment someone
out. Deliberately a separate file from `mail.env.bat`: the list changes often, the app
password does not, and editing the list should never risk breaking the credentials.

```
first.person@citilight.co
second.person@citilight.co
# third.person@citilight.co   <- on leave, skipped for now
```

Changes apply on the **next run** — nothing to restart, no code to touch, and
`setup-mail.js` will never overwrite the list. For CC, add `recipients-cc.txt` in the
same format. Check what will actually be used:

```powershell
node show-recipients.js
```

`recipients.txt` is gitignored (`recipients.example.txt` is the committed template) so
nobody's address ends up on GitHub. If the file is missing, `MAIL_TO` is used instead.

### Send it on a schedule
Two silent launchers (no prompts, no pop-ups) drive the Windows Task Scheduler tasks:

| Task | Runs | Launcher | Log |
|---|---|---|---|
| `Connectivity Report` | daily 5:30 PM | `run-report-scheduled.bat` | `Reports\run.log` |
| `Connectivity Server Watch` | hourly | `run-watch.bat` | `Reports\watch.log` |

To recreate them:
```powershell
schtasks /Create /TN "Connectivity Report" /TR "D:\ConnectivityReport\run-report-scheduled.bat" /SC DAILY /ST 17:30 /F
schtasks /Create /TN "Connectivity Server Watch" /TR "D:\ConnectivityReport\run-watch.bat" /SC HOURLY /MO 1 /F
```

Created this way they run **only while you are logged on** (`Logon Mode: Interactive
only`). To have them fire with the machine locked or logged off, open `taskschd.msc`,
the task's Properties → General → tick **Run whether user is logged on or not**, and
enter your Windows password — that step needs the password, so it must be done by hand.

Thresholds, the judged window, and recipients all live in `cities.config.js`
(`ALERTS` / `EMAIL`) — no code changes needed to retune them.

## Quick live check (no Excel)
```powershell
node probe.js                 # prints connected/disconnected for every project
node inspect.js ndmc 3 1      # dump raw record fields for a server/cityId/deviceType
```

## How connectivity is counted
- Pull `getListViewData_v1` for each project (deviceType 1 = CCMS, 2 = ILC).
- A device is **Connected (window)** if its `last_update` is within `now − window`.
  - CCMS `last_update` = unix seconds; ILC `last_update` = `"YYYY-MM-DD HH:MM:SS"`.
- **Meter** connectivity uses `meterTime` (ILC) or `dateTime` (CCMS).
- Total = device count; Disconnected = Total − Connected.

## Add a new project later
Edit `cities.config.js`:
- add a `SERVERS` entry if it's a new server, then
- add one `REPORTS` row `{ project, label, server, cityId, deviceType }`.
- If you don't know the cityId, set `cityId: null` + `cityName: "<NAME>"` — it's
  auto‑resolved from the server's geography call.

## Files
| File | Purpose |
|---|---|
| `connectivityReport.js` | main generator → Excel → email |
| `mailer.js` | HTML email body (alert banner + report table) + SMTP send |
| `alerts.js` | DROP / NODATA / LOW rules and the averages |
| `history.js` | per-run `snapshot.json`, so the next run can diff against it |
| `theme.js` | per-project colours shared by the Excel and the email |
| `serverWatch.js` | hourly portal health check; mails on state change only |
| `test-mail.js` | verify SMTP settings without running the report |
| `setup-mail.js` | write `mail.env.bat` from another project's `.env` |
| `recipients.txt` | **who gets the report** — edit any time, one address per line |
| `show-recipients.js` | print who the next run will mail, and from which source |
| `probe.js` | live console check of all projects |
| `inspect.js` | dump raw device fields for one query |
| `lib.js` | login, fetch, connectivity counting |
| `cities.config.js` | servers + project rows + windows + `EMAIL` / `ALERTS` (edit this to extend) |
| `KT.md` | **full knowledge transfer** — architecture, runbook, gotchas, handover |
| `SETUP_NEW_MACHINE.md` | moving this to an always-on server / PC |
| `SERVER_API_SPEC.md` | captured API details per server |
| `SHEET_COLUMN_SPEC.md` | A‑to‑Z column / formula mapping from the original sheet |
| `captures/*.txt` | raw cURLs per server |

## Security
The real `cities.config.js` (with credentials) is **gitignored** — copy `cities.config.example.js`
to `cities.config.js` and fill it in, or set env vars `CITILIGHT_USER` / `CITILIGHT_PASS`.
Never commit real passwords. `mail.env.bat` (the Gmail app password), raw `captures/*.txt`
(session cookies / login bodies) and the generated `Reports/` folder are also gitignored.
