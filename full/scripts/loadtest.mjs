// Jednoduchý zátěžový test: simuluje souběžné uživatele, kteří procházejí stránky, a měří propustnost a odezvu.
// Použití: node scripts/loadtest.mjs <adresa> <soubor-s-cookie-sid-na-řádek> [souběžně=20] [vteřin=20]
// Cookie `sid` vytvoř pro testovací (např. demo) účty, nikdy netestuj na ostrých datech uživatelů. Pozor: zatěžuje server naplno, spouštěj proti testovací kopii.
import { readFileSync } from "node:fs";

const [base, file, conc = "20", secs = "20"] = process.argv.slice(2);
if (!base || !file) { console.error("Použití: node scripts/loadtest.mjs http://localhost:3000 tokeny.txt [souběžně] [vteřin]"); process.exit(1); }
const tokens = readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const paths = (process.env.PATHS ?? "/dnes,/rozvrh,/znamky,/ukoly,/testy-a-zkouseni,/poznamky,/predmety,/kalendar,/api/health").split(",");
const end = Date.now() + Number(secs) * 1000;
const lat = []; let errs = 0, bytes = 0;

async function worker(i) {
  const sid = tokens[i % tokens.length];
  let k = i;
  while (Date.now() < end) {
    const p = paths[k++ % paths.length];
    const t = performance.now();
    try {
      const r = await fetch(base + p, { headers: { cookie: `sid=${sid}` }, redirect: "manual" });
      const b = await r.arrayBuffer();
      bytes += b.byteLength;
      if (r.status >= 500) errs++;
      lat.push(performance.now() - t);
    } catch { errs++; }
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: Number(conc) }, (_, i) => worker(i)));
const dur = (Date.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const q = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]?.toFixed(0);
console.log(`souběžně ${conc}: ${(lat.length / dur).toFixed(0)} požadavků/s, odezva p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, p99 ${q(0.99)} ms, chyb ${errs}, ${(bytes / dur / 1e6).toFixed(1)} MB/s`);
