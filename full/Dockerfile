# syntax=docker/dockerfile:1
# Verze Node je připnutá: 22.23.5 shazuje nativní modul better-sqlite3 hned při načtení (segfault, kód 139). Před zvýšením vyzkoušej, že obraz po sestavení běží.
FROM node:22.23.4-bookworm-slim AS deps
WORKDIR /app
# git čte číslo verze při buildu; build-essential jen pro případ, že pro platformu (např. ARM) není předkompilovaný better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Na GitHubu (dost paměti) se sestavuje normálně, včetně minifikace. Na malém serveru (2 GB RAM) padá build na paměti:
# tam spusť docker compose build --build-arg LOW_MEMORY=1 (bez minifikace a kontrol typů, soubory jsou větší).
ARG LOW_MEMORY=0
RUN if [ "$LOW_MEMORY" = "1" ]; then export SKIP_CHECKS=1 NO_MINIFY=1 NODE_OPTIONS=--max-old-space-size=1536; fi && npm run build

FROM node:22.23.4-bookworm-slim AS run
# propojí balíček na ghcr.io s repozitářem (zdědí jeho oprávnění a jde k němu jednoduše přiřadit přístup)
LABEL org.opencontainers.image.source="https://github.com/Vit-Egg/classmate-by-vitegg-modifikovany-pro-selfhosting"
WORKDIR /app
# UV_THREADPOOL_SIZE: scrypt (hesla) a práce se soubory běží ve vláknech, při dávce přihlášení by 4 výchozí vlákna nestačila
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 DATA_DIR=/data UV_THREADPOOL_SIZE=8
# ffmpeg převádí nahrávky z hodin (WebM z Chrome) na M4A, aby je přehrál i Safari
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN useradd --system --uid 1001 --create-home app && mkdir /data && chown app /data
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
# zkouška při sestavení: obraz, ve kterém by se nedala otevřít databáze, se nikdy nenasadí
RUN node -e "const D=require('better-sqlite3');new D(':memory:').prepare('select 1').get()"
USER app
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
