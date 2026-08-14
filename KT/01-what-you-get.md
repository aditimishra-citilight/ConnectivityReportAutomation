# 01 · What you get

*For anyone who receives the report. No technical knowledge needed.*

---

## Two kinds of email

### 1. The daily Connectivity Report — every day at 5:30 PM

Subject looks like:

```
Connectivity Report 12/08/2026 — ⚠ 4 ALERTS — avg 51.4% (48 Hrs)
```

The subject alone tells you the headline: how many things need attention, and the
overall connectivity percentage.

Inside:

| Part | What it is |
|---|---|
| **Black panel at the top** | Overall connectivity — e.g. `51.4% connected · 6,367 of 13,038 devices` |
| **Alert box** | Only what *changed* — sites that dropped, groups returning no devices, servers that could not be read. If nothing changed, it says so. |
| **The table** | Every project, every site, the same columns as the Excel sheet |
| **Attachment** | The full Excel workbook — 24 Hrs, 48 Hrs and a combined sheet, with live formulas |

### 2. Server up/down alerts — only when something changes

Sent to a shorter list. You get one when a portal stops answering, and one when
it comes back. **A server that stays down does not mail again** — no hourly spam.

---

## How to read the table

Columns, left to right:

| Column | Meaning |
|---|---|
| **Project / Site / Group / Type** | Which project, which device group, and whether it is CCMS, ILC or Gateway |
| **Total** | How many devices exist in that group |
| **Connected** | How many reported within the time window |
| **Connected %** | `Connected ÷ Total` |
| **Disconnected / %** | The rest |
| **Meter QTY / Meter %** | Meter reporting — **CCMS only**, so these stay blank for ILC, Gateway and Warehouse rows |

Each project has its own colour, ends with a bold **Total** row, and the gold
**GRAND TOTAL** at the bottom covers everything.

### Marks you may see

| Mark | Meaning |
|---|---|
| ▼ with a number | This site fell that many percentage points since the previous run |
| ✗ | The device list came back empty |
| Red `SERVER DOWN — no data` row | That server could not be reached at all. The row is kept visible on purpose so a project never silently disappears. |

**Blank is not zero.** A blank meter cell means "not applicable to this device
type". Zero would mean "no meters connected".

---

## What the alerts actually mean

The current connectivity level is treated as **normal**. You are only told when
something *changes*:

- **A site dropped** — its connectivity fell 10 or more percentage points since
  the last run
- **A group returned no devices** — the server answered, but the list was empty
- **A row could not be read** — the server was unreachable or the login failed

There is deliberately **no "below 80% is bad" alert**. That version flagged 27 of
31 rows every single day — sites that have always been low — and buried the one
site that actually moved. If you want that floor back, it is one line of config;
see [02 · Using and changing it](02-using-and-changing-it.md).

---

## Two honest limitations

**It runs on one laptop.** If that laptop is off or asleep at 5:30 PM, no report
is produced then. It catches up when the machine next wakes, so a *late* report
is normal. Moving it to an always-on machine removes this entirely —
see [05 · Moving to another machine](05-move-to-another-machine.md).

**Monitoring only happens while that laptop is awake.** Server up/down mails now
say so explicitly when there was a gap, rather than implying they watched the
whole night.
