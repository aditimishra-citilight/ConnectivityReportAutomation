// ===========================================================================
//  connectivityReport.js — logs into every server, pulls each project's device
//  groups (CCMS / ILC / Warehouse / Gateway), counts Connected/Disconnected for
//  24 hr & 48 hr (dynamic "now"), and writes a styled Excel:
//    - one sheet per window
//    - every project in ONE colour, with a gap row between projects
//    - Meter columns filled only for CCMS (blank for ILC/Gateway/Warehouse)
//
//  Run:  node connectivityReport.js
//        node connectivityReport.js "2026-06-25 12:00:00"   (override "now")
// ===========================================================================
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const { CREDENTIALS, SERVERS, REPORTS, WINDOWS } = require("./cities.config");
const { login, fetchDevices, fetchGeography, countConnectivity } = require("./lib");

// Parent folder that holds one dated sub-folder per run.
const REPORTS_DIR = path.join(__dirname, "Reports");

const arg = process.argv[2];
const nowMs = arg ? new Date(arg.replace(" ", "T")).getTime() : Date.now();
const NOW = new Date(nowMs);

// Per-project fill colours (consistent across both sheets).
const PALETTE = [
  "FFDDEBF7", "FFE2EFDA", "FFFFF2CC", "FFFCE4D6", "FFEDEDF6",
  "FFFCE4EC", "FFE0F2F1", "FFF2E6FF", "FFEAF1DD",
];
const projectColours = {};
[...new Set(REPORTS.map((r) => r.project))].forEach((p, i) => {
  projectColours[p] = PALETTE[i % PALETTE.length];
});

// Column layout. kind: value | formula | pct(formula)
//   sum:   true  -> on a Total row this column SUMs the group's data rows.
//   meter: true  -> meter column; left blank on a Total row when the group has no CCMS.
const COLUMNS = [
  { header: "Project",                    width: 13, align: "left",  kind: "value" },
  { header: "Site / Group",               width: 20, align: "left",  kind: "value" },
  { header: "Type",                       width: 11, align: "center",kind: "value" },
  { header: "Total",                      width: 9,  align: "right", kind: "value",   sum: true },
  { header: "Connected",                  width: 11, align: "right", kind: "value",   sum: true },
  { header: "Connected %",                width: 12, align: "right", kind: "pct",     formula: (r) => `IFERROR(E${r}/D${r},0)` },
  { header: "Disconnected",               width: 12, align: "right", kind: "formula", formula: (r) => `D${r}-E${r}` },
  { header: "Disconnected %",             width: 13, align: "right", kind: "pct",     formula: (r) => `IFERROR((D${r}-E${r})/D${r},0)` },
  { header: "Meter QTY",                  width: 10, align: "right", kind: "value",   sum: true, meter: true },
  { header: "Meter % (Connected Panels)", width: 15, align: "right", kind: "pct",     formula: (r) => `IFERROR(I${r}/E${r},0)`, meter: true },
  { header: "Meter % (Total Panels)",     width: 15, align: "right", kind: "pct",     formula: (r) => `IFERROR(I${r}/D${r},0)`, meter: true },
];

async function gatherData() {
  const sessions = {}, geo = {};
  for (const [key, srv] of Object.entries(SERVERS)) {
    process.stdout.write(`Login ${key} ... `);
    sessions[key] = await login(srv, CREDENTIALS);
    try { geo[key] = await fetchGeography(srv, sessions[key]); } catch { geo[key] = []; }
    console.log("OK");
  }
  const resolveCityId = (r) => {
    if (r.cityId) return r.cityId;
    const hit = (geo[r.server] || []).find(
      (c) => (c.cityName || "").trim().toUpperCase() === (r.cityName || "").toUpperCase());
    return hit ? String(hit.cityId) : null;
  };

  const rows = [];
  for (const r of REPORTS) {
    const cityId = resolveCityId(r);
    if (!cityId) { console.log(`  ! ${r.label}: cityId unresolved`); continue; }
    try {
      const devices = await fetchDevices(SERVERS[r.server], sessions[r.server], cityId, r.deviceType);
      const res = countConnectivity(devices, WINDOWS, nowMs);
      rows.push({ project: r.project, site: r.label, type: r.type || "", windows: res.windows });
      console.log(`  ${r.label}: total ${res.total}`);
    } catch (e) {
      console.log(`  ! ${r.label}: ${e.message}`);
    }
  }
  return rows;
}

const thin = () => {
  const s = { style: "thin", color: { argb: "FFB0B0B0" } };
  return { top: s, left: s, bottom: s, right: s };
};

