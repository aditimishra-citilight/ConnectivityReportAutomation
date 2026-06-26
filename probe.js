// ===========================================================================
//  probe.js — live login to every server, fetch each report row, and print
//  Connected / Disconnected for 30 min / 24 hr / 48 hr (dynamic "now").
//  Run:  node probe.js            (now = system time)
//        node probe.js "2026-06-25 12:00:00"   (override the reference time)
// ===========================================================================
const { CREDENTIALS, SERVERS, REPORTS, WINDOWS } = require("./cities.config");
const { login, fetchList, fetchGeography, countConnectivity, parseLastUpdate } = require("./lib");

const arg = process.argv[2];
const nowMs = arg ? new Date(arg.replace(" ", "T")).getTime() : Date.now();

const pct = (x) => (x * 100).toFixed(1) + "%";

(async () => {
  console.log("Reference time (now):", new Date(nowMs).toLocaleString());
  console.log("Windows:", WINDOWS.map((w) => w.label).join(" / "));
  console.log("=".repeat(78));

  // 1) login to each server once + grab geography (to resolve missing cityIds)
  const sessions = {};
  const geo = {};
  for (const [key, srv] of Object.entries(SERVERS)) {
    process.stdout.write(`Login ${key} (${srv.base}) ... `);
    try {
      sessions[key] = await login(srv, CREDENTIALS);
      console.log("OK");
      try { geo[key] = await fetchGeography(srv, sessions[key]); } catch { geo[key] = []; }
    } catch (e) {
      console.log("FAILED -", e.message);
    }
  }

  // resolve cityId by cityName where needed
  const resolveCityId = (r) => {
    if (r.cityId) return r.cityId;
    const list = geo[r.server] || [];
    const hit = list.find((c) => (c.cityName || "").trim().toUpperCase() === (r.cityName || "").toUpperCase());
    return hit ? String(hit.cityId) : null;
  };

  console.log("=".repeat(78));

  // 2) fetch + count each report row, grouped by project
  let lastProject = null;
  for (const r of REPORTS) {
    if (!sessions[r.server]) continue;
    if (r.project !== lastProject) { console.log(`\n### ${r.project}`); lastProject = r.project; }
    const cityId = resolveCityId(r);
    if (!cityId) { console.log(`  ${r.label}: cityId not resolved (cityName=${r.cityName})`); continue; }
    try {
      const devices = await fetchList(SERVERS[r.server], sessions[r.server], cityId, r.deviceType);
      const res = countConnectivity(devices, WINDOWS, nowMs);
      // freshest device timestamp, as a sanity check on "now"
      let newest = 0;
      for (const d of devices) { const t = parseLastUpdate(d); if (t && t > newest) newest = t; }
      const newestStr = newest ? new Date(newest).toLocaleString() : "n/a";
      console.log(`  ${r.label}  (cityId ${cityId}, dt ${r.deviceType})  Total=${res.total}  newest=${newestStr}`);
      for (const w of WINDOWS) {
        const x = res.windows[w.key];
        console.log(`      ${w.label.padEnd(7)} Connected ${String(x.connected).padStart(5)} (${pct(x.connectedPct).padStart(6)})   Disconnected ${String(x.disconnected).padStart(5)} (${pct(x.disconnectedPct).padStart(6)})   Meter ${String(x.meterQty).padStart(5)} (${pct(x.meterPctTotal)})`);
      }
    } catch (e) {
      console.log(`  ${r.label}: fetch error - ${e.message}`);
    }
  }
  console.log("\nDone.");
})();
