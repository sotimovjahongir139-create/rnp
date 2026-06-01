#!/usr/bin/env bash
# Self-healing TLS watcher for rnp.arcon-group.uz.
# Runs from cron every 10 min. While the DNS A record still points elsewhere it
# just logs and exits. Once it resolves to this box (62.169.31.240) it issues a
# Let's Encrypt cert via certbot --nginx, reloads nginx, drops a .tls-done marker
# and REMOVES its own cron entry (self-cleanup). By morning rnp is on HTTPS.
set -euo pipefail

DOMAIN=rnp.arcon-group.uz
WANT_IP=62.169.31.240
EMAIL=admin@arcon-group.uz
DIR=/home/admin/rnp/deploy
LOG="$DIR/tls-watch.log"
MARKER="$DIR/.tls-done"

[ -f "$MARKER" ] && exit 0

# Resolve via a public resolver first (avoids local negative cache); fall back to getent.
GOT=$( (dig +short "$DOMAIN" @1.1.1.1 2>/dev/null || true) | tail -1 )
[ -z "$GOT" ] && GOT=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | tail -1)

echo "$(date -Is) resolve $DOMAIN -> ${GOT:-none} (want $WANT_IP)" >> "$LOG"

[ "$GOT" != "$WANT_IP" ] && exit 0

echo "$(date -Is) DNS matched, requesting certificate" >> "$LOG"
if sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect >> "$LOG" 2>&1; then
  sudo systemctl reload nginx >> "$LOG" 2>&1 || true
  touch "$MARKER"
  ( crontab -l 2>/dev/null | grep -v 'tls-watch.sh' ) | crontab - || true
  echo "$(date -Is) SUCCESS: TLS issued, nginx reloaded, cron entry removed." >> "$LOG"
else
  echo "$(date -Is) certbot failed; will retry on next run." >> "$LOG"
fi
