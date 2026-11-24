/**
 * Bezpečné čtení těla požadavku s horní mezí. Route handlery v Next.js žádný limit nemají, takže `req.json()` nebo `req.arrayBuffer()`
 * by u souvislého (chunked) proudu přečetly cokoli a vyčerpaly paměť. Tady se čtení přeruší, jakmile limit přesáhne.
 */
export class BodyTooLarge extends Error {}

export async function readBytes(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new BodyTooLarge();
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export const readText = async (req: Request, max = 64 * 1024) => (await readBytes(req, max)).toString("utf8");

/** JSON z těla (výchozí limit 64 kB); při chybě nebo přesahu limitu vrací null. */
export async function readJson<T = unknown>(req: Request, max = 64 * 1024): Promise<T | null> {
  try {
    return JSON.parse(await readText(req, max)) as T;
  } catch {
    return null;
  }
}
