// ===========================================================================
//  Shared library: login, fetch device list, count connectivity by window.
// ===========================================================================
const axios = require("axios");
const https = require("https");
const qs = require("querystring");

// Accept the portals' self-signed / mismatched certs (same as the manual --insecure).
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/149.0.0.0 Mobile Safari/537.36";

function pullJsessionid(setCookie) {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = /JSESSIONID=([^;]+)/i.exec(c);
    if (m) return m[1];
  }
  return null;
}

// Log into a server; returns the JSESSIONID cookie value.
async function login(server, creds) {
  const loginUrl = server.base + server.loginPath;
  const common = { httpsAgent, timeout: 30000, maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400, headers: { "User-Agent": UA } };

  // 1) seed a session by GETting the login page
  let sid = null;
  try {
    const seed = await axios.get(loginUrl, common);
    sid = pullJsessionid(seed.headers["set-cookie"]);
  } catch (e) {
    sid = pullJsessionid(e.response && e.response.headers["set-cookie"]);
  }

  // 2) POST the credentials
  const body = qs.stringify({ username: creds.username, password: creds.password });
  const res = await axios.post(loginUrl, body, {
    ...common,
    headers: {
      ...common.headers,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: server.base,
      Referer: loginUrl,
      ...(sid ? { Cookie: `JSESSIONID=${sid}` } : {}),
    },
  }).catch((e) => e.response);

  sid = pullJsessionid(res && res.headers["set-cookie"]) || sid;
  if (!sid) throw new Error(`login failed for ${server.base} (no JSESSIONID)`);
  return sid;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POST with a few retries for transient network/server errors (DNS hiccup, reset, 502).
async function postWithRetry(url, body, headers, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await axios.post(url, body, { httpsAgent, timeout: 60000, headers });
      return Array.isArray(res.data) ? res.data : (res.data && res.data.data) || [];
    } catch (e) {
      lastErr = e;
      const transient = ["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN"]
        .includes(e.code) || (e.response && [502, 503, 504].includes(e.response.status));
      if (!transient || i === tries - 1) break;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

// POST getListViewData_v1 -> array of device records.
async function fetchList(server, sid, cityId, deviceType) {
  return postWithRetry(
    server.base + server.listPath,
    { cityId: String(cityId), deviceType: String(deviceType),
      zoneName: "0", wardName: "0", streetName: "0", userId: server.userId },
    { "Content-Type": "application/json", Cookie: `JSESSIONID=${sid}`,
      Origin: server.base, "X-Requested-With": "XMLHttpRequest", "User-Agent": UA }
  );
}

// Fetch a device group, choosing the right endpoint:
//   deviceType 10 (gateway) -> getDeviceList_V2 ; else -> getListViewData_v1.
async function fetchDevices(server, sid, cityId, deviceType) {
  if (String(deviceType) === "10") {
    const path = server.gatewayPath ||
      (server.listPath.includes("/smartlight/") ? "/smartlight/getDeviceList_V2" : "/getDeviceList_V2");
    return postWithRetry(
      server.base + path,
      { cityId: Number(cityId), deviceType: "10", zoneName: "0", wardName: "0", streetName: "0", userId: server.userId },
      { "Content-Type": "application/json", Cookie: `JSESSIONID=${sid}`,
        Origin: server.base, "X-Requested-With": "XMLHttpRequest", "User-Agent": UA });
  }
  return fetchList(server, sid, cityId, deviceType);
}

// GET geography -> [{cityId, cityName, ...}]
async function fetchGeography(server, sid) {
  const url = `${server.base}${server.geoPath}?userId=${server.userId}`;
  const res = await axios.get(url, {
    httpsAgent, timeout: 30000,
    headers: { Cookie: `JSESSIONID=${sid}`, "X-Requested-With": "XMLHttpRequest", "User-Agent": UA },
  });
  return Array.isArray(res.data) ? res.data : [];
}

// Convert a timestamp value to epoch ms. Handles BOTH formats seen in the portals:
//   - ILC  last_update : "2026-06-25 15:16:12" (string, server local time)
//   - CCMS last_update : 1782377129 (unix SECONDS, number or numeric string)
// Returns epoch ms, or null if unparseable.
function parseTimestamp(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || /^\d{9,13}$/.test(String(v).trim())) {
    let n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1e12) n *= 1000; // seconds -> ms
    return n;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(v).trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, se).getTime();
}

// Panel connectivity basis. Field name varies by device type:
//   CCMS/ILC = last_update (or lstUpdt) ; Gateway = lastUpdate (camelCase).
function parseLastUpdate(d) {
  if (!d) return null;
  for (const f of ["last_update", "lastUpdate", "lstUpdt"]) {
    if (d[f] !== undefined) {
      const t = parseTimestamp(d[f]);
      if (t !== null) return t;
    }
  }
  return null;
}

// Meter connectivity basis: ILC uses `meterTime`; CCMS has no meterTime — its meter
// data timestamp is `dateTime` (unix s), with `bill_data_time` as a fallback.
function parseMeterTime(d) {
  if (!d) return null;
  for (const f of ["meterTime", "dateTime", "bill_data_time"]) {
    if (d[f] !== undefined) {
      const t = parseTimestamp(d[f]);
      if (t !== null) return t;
    }
  }
  return null;
}

// Count connectivity for one device list across all windows, relative to `nowMs`.
// windows: [{key, minutes}]
function countConnectivity(devices, windows, nowMs) {
  const total = devices.length;
  const SKEW = 60 * 60 * 1000; // tolerate up to 1h clock skew into the "future"
  const out = { total, windows: {} };
  for (const w of windows) {
    const cutoff = nowMs - w.minutes * 60 * 1000;
    let connected = 0, meterConnected = 0;
    for (const dvc of devices) {
      const lu = parseLastUpdate(dvc);
      if (lu !== null && lu >= cutoff && lu <= nowMs + SKEW) connected++;
      const mt = parseMeterTime(dvc);
      if (mt !== null && mt >= cutoff && mt <= nowMs + SKEW) meterConnected++;
    }
    const disconnected = total - connected;
    out.windows[w.key] = {
      total,
      connected,
      connectedPct: total ? connected / total : 0,
      disconnected,
      disconnectedPct: total ? disconnected / total : 0,
      meterQty: meterConnected,
      meterPctConnected: connected ? meterConnected / connected : 0,
      meterPctTotal: total ? meterConnected / total : 0,
    };
  }
  return out;
}

module.exports = {
  login, fetchList, fetchDevices, fetchGeography, countConnectivity,
  parseLastUpdate, parseMeterTime,
};
