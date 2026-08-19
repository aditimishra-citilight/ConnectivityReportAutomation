// ===========================================================================
//  orbiwise.config.js — which projects belong to the Orbiwise report, and how
//  they split between SAAS and LNS.
//
//  Per the requirement ("Aditi Orbiwise Data automation"):
//     SAAS : KGBOT, GCBOT, Bhopal, JD, Nalanda
//     LNS  : KDMC
//
//  Only Connected (48 Hrs) figures for type "ILC" rows are used.
//
//  To add or remove a project, edit the lists below — nothing else needs to
//  change. `sites` are the site names as they appear in the daily connectivity
//  data; a project's figure is the SUM of its sites.
// ===========================================================================

module.exports = {
  // Which measurement window the report bills on. The requirement says 48 hours.
  WINDOW: "48hr",

  // Only rows of this type count as Orbiwise devices.
  DEVICE_TYPE: "ILC",

  // The reference table also carries Connected Gateways / Total Gateways columns,
  // so gateway rows are collected alongside the ILC ones. Gateways are reported
  // only — they are never part of the device cost.
  GATEWAY_TYPE: "Gateway",

  // Rate used for the cost columns. One place to change it.
  RATE_PER_DEVICE_PER_MONTH: 6,
  CURRENCY: "Rs",

  GROUPS: [
    {
      name: "SAAS",
      label: "Orbiwise SAAS",
      projects: [
        // `project` / `sites` match the daily connectivity data.
        // `label` is what appears in the report.
        { label: "KGBOT",   project: "KG BOT",  sites: ["KG BOT ILC"], gateways: ["KG BOT Gateway"] },
        // GCBOT bills as one project covering both its ILC sites — this matches
        // the historic Q2 sheet, where GCBOT's device total of 3,538 is
        // 2,410 (GC BOT ILC) + 1,128 (Bajaj Warehouse).
        { label: "GCBOT",   project: "GC BOT",  sites: ["GC BOT ILC", "Bajaj Warehouse"], gateways: ["GC BOT Gateway"] },
        { label: "Bhopal",  project: "Bhopal",  sites: ["Bhopal ILC"], gateways: ["Bhopal Gateway"] },
        { label: "JD",      project: "JD",      sites: ["JD ILC"], gateways: ["JD Gateway"] },
        { label: "Nalanda", project: "Nalanda", sites: ["Nalanda ILC"], gateways: ["Nalanda Gateway"] },
      ],
    },
    {
      name: "LNS",
      label: "Orbiwise LNS",
      projects: [
        { label: "KDMC", project: "KDMC", sites: ["KDMC ILC", "KDMC Warehouse"], gateways: ["KDMC Gateway"] },
      ],
    },
  ],
};
