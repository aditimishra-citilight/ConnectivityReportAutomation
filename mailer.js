// ===========================================================================
//  mailer.js — builds the HTML email (alert banner + colour table that mirrors
//  the Excel) and sends it with the workbook attached.
//
//  Gridlines and fills are written as HTML ATTRIBUTES (border="1", bgcolor,
//  align), NOT as CSS classes in a <style> block: Gmail's mobile apps drop
//  <style> entirely, which left the table with no visible lines at all. Inline
//  styles only ever carry cosmetics (padding, font size) that can be lost
//  without the table becoming unreadable.
// ===========================================================================
const nodemailer = require("nodemailer");
const path = require("path");
const { buildProjectColours, argbToCss } = require("./theme");
const { rowKey } = require("./alerts");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pctStr = (x) => (x * 100).toFixed(1) + "%";
const numStr = (n) => Number(n || 0).toLocaleString("en-IN");

// Roll the per-row counts up into per-project subtotals and a grand total.
function summarise(rows, windows) {
  const order = [], byKey = {};
  const blank = () => ({ total: 0, connected: 0 });
  const grand = {};
  for (const w of windows) grand[w.key] = blank();

  for (const r of rows) {
    if (!(r.project in byKey)) {
      byKey[r.project] = { project: r.project, rows: [], totals: {} };
      for (const w of windows) byKey[r.project].totals[w.key] = blank();
      order.push(byKey[r.project]);
    }
    const g = byKey[r.project];
    g.rows.push(r);
    for (const w of windows) {
      const x = r.windows[w.key];
      if (!x) continue;
      g.totals[w.key].total += x.total;
      g.totals[w.key].connected += x.connected;
      grand[w.key].total += x.total;
      grand[w.key].connected += x.connected;
    }
  }
  return { groups: order, grand };
}

// Derive the four displayed figures from a {total, connected} pair.
const derive = (t) => ({
  total: t.total,
  connected: t.connected,
  connectedPct: t.total ? t.connected / t.total : 0,
  disconnected: t.total - t.connected,
  disconnectedPct: t.total ? (t.total - t.connected) / t.total : 0,
});

// The email table is a faithful copy of the workbook's "24 & 48 Hrs" sheet:
// ONE table, both windows side by side, the same two-level header, the same
// per-project colour + subtotal + gap row, the same gold GRAND TOTAL. Column
// order and wording are taken from connectivityReport.js's FIXED/BLOCK so the
// mail and the attachment can never drift apart.
const FIXED = ["Project", "Site / Group", "Type", "Total"];
const BLOCK = [
  "Connected", "Connected %", "Disconnected", "Disconnected %",
  "Meter QTY", "Meter % (Connected Panels)", "Meter % (Total Panels)",
];
const BLOCK_FILL = ["#2e75b6", "#548235", "#9e480e", "#7030a0"];

