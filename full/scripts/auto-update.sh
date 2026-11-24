#!/usr/bin/env bash
# Automatická aktualizace: když je na GitHubu nový commit a GitHub Actions k němu sestavil obraz, stáhne ho a aplikaci restartuje.
# Build na malém serveru padá na paměti, proto se obraz sestavuje na GitHubu (workflow „Obraz aplikace“) a tady se jen stahuje.
# Spouští se z cronu, viz DEPLOY.md. Soubor compose lze změnit proměnnou COMPOSE_FILE, CLASSMATE_BUILD_LOCAL=1 vrátí sestavení na serveru.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.lan.yml}"
IMAGE="ghcr.io/classmatecz/classmate"

exec 9>/tmp/classmate-update.lock
flock -n 9 || exit 0   # předchozí aktualizace ještě běží

git fetch -q origin main
SHA="$(git rev-parse origin/main)"
if [ "$SHA" = "$(cat .deployed 2>/dev/null || true)" ]; then
  exit 0
fi

echo "$(date -Is) Nová verze ${SHA:0:7}, aktualizuji…"
git pull -q --ff-only origin main

if [ "${CLASSMATE_BUILD_LOCAL:-0}" = "1" ]; then
  LOW_MEMORY=1 docker compose -f "$COMPOSE_FILE" up -d --build
else
  # obraz k tomuhle commitu vzniká na GitHubu pár minut; když tam ještě není, zkusí se to při dalším spuštění
  if ! docker pull -q "$IMAGE:$SHA" >/dev/null 2>&1; then
    echo "$(date -Is) Obraz ${SHA:0:7} ještě není hotový (nebo chybí docker login ghcr.io), zkusím to znovu."
    exit 0
  fi
  docker tag "$IMAGE:$SHA" "$IMAGE:latest"
  docker compose -f "$COMPOSE_FILE" up -d --no-build
fi
echo "$SHA" > .deployed
# staré obrazy: každá verze se stahuje pod vlastním tagem (SHA), bez úklidu by jich na disku přibývalo (stovky MB každý)
docker images --format '{{.Repository}}:{{.Tag}}' "$IMAGE" | grep -vE ":(latest|$SHA)$" | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null
docker builder prune -af --filter until=24h >/dev/null 2>&1 || true
echo "$(date -Is) Hotovo: ${SHA:0:7}"
