// ===========================================================================
//  show-recipients.js — print exactly who the next report will go to, and
//  where that list came from. Sends nothing.
//
//  Run:  node show-recipients.js
// ===========================================================================
const fs = require("fs");
const path = require("path");
const { EMAIL } = require("./cities.config");

const list = (v) => (Array.isArray(v) ? v : String(v || "").split(","))
  .map((s) => s.trim()).filter(Boolean);

const to = list(EMAIL.to);
const cc = list(EMAIL.cc);
const watch = list(EMAIL.watchTo);
const has = (f) => fs.existsSync(path.join(__dirname, f));

console.log(`from : ${EMAIL.from || EMAIL.user || "(not set)"}`);
console.log("");

console.log("DAILY CONNECTIVITY REPORT  (report + Excel attachment)");
console.log(`  source: ${has("recipients.txt") ? "recipients.txt" : "MAIL_TO env var (recipients.txt not found)"}`);
if (!to.length) console.log("  (nobody — the report will NOT be emailed)");
else to.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
if (cc.length) {
  console.log("  cc:");
  cc.forEach((a, i) => console.log(`    ${i + 1}. ${a}`));
}

console.log("");
console.log("HOURLY SERVER UP/DOWN MAIL  (reveals when this machine is awake)");
console.log(`  source: ${has("recipients-watch.txt") ? "recipients-watch.txt" : "falling back to the report list — everyone above gets these too"}`);
if (!watch.length) console.log("  (nobody — server alerts will NOT be emailed)");
else watch.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));

// Catch the usual typos before they silently swallow a run's mail.
const bad = [...to, ...cc, ...watch].filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
if (bad.length) {
  console.log(`\nWARNING: these do not look like valid addresses: ${bad.join(", ")}`);
  process.exitCode = 1;
}
