# 08 · Hosting it on the Linux server

Moving the report off the laptop onto an always-on server. This fixes the one
real weakness: *"if the laptop is off, there is no report."*

The Node.js code is already cross-platform and needed **no changes**. Only the
Windows wrapping has a Linux equivalent:

| Windows | Linux |
|---|---|
| `run-report-scheduled.bat` | `run-report.sh` |
| `run-watch.bat` | `run-watch.sh` |
| `run-hidden.vbs` | not needed — cron has no console anyway |
| Task Scheduler | `cron` |
| `mail.env.bat` (`set "K=V"`) | `mail.env.sh` (`export K="V"`) |

---

## Which server — and why not the other one

**Use `UAT_dbserver`.**

```
ssh root@121.241.97.130 -p 2323
internal IP : 172.16.16.24
in the hosting sheet it is called "Velociti 1"
```

The hostname says *dbserver* for historical reasons; it is where the Velociti
portal actually runs today.

**`ubuntu-2` (`-p 2325`, `192.168.50.33`) was tried first and does not work.**
From there only Bhatinda is reachable — 1 project out of 11. Do not repeat that
attempt; the reason is below.

### The network reality (this is the part that costs a day if you don't know it)

The company runs a **Sophos firewall at `172.16.16.16`**. From any server,
outbound connections are only allowed on **standard ports**:

| Port | From a server |
|---|---|
| 443 (HTTPS) | allowed |
| 587 (SMTP) | allowed |
| 444, 446, 8080 | **blocked — packets are dropped, connection just times out** |

The portals' public URLs use exactly those blocked ports (`:444` Velociti,
`:446` NDMC, `:8080` KDMC), so **no server can reach them by their public URL.**

It is also worth knowing that `velociti.citilight.co` and
`smartlight.citilight.co` both resolve to `121.241.97.130`, which is the office's
own public IP. A machine inside that network cannot connect to its own public IP
— the router does not support NAT loopback. Testing this is quick: from inside,
connecting to `121.241.97.130:2325` fails even though that is the SSH port you
are connected on.

### How it is solved — internal addresses, not public URLs

Every portal has an internal LAN address. From `UAT_dbserver` those *are*
reachable, because the traffic never leaves the LAN and never meets the firewall:

| Portal | Public URL | Internal address |
|---|---|---|
| Velociti | `velociti.citilight.co:444` | `172.16.16.24:443` (this same machine) |
| NDMC | `smartlight.citilight.co:446` | `172.16.16.34:443` |
| Bhatinda | `dc.citilight.co:443` | public URL works — different site, standard port |
| KDMC | `103.248.31.109:8080` | see the caveat below |

**But the internal IP alone is not enough.** Those servers use name-based virtual
hosting — they decide which site to serve from the `Host` header. Requesting the
IP directly returns 404:

```
https://172.16.16.34:443/smartlight/login                      -> 404
https://172.16.16.34:443/smartlight/login  + Host header       -> 200
```

So the fix is `/etc/hosts`: keep the hostname (the `Host` header stays correct)
but point it at the internal IP.

```bash
printf "172.16.16.34   smartlight.citilight.co\n172.16.16.24   velociti.citilight.co\n" >> /etc/hosts
```

Then only the **port** changes in the config — 446 and 444 both become 443.

### KDMC — untested, and honestly so

KDMC's own server (`103.248.31.109`) has been down since 10 August; it is
unreachable from the laptop too. So we could not test whether this server can
reach it once it is back. It sits on port 8080, which is one of the blocked
ports, so **it may well need a firewall rule**. Find out when that server
returns; until then its rows simply appear as `SERVER DOWN` in the report, which
is the correct behaviour.

---

## Step 1 · Confirm the server can reach everything

Run on `UAT_dbserver`. All three must return **200**:

```bash
for u in "https://smartlight.citilight.co:443/smartlight/login" "https://velociti.citilight.co:443/login" "https://dc.citilight.co/login"; do echo -n "$u -> "; curl -sk -o /dev/null -w "%{http_code}\n" --max-time 10 "$u"; done
```

If NDMC returns 404, the `/etc/hosts` line above is missing.

Also check the basics — Node 18+, IST, and outbound mail:

```bash
node -v; timedatectl | grep -i "time zone"; timeout 6 bash -c "</dev/tcp/smtp.gmail.com/587" && echo "smtp OK"
```

---

## Step 2 · Get the code

`/opt` is the conventional home for this kind of application — `/root` hides it
from anyone else who has to look after the box later.

```bash
cd /opt
git clone https://github.com/aditimishra-citilight/ConnectivityReportAutomation.git ConnectivityReport
cd /opt/ConnectivityReport
npm install
```

If the repo is private and asks for credentials, copy it from Windows instead:

