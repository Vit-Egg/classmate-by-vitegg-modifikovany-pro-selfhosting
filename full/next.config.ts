import { execSync } from "node:child_process";
import path from "node:path";
import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/csp";

/** Verze aplikace = počet commitů, krátký hash a datum posledního commitu (z gitu při buildu). */
function buildInfo() {
  const git = (args: string) => execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    return { n: Number(git("rev-list --count HEAD")), sha: git("rev-parse --short HEAD"), date: git("log -1 --format=%cI") };
  } catch {
    return { n: 0, sha: "", date: "" }; // sestavení bez gitu
  }
}

const prod = process.env.NODE_ENV === "production";

const csp = buildCsp();

const config: NextConfig = {
  env: { APP_BUILD: JSON.stringify(buildInfo()) },
  serverExternalPackages: ["better-sqlite3", "web-push", "imapflow", "mailparser", "yjs", "y-protocols", "lib0"],
  output: "standalone",
  // Dříve otevřené stránky se při návratu zobrazí hned z paměti prohlížeče (akce a změny ji obnoví samy)
  experimental: {
    optimizePackageImports: ["@tiptap/react", "@tiptap/core"],
    staleTimes: { dynamic: 30, static: 180 },
    serverActions: { bodySizeLimit: "10mb" },
    // šetření pamětí při buildu na malém serveru: méně souběžných procesů a menší nároky webpacku
    ...(process.env.SKIP_CHECKS === "1" ? { cpus: 1, webpackMemoryOptimizations: true, workerThreads: false } : {}),
  },
  poweredByHeader: false,
  // Minifikace (nativní SWC) na serveru s 2 GB RAM padala na SIGSEGV u velkého balíku Excalidraw. V Docker buildu se vypíná, soubory jsou větší, ale po gzipu přes Cloudflare dobře průchozí.
  webpack(config, { isServer }) {
    // Yjs musí být v balíku jen jednou (jinak přestanou fungovat jeho kontroly typů): v prohlížeči všechny importy ukazují na stejný soubor, na serveru se bere jedna instalace z node_modules (serverExternalPackages)
    if (!isServer) config.resolve.alias = { ...config.resolve.alias, yjs: path.resolve("node_modules/yjs/dist/yjs.mjs") };
    if (process.env.NO_MINIFY === "1") config.optimization.minimize = false;
    return config;
  },
  // Docker build na malém serveru (LXC) padal na paměti při kontrole typů (SIGSEGV). Typy i lint se kontrolují před pushnutím (npm run typecheck), v image se přeskočí.
  ...(process.env.SKIP_CHECKS === "1" ? { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } } : {}),
  async redirects() {
    return [
      { source: "/zpravy", destination: "/", permanent: false }, // dřívější stránka, zprávy jsou teď zvoneček
      { source: "/testy", destination: "/testy-a-zkouseni", permanent: true }, // původní adresa (staré odkazy, zprávy, aplikace)
    ];
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
    ];
    const strict = prod
      ? [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ]
      : [];
    return [
      // CSP včetně frame-ancestors (kdo smí aplikaci vložit, EMBED_ORIGINS) skládá za běhu src/middleware.ts
      { source: "/:path*", headers: [...common, ...strict] },
      // server je soukromý, nic z něj nepatří do vyhledávačů (kromě meta značky i hlavičkou)
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
      // ikony, favicon a náhledový obrázek se mění zřídka: prohlížeč je nemusí při každém načtení znovu ověřovat
      { source: "/:file(icon-192.png|icon-512.png|icon-maskable-192.png|icon-maskable-512.png|apple-touch-icon.png|favicon.ico|icon.svg|og-image.png)", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      // service worker se musí kontrolovat při každém načtení, jinak by se aktualizace zdržela
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }, { key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
};

export default config;
