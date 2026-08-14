#!/usr/bin/env bash
# ===========================================================================
#  Hourly server health check — Linux/cron equivalent of run-watch.bat.
#  Mails only when a server changes state, so a quiet log is the normal case.
#
#  crontab:  0 * * * *  /path/to/ConnectivityReport/run-watch.sh
# ===========================================================================
set -u
cd "$(dirname "$0")" || exit 1

mkdir -p Reports

# shellcheck disable=SC1091
[ -f ./mail.env.sh ] && . ./mail.env.sh

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
command -v node >/dev/null 2>&1 || {
  echo "===== $(date '+%F %T') =====" >> Reports/watch.log
  echo "node not found on PATH" >> Reports/watch.log
  exit 127
}

{
  echo "===== $(date '+%F %T') ====="
  node serverWatch.js
} >> Reports/watch.log 2>&1
