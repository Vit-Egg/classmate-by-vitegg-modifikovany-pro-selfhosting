import fs from "node:fs";
import path from "node:path";

export function dataDir() {
  const dir = path.resolve(process.env.DATA_DIR ?? "./data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
