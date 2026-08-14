#!/usr/bin/env bash
# ===========================================================================
#  Daily report — Linux/cron equivalent of run-report-scheduled.bat.
#  Cron gives no console, so everything is appended to Reports/run.log.
#
#  crontab:  30 17 * * *  /path/to/ConnectivityReport/run-report.sh
# ===========================================================================
set -u
cd "$(dirname "$0")" || exit 1

mkdir -p Reports

# Mail credentials. Keep them in mail.env.sh (gitignored, chmod 600).
# shellcheck disable=SC1091
[ -f ./mail.env.sh ] && . ./mail.env.sh

# cron's PATH is minimal — find node the way a login shell would.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
command -v node >/dev/null 2>&1 || {
  echo "===== $(date '+%F %T') =====" >> Reports/run.log
  echo "node not found on PATH" >> Reports/run.log
  exit 127
}

{
  echo ""
  echo "===== $(date '+%F %T') ====="
  node connectivityReport.js
} >> Reports/run.log 2>&1
