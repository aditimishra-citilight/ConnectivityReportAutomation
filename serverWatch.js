// ===========================================================================
//  serverWatch.js — cheap hourly health check of every portal.
//
//  It only logs in (no device pull), remembers each server's last known state,
//  and mails ONLY when a server CHANGES state:
//      down -> up    "BACK UP"     (the one you are waiting for)
//      up   -> down  "WENT DOWN"   (so you hear about it in an hour, not tomorrow)
//  A server that is simply still down sends nothing — no hourly spam.
//
//  Run:  node serverWatch.js            (normal, mails only on a change)
//        node serverWatch.js --status   (print current state, never mails)
// ===========================================================================
const fs = require("fs");
const path = require("path");
const net = require("net");
const nodemailer = require("nodemailer");
const { CREDENTIALS, SERVERS, EMAIL } = require("./cities.config");
const { login } = require("./lib");

const STATE_FILE = path.join(__dirname, "Reports", "server-status.json");
const STATUS_ONLY = process.argv.includes("--status");

// A TCP probe separates "the machine is gone" from "the app on that port died" —
// the single most useful thing to hand to whoever has to fix it.
function tcpProbe(host, port, ms = 8000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(ms);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
    s.connect(port, host);
  });
}

function hostPort(base) {
  const u = new URL(base);
  return { host: u.hostname, port: Number(u.port) || (u.protocol === "https:" ? 443 : 80) };
}

async function checkServer(key, srv) {
  const { host, port } = hostPort(srv.base);
  const portOpen = await tcpProbe(host, port);
  if (!portOpen) return { key, up: false, portOpen: false, reason: `TCP ${host}:${port} refused` };
  try {
    await login(srv, CREDENTIALS);
    return { key, up: true, portOpen: true, reason: "login OK" };
  } catch (e) {
    return { key, up: false, portOpen: true, reason: `port open but login failed — ${e.message}` };
  }
}

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
};
const writeState = (s) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function buildMail(changes, all, now) {
  const back = changes.filter((c) => c.up);
  const gone = changes.filter((c) => !c.up);
  const head = back.length && !gone.length ? "SERVER BACK UP"
    : gone.length && !back.length ? "SERVER WENT DOWN" : "SERVER STATUS CHANGED";
  const colour = back.length && !gone.length ? "#0ca30c" : "#c00000";

  const line = (c) => {
    const since = c.sinceLabel ? ` <span style="color:#52514e">(${esc(c.sinceLabel)})</span>` : "";
    return `<div style="font-size:14px;padding:3px 0">` +
      `<b style="color:${c.up ? "#0ca30c" : "#c00000"}">${c.up ? "&#9650; BACK UP" : "&#9660; WENT DOWN"}</b>` +
      ` &nbsp;<b>${esc(c.key.toUpperCase())}</b> <span style="color:#52514e">${esc(c.base)}</span>${since}</div>` +
      `<div style="font-size:12px;color:#52514e;padding:0 0 6px 14px">${esc(c.reason)}</div>`;
  };

  const rows = all.map((c) =>
    `<tr><td bgcolor="${c.up ? "#e6f4e6" : "#ffd6d6"}" style="padding:5px 9px;font-size:12px"><b>${esc(c.key.toUpperCase())}</b></td>` +
    `<td bgcolor="${c.up ? "#e6f4e6" : "#ffd6d6"}" style="padding:5px 9px;font-size:12px">${esc(c.base)}</td>` +
    `<td bgcolor="${c.up ? "#e6f4e6" : "#ffd6d6"}" style="padding:5px 9px;font-size:12px;font-weight:bold;` +
    `color:${c.up ? "#0a7d0a" : "#c00000"}">${c.up ? "UP" : "DOWN"}</td>` +
    `<td bgcolor="${c.up ? "#e6f4e6" : "#ffd6d6"}" style="padding:5px 9px;font-size:12px">${esc(c.reason)}</td></tr>`).join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0b0b0b;padding:18px">` +
    `<div style="font-size:17px;font-weight:bold;color:${colour}">${head}</div>` +
    `<div style="font-size:12px;color:#52514e;padding:3px 0 14px">${esc(now.toLocaleString())}</div>` +
    changes.map(line).join("") +
    `<div style="font-size:12px;font-weight:bold;padding:16px 0 6px">All servers right now</div>` +
    `<table border="1" bordercolor="#9a9a9a" cellspacing="0" cellpadding="0" style="border-collapse:collapse">` +
    `<tr><th bgcolor="#44546a" style="color:#fff;padding:5px 9px;font-size:11px">Server</th>` +
    `<th bgcolor="#44546a" style="color:#fff;padding:5px 9px;font-size:11px">Base URL</th>` +
    `<th bgcolor="#44546a" style="color:#fff;padding:5px 9px;font-size:11px">State</th>` +
    `<th bgcolor="#44546a" style="color:#fff;padding:5px 9px;font-size:11px">Detail</th></tr>${rows}</table>` +
    `<div style="font-size:11px;color:#52514e;margin-top:14px;line-height:1.6">` +
    `Hourly check. This mail is sent only when a server changes state &mdash; ` +
    `a server that stays down does not mail again.<br>` +
    `The daily report keeps running regardless; unreachable rows appear in it marked SERVER DOWN.</div></div>`;

  const names = changes.map((c) => c.key.toUpperCase()).join(", ");
  return { subject: `${head} — ${names}`, html };
}

async function send(subject, html) {
  const to = String(EMAIL.to || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!EMAIL.user || !EMAIL.pass || !to.length) throw new Error("mail not configured");
  const transporter = nodemailer.createTransport({
    host: EMAIL.host, port: EMAIL.port, secure: EMAIL.port === 465,
    auth: { user: EMAIL.user, pass: EMAIL.pass },
  });
  await transporter.sendMail({ from: EMAIL.from || EMAIL.user, to, subject, html });
  return to;
}

// "3 h 20 m" — how long the server had been in its previous state.
function humanSince(ms) {
  if (!ms) return "";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `after ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `after ${h} h${m ? " " + m + " m" : ""}`;
}

(async () => {
  const now = new Date();
  const prev = readState();
  const results = [];

  for (const [key, srv] of Object.entries(SERVERS)) {
    const r = await checkServer(key, srv);
    r.base = srv.base;
    results.push(r);
    console.log(`${key.padEnd(10)} ${r.up ? "UP  " : "DOWN"}  ${r.reason}`);
  }

  if (STATUS_ONLY) return;

  // A change is only a change once we have a previous reading to compare with.
  const changes = [];
  const next = {};
  for (const r of results) {
    const was = prev[r.key];
    next[r.key] = { up: r.up, reason: r.reason, changedAt: was && was.up === r.up ? was.changedAt : now.getTime() };
    if (was && was.up !== r.up) {
      changes.push({ ...r, sinceLabel: humanSince(was.changedAt) });
    }
  }
  writeState(next);

  if (!changes.length) {
    console.log(prev && Object.keys(prev).length ? "No state change — no mail sent."
      : "First run — state recorded, no mail sent.");
    return;
  }

  const { subject, html } = buildMail(changes, results, now);
  try {
    const to = await send(subject, html);
    console.log(`Mailed "${subject}" to ${to.join(", ")}`);
  } catch (e) {
    console.error("[MAIL ERROR]", e.message);
    process.exit(1);
  }
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