// 1-indexed column number -> Excel column letter (1->A, 27->AA).
const colLetter = (n) => {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

// Group report rows by project, preserving first-seen order.
function groupByProject(rows) {
  const order = [], byKey = {};
  for (const r of rows) {
    if (!(r.project in byKey)) { byKey[r.project] = { project: r.project, rows: [] }; order.push(byKey[r.project]); }
    byKey[r.project].rows.push(r);
  }
  return order;
}

// SUM over a contiguous range in one column:  SUM(D6:D12)
const sumRange = (letter, first, last) => `SUM(${letter}${first}:${letter}${last})`;
// SUM over specific (non-contiguous) cells in one column:  SUM(D13,D21,D29)
const sumCells = (letter, rowNums) => `SUM(${rowNums.map((r) => letter + r).join(",")})`;

const GRAND_FILL = "FFFFE699"; // light gold — distinguishes the grand-total row

// Write a Total / Grand-Total row on a COLUMNS-based sheet (per-window 24/48 sheets).
//   sumRefFor(letter) -> the SUM formula for a count column (range or specific cells).
//   Count columns SUM; % / Disconnected columns reuse their per-row formula (so they
//   become ratio-of-sums); meter columns stay blank when the group has no CCMS.
function writeColumnsTotalRow(ws, rowNo, fill, label1, label2, sumRefFor, hasCCMS) {
  const row = ws.getRow(rowNo);
  COLUMNS.forEach((c, i) => {
    const colNo = i + 1;
    const letter = colLetter(colNo);
    const cell = row.getCell(colNo);
    let val;
    if (colNo === 1) val = label1;
    else if (colNo === 2) val = label2;
    else if (colNo === 3) val = "";
    else if (c.meter && !hasCCMS) val = "";
    else if (c.sum) val = { formula: sumRefFor(letter) };
    else if (c.formula) val = { formula: c.formula(rowNo) };
    else val = "";
    cell.value = val;
    cell.alignment = { horizontal: c.align };
    if (c.kind === "pct") cell.numFmt = "0.0%";
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.border = thin();
  });
  return row;
}

function buildSheet(ws, rows, win) {
  const n = COLUMNS.length;
  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = `Connectivity Report — ${win.label}   (as of ${NOW.toLocaleString()})`;
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  const hr = ws.getRow(2);
  COLUMNS.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF44546A" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.border = thin();
    ws.getColumn(i + 1).width = c.width;
  });
  hr.height = 42;

  let xl = 3;
  const groups = groupByProject(rows);
  const subtotalRows = [];
  let anyCCMS = false;
  groups.forEach((g) => {
    const fill = projectColours[g.project] || "FFFFFFFF";
    const firstRow = xl;
    let hasCCMS = false;
    for (const r of g.rows) {
      const w = r.windows[win.key];
      const isCCMS = r.type === "CCMS";
      if (isCCMS) { hasCCMS = true; anyCCMS = true; }
      const row = ws.getRow(xl);
      const data = {
        1: r.project, 2: r.site, 3: r.type,
        4: w.total, 5: w.connected,
        9: isCCMS ? w.meterQty : null,
      };
      COLUMNS.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const colNo = i + 1;
        if (c.kind === "value") {
          cell.value = data[colNo] ?? "";
        } else if (c.meter && !isCCMS) {
          cell.value = "";                       // meter % (cols 10,11) only for CCMS
        } else {
          cell.value = { formula: c.formula(xl) };
        }
        cell.alignment = { horizontal: c.align };
        if (c.kind === "pct") cell.numFmt = "0.0%";
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.border = thin();
      });
      xl++;
    }
    // Per-project subtotal, then a gap row before the next project.
    const lastRow = xl - 1;
    writeColumnsTotalRow(ws, xl, fill, g.project, "Total", (L) => sumRange(L, firstRow, lastRow), hasCCMS);
    subtotalRows.push(xl);
    xl += 2;
  });
  // Grand total across all projects (sum of the per-project subtotal rows).
  writeColumnsTotalRow(ws, xl, GRAND_FILL, "GRAND TOTAL", "", (L) => sumCells(L, subtotalRows), anyCCMS);

  ws.views = [{ state: "frozen", ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: n } };
}

