# Connectivity Report — Automation

Automates the **30 min / 24 hr / 48 hr connectivity report** (Connected vs Disconnected
devices) across all Citilight projects, pulling live data from each project's portal and
writing a styled Excel — replacing the manual login‑and‑count process.

## What it covers
9 projects across 4 servers (each server has its own base URL / cityId / userId):

| Server | Projects |
|---|---|
| smartlight.citilight.co:446 | **NDMC** (6 zones) |
| velociti.citilight.co:444 | GC BOT, KG BOT, Nalanda, Bhopal, JD, Puri |
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
- **Meter** columns are filled **only for CCMS** (blank for ILC / Gateway / Warehouse),
  matching the original sheet.
- Time windows are set in `cities.config.js` (`WINDOWS`) — add 30 Min back anytime.

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
| `connectivityReport.js` | main generator → Excel |
| `probe.js` | live console check of all projects |
| `inspect.js` | dump raw device fields for one query |
| `lib.js` | login, fetch, connectivity counting |
| `cities.config.js` | servers + project rows + time windows (edit this to extend) |
| `SERVER_API_SPEC.md` | captured API details per server |
| `SHEET_COLUMN_SPEC.md` | A‑to‑Z column / formula mapping from the original sheet |
| `captures/*.txt` | raw cURLs per server |

## Security
The real `cities.config.js` (with credentials) is **gitignored** — copy `cities.config.example.js`
to `cities.config.js` and fill it in, or set env vars `CITILIGHT_USER` / `CITILIGHT_PASS`.
Never commit real passwords. Raw `captures/*.txt` (session cookies / login bodies) are also
gitignored.
