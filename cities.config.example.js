// ===========================================================================
//  Connectivity Report — city / server configuration (EXAMPLE / TEMPLATE)
//
//  Copy this file to `cities.config.js` and fill in real credentials, OR set
//  the env vars CITILIGHT_USER / CITILIGHT_PASS before running. The real
//  cities.config.js is gitignored so secrets never reach the repo.
//
//  Adding a new city later = add one row to REPORTS (and SERVERS if it's a new
//  server). No code changes needed anywhere else.
// ===========================================================================

// Credentials. NEVER hardcode the real password here in the committed file —
// set env vars CITILIGHT_USER / CITILIGHT_PASS, or put them in your local
// (gitignored) cities.config.js copy.
const CREDENTIALS = {
  username: process.env.CITILIGHT_USER || "admin",
  password: process.env.CITILIGHT_PASS || "",
};

// One entry per distinct server (base URL + API paths + userId).
const SERVERS = {
  ndmc: {
    base: "https://smartlight.citilight.co:446",
    loginPath: "/smartlight/login",
    listPath: "/smartlight/getListViewData_v1",
    gatewayPath: "/smartlight/getDeviceList_V2",
    geoPath: "/smartlight/getCityGeography",
    userId: "10",
  },
  velociti: {
    base: "https://velociti.citilight.co:444",
    loginPath: "/login",
    listPath: "/getListViewData_v1",
    gatewayPath: "/getDeviceList_V2",
    geoPath: "/getCityGeography",
    userId: "101",
  },
  kdmc: {
    base: "http://103.248.31.109:8080",
    loginPath: "/login",
    listPath: "/getListViewData_v1",
    gatewayPath: "/getDeviceList_V2",
    geoPath: "/getCityGeography",
    userId: "10",
  },
  bhatinda: {
    base: "https://dc.citilight.co",
    loginPath: "/login",
    listPath: "/getListViewData_v1",
    gatewayPath: "/getDeviceList_V2",
    geoPath: "/getCityGeography",
    userId: "1",
  },
};

// deviceType codes: 1 = CCMS, 2 = ILC, 10 = Gateway
// One entry per report ROW. `project` groups rows together (same colour + a gap after).
// `type` is the device-group label shown in the row. Meter columns are only filled for
// CCMS (the sheet leaves meter blank for ILC / Gateway / Warehouse).
const REPORTS = [
  // ---- NDMC (smartlight) — 6 zones, CCMS only (no gateways at zone level) ----
  { project: "NDMC", label: "NDMC - City",        type: "CCMS", server: "ndmc", cityId: "3", deviceType: "1" },
  { project: "NDMC", label: "NDMC - SP",          type: "CCMS", server: "ndmc", cityId: "2", deviceType: "1" },
  { project: "NDMC", label: "NDMC - Rohini",      type: "CCMS", server: "ndmc", cityId: "7", deviceType: "1" },
  { project: "NDMC", label: "NDMC - Narela",      type: "CCMS", server: "ndmc", cityId: "6", deviceType: "1" },
  { project: "NDMC", label: "NDMC - Civil Lines", type: "CCMS", server: "ndmc", cityId: "4", deviceType: "1" },
  { project: "NDMC", label: "NDMC - Karol Bagh",  type: "CCMS", server: "ndmc", cityId: "5", deviceType: "1" },

  // ---- GC BOT  (CCMS + ILC + Bajaj Warehouse + Gateway) ----
  { project: "GC BOT", label: "GC BOT CCMS",        type: "CCMS",      server: "velociti", cityId: "11", deviceType: "1" },
  { project: "GC BOT", label: "GC BOT ILC",         type: "ILC",       server: "velociti", cityId: "11", deviceType: "2" },
  { project: "GC BOT", label: "Bajaj Warehouse",    type: "ILC", server: "velociti", cityId: "30", deviceType: "2" },
  { project: "GC BOT", label: "GC BOT Gateway",     type: "Gateway",   server: "velociti", cityId: "11", deviceType: "10" },

  // ---- KG BOT ----
  { project: "KG BOT", label: "KG BOT CCMS",    type: "CCMS",    server: "velociti", cityId: "21", deviceType: "1" },
  { project: "KG BOT", label: "KG BOT ILC",     type: "ILC",     server: "velociti", cityId: "21", deviceType: "2" },
  { project: "KG BOT", label: "KG BOT Gateway", type: "Gateway", server: "velociti", cityId: "21", deviceType: "10" },

  // ---- Nalanda (no CCMS) ----
  { project: "Nalanda", label: "Nalanda ILC",     type: "ILC",     server: "velociti", cityId: "31", deviceType: "2" },
  { project: "Nalanda", label: "Nalanda Gateway", type: "Gateway", server: "velociti", cityId: "31", deviceType: "10" },

  // ---- Bhopal ----
  { project: "Bhopal", label: "Bhopal CCMS",    type: "CCMS",    server: "velociti", cityId: "48", deviceType: "1" },
  { project: "Bhopal", label: "Bhopal ILC",     type: "ILC",     server: "velociti", cityId: "48", deviceType: "2" },
  { project: "Bhopal", label: "Bhopal Gateway", type: "Gateway", server: "velociti", cityId: "48", deviceType: "10" },

  // ---- JD ----
  { project: "JD", label: "JD CCMS",    type: "CCMS",    server: "velociti", cityId: "57", deviceType: "1" },
  { project: "JD", label: "JD ILC",     type: "ILC",     server: "velociti", cityId: "57", deviceType: "2" },
  { project: "JD", label: "JD Gateway", type: "Gateway", server: "velociti", cityId: "57", deviceType: "10" },

  // ---- Puri ----
  { project: "Puri", label: "Puri CCMS",    type: "CCMS",    server: "velociti", cityId: "64", deviceType: "1" },
  { project: "Puri", label: "Puri ILC",     type: "ILC",     server: "velociti", cityId: "64", deviceType: "2" },
  { project: "Puri", label: "Puri Gateway", type: "Gateway", server: "velociti", cityId: "64", deviceType: "10" },

  // ---- Jaipur  (CCMS only — live check shows 0 ILC and 0 gateways) ----
  { project: "Jaipur", label: "Jaipur CCMS",      type: "CCMS", server: "velociti", cityId: "79", deviceType: "1" },
  { project: "Jaipur", label: "Jaipur Warehouse", type: "CCMS", server: "velociti", cityId: "86", deviceType: "1" },

  // ---- Dehradun ----
  { project: "Dehradun", label: "Dehradun CCMS",    type: "CCMS",    server: "velociti", cityId: "65", deviceType: "1" },
  { project: "Dehradun", label: "Dehradun ILC",     type: "ILC",     server: "velociti", cityId: "65", deviceType: "2" },
  { project: "Dehradun", label: "Dehradun Gateway", type: "Gateway", server: "velociti", cityId: "65", deviceType: "10" },

  // ---- KDMC  (CCMS + ILC + KDMC Warehouse + Gateway) ----
  { project: "KDMC", label: "KDMC CCMS",      type: "CCMS",      server: "kdmc", cityId: "2", deviceType: "1" },
  { project: "KDMC", label: "KDMC ILC",       type: "ILC",       server: "kdmc", cityId: "2", deviceType: "2" },
  { project: "KDMC", label: "KDMC Warehouse", type: "ILC", server: "kdmc", cityId: "5", deviceType: "2" },
  { project: "KDMC", label: "KDMC Gateway",   type: "Gateway",   server: "kdmc", cityId: "2", deviceType: "10" },

  // ---- Bhatinda ----
  { project: "Bhatinda", label: "Bhatinda CCMS",    type: "CCMS",    server: "bhatinda", cityId: "52", deviceType: "1" },
  { project: "Bhatinda", label: "Bhatinda ILC",     type: "ILC",     server: "bhatinda", cityId: "52", deviceType: "2" },
  { project: "Bhatinda", label: "Bhatinda Gateway", type: "Gateway", server: "bhatinda", cityId: "52", deviceType: "10" },
];

