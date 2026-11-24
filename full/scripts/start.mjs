// Spustí produkční build. Next s output: "standalone" nepodporuje `next start`,
// proto před startem doplníme statické soubory vedle standalone serveru.
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const standalone = ".next/standalone";
if (!existsSync(`${standalone}/server.js`)) {
  console.error("Chybí build. Nejdřív spusť `npm run build`.");
  process.exit(1);
}
cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${standalone}/public`, { recursive: true });

const child = spawn(process.execPath, [`${standalone}/server.js`], { stdio: "inherit", env: { HOSTNAME: "0.0.0.0", ...process.env, DATA_DIR: resolve(process.env.DATA_DIR ?? "data") } });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
