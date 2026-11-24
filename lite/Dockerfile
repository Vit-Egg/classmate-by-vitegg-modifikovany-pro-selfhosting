# syntax=docker/dockerfile:1
FROM node:22.23.4-bookworm-slim AS deps
WORKDIR /app
# build nástroje jen pro případ, že pro platformu (např. ARM) není předkompilovaný better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22.23.4-bookworm-slim AS run
LABEL org.opencontainers.image.source="https://github.com/Vit-Egg/classmate-by-vitegg-modifikovany-pro-selfhosting"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3100 DATA_DIR=/data
RUN useradd --system --uid 1001 --create-home app && mkdir /data && chown app /data
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/public ./public
RUN node -e "const D=require('better-sqlite3');new D(':memory:').prepare('select 1').get()"
USER app
VOLUME /data
EXPOSE 3100
CMD ["node", "server.js"]
