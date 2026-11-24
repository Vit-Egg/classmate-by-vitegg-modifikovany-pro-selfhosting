#!/usr/bin/env bash
# Konzistentní záloha SQLite databáze za běhu. Použití: ./scripts/backup.sh [cílová-složka]
# Soubor compose lze změnit proměnnou COMPOSE_FILE (výchozí docker-compose.lan.yml), BACKUP_IMAGES=1 přibalí i obrázky z poznámek.
# Doporučení: spouštět z cronu denně a kopírovat mimo server, viz DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.lan.yml}"
# BACKUP_REMOTE a BACKUP_PING_URL jdou nastavit i v .env (cron .env nečte)
for v in BACKUP_REMOTE BACKUP_PING_URL; do
  if [ -z "${!v:-}" ] && [ -f .env ]; then x="$(grep -E "^$v=" .env | tail -n1 | cut -d= -f2- || true)"; [ -n "$x" ] && export "$v=$x"; fi
done
DC="docker compose -f $COMPOSE_FILE"
DEST="${1:-./backups}"
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
$DC exec -T app node -e "
const D=require('better-sqlite3');
new D('/data/classmate.db',{readonly:true}).backup('/tmp/backup.db').then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"
# „docker compose cp“ občas vrací nenulový kód, i když soubor zkopíroval, proto se kontroluje výsledek
$DC cp app:/tmp/backup.db "$DEST/classmate-$STAMP.db" || echo "docker compose cp skončil kódem $? (kontroluji soubor)" >&2
[ -s "$DEST/classmate-$STAMP.db" ] || { echo "Záloha se nezkopírovala." >&2; exit 1; }
$DC exec -T app rm -f /tmp/backup.db >/dev/null 2>&1 || true
# kontrola, že je databáze v pořádku (zálohu jsme právě z ní udělali)
CHECK="$($DC exec -T app node -e "
const D=require('better-sqlite3');const d=new D('/data/classmate.db',{readonly:true});console.log('integrity:',d.pragma('integrity_check',{simple:true}))" 2>&1 || true)"
case "$CHECK" in
  *"integrity: ok"*) ;;
  *) echo "Pozor: kontrola databáze nevyšla (${CHECK:-bez výstupu}), záloha může být poškozená." >&2; exit 1 ;;
esac
if [ "${BACKUP_IMAGES:-0}" = "1" ]; then
  $DC exec -T app tar -C /data -cf - images 2>/dev/null | gzip > "$DEST/classmate-images-$STAMP.tar.gz" || true
fi
# ponech posledních 30 záloh
ls -1t "$DEST"/classmate-2*.db 2>/dev/null | tail -n +31 | xargs -r rm -- || true
ls -1t "$DEST"/classmate-images-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -- || true
echo "Záloha: $DEST/classmate-$STAMP.db"
# Záloha jen na stejném stroji nestačí. BACKUP_REMOTE (cíl rclone, např. "b2crypt:classmate" nebo "gdrive-crypt:classmate") ji nahraje mimo server;
# kopii vždy šifruj (rclone crypt), v databázi jsou jména, známky a zprávy žáků. Bez rclone se krok přeskočí.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copyto "$DEST/classmate-$STAMP.db" "$BACKUP_REMOTE/classmate-$STAMP.db" --quiet \
      && echo "Nahráno do $BACKUP_REMOTE" \
      || { echo "Nahrání do $BACKUP_REMOTE selhalo." >&2; [ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 "${BACKUP_PING_URL%/}/fail" >/dev/null 2>&1; exit 1; }
    # vzdálených záloh drž posledních 30
    rclone lsf "$BACKUP_REMOTE" --files-only 2>/dev/null | grep '^classmate-2.*\.db$' | sort -r | tail -n +31 | while read -r f; do rclone deletefile "$BACKUP_REMOTE/$f" --quiet || true; done
  else
    echo "BACKUP_REMOTE je nastavené, ale rclone není nainstalovaný (apt install rclone)." >&2
  fi
fi
# Hlídání: BACKUP_PING_URL (Healthchecks.io, Uptime Kuma push) se zavolá po úspěšné záloze; když zálohy přestanou chodit, přijde upozornění.
[ -n "${BACKUP_PING_URL:-}" ] && curl -fsS -m 10 "$BACKUP_PING_URL" >/dev/null 2>&1 || true