// IMPORTANT: gridlines and fills are written as HTML ATTRIBUTES here
// (border="1", bgcolor, align) — not CSS classes. Gmail's mobile apps drop the
// <style> block entirely, which left the table with no visible lines at all.
// These HTML-4 attributes survive every client, so the grid is never lost.
function buildExcelTable(rows, windows, win, alerts, now) {
  const { groups, grand } = summarise(rows, windows);
  const colours = buildProjectColours(rows.map((r) => r.project));
  const nCols = FIXED.length + BLOCK.length;
  const HB = "#44546a";        // header fill
  const GB = BLOCK_FILL[0];    // window group-header fill
  const out = [];

  const th = (h, extra = "") =>
    `<th bgcolor="${HB}" ${extra} style="color:#ffffff;font-weight:bold;padding:5px 7px;` +
    `font-size:11px;line-height:1.3">${esc(h)}</th>`;
  // bgcolor goes on every cell, not the row: Outlook ignores <tr bgcolor>.
  const td = (v, bg, align = "left", bold = false) =>
    `<td bgcolor="${bg}" align="${align}" style="padding:4px 7px;font-size:11px` +
    `${bold ? ";font-weight:bold" : ""}">${v}</td>`;

  out.push(`<table border="1" bordercolor="#9a9a9a" cellspacing="0" cellpadding="0" ` +
    `style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif">`);

  // Title row, merged across the whole sheet — as in the workbook.
  out.push(`<tr><td colspan="${nCols}" bgcolor="#ffffff" align="center" ` +
    `style="padding:8px;font-size:13px;font-weight:bold">Connectivity Report &mdash; ` +
    `${esc(win.label)} &nbsp; (as of ${esc(now.toLocaleString())})</td></tr>`);

  // Two-level header: the fixed columns span both rows, the window spans its block.
  out.push(`<tr>`);
  for (const h of FIXED) out.push(th(h, `rowspan="2"`));
  out.push(`<th colspan="${BLOCK.length}" bgcolor="${GB}" style="color:#ffffff;font-weight:bold;` +
    `padding:5px;font-size:12px">${esc(win.label)}</th></tr><tr>`);
  for (const h of BLOCK) out.push(th(h));
  out.push(`</tr>`);

  // Meter columns are filled for CCMS only — blank elsewhere, as in the sheet.
  const meterCells = (bg, on, qty, pc, pt, bold) => on
    ? td(numStr(qty), bg, "right", bold) + td(pctStr(pc), bg, "right", bold) + td(pctStr(pt), bg, "right", bold)
    : td("", bg) + td("", bg) + td("", bg);

  groups.forEach((g, gi) => {
    const bg = argbToCss(colours[g.project]);
    const hasCCMS = g.rows.some((r) => r.type === "CCMS");

    for (const r of g.rows) {
      const x = r.windows[win.key] || {};
      const isCCMS = r.type === "CCMS";

      // A row we could not read is shown, not hidden — red band across the data
      // columns so a dead server is impossible to miss in the table.
      if (r.failed) {
        const RB = "#ffd6d6";
        out.push(`<tr>`);
        out.push(td(esc(r.project), RB));
        out.push(td(`${esc(r.site)} <font color="#c00000"><b>&#10007;</b></font>`, RB));
        out.push(td(esc(r.type), RB, "center"));
        out.push(`<td bgcolor="${RB}" colspan="${BLOCK.length + 1}" align="center" ` +
          `style="padding:4px 7px;font-size:11px;color:#c00000;font-weight:bold">` +
          `SERVER DOWN &mdash; no data (${esc(r.error || "fetch failed")})</td>`);
        out.push(`</tr>`);
        continue;
      }

      let site = esc(r.site);
      if (alerts && alerts.noDataKeys.has(rowKey(r))) {
        site += ` <font color="#c00000"><b>&#10007;</b></font>`;
      } else if (alerts && alerts.dropKeys.has(rowKey(r))) {
        const dd = alerts.drops.find((y) => rowKey(y) === rowKey(r));
        site += ` <font color="#c00000"><b>&#9660;${dd ? " " + dd.deltaPts.toFixed(0) : ""}</b></font>`;
      }

      out.push(`<tr>`);
      out.push(td(esc(r.project), bg));
      out.push(td(site, bg));
      out.push(td(esc(r.type), bg, "center"));
      out.push(td(numStr(x.total), bg, "right"));
      out.push(td(numStr(x.connected), bg, "right"));
      out.push(td(pctStr(x.connectedPct || 0), bg, "right"));
      out.push(td(numStr(x.disconnected), bg, "right"));
      out.push(td(pctStr(x.disconnectedPct || 0), bg, "right"));
      out.push(meterCells(bg, isCCMS, x.meterQty, x.meterPctConnected || 0, x.meterPctTotal || 0, false));
      out.push(`</tr>`);
    }

    // Subtotal — counts are sums; percentages are the ratio of those sums.
    const d = derive(g.totals[win.key]);
    let q = 0, qc = 0;
    for (const r of g.rows) if (r.type === "CCMS") {
      q += (r.windows[win.key] || {}).meterQty || 0;
      qc += (r.windows[win.key] || {}).connected || 0;
    }
    out.push(`<tr>`);
    out.push(td(esc(g.project), bg, "left", true));
    out.push(td("Total", bg, "left", true));
    out.push(td("", bg));
    out.push(td(numStr(d.total), bg, "right", true));
    out.push(td(numStr(d.connected), bg, "right", true));
    out.push(td(pctStr(d.connectedPct), bg, "right", true));
    out.push(td(numStr(d.disconnected), bg, "right", true));
    out.push(td(pctStr(d.disconnectedPct), bg, "right", true));
    out.push(meterCells(bg, hasCCMS, q, qc ? q / qc : 0, d.total ? q / d.total : 0, true));
    out.push(`</tr>`);

    // The sheet leaves one empty row between projects.
    if (gi < groups.length - 1) {
      out.push(`<tr><td colspan="${nCols}" bgcolor="#ffffff" style="height:8px;` +
        `line-height:8px;font-size:1px;border-left:none;border-right:none">&nbsp;</td></tr>`);
    }
  });

  // Grand total, gold, across all projects.
  const t = derive(grand[win.key]);
  let gq = 0, gqc = 0;
  for (const r of rows) if (r.type === "CCMS") {
    gq += (r.windows[win.key] || {}).meterQty || 0;
    gqc += (r.windows[win.key] || {}).connected || 0;
  }
  const G = "#ffe699";
  out.push(`<tr>`);
  out.push(td("GRAND TOTAL", G, "left", true));
  out.push(td("", G) + td("", G));
  out.push(td(numStr(t.total), G, "right", true));
  out.push(td(numStr(t.connected), G, "right", true));
  out.push(td(pctStr(t.connectedPct), G, "right", true));
  out.push(td(numStr(t.disconnected), G, "right", true));
  out.push(td(pctStr(t.disconnectedPct), G, "right", true));
  out.push(meterCells(G, rows.some((r) => r.type === "CCMS"), gq, gqc ? gq / gqc : 0, t.total ? gq / t.total : 0, true));
  out.push(`</tr></table>`);
  return out.join("");
}

