// ===========================================================================
//  history.js — persist one small JSON snapshot per run so the next run can
//  detect a SUDDEN drop (today vs the previous run), not just a low absolute
//  number. The snapshot lives next to that run's Excel in Reports/<stamp>/.
// ===========================================================================
const fs = require("fs");
const path = require("path");

const SNAPSHOT_FILE = "snapshot.json";

// Write this run's counts. Kept deliberately small — only what alerts need.
function writeSnapshot(runDir, rows, nowMs) {
  const snap = {
    generatedAt: new Date(nowMs).toISOString(),
    nowMs,
    rows: rows.map((r) => ({
      project: r.project,
      site: r.site,
      type: r.type,
      // Kept so a later run can tell "the server was unreadable" apart from
      // "the server genuinely reported zero devices" — they look identical
      // otherwise, and only the second one deserves an alert.
      ...(r.failed ? { failed: true } : {}),
      windows: r.windows,
    })),
  };
  fs.writeFileSync(path.join(runDir, SNAPSHOT_FILE), JSON.stringify(snap, null, 2));
  return snap;
}

// Newest snapshot from an EARLIER run. Run folders are named "YYYY-MM-DD_HH-MM-SS",
// so a plain string sort is already chronological.
function readPreviousSnapshot(reportsDir, currentStamp) {
  let names;
  try {
    names = fs.readdirSync(reportsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return null;
  }
  names = names.filter((n) => n < currentStamp).sort().reverse();
  for (const n of names) {
    const p = path.join(reportsDir, n, SNAPSHOT_FILE);
    if (!fs.existsSync(p)) continue;              // older runs predate snapshots
    try {
      const snap = JSON.parse(fs.readFileSync(p, "utf8"));
      snap.stamp = n;
      return snap;
    } catch { /* corrupt file — fall through to the run before it */ }
  }
  return null;
}

module.exports = { writeSnapshot, readPreviousSnapshot, SNAPSHOT_FILE };