// ---------------------------------------------------------------------------
//  Combined sheet: every window side-by-side on ONE sheet.
//    Row 1: title.  Row 2: window group header (24 Hrs / 48 Hrs).  Row 3: column
//    sub-headers. Fixed cols (Project / Site / Type / Total) appear once and span
//    rows 2-3; Total is window-independent. Each window gets its own 7-col block
//    (Connected, Connected %, Disconnected, Disconnected %, Meter QTY, Meter %…).
// ---------------------------------------------------------------------------
const FIXED = [
  { header: "Project",      width: 13, align: "left"   },
  { header: "Site / Group", width: 20, align: "left"   },
  { header: "Type",         width: 11, align: "center" },
  { header: "Total",        width: 9,  align: "right"   },
];
// Per-window block. kind: value | count | pct. `ref(connCol, meterCol, totalCol, r)`
// builds the formula from the resolved column letters for that window's block.
const BLOCK = [
  { header: "Connected",                  width: 11, kind: "value", sum: true },
  { header: "Connected %",                width: 12, kind: "pct",   ref: (c, m, d, r) => `IFERROR(${c}${r}/${d}${r},0)` },
  { header: "Disconnected",               width: 12, kind: "count", ref: (c, m, d, r) => `${d}${r}-${c}${r}` },
  { header: "Disconnected %",             width: 13, kind: "pct",   ref: (c, m, d, r) => `IFERROR((${d}${r}-${c}${r})/${d}${r},0)` },
  { header: "Meter QTY",                  width: 10, kind: "value", sum: true, meter: true },
  { header: "Meter % (Connected Panels)", width: 15, kind: "pct",   ref: (c, m, d, r) => `IFERROR(${m}${r}/${c}${r},0)`, ccmsOnly: true },
  { header: "Meter % (Total Panels)",     width: 15, kind: "pct",   ref: (c, m, d, r) => `IFERROR(${m}${r}/${d}${r},0)`, ccmsOnly: true },
];
// Group-header fill per window block (cycled), to visually separate the windows.
const BLOCK_FILL = ["FF2E75B6", "FF548235", "FF9E480E", "FF7030A0"];

function styleCell(cell, fill, align, isPct) {
  cell.alignment = { horizontal: align || "right" };
  if (isPct) cell.numFmt = "0.0%";
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.border = thin();
}

