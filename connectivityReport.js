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
const COLUMNS = [
  { header: "Project",                    width: 13, align: "left",  kind: "value" },
  { header: "Site / Group",               width: 20, align: "left",  kind: "value" },
  { header: "Type",                       width: 11, align: "center",kind: "value" },
  { header: "Total",                      width: 9,  align: "right", kind: "value" },
  { header: "Connected",                  width: 11, align: "right", kind: "value" },
  { header: "Connected %",                width: 12, align: "right", kind: "pct",     formula: (r) => `IFERROR(E${r}/D${r},0)` },
  { header: "Disconnected",               width: 12, align: "right", kind: "formula", formula: (r) => `D${r}-E${r}` },
  { header: "Disconnected %",             width: 13, align: "right", kind: "pct",     formula: (r) => `IFERROR((D${r}-E${r})/D${r},0)` },
  { header: "Meter QTY",                  width: 10, align: "right", kind: "value" },
  { header: "Meter % (Connected Panels)", width: 15, align: "right", kind: "pct",     formula: (r) => `IFERROR(I${r}/E${r},0)` },
  { header: "Meter % (Total Panels)",     width: 15, align: "right", kind: "pct",     formula: (r) => `IFERROR(I${r}/D${r},0)` },
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
  let lastProject = null;
  for (const r of rows) {
    // gap row between projects
    if (lastProject !== null && r.project !== lastProject) xl++;
    lastProject = r.project;

    const w = r.windows[win.key];
    const isCCMS = r.type === "CCMS";
    const fill = projectColours[r.project] || "FFFFFFFF";
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
      } else {
        // meter % (cols 10,11) only meaningful for CCMS
        if ((colNo === 10 || colNo === 11) && !isCCMS) cell.value = "";
        else cell.value = { formula: c.formula(xl) };
      }
      cell.alignment = { horizontal: c.align };
      if (c.kind === "pct") cell.numFmt = "0.0%";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = thin();
    });
    xl++;
  }

  ws.views = [{ state: "frozen", ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: n } };
}

(async () => {
  console.log("Reference time (now):", NOW.toLocaleString());
  const rows = await gatherData();

  const wb = new ExcelJS.Workbook();
  wb.creator = "ConnectivityReport";
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
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
