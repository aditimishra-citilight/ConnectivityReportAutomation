// ===========================================================================
//  orbiwiseHistory.js — the daily log the Orbiwise report is built from.
//
//  WHY THIS EXISTS: the connectivity tool already measures Connected (48 Hrs)
//  for every ILC site on every run, but until now that number was only kept
//  inside each run's own folder. Nothing accumulated it, so the quarterly
//  Orbiwise sheet had to be filled by hand from whichever days someone happened
//  to have a reading for — roughly 30 days out of 91, with the monthly averages
//  swinging wildly as a result.
//
//  This appends one row per (date, project) to a single file, so the report can
//  be generated from a real daily series instead.
//
//  Storage: orbiwise-history.json, keyed "YYYY-MM-DD|Project" so re-importing
//  the same run is harmless and re-running a day overwrites rather than
//  duplicates.
//
//  A site whose fetch FAILED is never recorded as zero. "The server was
//  unreadable" and "the server said zero devices" look identical in a bare
//  count, and only the second is real data — recording the first would drag
//  every average down with fake zeros.
// ===========================================================================

const fs = require("fs");
const path = require("path");
const CFG = require("./orbiwise.config");

const HISTORY_FILE = path.join(__dirname, "orbiwise-history.json");

// Flatten the config into a site -> {group, label} lookup.
function siteIndex() {
  const idx = new Map();
  for (const g of CFG.GROUPS) {
    for (const p of g.projects) {
      for (const s of p.sites) {
        idx.set(`${p.project}|${s}`, { group: g.name, label: p.label });
      }
    }
  }
  return idx;
}

function loadHistory() {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    return raw && typeof raw === "object" && raw.entries ? raw : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

function saveHistory(h) {
  const tmp = HISTORY_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(h, null, 2), "utf8");
  fs.renameSync(tmp, HISTORY_FILE);       // atomic: never leave a half-written log
}

// Reduce one run's rows to per-project Orbiwise totals.
// `rows` is the same shape the connectivity report and snapshot.json use.
function summariseRun(rows, whenMs) {
  const idx = siteIndex();
  const date = new Date(whenMs).toISOString().slice(0, 10);
  const byProject = new Map();

  for (const r of rows || []) {
    if (r.type !== CFG.DEVICE_TYPE) continue;
    const hit = idx.get(`${r.project}|${r.site}`);
    if (!hit) continue;                                  // not an Orbiwise project

    const w = (r.windows || {})[CFG.WINDOW];
    if (!w) continue;

    const cur = byProject.get(hit.label) || {
      group: hit.group, connected: 0, total: 0, sites: 0, failedSites: 0,
    };
    // A failed fetch contributes nothing and is counted, so the report can say
    // "this project was only partly readable that day" instead of silently
    // publishing a smaller number.
    if (r.failed) cur.failedSites++;
    else {
      cur.connected += Number(w.connected) || 0;
      cur.total     += Number(w.total) || 0;
      cur.sites++;
    }
    byProject.set(hit.label, cur);
  }

  const out = [];
  for (const [label, v] of byProject) {
    // Every site failed -> we learned nothing about this project today. Skip it
    // rather than log a zero.
    if (v.sites === 0) continue;
    out.push({ date, project: label, group: v.group,
               connected: v.connected, total: v.total,
               partial: v.failedSites > 0 ? v.failedSites : undefined });
  }
  return out;
}

// Record one run. Safe to call repeatedly for the same run.
function recordRun(rows, whenMs) {
  const h = loadHistory();
  const added = summariseRun(rows, whenMs);
  for (const e of added) h.entries[`${e.date}|${e.project}`] = e;
  h.updatedAt = new Date(whenMs).toISOString();
  saveHistory(h);
  return added;
}

// Rebuild the log from every snapshot.json already on disk. Lets the report
// start with real history instead of waiting months to accumulate it.
function backfillFromReports(reportsDir) {
  const h = loadHistory();
  let runs = 0, entries = 0, skipped = 0;

  const dirs = fs.existsSync(reportsDir)
    ? fs.readdirSync(reportsDir).filter(d => fs.statSync(path.join(reportsDir, d)).isDirectory()).sort()
    : [];

  for (const d of dirs) {
    const snap = path.join(reportsDir, d, "snapshot.json");
    if (!fs.existsSync(snap)) { skipped++; continue; }
    let s;
    try { s = JSON.parse(fs.readFileSync(snap, "utf8")); } catch { skipped++; continue; }
    const when = s.nowMs || Date.parse(s.generatedAt) || null;
    if (!when) { skipped++; continue; }
    const rec = summariseRun(s.rows, when);
    for (const e of rec) { h.entries[`${e.date}|${e.project}`] = e; entries++; }
    runs++;
  }

  h.updatedAt = new Date().toISOString();
  saveHistory(h);
  return { runs, entries, skipped, totalEntries: Object.keys(h.entries).length };
}

// All entries as a sorted array.
function allEntries() {
  const h = loadHistory();
  return Object.values(h.entries).sort((a, b) =>
    a.date.localeCompare(b.date) || a.project.localeCompare(b.project));
}

module.exports = { HISTORY_FILE, loadHistory, recordRun, backfillFromReports, allEntries, summariseRun };
