// ===========================================================================
//  orbiwiseMonthly.js — generate and email the Orbiwise report for a month.
//
//  This is the unattended monthly entry point. It reports on the month that
//  just ended, so nothing needs editing each month.
//
//    node orbiwiseMonthly.js                 # previous month, generate + email
//    node orbiwiseMonthly.js 2026-06         # a specific month
//    node orbiwiseMonthly.js --no-mail       # generate only
//    node orbiwiseMonthly.js --test          # subject prefixed [TEST]
//    node orbiwiseMonthly.js --dry-run       # show what would be sent
//
//  Mail settings come from mail.env.bat (the same Gmail account the
//  connectivity report already uses). Recipients come from
//  orbiwise-recipients.txt — one address per line, "#" comments a line out.
// ===========================================================================

const { execFileSync } = require("child_process");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const CFG = require("./orbiwise.config");
const HIST = require("./orbiwiseHistory");

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const MON_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const args = process.argv.slice(2);
const NO_MAIL = args.includes("--no-mail");
const TEST_MODE = args.includes("--test");
const DRY_RUN = args.includes("--dry-run");
const monthArg = args.find(a => /^\d{4}-\d{2}$/.test(a));

// The month that just ended — run on the 2nd of August and you get July.
function previousMonth() {
    const n = new Date();
    const m = n.getMonth();                       // 0-11 → already the previous month
    return m === 0 ? `${n.getFullYear() - 1}-12` : `${n.getFullYear()}-${String(m).padStart(2, "0")}`;
}

const mKey = monthArg || previousMonth();
const label = `${MONTH_NAMES[Number(mKey.slice(5, 7)) - 1]} ${mKey.slice(0, 4)}`;
const folder = path.join(__dirname, "Reports", "Orbiwise",
                         MON_SHORT[Number(mKey.slice(5, 7)) - 1] + mKey.slice(0, 4));
const file = path.join(folder, `Orbiwise_Connected_Devices_${label.replace(" ", "_")}.xlsx`);

// ---- mail settings out of mail.env.bat (`set "KEY=value"` lines) ------------
function loadMailEnv() {
    const f = path.join(__dirname, "mail.env.bat");
    if (!fs.existsSync(f)) return false;
    for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*set\s+"?([A-Z_]+)=([^"]*)"?\s*$/i);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
    return true;
}

function readRecipients() {
    const f = path.join(__dirname, "orbiwise-recipients.txt");
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, "utf8").split(/\r?\n/)
        .map(s => s.trim()).filter(s => s && !s.startsWith("#"));
}

// Figures for the mail body, straight from the history.
function summarise() {
    const entries = HIST.allEntries().filter(e => e.date.slice(0, 7) === mKey);
    const out = [];
    for (const g of CFG.GROUPS) {
        const rows = [];
        for (const p of g.projects) {
            const vals = entries.filter(e => e.project === p.label).map(e => e.connected);
            const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
            rows.push({ project: p.label, readings: vals.length, avg,
                        cost: avg === null ? 0 : avg * CFG.RATE_PER_DEVICE_PER_MONTH });
        }
        out.push({ group: g.label, rows, total: rows.reduce((s, r) => s + r.cost, 0) });
    }
    const days = new Set(entries.map(e => e.date)).size;
    return { groups: out, days };
}

