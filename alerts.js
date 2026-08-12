// ===========================================================================
//  alerts.js — decide what deserves an alert in the email.
//
//  Three independent rules (a row can trip more than one):
//    LOW    — Connected % is below ALERTS.lowPct (an absolute floor).
//    DROP   — Connected % fell by >= ALERTS.dropPoints percentage points versus
//             the previous run's snapshot ("achanak down"). Needs history.
//    NODATA — the device list came back EMPTY. Percentages are meaningless here
//             (0/0), so LOW/DROP skip these rows — without this rule a server
//             that stopped answering would look silently fine.
//
//  Also computes the averages the email reports: overall and per project,
//  always as ratio-of-sums (ΣConnected / ΣTotal), matching the sheet footer.
// ===========================================================================

// Rows are matched across runs by project + site + type.
const rowKey = (r) => `${r.project}||${r.site}||${r.type}`;

function computeAlerts(rows, prevSnapshot, cfg, windows) {
  const winKey = cfg.window;
  const win = windows.find((w) => w.key === winKey) || windows[0];

  const prevByKey = {};
  if (prevSnapshot) for (const r of prevSnapshot.rows || []) prevByKey[rowKey(r)] = r;

  const low = [], drops = [], noData = [];
  const projectOrder = [], byProject = {};
  let total = 0, connected = 0;

  for (const r of rows) {
    const w = r.windows[winKey];
    if (!w) continue;
    // A row that could not be fetched carries zeros only as placeholders. It is
    // already reported as a fetch error, so it must not also count as an average,
    // a NODATA finding, or a drop.
    if (r.failed) continue;
    const pw = (prevByKey[rowKey(r)] || {}).windows?.[winKey];

    total += w.total;
    connected += w.connected;

    if (!(r.project in byProject)) {
      byProject[r.project] = { project: r.project, total: 0, connected: 0 };
      projectOrder.push(byProject[r.project]);
    }
    byProject[r.project].total += w.total;
    byProject[r.project].connected += w.connected;

    // Empty list: 0/0 has no meaningful percentage, so LOW/DROP would read it as
    // "0% connected" or as no change at all. Report it as its own problem instead —
    // a configured row is expected to return devices.
    if (w.total < cfg.minDevices) {
      noData.push({ project: r.project, site: r.site, type: r.type,
        total: w.total, prevTotal: pw ? pw.total : null });
      continue;
    }

    // lowPct = 0 switches the absolute floor OFF entirely: the current level is
    // accepted as normal and only a fall from it is worth an alert.
    if (cfg.lowPct > 0 && w.connectedPct < cfg.lowPct) {
      low.push({ project: r.project, site: r.site, type: r.type,
        total: w.total, connected: w.connected, pct: w.connectedPct });
    }

    // A previous reading that failed carries placeholder zeros, not a real
    // baseline — comparing against it would invent a drop or hide one.
    if (pw && !(prevByKey[rowKey(r)] || {}).failed && pw.total >= cfg.minDevices) {
      const deltaPts = (pw.connectedPct - w.connectedPct) * 100;
      if (deltaPts >= cfg.dropPoints) {
        drops.push({ project: r.project, site: r.site, type: r.type,
          total: w.total, connected: w.connected, pct: w.connectedPct,
          prevPct: pw.connectedPct, prevConnected: pw.connected, deltaPts });
      }
    }
  }

  low.sort((a, b) => a.pct - b.pct);              // worst first
  drops.sort((a, b) => b.deltaPts - a.deltaPts);  // biggest fall first

  for (const p of projectOrder) p.pct = p.total ? p.connected / p.total : 0;

  return {
    windowKey: winKey,
    windowLabel: win ? win.label : winKey,
    lowPct: cfg.lowPct,
    dropPoints: cfg.dropPoints,
    minDevices: cfg.minDevices,
    total, connected,
    avgPct: total ? connected / total : 0,
    projects: projectOrder,
    low, drops, noData,
    prevStamp: prevSnapshot ? prevSnapshot.stamp : null,
    prevAt: prevSnapshot ? prevSnapshot.generatedAt : null,
    // Keys that tripped a rule — the email table highlights these rows.
    lowKeys: new Set(low.map(rowKey)),
    dropKeys: new Set(drops.map(rowKey)),
    noDataKeys: new Set(noData.map(rowKey)),
  };
}

module.exports = { computeAlerts, rowKey };
