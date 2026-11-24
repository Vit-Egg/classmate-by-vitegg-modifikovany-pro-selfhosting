/** Nahrání obrázku do poznámky z prohlížeče. Velké fotky se předtím zmenší, ať se nenahrávají desítky MB. */
const MAX_SIDE = 2000;
const SKIP_BELOW = 1.5 * 1024 * 1024;

export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif" || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < SKIP_BELOW) return (bmp.close(), file);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const type = file.type === "image/png" ? "image/png" : "image/jpeg"; // průhlednost PNG se zachová
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export async function uploadNoteImage(noteId: number, file: File): Promise<{ src: string; alt: string }> {
  const blob = await shrinkImage(file);
  const r = await fetch(`/poznamky/${noteId}/obrazek`, { method: "POST", body: blob });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? "Obrázek se nepodařilo nahrát.");
  return { src: body.src as string, alt: file.name.replace(/\.[^.]+$/, "").slice(0, 120) };
}

export const isImageFile = (f: File) => /^image\/(png|jpe?g|gif|webp)$/.test(f.type);