// Time windows for connectivity (label -> minutes back from "now").
const WINDOWS = [
  { key: "24hr",  label: "24 Hrs", minutes: 24 * 60 },
  { key: "48hr",  label: "48 Hrs", minutes: 48 * 60 },
];

// ---------------------------------------------------------------------------
//  Email delivery. NEVER hardcode the mail password here — use env vars.
//  Gmail / Google Workspace needs an APP PASSWORD (a normal account password is
//  rejected when 2-Step Verification is on):
//    myaccount.google.com -> Security -> 2-Step Verification -> App passwords
// ---------------------------------------------------------------------------
const EMAIL = {
  enabled: process.env.MAIL_ENABLED !== "0",
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.MAIL_PORT || 465),      // 465 = SSL, 587 = STARTTLS
  user: process.env.MAIL_USER || "",               // e.g. reports@yourdomain.com
  pass: process.env.MAIL_PASS || "",               // Gmail App Password (16 chars)
  from: process.env.MAIL_FROM || "",               // blank -> use `user`
  // Recipients live in recipients.txt (one per line) so the list can be edited
  // without touching the app password. MAIL_TO is the fallback. The real
  // cities.config.js reads that file — see recipients.example.txt.
  to:   process.env.MAIL_TO   || "",
  cc:   process.env.MAIL_CC   || "",
  attachExcel: true,
};

// When to shout. `window` picks which time window the rules judge.
// The current level is treated as NORMAL — alert only on a fall from it.
//   lowPct: 0     -> no absolute floor; only drops are reported  (current)
//   lowPct: 0.60  -> also flag anything under 60%, on top of drops
const ALERTS = {
  window: "24hr",      // must match a WINDOWS key
  lowPct: 0,           // absolute floor OFF
  dropPoints: 10,      // fell 10+ percentage points vs the last run = ALERT
  minDevices: 1,       // ignore groups smaller than this (no meaningful %)
};

module.exports = { CREDENTIALS, SERVERS, REPORTS, WINDOWS, EMAIL, ALERTS };
