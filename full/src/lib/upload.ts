/** Zapisuje tělo požadavku do souboru po částech. Hlídání velikosti a obsahu dělá `check`, který při porušení pravidel vyhodí chybu. */
import fs from "node:fs";

export async function streamToFile(body: ReadableStream<Uint8Array>, file: string, check: (chunk: Uint8Array, total: number) => void): Promise<number> {
  const reader = body.getReader();
  const fh = await fs.promises.open(file, "w", 0o600);
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      check(value, total);
      await fh.write(value);
    }
    return total;
  } catch (e) {
    await reader.cancel(e).catch(() => {}); // zbytek těla se zahodí (jinak by spadl až později v Node)
    throw e;
  } finally {
    await fh.close().catch(() => {});
  }
}
