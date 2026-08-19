// ===========================================================================
//  orbiwiseReport.js — the Orbiwise connected-devices report.
//
//  Builds an Excel workbook of Connected (48 Hrs) ILC devices, one table per
//  month, with SAAS and LNS kept separate — the automatic replacement for the
//  hand-filled quarterly sheet.
//
//  Usage:
//    node orbiwiseReport.js                 # last 3 months
//    node orbiwiseReport.js 2026-04 2026-06 # an explicit month range
//    node orbiwiseReport.js --backfill      # import every snapshot.json first
//    node orbiwiseReport.js --print         # console only, no file
//
//  Each month gets one sheet:
//     one row per project, one column per DAY, then avg / min / max / cost,
//     with SAAS and LNS in separate blocks and a total line for each.
//
//  Days with no reading are left BLANK, never zero — a missing measurement and
//  a genuine zero are different things, and averaging the two together is how
//  the old hand-filled sheet produced numbers that swung 600x within a month.
// ===========================================================================

const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const CFG = require("./orbiwise.config");
const HIST = require("./orbiwiseHistory");

const REPORTS_DIR = path.join(__dirname, "Reports");
const OUT_DIR = path.join(__dirname, "Reports");
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

const args = process.argv.slice(2);
const DO_BACKFILL = args.includes("--backfill");
const PRINT_ONLY = args.includes("--print");
const monthArgs = args.filter(a => /^\d{4}-\d{2}$/.test(a));