```powershell
scp -P 2323 -r D:\ConnectivityReport root@121.241.97.130:/opt/ConnectivityReport
```

---

## Step 3 · Copy the three files git does not carry

They hold passwords and personal addresses, so they are gitignored on purpose.
From the **Windows machine**:

```powershell
cd D:\ConnectivityReport
scp -P 2323 cities.config.js recipients.txt recipients-watch.txt root@121.241.97.130:/opt/ConnectivityReport/
```

| File | Without it |
|---|---|
| `cities.config.js` | **Nothing runs** — `Cannot find module './cities.config'` |
| `recipients.txt` | Nobody receives the report |
| `recipients-watch.txt` | Server alerts fall back to the report list |

---

## Step 4 · Point the config at the internal addresses

Only the ports change:

```bash
cd /opt/ConnectivityReport
sed -i 's|smartlight.citilight.co:446|smartlight.citilight.co:443|; s|velociti.citilight.co:444|velociti.citilight.co:443|' cities.config.js
grep -n "base:" cities.config.js
```

Expect NDMC and Velociti on `:443`; KDMC and Bhatinda unchanged.

> **This is why the server's `cities.config.js` differs from the laptop's.** The
> file is gitignored precisely because each machine needs its own. Do not "fix"
> the ports back to 446/444 on the server — they will stop working.

---

## Step 5 · Mail credentials

Do **not** copy `mail.env.bat` across; it is Windows syntax.

```bash
cp mail.env.example.sh mail.env.sh
chmod 600 mail.env.sh
nano mail.env.sh        # MAIL_USER, MAIL_PASS (Gmail app password), MAIL_FROM
```

Check without sending or fetching anything:

```bash
node show-recipients.js
. ./mail.env.sh && node test-mail.js --verify-only
```

---

## Step 6 · One manual run before trusting cron

Never schedule something that has not run successfully by hand once — a cron job
that fails does so silently.

```bash
chmod +x run-report.sh run-watch.sh
./run-report.sh
tail -40 Reports/run.log
```

The log should end with `Email sent to ...`, and the device counts should look
like the laptop's. If not, the reason is in that log —
see [04 · Troubleshooting](04-troubleshooting.md).

---

## Step 7 · Carry the history over

Drop alerts compare against the previous run, so a fresh machine raises none on
its first run. Copy the newest run folder from Windows and that gap disappears:

```powershell
scp -P 2323 -r "D:\ConnectivityReport\Reports\<newest folder>" root@121.241.97.130:/opt/ConnectivityReport/Reports/
```

---

## Step 8 · Schedule it

```bash
crontab -e
```

```cron
30 17 * * *  /opt/ConnectivityReport/run-report.sh
0  *  * * *  /opt/ConnectivityReport/run-watch.sh
```

The server clock is already `Asia/Kolkata`, so `30 17` is 5:30 PM IST.

Cron runs with almost no environment — that is why both scripts `cd` to their own
directory, set `PATH` themselves and source `mail.env.sh`. Do not simplify that
away.

---

## Step 9 · Prove cron works

```bash
/opt/ConnectivityReport/run-report.sh && tail -5 /opt/ConnectivityReport/Reports/run.log
```

---

## Step 10 · Turn the Windows tasks off — last, not first

Until a report has gone out from the server, the laptop must keep running, or
some day nothing sends at all. Once the server has proved itself:

```powershell
Disable-ScheduledTask -TaskName "Connectivity Report"
Disable-ScheduledTask -TaskName "Connectivity Server Watch"
```

Disabled rather than deleted, so falling back is one command.

---

## Linux gotchas

**Line endings.** `.sh` files authored on Windows arrive with CRLF and fail with
`bad interpreter: /usr/bin/env bash^M`, which points nowhere near the cause.
`.gitattributes` forces LF on `*.sh`, so a normal clone is safe. If you ever copy
a script by hand, run `dos2unix run-report.sh`.

**cron's PATH is not your PATH.** A script that works when you type it can still
fail under cron.

**Case sensitivity.** Linux distinguishes `Reports` from `reports`.

**Permissions.** `chmod +x` the scripts, `chmod 600 mail.env.sh`.

---

## After it is running

```bash
tail -f /opt/ConnectivityReport/Reports/run.log
tail -f /opt/ConnectivityReport/Reports/watch.log
crontab -l
```

Thresholds, recipients and adding a project all work exactly as on Windows —
see [02 · Using and changing it](02-using-and-changing-it.md).

---

## One thing to raise separately

`UAT_dbserver` reported **20,334 failed SSH login attempts** since the previous
successful login. Root login over SSH is exposed to the internet, and the root
password is stored in a shared spreadsheet. That is not this project's problem to
fix, but whoever owns the server should know.
