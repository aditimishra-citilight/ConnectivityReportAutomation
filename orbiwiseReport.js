// ===========================================================================
//  orbiwiseReport.js — the Orbiwise connected-devices report.
//
//  Automatic replacement for the hand-filled quarterly Orbiwise sheet. Builds
//  the same table shape the team already uses, so it drops straight in:
//
//    - one block per PROJECT
//    - within a block, one column-group per MONTH, side by side
//    - days run DOWN the rows (1..31), one row per day
//    - per month: Connected devices | Total Devices | Cost of Usage |
//                 Connected Gateways | Total Gateways
//    - an "avg" row, then "Total Amount owed in <Month>"
//    - SAAS and LNS on separate sheets, each with a group total
//
//  Usage:
//    node orbiwiseReport.js                 # last 3 months present
//    node orbiwiseReport.js 2026-04 2026-06 # explicit month range
//    node orbiwiseReport.js --backfill      # import every snapshot.json first
//    node orbiwiseReport.js --print         # console only, no file
//
//  Days with no reading are left BLANK, never zero — a missing measurement and
//  a genuine zero are different things, and the "avg" row averages only the
//  days that actually have a reading.
// ===========================================================================

const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const CFG = require("./orbiwise.config");
const HIST = require("./orbiwiseHistory");

