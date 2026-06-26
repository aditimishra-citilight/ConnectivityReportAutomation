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

module.exports = { CREDENTIALS, SERVERS, REPORTS, WINDOWS };