// Collapse "4 rows failed on server kdmc" into ONE line instead of four
// near-identical ones — the server is the fact, the rows are just its victims.
function groupFetchErrors(fetchErrors) {
  const byMsg = new Map();
  for (const e of fetchErrors) {
    const m = /server "([^"]+)" login failed — (.*)$/.exec(e.message);
    const key = m ? `server:${m[1]}` : e.message;
    const detail = m ? m[2] : e.message;
    if (!byMsg.has(key)) byMsg.set(key, { detail, labels: [], server: m ? m[1] : null });
    byMsg.get(key).labels.push(e.label);
  }
  return [...byMsg.values()];
}

// The bold alert block that sits above the table.
function buildAlertBox(a, fetchErrors) {
  const B = (s) => `<b>${s}</b>`;
  const line = (s) => `<div style="font-size:13px;line-height:1.7">${s}</div>`;
  const grouped = groupFetchErrors(fetchErrors);
  const hasAlerts = a.low.length || a.drops.length || a.noData.length || grouped.length;

  const box = (border, inner) =>
    `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 18px;` +
    `font-family:Arial,Helvetica,sans-serif"><tr>` +
    `<td bgcolor="${border}" width="4" style="background:${border};font-size:1px;line-height:1px">&nbsp;</td>` +
    `<td style="padding:11px 14px;border:1px solid #d9d8d2;border-left:none">${inner}</td></tr></table>`;

  if (!hasAlerts) {
    return box("#0ca30c",
      line(`${B("&#10004; No drops")} &mdash; kisi site me pichle run se ${a.dropPoints}+ points ki girawat nahi.`));
  }

  const parts = [];

  if (a.drops.length) {
    parts.push(`<div style="font-size:14px;font-weight:700;color:#d03b3b">` +
      `&#9660; ${a.drops.length} site${a.drops.length > 1 ? "s" : ""} dropped` +
      (a.prevAt ? ` <span style="color:#52514e;font-weight:400;font-size:12px">since ${esc(new Date(a.prevAt).toLocaleString())}</span>` : "") +
      `</div>`);
    for (const d of a.drops) {
      parts.push(line(`${B(`${esc(d.project)} &mdash; ${esc(d.site)}`)} ` +
        `<span style="color:#52514e">${esc(d.type)}</span> &nbsp; ${pctStr(d.prevPct)} &rarr; ` +
        `<span style="color:#c00000;font-weight:bold">${pctStr(d.pct)}</span> ` +
        `<span style="color:#c00000;font-weight:bold">(&#9660; ${d.deltaPts.toFixed(1)} pts)</span> ` +
        `<span style="color:#52514e">${numStr(d.connected)}/${numStr(d.total)}</span>`));
    }
  }

  if (a.low.length) {
    parts.push(`<div style="margin-top:10px">${B(`&#9888; LOW CONNECTIVITY &mdash; ${a.low.length} site(s) below ${pctStr(a.lowPct)}`)}</div>`);
    for (const l of a.low) {
      parts.push(line(`&nbsp;&nbsp;&bull; ${B(`${esc(l.project)} &mdash; ${esc(l.site)} (${esc(l.type)})`)}: ` +
        `<span style="color:#c00000">${B(pctStr(l.pct))}</span> ` +
        `(${numStr(l.connected)} of ${numStr(l.total)} connected, ${B(numStr(l.total - l.connected))} down)`));
    }
  }

  if (a.noData.length) {
    parts.push(`<div style="font-size:14px;font-weight:700;color:#d03b3b;margin-top:${parts.length ? 12 : 0}px">` +
      `&#10007; ${a.noData.length} group${a.noData.length > 1 ? "s" : ""} returned 0 devices</div>`);
    for (const n of a.noData) {
      const was = n.prevTotal ? ` <span style="color:#52514e">was ${numStr(n.prevTotal)} last run</span>` : "";
      parts.push(line(`${B(`${esc(n.project)} &mdash; ${esc(n.site)}`)} <span style="color:#52514e">${esc(n.type)}</span>${was}`));
    }
  }

  if (grouped.length) {
    const n = grouped.reduce((s, g) => s + g.labels.length, 0);
    parts.push(`<div style="font-size:14px;font-weight:700;color:#ec835a;margin-top:${parts.length ? 12 : 0}px">` +
      `&#10007; ${n} row${n > 1 ? "s" : ""} unavailable</div>`);
    for (const g of grouped) {
      parts.push(line(`${B(esc(g.labels.join(", ")))} <span style="color:#52514e">${esc(g.detail)}</span>`));
    }
  }

  if (!a.prevStamp) {
    parts.push(line(`<span style="color:#52514e">Pehla run &mdash; comparison agle run se shuru hoga.</span>`));
  }

  return box("#d03b3b", parts.join(""));
}

// The one number the report leads with, on its own dark plane. Inline-styled
// for the same reason as the table — it must survive a stripped <style> block.
function buildHero(a) {
  const bg = `bgcolor="#0b0b0b"`;
  return `<table cellspacing="0" cellpadding="0" width="100%" ${bg} style="background:#0b0b0b;` +
    `border-collapse:collapse;margin:14px 0 18px;font-family:Arial,Helvetica,sans-serif"><tr>` +
    `<td ${bg} align="left" style="background:#0b0b0b;padding:16px 24px 15px">` +
    `<span style="color:#ffffff;font-size:30px;font-weight:bold">${pctStr(a.avgPct)}</span>` +
    `<span style="color:#c3c2b7;font-size:12px">&nbsp;&nbsp;connected &middot; ${esc(a.windowLabel)}</span></td>` +
    `<td ${bg} align="right" style="background:#0b0b0b;padding:16px 24px 15px;color:#c3c2b7;font-size:12px">` +
    `<b style="color:#ffffff;font-size:16px">${numStr(a.connected)}</b>&nbsp; of ${numStr(a.total)} devices</td>` +
    `</tr></table>`;
}

function buildHtml({ rows, windows, emailWindow, alerts, fetchErrors, now, fileName }) {
  const win = emailWindow || windows[0];
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#0b0b0b;padding:18px">`,
    `<div style="font-size:17px;font-weight:bold">Connectivity Report</div>`,
    `<div style="font-size:12px;color:#52514e;padding-top:3px">${esc(now.toLocaleString())}</div>`,
    buildHero(alerts),
    buildAlertBox(alerts, fetchErrors),
    buildExcelTable(rows, windows, win, alerts, now),
    `<div style="font-size:11px;color:#52514e;margin-top:16px;line-height:1.7">`,
    `This table is the ${esc(win.label)} view. The attached workbook has the full detail &mdash; ` +
      `all windows, every column, with live formulas: <b>${esc(fileName)}</b><br>`,
    `Meter columns apply to CCMS only, so they stay blank for ILC / Gateway / Warehouse.<br>`,
    `&#9660; = fell ${alerts.dropPoints}+ points vs the last run &nbsp;&middot;&nbsp; &#10007; = device list came back empty.`,
    `</div></div>`,
  ].join("");
}

