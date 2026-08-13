# Connectivity Report — Column Spec (A‑to‑Z): what is FETCHED vs FORMULA

Decoded from the live formulas in `Updated Connectivity Report Sheet*.xlsx` (the
right‑side daily blocks carry the real formulas; left columns are frozen pasted values).

## The core idea
For each **city** (and for NDMC, each **zone**), there are only **3 fetched inputs**.
Everything else is a formula. The report is logged **daily** — each day a new block of the
same columns is appended to the right.

### Fetched inputs (counted from the portal API `getListViewData_v1`)
| # | Input | How it's obtained |
|---|---|---|
| 1 | **Total** panels | count of all devices returned for that city/zone (by `deviceType`) |
| 2 | **Connected** | count of devices whose `last_update` is within the time window (30 min / 24 hr / 48 hr, measured back from "now") |
| 3 | **Meter Qty (connected meters)** | count of devices whose `meterTime` is valid & within the window |

### Columns (per block) — A to J
| Col | Header (in sheet) | Source | Formula / rule |
|---|---|---|---|
| **A** | City / Zone name | config (label) | — |
| **B** | Total | **FETCH** | count of all devices |
| **C** | Connected | **FETCH** | count where `last_update ≥ now − window` |
| **D** | Connected (%) | FORMULA | `= C / B`  (e.g. 90/145 = 62.0%) |
| **E** | Disconnected | FORMULA | `= B − C` |
| **F** | Disconnected (%) | FORMULA | `= E / B`  ( = 1 − D ) |
| **G** | Meter QTY | **FETCH** | count of connected meters (valid `meterTime` in window) |
| **H** | Meter Connectivity (Connected Panels) | FORMULA | `= G / C` |
| **I** | Meter Connectivity (Total Panels) | FORMULA | `= G / B` |
| **J** | Reason for low connectivity | manual note | free text (optional) |

> Exact cell formulas pulled from the workbook (NDMC, row 6 of the live block):
> `D = LK/LJ`  ·  `E = LJ−LK`  ·  `F = LM/LJ`  ·  `H = LO/LK`  ·  `I = LO/LJ`
> (LJ=Total, LK=Connected, LO=Meter connected.)

## The time window (30 min / 24 hr / 48 hr)
The **only** thing that changes between the three reports is the threshold used for **C**
(and **G**), measured back from the moment you run it (dynamic "now"):
- **30 min** → Connected = devices with `last_update ≥ now − 0:30`
- **24 hr**  → Connected = devices with `last_update ≥ now − 24:00`
- **48 hr**  → Connected = devices with `last_update ≥ now − 48:00`

So one device pull gives **all three** windows at once — just three different counts of
the same list. Total (B) is the same for all three windows.

## Per‑city notes (from the sheet tabs)
- **NDMC** — split into 6 **zones** (City, SP, Rohini, Narela, Civil Lines, Karol Bagh),
  each a row; plus a grand‑total row. deviceType 1 (CCMS).
- **Bhatinda** — labelled "CCMS (48 Hrs)"; also has ILC rows. Has both Meter % (Connected)
  and Meter % (Total).
- **Jaipur** — labelled "CCMS (30 Mins)".
- **GC BOT / KG BOT** — multiple device groups (CCMS + ILC) each a row.
- **KDMC** — large counts (CCMS + ILC + gateways).
- Others (Nalanda, Bhopal, JD, Puri) — single‑project rows, mostly ILC.
- Columns are identical across tabs (some tabs omit the second Meter % column).

## What the automation will do
1. Login to each city's server (its own base/cityId/userId).
2. Pull `getListViewData_v1` (deviceType 1 and/or 2) — once.
3. Compute B, C(×3 windows), G from the device list using dynamic `now`.
4. Fill D, E, F, H, I by formula.
5. Append today's block to that city's sheet (keep daily history) and/or write a clean
   summary. Adding a new city later = one config entry.
