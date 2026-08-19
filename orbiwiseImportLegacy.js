// ===========================================================================
//  orbiwiseImportLegacy.js — seed the Orbiwise history from the old master
//  connectivity workbook.
//
//  Going forward the daily run records history by itself (see orbiwiseHistory).
//  But that only starts from today, and the past readings live in the master
//  workbook that was maintained by hand — "Updated Connectivity Report
//  Sheet<date>.xlsx". This reads that workbook and writes its readings into the
//  same history file, so months before the automation began still appear.
//
//  Usage:
//    node orbiwiseImportLegacy.js "C:\path\Updated Connectivity Report Sheet16.01.2026.xlsx"
//    node orbiwiseImportLegacy.js <file> --dry-run
//
//  Layout of that workbook: one sheet per project; across the columns are
//  repeated per-DATE blocks, and the date (an Excel serial) sits in the SAME
//  column as that date's "Connected" figure. Device totals are in column B.
//
//  Existing history entries are NOT overwritten — a reading the daily run
//  recorded itself always wins over one scraped from the old sheet.
// ===========================================================================

const ExcelJS = require("exceljs");
const fs = require("fs");
const HIST = require("./orbiwiseHistory");

const SRC = process.argv[2];
const DRY = process.argv.includes("--dry-run");

// Which row of which sheet feeds which configured project. Sites within a
// project are summed, matching orbiwise.config.js.
const LEGACY_ROWS = [
    { project: "KGBOT",   sheet: "KG BOT",  match: /KG BOT ILC/i,     group: "SAAS" },
    { project: "GCBOT",   sheet: "GC BOT",  match: /GC BOT ILC/i,     group: "SAAS" },
    { project: "GCBOT",   sheet: "GC BOT",  match: /Bajaj/i,          group: "SAAS" },
    { project: "Bhopal",  sheet: "Bhopal",  match: /BHOPAL ILC/i,     group: "SAAS" },
    { project: "JD",      sheet: "JD",      match: /ITVIS PUNE ILC/i, group: "SAAS" },
    { project: "Nalanda", sheet: "Nalanda", match: /Nalanda ILC/i,    group: "SAAS" },
    { project: "KDMC",    sheet: "KDMC",    match: /ILC/i,            group: "LNS"  },
];

const serialToDate = (n) => new Date(Math.round((n - 25569) * 86400 * 1000));
const num = (v) => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    if (typeof v === "object" && v.result !== undefined) return typeof v.result === "number" ? v.result : null;
    return null;
};
const txt = (v) => {
    if (v == null) return "";
    if (typeof v === "object") return v.richText ? v.richText.map(x => x.text).join("") : (v.text || "");
    return String(v);
};

(async () => {
    if (!SRC || !fs.existsSync(SRC)) {
        console.error("Usage: node orbiwiseImportLegacy.js \"<path to master connectivity workbook>\" [--dry-run]");
        process.exit(1);
    }
    console.log(`Reading ${SRC}${DRY ? "  (DRY RUN)" : ""}\n`);

    // Streamed: the master workbook is very wide and blows the heap if fully loaded.
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(SRC, { entries: "emit", sharedStrings: "cache", worksheets: "emit" });
    const sheets = {};
    for await (const ws of reader) {
        const rows = [];
        for await (const row of ws) {
            const arr = [];
            row.eachCell({ includeEmpty: true }, (cell, c) => { arr[c] = cell.value; });
            rows[row.number] = arr;
        }
        sheets[ws.name] = rows;
    }

    // date -> project -> {connected, total}
    const collected = new Map();

    for (const spec of LEGACY_ROWS) {
        const rows = sheets[spec.sheet];
        if (!rows) { console.log(`  ! sheet "${spec.sheet}" not found — skipping ${spec.project}`); continue; }

        // The date serials in the header rows mark the "Connected" columns.
        const dateCols = [];
        for (let r = 1; r <= Math.min(5, rows.length); r++) {
            const arr = rows[r] || [];
            for (let c = 1; c < arr.length; c++) {
                const n = num(arr[c]);
                if (n && n > 44000 && n < 48000) dateCols.push({ col: c, date: serialToDate(n) });
            }
        }
        let dataRow = null;
        for (let r = 1; r < rows.length; r++) {
            const arr = rows[r] || [];
            if (spec.match.test([txt(arr[1]), txt(arr[2])].join(" "))) { dataRow = r; break; }
        }
        if (dataRow == null) { console.log(`  ! no row matching ${spec.match} in "${spec.sheet}"`); continue; }

        const total = num((rows[dataRow] || [])[2]) || 0;
        let n = 0, dupes = 0;
        // The master workbook contains repeated date columns in places (its own
        // notes flag "GC BOT has two columns both dated 15 Jun 2026"). Taking both
        // would double that day's figure — and, because a project sums its site
        // rows, silently double its device total too. Keep the FIRST column for a
        // given date on a given source row.
        const seenDates = new Set();
        for (const dc of dateCols) {
            const connected = num((rows[dataRow] || [])[dc.col]);
            if (connected == null) continue;
            const date = dc.date.toISOString().slice(0, 10);
            if (seenDates.has(date)) { dupes++; continue; }
            seenDates.add(date);
            if (!collected.has(date)) collected.set(date, new Map());
            const byProj = collected.get(date);
            const cur = byProj.get(spec.project) || { group: spec.group, connected: 0, total: 0 };
            cur.connected += connected;     // sum the sites of a project
            cur.total += total;
            byProj.set(spec.project, cur);
            n++;
        }
        console.log(`  ${spec.project.padEnd(9)} <- "${spec.sheet}" row ${dataRow}: ${n} reading(s), total ${total}` +
                    (dupes ? `   [${dupes} duplicate date column(s) ignored]` : ""));
    }

    // Merge into history without clobbering anything already recorded.
    // Previously-imported legacy entries are dropped first so re-running this is
    // idempotent — otherwise a corrected import would sit alongside the old one.
    const h = HIST.loadHistory();
    let dropped = 0;
    for (const [k, v] of Object.entries(h.entries)) {
        if (v && v.source === "legacy") { delete h.entries[k]; dropped++; }
    }
    if (dropped) console.log(`\n  Cleared ${dropped} previously-imported legacy entr(ies) before re-importing.`);
    let added = 0, kept = 0;
    const months = new Map();
    for (const [date, byProj] of collected) {
        for (const [project, v] of byProj) {
            const key = `${date}|${project}`;
            if (h.entries[key]) { kept++; continue; }
            h.entries[key] = { date, project, group: v.group, connected: v.connected, total: v.total, source: "legacy" };
            added++;
            const m = date.slice(0, 7);
            months.set(m, (months.get(m) || 0) + 1);
        }
    }

    console.log("");
    console.log(`  ${added} entr(ies) to add, ${kept} already present (kept — live readings win).`);
    console.log("  by month:");
    for (const m of [...months.keys()].sort()) console.log(`    ${m}  ${months.get(m)} project-day(s)`);

    if (DRY) { console.log("\nDRY RUN — nothing written."); return; }

    h.updatedAt = new Date().toISOString();
    fs.writeFileSync(HIST.HISTORY_FILE, JSON.stringify(h, null, 2), "utf8");
    console.log(`\nWritten: ${HIST.HISTORY_FILE}  (${Object.keys(h.entries).length} project-days total)`);
})().catch(e => { console.error("ERR", e.stack); process.exit(1); });
