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
const hasFile = fs.existsSync(path.join(__dirname, "recipients.txt"));

console.log(`source : ${hasFile ? "recipients.txt" : "MAIL_TO env var (recipients.txt not found)"}`);
console.log(`from   : ${EMAIL.from || EMAIL.user || "(not set)"}`);
console.log("");

if (!to.length) {
  console.log("TO     : (nobody — the report will NOT be emailed)");
  console.log("\nAdd at least one address to recipients.txt.");
} else {
  console.log(`TO     : ${to.length} recipient${to.length > 1 ? "s" : ""}`);
  to.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
}
if (cc.length) {
  console.log(`\nCC     : ${cc.length}`);
  cc.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
}

// Catch the usual typos before they silently swallow a run's mail.
const bad = [...to, ...cc].filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
if (bad.length) {
  console.log(`\nWARNING: these do not look like valid addresses: ${bad.join(", ")}`);
  process.exitCode = 1;
}
