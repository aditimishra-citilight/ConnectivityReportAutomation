# 08 · Hosting it on the Linux server

Moving the report off the laptop and onto an always-on Ubuntu server. This is the
fix for the one real weakness: *"if the laptop is off, there is no report."*

The Node.js code is already cross-platform — `connectivityReport.js`, `lib.js`,
`mailer.js`, `alerts.js`, `history.js`, `theme.js` and `serverWatch.js` run
unchanged. Only the Windows wrapping needs a Linux equivalent:

| Windows | Linux |
|---|---|
| `run-report-scheduled.bat` | `run-report.sh` |
| `run-watch.bat` | `run-watch.sh` |
| `run-hidden.vbs` | not needed — cron has no console anyway |
| Task Scheduler | `cron` |
| `mail.env.bat` (`set "K=V"`) | `mail.env.sh` (`export K="V"`) |

Server in use: `ubuntu-2@121.241.97.130 -p 2325`, Ubuntu 24.04.

---

## Step 1 · Prove the server can reach everything (do this first)

**If this fails, nothing else matters.** A server room sits behind a stricter
firewall than a laptop, and corporate networks very often block outbound SMTP.

```bash
for hp in smartlight.citilight.co:446 velociti.citilight.co:444 \
          103.248.31.109:8080 dc.citilight.co:443 smtp.gmail.com:587; do
  h=${hp%:*}; p=${hp##*:}
  timeout 8 bash -c "</dev/tcp/$h/$p" 2>/dev/null \
    && echo "OK    $hp" || echo "BLOCK $hp"
done
node -v 2>/dev/null || echo "node NOT installed"
timedatectl | grep -i "time zone"
```

Every line must say `OK`. What the failures mean:

| Fails | Meaning |
|---|---|
| A portal | The server cannot see that portal — network/firewall team |
| `smtp.gmail.com:587` | Outbound SMTP blocked. Nothing will be emailed. Ask IT to open it, or relay through an internal mail server. |
| `node NOT installed` | Install it: `sudo apt update && sudo apt install -y nodejs npm` (Node 18+) |

**Check the time zone.** Cron uses the server's clock. This server already
reports IST, so `30 17` in cron means 5:30 PM IST. If it says UTC, either set the
zone (`sudo timedatectl set-timezone Asia/Kolkata`) or write the cron time in UTC.

---

## Step 2 · Get the code

```bash
cd ~
git clone https://github.com/aditimishra-citilight/ConnectivityReportAutomation.git ConnectivityReport
cd ConnectivityReport
npm install
```

---

## Step 3 · Copy the three files git does not carry

They hold passwords and personal addresses, so they are gitignored on purpose.
From the **Windows machine**, in PowerShell:

```powershell
cd D:\ConnectivityReport
scp -P 2325 cities.config.js recipients.txt recipients-watch.txt ubuntu-2@121.241.97.130:~/ConnectivityReport/
```

`cities.config.js` is not optional — without it nothing starts at all.

Then create the mail credentials **on the server** (do not copy `mail.env.bat`,
it is Windows syntax):

```bash
cd ~/ConnectivityReport
cp mail.env.example.sh mail.env.sh
nano mail.env.sh          # fill in MAIL_USER, MAIL_PASS, MAIL_FROM
chmod 600 mail.env.sh     # it holds a password — keep it to your account
```

Verify without sending or fetching anything:

```bash
node show-recipients.js
. ./mail.env.sh && node test-mail.js --verify-only
node serverWatch.js --status
```

---

## Step 4 · Carry the history over (optional, but do it)

Drop alerts compare against the previous run. A fresh machine has no baseline, so
its **first run raises no drop alerts**. Copy the newest run folder across and
that gap disappears:

```powershell
# on Windows — pick the newest folder under Reports\
scp -P 2325 -r "D:\ConnectivityReport\Reports\2026-08-14_17-30-00" ubuntu-2@121.241.97.130:~/ConnectivityReport/Reports/
```

---

## Step 5 · One manual run before trusting cron

```bash
cd ~/ConnectivityReport
chmod +x run-report.sh run-watch.sh
./run-report.sh
tail -30 Reports/run.log
```

The log should end with `Email sent to ...`. If it does not, the reason is in
that log — see [04 · Troubleshooting](04-troubleshooting.md).

---

## Step 6 · Schedule it

```bash
crontab -e
```

Add these two lines, with the real path:

```cron
30 17 * * *  /home/ubuntu-2/ConnectivityReport/run-report.sh
0  *  * * *  /home/ubuntu-2/ConnectivityReport/run-watch.sh
```

Confirm: `crontab -l`

Cron runs with a nearly empty environment — that is why both scripts `cd` to
their own directory, set `PATH` themselves, and source `mail.env.sh`. Do not
"simplify" that away.

---

## Step 7 · Turn the Windows tasks off

Otherwise **every recipient gets two of every email**, and the two machines build
separate snapshot histories, so drop alerts start comparing against the wrong
run. On Windows:

```powershell
Disable-ScheduledTask -TaskName "Connectivity Report"
Disable-ScheduledTask -TaskName "Connectivity Server Watch"
```

Disabled, not deleted — one command to fall back if the server has trouble.

---

## Gotchas specific to Linux

**Line endings.** `.sh` files authored on Windows arrive with CRLF and fail with
`bad interpreter: /usr/bin/env bash^M`, which looks nothing like the real cause.
`.gitattributes` forces LF on `*.sh`, so a normal `git clone` is safe. If you
ever copy a script across by hand, run `dos2unix run-report.sh`.

**cron's PATH is not your PATH.** A script that works when you type it can still
fail under cron. Both scripts handle this; if you add a third, copy the same
header.

**Case sensitivity.** Linux distinguishes `Reports` from `reports`. The code uses
`Reports` consistently — leave it alone.

**File permissions.** `chmod +x` on the scripts, `chmod 600` on `mail.env.sh`.

---

## After it is running

```bash
tail -f ~/ConnectivityReport/Reports/run.log      # daily report
tail -f ~/ConnectivityReport/Reports/watch.log    # hourly check
crontab -l                                        # what is scheduled
```

Everything else — thresholds, recipients, adding a project — works exactly as on
Windows; see [02 · Using and changing it](02-using-and-changing-it.md).
