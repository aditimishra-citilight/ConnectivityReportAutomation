# Connectivity Report — Automation

Automates the daily **connected vs disconnected** report across all Citilight
projects: pulls live data from every portal, writes the styled Excel, emails it,
and alerts when connectivity drops or a server stops answering.

Replaces the old routine of logging into four portals every evening and
hand-filling a sheet.

---

## Start here — pick what you need

| I want to… | Read |
|---|---|
| **Understand the email I receive** | [01 · What you get](docs/01-what-you-get.md) |
| **Add a recipient, change the time, change a threshold** | [02 · Using and changing it](docs/02-using-and-changing-it.md) |
| **Take over / own this system** | [03 · Technical KT](docs/03-technical-kt.md) |
| **Fix something that broke** | [04 · Troubleshooting](docs/04-troubleshooting.md) |
| **Move it to another Windows machine** | [05 · Moving to another machine](docs/05-move-to-another-machine.md) |
| **Host it on the Linux server** | [08 · Hosting it on the Linux server](docs/08-host-on-linux-server.md) |
| **Look up a portal API detail** | [06 · Server API reference](docs/06-server-api-reference.md) |
| **Check what an Excel column means** | [07 · Excel column reference](docs/07-excel-column-reference.md) |

New to the project and taking it over? Read **01 → 02 → 03**, then keep 04 open
the first time something goes wrong.

---

## What it covers

11 projects across 4 servers, 36 device groups. Each server has its own base URL,
cityIds and userId — they are not uniform.

| Server | Projects |
|---|---|
| smartlight.citilight.co:446 | **NDMC** (6 zones) |
| velociti.citilight.co:444 | GC BOT, KG BOT, Nalanda, Bhopal, JD, Puri, Jaipur, Dehradun |
| 103.248.31.109:8080 | KDMC |
| dc.citilight.co | Bhatinda |

---

## Runs by itself

| When | What | Log |
|---|---|---|
| Daily **17:30** | Full report → Excel → email to everyone in `recipients.txt` | `Reports\run.log` |
| Every **hour** | Server health check → mails only on a state change | `Reports\watch.log` |

Both are Windows Task Scheduler jobs on one laptop. **If that laptop is off, they
do not run** — see [05](docs/05-move-to-another-machine.md).

---

## Run it by hand

```powershell
cd D:\ConnectivityReport
npm install                              # first time only
node connectivityReport.js               # generate + email
node connectivityReport.js --no-mail     # generate only
```

Or double-click `run-report.bat`.

---

## Layout

```
ConnectivityReport\
├── README.md                     you are here
├── docs\                         all documentation, numbered in reading order
│
├── connectivityReport.js         main program — report, Excel, email hand-off
├── serverWatch.js                hourly server health check
├── lib.js                        login, fetch, connectivity counting
├── alerts.js                     the alert rules and averages
├── mailer.js                     builds and sends the HTML email
├── history.js                    per-run snapshot, the baseline for drop detection
├── theme.js                      per-project colours, shared by Excel and email
│
├── probe.js                      live counts in the console, no Excel
├── inspect.js                    dump raw device fields for one query
├── discover.js                   find cityIds and device counts
├── show-recipients.js            print who each mail goes to
├── test-mail.js                  verify SMTP settings
├── setup-mail.js                 write mail.env.bat from another project's .env
│
├── run-report.bat                double-click launcher
├── run-report-scheduled.bat      silent daily launcher (Task Scheduler)
├── run-watch.bat                 silent hourly launcher (Task Scheduler)
├── run-hidden.vbs                runs a .bat with no console window
│
├── cities.config.js              ← the only file you normally edit  (gitignored)
├── recipients.txt                ← who gets the report              (gitignored)
├── recipients-watch.txt          ← who gets server alerts           (gitignored)
├── mail.env.bat                  ← email password                   (gitignored)
└── Reports\                      generated output                   (gitignored)
```

---

## Security

Four things are gitignored because they hold passwords, personal addresses, or
generated output:

`cities.config.js` · `mail.env.bat` · `recipients*.txt` · `Reports\`

Committed templates: `cities.config.example.js`, `mail.env.example.bat`,
`recipients.example.txt`.

**A fresh `git clone` therefore cannot run until `cities.config.js` is copied
across by hand.** That is intentional — the portal password is in it. Full
instructions in [05](docs/05-move-to-another-machine.md).
