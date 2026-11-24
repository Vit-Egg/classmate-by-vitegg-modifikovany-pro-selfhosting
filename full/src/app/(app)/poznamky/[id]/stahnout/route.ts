import { docToMarkdown } from "@/lib/markdown";
import { siteUrl } from "@/lib/site";
import { fold } from "@/lib/text";
import { readableNote } from "@/lib/services";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Stažení poznámky jako Markdown (.md). Jde i u poznámek, které spolužák sdílí se třídou. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const note = readableNote(user, Number((await params).id), true);
  if (!note) return new Response("Not found", { status: 404 });

  let body = "";
  try {
    body = docToMarkdown(JSON.parse(note.content));
  } catch {}
  const title = note.title || "Bez názvu";
  // obrázky v poznámce jsou za přihlášením, proto v souboru vedou na celou adresu aplikace
  const text = `# ${title}\n\n${body.replaceAll("](/poznamky/", `](${siteUrl()}/poznamky/`)}\n`;
  const slug = fold(title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "poznamka";
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.md"; filename*=UTF-8''${encodeURIComponent(title.slice(0, 80))}.md`,
      "Cache-Control": "no-store",
    },
  });
}
