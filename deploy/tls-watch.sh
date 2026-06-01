#!/usr/bin/env bash
# Self-healing TLS watcher for rnp.arcon-group.uz.
# Runs from cron every 10 min. While the DNS A record is missing or still points
# elsewhere it just logs and exits 0. Once it resolves to this box
# (62.169.31.240) it issues a Let's Encrypt cert via certbot --nginx, reloads
# nginx, drops a .tls-done marker and REMOVES its own cron entry (self-cleanup).
# By morning rnp is on HTTPS. NOTE: intentionally no `set -e` — a failed/NXDOMAIN
# lookup is the normal "keep waiting" path, not an error.
set -uo pipefail

DOMAIN=rnp.arcon-group.uz
WANT_IP=62.169.31.240
EMAIL=admin@arcon-group.uz
DIR=/home/admin/rnp/deploy
LOG="$DIR/tls-watch.log"
MARKER="$DIR/.tls-done"

[ -f "$MARKER" ] && exit 0

resolve() {
  local ip=""
  ip=$(dig +short "$DOMAIN" @1.1.1.1 2>/dev/null | grep -Eo '^[0-9.]+$' | tail -1)
  [ -z "$ip" ] && ip=$(dig +short "$DOMAIN" @8.8.8.8 2>/dev/null | grep -Eo '^[0-9.]+$' | tail -1)
  [ -z "$ip" ] && ip=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | tail -1)
  printf '%s' "$ip"
}

GOT=$(resolve)
echo "$(date -Is) resolve $DOMAIN -> ${GOT:-none} (want $WANT_IP)" >> "$LOG"

[ "$GOT" != "$WANT_IP" ] && exit 0

echo "$(date -Is) DNS matched, requesting certificate" >> "$LOG"
if sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect >> "$LOG" 2>&1; then
  sudo systemctl reload nginx >> "$LOG" 2>&1
  touch "$MARKER"
  ( crontab -l 2>/dev/null | grep -v 'tls-watch.sh' ) | crontab -
  echo "$(date -Is) SUCCESS: TLS issued, nginx reloaded, cron entry removed." >> "$LOG"
else
  echo "$(date -Is) certbot failed; will retry on next run." >> "$LOG"
fi
