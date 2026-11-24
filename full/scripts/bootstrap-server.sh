#!/usr/bin/env bash
# Nový server od nuly na čistém Debianu/Ubuntu (například LXC v Proxmoxu): nainstaluje Docker, nasadí Classmate server a web a obnoví data ze zálohy.
# Použití (jako root):
#   ./bootstrap-server.sh /cesta/plna-zaloha-RRRRMMDD-HHMMSS.tar.gz /cesta/env-RRRRMMDD-HHMMSS [/cesta/web-env-RRRRMMDD-HHMMSS]
# Skript si stáhne repozitáře z GitHubu (soukromé: zeptá se na uživatele a token).
set -euo pipefail
ARCHIVE="${1:-}"; ENVFILE="${2:-}"; WEBENV="${3:-}"
[ "$(id -u)" = "0" ] || { echo "Spusť jako root." >&2; exit 1; }
[ -f "$ARCHIVE" ] && [ -f "$ENVFILE" ] || { echo "Použití: $0 archiv.tar.gz env-soubor [web-env-soubor]" >&2; exit 1; }
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "1/6 Balíčky a Docker"
apt-get update -qq && apt-get install -y -qq ca-certificates curl git cron >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker cron >/dev/null 2>&1 || true

say "2/6 Přihlášení do ghcr.io (token typu classic s oprávněním read:packages)"
read -r -p "GitHub uživatel [plojharsim]: " GU; GU="${GU:-plojharsim}"
docker login ghcr.io -u "$GU"

say "3/6 Repozitáře"
[ -d /root/classmate-server ] || git clone https://github.com/classmatecz/classmate-server.git /root/classmate-server
[ -d /root/classmate-landing ] || git clone https://github.com/classmatecz/classmate-landing.git /root/classmate-landing

say "4/6 Obnova dat"
docker volume inspect classmate-data >/dev/null 2>&1 && { echo "Volume classmate-data už existuje, nepřepisuji (smaž ho, pokud chceš obnovit znovu)." >&2; exit 1; }
docker volume create classmate-data >/dev/null
docker run --rm -v classmate-data:/d -v "$(dirname "$(readlink -f "$ARCHIVE")")":/b:ro alpine sh -c "
  set -e
  tar xzf /b/$(basename "$ARCHIVE") -C /d
  chown -R 1001 /d
  ls -la /d | head"
cp "$ENVFILE" /root/classmate-server/.env; chmod 600 /root/classmate-server/.env
[ -n "$WEBENV" ] && [ -f "$WEBENV" ] && { cp "$WEBENV" /root/classmate-landing/.env; chmod 600 /root/classmate-landing/.env; } || [ -f /root/classmate-landing/.env ] || cp /root/classmate-landing/.env.example /root/classmate-landing/.env

say "5/6 Spuštění serveru a webu"
( cd /root/classmate-server && docker compose -f docker-compose.lan.yml pull && docker compose -f docker-compose.lan.yml up -d )
( cd /root/classmate-landing && docker compose pull && docker compose up -d )
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && { echo "Server běží."; break; }; sleep 2; [ "$i" = 30 ] && { echo "Server neodpovídá, koukni do: cd /root/classmate-server && docker compose -f docker-compose.lan.yml logs" >&2; exit 1; }; done

say "6/6 Pravidelná záloha"
mkdir -p /root/backups
echo '30 3 * * * root /root/classmate-server/scripts/backup.sh /root/backups >> /var/log/classmate-backup.log 2>&1' > /etc/cron.d/classmate-backup
say "Hotovo. Server běží na portu 3000, web na 3001. Přepni cíle v Cloudflare Tunelu na IP tohohle stroje."
