# ===========================================================================
#  Mail settings for the Connectivity Report (Linux).
#
#  SETUP:
#    cp mail.env.example.sh mail.env.sh
#    nano mail.env.sh          # fill in the values
#    chmod 600 mail.env.sh     # only you can read it — it holds a password
#
#  Both run-report.sh and run-watch.sh source this file before running node.
#  mail.env.sh is gitignored, so the password never leaves this machine.
#
#  GMAIL / GOOGLE WORKSPACE needs an APP PASSWORD, not the account password:
#    myaccount.google.com -> Security -> 2-Step Verification -> App passwords
#  Paste the 16 characters with no spaces.
# ===========================================================================

# --- who sends ---
export MAIL_USER="you@yourdomain.com"
export MAIL_PASS="PASTE_16_CHAR_APP_PASSWORD_HERE"
export MAIL_FROM="you@yourdomain.com"

# --- SMTP server (defaults are Gmail) ---
export MAIL_HOST="smtp.gmail.com"
export MAIL_PORT="587"

# Set to 0 to generate the report but skip sending.
export MAIL_ENABLED="1"

# Recipients are NOT set here — they live in recipients.txt and
# recipients-watch.txt, one address per line.