function buildHtml(s) {
    const money = (v) => `${CFG.CURRENCY} ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const block = (g) => `
      <p style="margin:18px 0 6px;font-weight:600;font-size:14px;">${g.group}</p>
      <table style="border-collapse:collapse;font-size:13px;min-width:460px;">
        <thead><tr style="background:#f9fafb;">
          <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Project</th>
          <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Readings</th>
          <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Avg connected</th>
          <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Cost</th>
        </tr></thead>
        <tbody>${g.rows.map(r => `
          <tr>
            <td style="padding:5px 12px;border-bottom:1px solid #eee;">${r.project}</td>
            <td style="padding:5px 12px;border-bottom:1px solid #eee;text-align:right;color:#6b7280;">${r.readings}</td>
            <td style="padding:5px 12px;border-bottom:1px solid #eee;text-align:right;">${r.avg === null ? "—" : r.avg.toFixed(1)}</td>
            <td style="padding:5px 12px;border-bottom:1px solid #eee;text-align:right;">${money(r.cost)}</td>
          </tr>`).join("")}
          <tr style="background:#f3f4f6;font-weight:600;">
            <td style="padding:6px 12px;" colspan="3">${g.group} total</td>
            <td style="padding:6px 12px;text-align:right;">${money(g.total)}</td>
          </tr>
        </tbody>
      </table>`;

    return `${TEST_MODE ? `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin:0 0 20px;font-size:13px;color:#78350f;">
        <strong>This is a TEST email.</strong> Sent by hand to check the monthly Orbiwise delivery. No action needed.</div>` : ""}
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827;line-height:1.55;">
  <h2 style="margin:0 0 4px;font-size:19px;">Orbiwise Connected Devices — ${label}</h2>
  <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">
    Connected (48 Hrs) ${CFG.DEVICE_TYPE} devices, at ${CFG.CURRENCY} ${CFG.RATE_PER_DEVICE_PER_MONTH} per device per month.
  </p>
  <p style="margin:0 0 16px;color:#6b7280;font-size:12px;">
    Based on ${s.days} day(s) with a reading in ${label}. The attached workbook has the full day-by-day table,
    with SAAS and LNS on separate sheets.
  </p>
  ${s.groups.map(block).join("")}
  <p style="margin:22px 0 0;font-size:12px;color:#9ca3af;">
    Generated automatically from the daily connectivity data. Reply if anything looks wrong.
  </p>
</div>`;
}

(async () => {
    console.log(`Orbiwise monthly — ${label}${TEST_MODE ? "  (TEST)" : ""}${DRY_RUN ? "  (DRY RUN)" : ""}`);

    // 1. Generate. Delegated to orbiwiseReport.js so there is one implementation.
    console.log("\n--- generating ---");
    execFileSync(process.execPath, [path.join(__dirname, "orbiwiseReport.js"), mKey], { stdio: "inherit" });

    if (!fs.existsSync(file)) {
        console.error(`\nExpected output not found: ${file}`);
        process.exit(1);
    }
    const sizeKb = (fs.statSync(file).size / 1024).toFixed(0);
    console.log(`\nReport ready: ${file}  (${sizeKb} KB)`);

    if (NO_MAIL) { console.log("--no-mail — not sending."); return; }

    // 2. Email.
    loadMailEnv();
    const to = readRecipients();
    if (!to.length) {
        console.error("orbiwise-recipients.txt is empty or missing — nobody to send to.");
        process.exit(1);
    }
    const s = summarise();
    const subject = (TEST_MODE ? "[TEST] " : "") + `Orbiwise Connected Devices — ${label}`;
    console.log(`\n--- email ---`);
    console.log(`  subject: ${subject}`);
    console.log(`  to     : ${to.join(", ")}`);
    for (const g of s.groups) console.log(`  ${g.group}: ${CFG.CURRENCY} ${Math.round(g.total).toLocaleString("en-IN")}`);

    if (DRY_RUN) { console.log("\nDRY RUN — nothing sent."); return; }
    if (process.env.MAIL_ENABLED === "0") { console.log("\nMAIL_ENABLED=0 — skipping send."); return; }

    const user = process.env.MAIL_USER, pass = String(process.env.MAIL_PASS || "").replace(/\s/g, "");
    if (!user || !pass) throw new Error("MAIL_USER / MAIL_PASS not set (see mail.env.bat)");
    const port = Number(process.env.MAIL_PORT) || 587;
    const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST || "smtp.gmail.com",
        port, secure: port === 465, auth: { user, pass },
    });
    const info = await transporter.sendMail({
        from: process.env.MAIL_FROM || user,
        to, subject, html: buildHtml(s),
        attachments: [{ filename: path.basename(file), path: file }],
    });
    console.log(`\nSent. messageId=${info.messageId}`);
})().catch(e => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