const REPORTS_DIR = path.join(__dirname, "Reports");
// Orbiwise output lives in its own tree, one folder per month, mirroring the way
// the NDMC reports are filed: Reports/Orbiwise/<Mon><Year>/
const ORBIWISE_ROOT = path.join(__dirname, "Reports", "Orbiwise");
const MON_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthFolder(mKey) {
    const dir = path.join(ORBIWISE_ROOT, MON_SHORT[Number(mKey.slice(5,7))-1] + mKey.slice(0,4));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

const args = process.argv.slice(2);
const DO_BACKFILL = args.includes("--backfill");
const PRINT_ONLY = args.includes("--print");
const monthArgs = args.filter(a => /^\d{4}-\d{2}$/.test(a));

const RATE = CFG.RATE_PER_DEVICE_PER_MONTH;
const CUR = CFG.CURRENCY;

// ---------------------------------------------------------------- helpers ---
const monthKey = (d) => d.slice(0, 7);
const monthLabel = (k) => `${MONTH_NAMES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
const monthShort = (k) => MONTH_NAMES[Number(k.slice(5, 7)) - 1];
const daysInMonth = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();

function resolveMonths(entries) {
    if (monthArgs.length === 2) {
        const [a, b] = [...monthArgs].sort();
        const out = [];
        let y = Number(a.slice(0, 4)), m = Number(a.slice(5, 7));
        while (`${y}-${String(m).padStart(2, "0")}` <= b) {
            out.push(`${y}-${String(m).padStart(2, "0")}`);
            if (++m > 12) { m = 1; y++; }
        }
        return out;
    }
    if (monthArgs.length === 1) return [monthArgs[0]];
    return [...new Set(entries.map(e => monthKey(e.date)))].sort().slice(-3);
}

// entries -> project -> month -> day -> reading
function index(entries) {
    const m = new Map();
    for (const e of entries) {
        if (!m.has(e.project)) m.set(e.project, new Map());
        const byMonth = m.get(e.project);
        const mk = monthKey(e.date);
        if (!byMonth.has(mk)) byMonth.set(mk, new Map());
        byMonth.get(mk).set(Number(e.date.slice(8, 10)), e);
    }
    return m;
}

function projectStats(idx, project, mKey) {
    const byDay = (idx.get(project) || new Map()).get(mKey) || new Map();
    const vals = [...byDay.values()].map(e => e.connected).filter(v => v !== null && v !== undefined);
    return {
        byDay,
        readings: vals.length,
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
        // Device / gateway totals are a property of the fleet, not of a day, so
        // take the largest seen rather than summing across days.
        total:   Math.max(0, ...[...byDay.values()].map(e => e.total || 0)),
        gwTotal: Math.max(0, ...[...byDay.values()].map(e => e.gwTotal || 0)),
        gwAvg: (() => {
            const g = [...byDay.values()].map(e => e.gwConnected).filter(v => v !== null && v !== undefined);
            return g.length ? g.reduce((a, b) => a + b, 0) / g.length : null;
        })(),
    };
}

// ------------------------------------------------------------------ excel ---
const THIN = { style: "thin", color: { argb: "FFBFBFBF" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const FILL = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const MONEY = `"${CUR} "#,##0.00`;

// Columns per month block, in the SAME order and with the same headings as the
// reference Q2 sheet, so this output can sit next to it without re-reading:
//   Date | Connected devices | Avg for weekends | Total Devices |
//   Cost of Usage | Connected Gateways | Total gateways
// "Avg for weekends" is a placeholder in the reference sheet too - it carries a
// heading but no values - so it is emitted empty rather than invented.
const COLS_PER_MONTH = 7;
const GAP = 1;

function writeGroupSheet(wb, group, months, idx) {
    const ws = wb.addWorksheet(group.label.replace(/[\\/*?:[\]]/g, "-"));
    const blockWidth = COLS_PER_MONTH + GAP;
    const lastCol = months.length * blockWidth;

    ws.getCell(1, 1).value = `${group.label} — Connected (48 Hrs) ${CFG.DEVICE_TYPE} devices`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, Math.max(lastCol, 6));
    ws.getCell(2, 1).value =
        `Rate ${CUR} ${RATE} per device per month.  Cost of Usage = average connected devices x rate.  ` +
        `A blank day means no reading was recorded — the average uses only days that have one.`;
    ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF808080" } };
    ws.mergeCells(2, 1, 2, Math.max(lastCol, 6));

    let r = 4;
    const groupTotalRows = [];

    for (const p of group.projects) {
        // ---- project banner
        ws.getCell(r, 1).value = p.label;
        ws.getCell(r, 1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
        ws.getCell(r, 1).fill = FILL(group.name === "SAAS" ? "FF2F5597" : "FF548235");
        ws.mergeCells(r, 1, r, lastCol);
        ws.getRow(r).height = 20;
        r++;

        // ---- month headers
        const headRow = r, subRow = r + 1;
        months.forEach((mk, i) => {
            const c0 = i * blockWidth + 1;
            ws.getCell(headRow, c0).value = monthLabel(mk);
            ws.mergeCells(headRow, c0, headRow, c0 + COLS_PER_MONTH - 1);
            ws.getCell(headRow, c0).font = { bold: true, size: 10 };
            ws.getCell(headRow, c0).alignment = { horizontal: "center" };
            ws.getCell(headRow, c0).fill = FILL("FFD9E1F2");

            ["Date", "Connected devices", "Avg for weekends", "Total Devices",
             "Cost of Usage", "Connected Gateways", "Total gateways"].forEach((t, j) => {
                const cell = ws.getCell(subRow, c0 + j);
                cell.value = t;
                cell.font = { bold: true, size: 9 };
                cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                cell.fill = FILL("FFF2F2F2");
                cell.border = BORDER;
            });
            for (let j = 0; j < COLS_PER_MONTH; j++) ws.getCell(headRow, c0 + j).border = BORDER;
        });
        ws.getRow(subRow).height = 30;
        r = subRow + 1;

        // ---- day rows
        const firstDayRow = r;
        const maxDays = Math.max(...months.map(daysInMonth));
        const stats = months.map(mk => projectStats(idx, p.label, mk));

        for (let d = 1; d <= maxDays; d++) {
            months.forEach((mk, i) => {
                const c0 = i * blockWidth + 1;
                if (d > daysInMonth(mk)) return;
                const st = stats[i];
                const e = st.byDay.get(d);
                ws.getCell(r, c0).value = d;
                ws.getCell(r, c0 + 1).value = e ? e.connected : null;
                // c0+2 is "Avg for weekends" - intentionally left empty, as in the reference.
                ws.getCell(r, c0 + 3).value = e ? (e.total ?? null) : null;
                ws.getCell(r, c0 + 5).value = e && e.gwConnected !== undefined ? e.gwConnected : null;
                ws.getCell(r, c0 + 6).value = e && e.gwTotal !== undefined ? e.gwTotal : null;
                for (let j = 0; j < COLS_PER_MONTH; j++) {
                    const cell = ws.getCell(r, c0 + j);
                    cell.border = BORDER;
                    cell.font = { size: 9 };
                    cell.alignment = { horizontal: "center" };
                }
            });
            r++;
        }
        const lastDayRow = r - 1;

        // ---- avg row
        months.forEach((mk, i) => {
            const c0 = i * blockWidth + 1;
            ws.getCell(r, c0).value = "avg";
            const colL = ws.getColumn(c0 + 1).letter;   // Connected devices
            const gwL  = ws.getColumn(c0 + 5).letter;   // Connected Gateways
            ws.getCell(r, c0 + 1).value = { formula: `IFERROR(AVERAGE(${colL}${firstDayRow}:${colL}${lastDayRow}),"")`, result: stats[i].avg ?? "" };
            // c0+2 is "Avg for weekends" — left empty, as in the reference sheet.
            ws.getCell(r, c0 + 3).value = stats[i].total || null;
            // Cost of Usage = avg connected x rate.
            ws.getCell(r, c0 + 4).value = { formula: `IFERROR(${colL}${r}*${RATE},"")`, result: stats[i].avg === null ? "" : Number((stats[i].avg * RATE).toFixed(2)) };
            ws.getCell(r, c0 + 4).numFmt = MONEY;
            ws.getCell(r, c0 + 5).value = { formula: `IFERROR(AVERAGE(${gwL}${firstDayRow}:${gwL}${lastDayRow}),"")`, result: stats[i].gwAvg ?? "" };
            ws.getCell(r, c0 + 6).value = stats[i].gwTotal || null;
            for (let j = 0; j < COLS_PER_MONTH; j++) {
                const cell = ws.getCell(r, c0 + j);
                cell.font = { bold: true, size: 9 };
                cell.fill = FILL("FFE7E6E6");
                cell.border = BORDER;
                cell.alignment = { horizontal: "center" };
            }
        });
        const avgRow = r;
        r++;

        // ---- total amount owed
        months.forEach((mk, i) => {
            const c0 = i * blockWidth + 1;
            ws.getCell(r, c0).value = `Total Amount owed in ${monthShort(mk)}`;
            ws.mergeCells(r, c0, r, c0 + 3);
            ws.getCell(r, c0).font = { bold: true, size: 9 };
            ws.getCell(r, c0).alignment = { horizontal: "right" };
            ws.getCell(r, c0 + 4).value = { formula: `${ws.getColumn(c0 + 4).letter}${avgRow}` };
            ws.getCell(r, c0 + 4).numFmt = MONEY;
            ws.getCell(r, c0 + 4).font = { bold: true, size: 9 };
            ws.getCell(r, c0 + 4).fill = FILL("FFFFF2CC");
            for (let j = 0; j <= 4; j++) ws.getCell(r, c0 + j).border = BORDER;
        });
        groupTotalRows.push(r);
        r += 2;
    }

    // ---- group total across all projects
    ws.getCell(r, 1).value = `${group.label} — TOTAL`;
    ws.getCell(r, 1).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    ws.getCell(r, 1).fill = FILL("FF404040");
    ws.mergeCells(r, 1, r, Math.max(lastCol, 6));
    r++;
    months.forEach((mk, i) => {
        const c0 = i * blockWidth + 1;
        ws.getCell(r, c0).value = `${monthShort(mk)} total`;
        ws.mergeCells(r, c0, r, c0 + 3);
        ws.getCell(r, c0).font = { bold: true, size: 10 };
        ws.getCell(r, c0).alignment = { horizontal: "right" };
        const col = ws.getColumn(c0 + 4).letter;
        ws.getCell(r, c0 + 4).value = { formula: groupTotalRows.map(tr => `${col}${tr}`).join("+") };
        ws.getCell(r, c0 + 4).numFmt = MONEY;
        ws.getCell(r, c0 + 4).font = { bold: true, size: 10 };
        ws.getCell(r, c0 + 4).fill = FILL("FFC6E0B4");
        for (let j = 0; j <= 4; j++) ws.getCell(r, c0 + j).border = BORDER;
    });

    // widths
    months.forEach((_, i) => {
        const c0 = i * blockWidth + 1;
        ws.getColumn(c0).width = 7;      // Date
        ws.getColumn(c0 + 1).width = 12; // Connected devices
        ws.getColumn(c0 + 2).width = 11; // Avg for weekends
        ws.getColumn(c0 + 3).width = 11; // Total Devices
        ws.getColumn(c0 + 4).width = 15; // Cost of Usage
        ws.getColumn(c0 + 5).width = 12; // Connected Gateways
        ws.getColumn(c0 + 6).width = 11; // Total gateways
        if (GAP) ws.getColumn(c0 + COLS_PER_MONTH).width = 2;
    });
    return ws;
}

// ------------------------------------------------------------------- main ---
(async () => {
    if (DO_BACKFILL) {
        const res = HIST.backfillFromReports(REPORTS_DIR);
        console.log(`Backfill: ${res.runs} run(s) imported, ${res.entries} entr(ies) written, ${res.skipped} skipped.`);
        console.log(`History now holds ${res.totalEntries} project-days.\n`);
    }

    const entries = HIST.allEntries();
    if (!entries.length) {
        console.error("No history yet. Run with --backfill, or let the daily report run once.");
        process.exit(1);
    }

    const months = resolveMonths(entries);
    const idx = index(entries);

    // Console summary, so a scheduled run leaves a readable log.
    for (const g of CFG.GROUPS) {
        console.log("=".repeat(94));
        console.log(`  ${g.label}`);
        console.log("=".repeat(94));
        console.log("  Project      " + months.map(m => monthLabel(m).padStart(24)).join(""));
        console.log("               " + months.map(() => "  avg   readings      cost").join(""));
        const totals = months.map(() => 0);
        for (const p of g.projects) {
            let line = "  " + p.label.padEnd(13);
            months.forEach((mk, i) => {
                const st = projectStats(idx, p.label, mk);
                const cost = st.avg === null ? 0 : st.avg * RATE;
                totals[i] += cost;
                line += (st.avg === null ? "-" : st.avg.toFixed(1)).padStart(7)
                      + String(st.readings).padStart(9)
                      + (`${CUR} ` + Math.round(cost).toLocaleString("en-IN")).padStart(11);
            });
            console.log(line);
        }
        console.log("  " + "TOTAL".padEnd(13) + months.map((_, i) =>
            (`${CUR} ` + Math.round(totals[i]).toLocaleString("en-IN")).padStart(27)).join(""));
        console.log("");
    }

    if (PRINT_ONLY) return;

    // ONE WORKBOOK PER MONTH, in its own folder — Reports/Orbiwise/<Mon><Year>/.
    // A month is a self-contained billing period, so keeping months in separate
    // files means one can be re-generated or re-sent without touching the others.
    const written = [];
    for (const mk of months) {
        const wb = new ExcelJS.Workbook();
        wb.creator = "Connectivity Report — Orbiwise automation";
        // Each group is its own sheet, and inside it every project/city is its
        // own block — so the cities stay visibly separate within the month.
        for (const g of CFG.GROUPS) writeGroupSheet(wb, g, [mk], idx);

        const dir = monthFolder(mk);
        let out = path.join(dir, `Orbiwise_Connected_Devices_${monthLabel(mk).replace(" ", "_")}.xlsx`);
        try {
            await wb.xlsx.writeFile(out);
        } catch {
            out = out.replace(/\.xlsx$/, `_NEW.xlsx`);
            await wb.xlsx.writeFile(out);
        }
        written.push(out);
        console.log(`Written: ${out}`);
    }
    return written;
})().catch(e => { console.error("ERR", e.stack); process.exit(1); });