// ---------------------------------------------------------------- helpers ---
const monthKey = (d) => d.slice(0, 7);
const monthLabel = (k) => `${MONTH_NAMES[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
const daysInMonth = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();

function resolveMonths(entries) {
    if (monthArgs.length === 2) {
        const [a, b] = monthArgs.sort();
        const out = [];
        let y = Number(a.slice(0, 4)), m = Number(a.slice(5, 7));
        while (`${y}-${String(m).padStart(2, "0")}` <= b) {
            out.push(`${y}-${String(m).padStart(2, "0")}`);
            if (++m > 12) { m = 1; y++; }
        }
        return out;
    }
    if (monthArgs.length === 1) return [monthArgs[0]];
    const present = [...new Set(entries.map(e => monthKey(e.date)))].sort();
    return present.slice(-3);                 // default: the last three months present
}

const allProjects = () =>
    CFG.GROUPS.map(g => ({ group: g.name, label: g.label,
                           projects: g.projects.map(p => p.label) }));

// ------------------------------------------------------------------ build ---
function buildMonth(entries, mKey) {
    const inMonth = entries.filter(e => monthKey(e.date) === mKey);
    const dates = [...new Set(inMonth.map(e => e.date))].sort();
    const groups = [];

    for (const g of allProjects()) {
        const rows = [];
        for (const proj of g.projects) {
            const byDate = new Map();
            for (const e of inMonth) if (e.project === proj) byDate.set(e.date, e);
            const vals = dates.map(d => (byDate.has(d) ? byDate.get(d).connected : null));
            const seen = vals.filter(v => v !== null);
            const total = [...byDate.values()].reduce((mx, e) => Math.max(mx, e.total || 0), 0);
            rows.push({
                project: proj, total, vals,
                readings: seen.length,
                avg: seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : null,
                min: seen.length ? Math.min(...seen) : null,
                max: seen.length ? Math.max(...seen) : null,
                partialDays: [...byDate.values()].filter(e => e.partial).length,
            });
        }
        groups.push({ group: g.group, label: g.label, rows });
    }
    return { mKey, dates, groups };
}

// ------------------------------------------------------------------ excel ---
const THIN = { style: "thin", color: { argb: "FFBFBFBF" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const FILL = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function writeSheet(wb, m) {
    const ws = wb.addWorksheet(monthLabel(m.mKey).replace(/[\\/*?:[\]]/g, "-"));
    const nDays = m.dates.length;
    const rate = CFG.RATE_PER_DEVICE_PER_MONTH;

    // Column layout: A project | B total devices | C..(C+n-1) days | avg min max cost
    const firstDay = 3;
    const cAvg = firstDay + nDays, cMin = cAvg + 1, cMax = cMin + 1, cCost = cMax + 1;

    ws.getCell(1, 1).value = `Orbiwise — Connected (${CFG.WINDOW === "48hr" ? "48 Hrs" : CFG.WINDOW}) ${CFG.DEVICE_TYPE} devices — ${monthLabel(m.mKey)}`;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    ws.mergeCells(1, 1, 1, Math.max(cCost, 4));

    ws.getCell(2, 1).value = `Blank = no reading that day (not zero). ${m.dates.length} of ${daysInMonth(m.mKey)} days have a reading.`;
    ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF808080" } };
    ws.mergeCells(2, 1, 2, Math.max(cCost, 4));

    let r = 4;
    const header = () => {
        ws.getCell(r, 1).value = "Project";
        ws.getCell(r, 2).value = "Total Devices";
        m.dates.forEach((d, i) => { ws.getCell(r, firstDay + i).value = Number(d.slice(8, 10)); });
        ws.getCell(r, cAvg).value = "Avg";
        ws.getCell(r, cMin).value = "Min";
        ws.getCell(r, cMax).value = "Max";
        ws.getCell(r, cCost).value = `Cost (${CFG.CURRENCY}${rate}/device)`;
        for (let c = 1; c <= cCost; c++) {
            const cell = ws.getCell(r, c);
            cell.font = { bold: true, size: 9 };
            cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
            cell.fill = FILL("FFF2F2F2");
            cell.border = BORDER;
        }
        ws.getRow(r).height = 26;
        r++;
    };

    for (const g of m.groups) {
        // Group banner — the SAAS / LNS separation the requirement asks for.
        ws.getCell(r, 1).value = g.label;
        ws.getCell(r, 1).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        ws.getCell(r, 1).fill = FILL(g.group === "SAAS" ? "FF2F5597" : "FF548235");
        ws.mergeCells(r, 1, r, cCost);
        ws.getRow(r).height = 20;
        r++;
        header();

        const groupStart = r;
        for (const row of g.rows) {
            ws.getCell(r, 1).value = row.project;
            ws.getCell(r, 2).value = row.total || null;
            row.vals.forEach((v, i) => { ws.getCell(r, firstDay + i).value = v === null ? null : v; });
            ws.getCell(r, cAvg).value = row.avg === null ? null : Number(row.avg.toFixed(2));
            ws.getCell(r, cMin).value = row.min;
            ws.getCell(r, cMax).value = row.max;
            ws.getCell(r, cCost).value = row.avg === null ? null : { formula: `${ws.getCell(r, cAvg).address}*${rate}` , result: Number((row.avg * rate).toFixed(2)) };
            ws.getCell(r, cCost).numFmt = `"${CFG.CURRENCY} "#,##0.00`;
            for (let c = 1; c <= cCost; c++) {
                const cell = ws.getCell(r, c);
                cell.border = BORDER;
                cell.font = { size: 9 };
                cell.alignment = { horizontal: c === 1 ? "left" : "center" };
                // A project with no readings at all is worth seeing, not hiding.
                if (row.readings === 0) cell.fill = FILL("FFFFF2CC");
            }
            r++;
        }

        // Group total.
        ws.getCell(r, 1).value = `${g.label} total`;
        ws.getCell(r, cAvg).value = { formula: `SUM(${ws.getCell(groupStart, cAvg).address}:${ws.getCell(r - 1, cAvg).address})` };
        ws.getCell(r, cCost).value = { formula: `SUM(${ws.getCell(groupStart, cCost).address}:${ws.getCell(r - 1, cCost).address})` };
        ws.getCell(r, cCost).numFmt = `"${CFG.CURRENCY} "#,##0.00`;
        for (let c = 1; c <= cCost; c++) {
            const cell = ws.getCell(r, c);
            cell.font = { bold: true, size: 9 };
            cell.fill = FILL("FFE7E6E6");
            cell.border = BORDER;
            cell.alignment = { horizontal: c === 1 ? "left" : "center" };
        }
        r += 2;
    }

    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 13;
    for (let i = 0; i < nDays; i++) ws.getColumn(firstDay + i).width = 5;
    ws.getColumn(cAvg).width = 10;
    ws.getColumn(cMin).width = 7;
    ws.getColumn(cMax).width = 7;
    ws.getColumn(cCost).width = 16;
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 0 }];
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
    const built = months.map(k => buildMonth(entries, k));

    // Console summary — always shown, so a scheduled run leaves a readable log.
    for (const m of built) {
        console.log("=".repeat(88));
        console.log(`  ${monthLabel(m.mKey)} — Connected (48 Hrs) ${CFG.DEVICE_TYPE}   [${m.dates.length}/${daysInMonth(m.mKey)} days with a reading]`);
        console.log("=".repeat(88));
        for (const g of m.groups) {
            console.log(`  -- ${g.label} --`);
            console.log("     Project            Total   Readings     Avg     Min     Max        Cost");
            let sum = 0;
            for (const row of g.rows) {
                if (row.avg !== null) sum += row.avg * CFG.RATE_PER_DEVICE_PER_MONTH;
                const f = (v, w, d = 0) => (v === null ? "-" : v.toFixed(d)).padStart(w);
                console.log(
                    "     " + row.project.padEnd(19) + String(row.total || "-").padStart(5) +
                    String(row.readings).padStart(11) + f(row.avg, 8, 1) + f(row.min, 8) + f(row.max, 8) +
                    (`${CFG.CURRENCY} ` + Math.round(row.avg === null ? 0 : row.avg * CFG.RATE_PER_DEVICE_PER_MONTH).toLocaleString("en-IN")).padStart(12)
                );
            }
            console.log("     " + "".padEnd(19) + " ".repeat(40) + `${CFG.CURRENCY} ${Math.round(sum).toLocaleString("en-IN")}`.padStart(12));
        }
        console.log("");
    }

    if (PRINT_ONLY) return;

    const wb = new ExcelJS.Workbook();
    wb.creator = "Connectivity Report — Orbiwise automation";
    for (const m of built) writeSheet(wb, m);

    const stamp = new Date().toISOString().slice(0, 10);
    const name = `Orbiwise_Connected_Devices_${months[0]}_to_${months[months.length - 1]}.xlsx`;
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    let out = path.join(OUT_DIR, name);
    try {
        await wb.xlsx.writeFile(out);
    } catch {
        out = out.replace(/\.xlsx$/, `_${stamp}_NEW.xlsx`);
        await wb.xlsx.writeFile(out);
    }
    console.log(`Written: ${out}`);
})().catch(e => { console.error("ERR", e.stack); process.exit(1); });
