#!/usr/bin/env bash
# Úplná záloha serveru před přesunem na nový stroj: celé úložiště (databáze, nahrávky, obrázky, klíče) + .env serveru i webu.
# Aplikace se na chvíli zastaví, aby byla záloha konzistentní. Použití na serveru: ./scripts/backup-full.sh [cílová-složka]
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.lan.yml}"
DEST="${1:-/root/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"; chmod 700 "$DEST"
echo "Zastavuji aplikaci…"
docker compose -f "$COMPOSE_FILE" stop app
trap 'docker compose -f "$COMPOSE_FILE" start app >/dev/null' EXIT
docker run --rm -v classmate-data:/data:ro -v "$DEST":/b alpine tar czf "/b/plna-zaloha-$STAMP.tar.gz" -C /data .
cp .env "$DEST/env-$STAMP"; chmod 600 "$DEST/env-$STAMP"
[ -f /root/classmate-landing/.env ] && { cp /root/classmate-landing/.env "$DEST/web-env-$STAMP"; chmod 600 "$DEST/web-env-$STAMP"; }
ls -lh "$DEST"/*"$STAMP"*
echo "Hotovo. Aplikace se znovu spouští. Soubory stáhni mimo server (například rsync nebo scp)."
