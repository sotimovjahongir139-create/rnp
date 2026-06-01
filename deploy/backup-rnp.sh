#!/usr/bin/env bash
# Nightly pg_dump of rnp_analytics into ~/backups, keeping the last 14.
# Source data is re-pullable from the upstream sources, but this is cheap insurance.
set -euo pipefail
cd "$HOME/rnp"
set -a; . ./.env; set +a
STAMP=$(date +%F)
mkdir -p "$HOME/backups"
pg_dump "$DATABASE_URL" | gzip > "$HOME/backups/rnp_analytics_${STAMP}.sql.gz"
ls -1t "$HOME"/backups/rnp_analytics_*.sql.gz | tail -n +15 | xargs -r rm
echo "$(date -Is) backup ok: rnp_analytics_${STAMP}.sql.gz"
