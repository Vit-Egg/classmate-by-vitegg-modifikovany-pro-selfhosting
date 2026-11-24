// Zkopíruje písma Excalidraw do public/excalidraw/fonts, aby se nenačítala z cizího CDN (CSP to nedovolí). Čínské písmo (Xiaolai) se vynechá, je velké.
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const dst = path.resolve("public/excalidraw/fonts");
if (!fs.existsSync(src)) process.exit(0);
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const d of fs.readdirSync(src)) {
  if (d === "Xiaolai") continue;
  fs.cpSync(path.join(src, d), path.join(dst, d), { recursive: true });
}
