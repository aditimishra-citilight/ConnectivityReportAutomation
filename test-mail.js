// ===========================================================================
//  test-mail.js — verify the SMTP settings WITHOUT running the full report
//  (no portal logins, no Excel). Sends one small test mail.
//
//  Run:  node test-mail.js          (after setting MAIL_* env vars)
//        run-report.bat loads mail.env.bat for you; from a bare prompt, do:
//        call mail.env.bat && node test-mail.js
// ===========================================================================
const nodemailer = require("nodemailer");
const { EMAIL } = require("./cities.config");

(async () => {
  const to = String(EMAIL.to || "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`host : ${EMAIL.host}:${EMAIL.port}`);
  console.log(`user : ${EMAIL.user || "(not set)"}`);
  console.log(`pass : ${EMAIL.pass ? "*".repeat(EMAIL.pass.length) : "(not set)"}`);
  console.log(`to   : ${to.join(", ") || "(not set)"}`);
  console.log("");

  if (!EMAIL.user || !EMAIL.pass) {
    console.error("MAIL_USER / MAIL_PASS are not set. Copy mail.env.example.bat to");
    console.error("mail.env.bat, fill it in, then:  call mail.env.bat && node test-mail.js");
    process.exit(1);
  }
  if (!to.length) { console.error("MAIL_TO is empty."); process.exit(1); }

  const transporter = nodemailer.createTransport({
    host: EMAIL.host, port: EMAIL.port, secure: EMAIL.port === 465,
    auth: { user: EMAIL.user, pass: EMAIL.pass },
  });

  try {
    await transporter.verify();
    console.log("SMTP login OK.");
    // --verify-only proves the credentials work without sending anything.
    if (process.argv.includes("--verify-only")) {
      console.log("--verify-only: no mail sent.");
      return;
    }
  } catch (e) {
    console.error("SMTP login FAILED:", e.message);
    console.error("\nGmail: 2-Step Verification must be ON and you must use a 16-character");
    console.error("App Password (myaccount.google.com > Security > App passwords),");
    console.error("not the normal account password.");
    process.exit(1);
  }

  const info = await transporter.sendMail({
    from: EMAIL.from || EMAIL.user,
    to,
    subject: "Connectivity Report — test mail",
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;">
      <h3 style="margin:0 0 8px 0;">Test mail</h3>
      <p>If you can read this, the Connectivity Report can email you.
      Sent ${new Date().toLocaleString()}.</p></div>`,
  });
  console.log(`Sent. messageId=${info.messageId}`);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
