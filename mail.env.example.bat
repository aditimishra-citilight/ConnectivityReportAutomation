@echo off
REM ===========================================================================
REM  Mail settings for the Connectivity Report.
REM
REM  SETUP:
REM    1. Copy this file to  mail.env.bat  (same folder).
REM    2. Fill in the values below.
REM    3. Double-click run-report.bat  — it picks this up automatically.
REM
REM  mail.env.bat is gitignored, so the password never leaves this machine.
REM
REM  GMAIL / GOOGLE WORKSPACE needs an APP PASSWORD, not your normal password:
REM    myaccount.google.com  ->  Security  ->  2-Step Verification  ->  App passwords
REM    Pick "Mail" + "Windows Computer", copy the 16-character code, paste below
REM    (spaces in the code are fine to remove).
REM ===========================================================================

REM --- who sends ---
set MAIL_USER=you@yourdomain.com
set MAIL_PASS=PASTE_16_CHAR_APP_PASSWORD_HERE
set MAIL_FROM=you@yourdomain.com

REM --- who receives (comma-separated for multiple) ---
set MAIL_TO=boss@yourdomain.com,ops@yourdomain.com
set MAIL_CC=

REM --- SMTP server (defaults are Gmail; change only for another provider) ---
set MAIL_HOST=smtp.gmail.com
set MAIL_PORT=465

REM Set to 0 to generate the Excel but skip sending.
set MAIL_ENABLED=1