function buildSubject(alerts, fetchErrors, now) {
  const d = now.toLocaleDateString("en-GB");
  const n = alerts.low.length + alerts.drops.length + alerts.noData.length + fetchErrors.length;
  const flag = n ? `⚠ ${n} ALERT${n > 1 ? "S" : ""}` : "All OK";
  return `Connectivity Report ${d} — ${flag} — avg ${pctStr(alerts.avgPct)} (${alerts.windowLabel})`;
}

// Send it. Throws with a readable message if the config is incomplete.
async function sendReport(cfg, { subject, html, filePath }) {
  const to = (Array.isArray(cfg.to) ? cfg.to : String(cfg.to || "").split(","))
    .map((s) => s.trim()).filter(Boolean);
  const cc = (Array.isArray(cfg.cc) ? cfg.cc : String(cfg.cc || "").split(","))
    .map((s) => s.trim()).filter(Boolean);

  if (!cfg.user || !cfg.pass) throw new Error("MAIL_USER / MAIL_PASS not set (Gmail needs an App Password)");
  if (!to.length) throw new Error("MAIL_TO is empty — nobody to send to");

  const transporter = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const info = await transporter.sendMail({
    from: cfg.from || cfg.user,
    to, cc, subject, html,
    attachments: cfg.attachExcel && filePath
      ? [{ filename: path.basename(filePath), path: filePath }] : [],
  });
  return { messageId: info.messageId, to, cc };
}

module.exports = { buildHtml, buildSubject, sendReport, summarise };