function buildCombinedSheet(ws, rows) {
  const nFixed = FIXED.length;          // 4
  const nBlock = BLOCK.length;          // 7
  const nCols = nFixed + WINDOWS.length * nBlock;
  const TOTAL_COL = colLetter(4);       // "D" — shared Total column

  // Title.
  ws.mergeCells(1, 1, 1, nCols);
  const t = ws.getCell(1, 1);
  t.value = `Connectivity Report — ${WINDOWS.map((w) => w.label).join(" & ")}   (as of ${NOW.toLocaleString()})`;
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  // Fixed headers span rows 2-3.
  FIXED.forEach((c, i) => {
    const col = i + 1;
    ws.mergeCells(2, col, 3, col);
    const cell = ws.getCell(2, col);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF44546A" } };
    cell.border = thin();
    ws.getColumn(col).width = c.width;
  });

  // Per-window group header (row 2) + sub-headers (row 3).
  WINDOWS.forEach((w, wi) => {
    const start = nFixed + wi * nBlock + 1;
    const end = start + nBlock - 1;
    ws.mergeCells(2, start, 2, end);
    const g = ws.getCell(2, start);
    g.value = w.label;
    g.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    g.alignment = { horizontal: "center", vertical: "middle" };
    g.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLOCK_FILL[wi % BLOCK_FILL.length] } };
    g.border = thin();
    BLOCK.forEach((c, ci) => {
      const col = start + ci;
      const cell = ws.getCell(3, col);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF44546A" } };
      cell.border = thin();
      ws.getColumn(col).width = c.width;
    });
  });
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 42;

  // Total / Grand-Total row writer for this sheet (closes over FIXED/BLOCK/WINDOWS).
  //   sumRefFor(letter) -> SUM formula for a count column. Count cols SUM; % / Disconnected
  //   reuse their per-row formula (ratio-of-sums); meter cols blank when no CCMS in group.
  const writeTotal = (rowNo, fill, label1, label2, sumRefFor, hasCCMS) => {
    const row = ws.getRow(rowNo);
    FIXED.forEach((c, i) => {
      const colNo = i + 1;
      const cell = row.getCell(colNo);
      if (colNo === 1) cell.value = label1;
      else if (colNo === 2) cell.value = label2;
      else if (colNo === 4) cell.value = { formula: sumRefFor(colLetter(4)) };  // Total
      else cell.value = "";
      cell.font = { bold: true };
      styleCell(cell, fill, c.align, false);
    });
    WINDOWS.forEach((w, wi) => {
      const start = nFixed + wi * nBlock + 1;
      const connCol = colLetter(start);
      const meterCol = colLetter(start + 4);
      BLOCK.forEach((c, ci) => {
        const colNo = start + ci;
        const cell = row.getCell(colNo);
        const isMeter = c.meter || c.ccmsOnly;
        if (isMeter && !hasCCMS) cell.value = "";
        else if (c.sum) cell.value = { formula: sumRefFor(colLetter(colNo)) };
        else if (c.ref) cell.value = { formula: c.ref(connCol, meterCol, TOTAL_COL, rowNo) };
        else cell.value = "";
        cell.font = { bold: true };
        styleCell(cell, fill, "right", c.kind === "pct");
      });
    });
    return row;
  };

  // Data rows (start at 4): per project, then its subtotal, a gap, and a final grand total.
  let xl = 4;
  const groups = groupByProject(rows);
  const subtotalRows = [];
  let anyCCMS = false;
  groups.forEach((g) => {
    const fill = projectColours[g.project] || "FFFFFFFF";
    const firstRow = xl;
    let hasCCMS = false;
    for (const r of g.rows) {
      const isCCMS = r.type === "CCMS";
      if (isCCMS) { hasCCMS = true; anyCCMS = true; }
      const row = ws.getRow(xl);
      const w0 = r.windows[WINDOWS[0].key];

      // Fixed columns (Total is window-independent).
      const fixedVals = [r.project, r.site, r.type, w0 ? w0.total : ""];
      FIXED.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = fixedVals[i] ?? "";
        styleCell(cell, fill, c.align, false);
      });

      // Each window's block.
      WINDOWS.forEach((w, wi) => {
        const win = r.windows[w.key] || {};
        const start = nFixed + wi * nBlock + 1;
        const connCol = colLetter(start);        // Connected
        const meterCol = colLetter(start + 4);   // Meter QTY
        BLOCK.forEach((c, ci) => {
          const cell = row.getCell(start + ci);
          if (c.kind === "value") {
            if (c.header === "Connected") cell.value = win.connected ?? "";
            else cell.value = isCCMS ? (win.meterQty ?? "") : "";   // Meter QTY
            styleCell(cell, fill, "right", false);
          } else if (c.ccmsOnly && !isCCMS) {
            cell.value = "";
            styleCell(cell, fill, "right", false);
          } else {
            cell.value = { formula: c.ref(connCol, meterCol, TOTAL_COL, xl) };
            styleCell(cell, fill, "right", c.kind === "pct");
          }
        });
      });
      xl++;
    }
    // Per-project subtotal, then a gap row.
    const lastRow = xl - 1;
    writeTotal(xl, fill, g.project, "Total", (L) => sumRange(L, firstRow, lastRow), hasCCMS);
    subtotalRows.push(xl);
    xl += 2;
  });
  // Grand total across all projects (sum of the per-project subtotal rows).
  writeTotal(xl, GRAND_FILL, "GRAND TOTAL", "", (L) => sumCells(L, subtotalRows), anyCCMS);

  // Freeze the fixed columns + the 3 header rows.
  ws.views = [{ state: "frozen", xSplit: nFixed, ySplit: 3 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: nCols } };
}

async function main() {
  console.log("Reference time (now):", NOW.toLocaleString());
  const rows = await gatherData();

  const wb = new ExcelJS.Workbook();
  wb.creator = "ConnectivityReport";
  // Combined view first (24 & 48 Hrs on one sheet), then the per-window sheets.
  buildCombinedSheet(wb.addWorksheet("24 & 48 Hrs"), rows);
  for (const win of WINDOWS) buildSheet(wb.addWorksheet(win.label), rows, win);

  const pad = (x) => String(x).padStart(2, "0");
  const stamp = `${NOW.getFullYear()}-${pad(NOW.getMonth() + 1)}-${pad(NOW.getDate())}_${pad(NOW.getHours())}-${pad(NOW.getMinutes())}-${pad(NOW.getSeconds())}`;

  // Reports/<date_time>/  — a fresh folder for every run.
  const runDir = path.join(REPORTS_DIR, stamp);
  fs.mkdirSync(runDir, { recursive: true });

  const fname = `Connectivity_Report_${stamp}.xlsx`;
  const fpath = path.join(runDir, fname);
  try {
    await wb.xlsx.writeFile(fpath);
    console.log(`\nWritten: ${fpath}`);
  } catch {
    const alt = fpath.replace(".xlsx", "_NEW.xlsx");
    await wb.xlsx.writeFile(alt);
    console.log(`\nTarget busy; written: ${alt}`);
  }
}

// Run only when invoked directly (so the sheet builders can be required in tests
// without triggering a live login).
if (require.main === module) {
  main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
}

module.exports = { buildSheet, buildCombinedSheet, COLUMNS, FIXED, BLOCK };
