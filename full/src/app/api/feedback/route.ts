import { z } from "zod";
import { audit } from "@/lib/audit";
import { BodyTooLarge, readBytes } from "@/lib/body";
import { rateLimit } from "@/lib/db";
import { FEEDBACK_MAX_FILE, FEEDBACK_MAX_FILES, FEEDBACK_MAX_TOTAL, checkAttachment, mailOwner, ownerEmail } from "@/lib/feedback";
import { getCurrentUser } from "@/lib/session";
import { versionTitle } from "@/lib/version";

export const dynamic = "force-dynamic";

const KINDS = { napad: "Mám nápad na vylepšení", bug: "Našel jsem chybu", otazka: "Mám otázku", jine: "Něco jiného", nahlasit: "Nahlášení nevhodného obsahu" } as const;
const Input = z.object({
  kind: z.enum(["napad", "bug", "otazka", "jine", "nahlasit"]),
  message: z.string().trim().min(5, "Napiš aspoň pár slov.").max(4000, "Zpráva je moc dlouhá."),
});
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Zpětná vazba z aplikace (multipart: text a až čtyři přílohy). Jde e-mailem autorovi, odpověď přímo uživateli. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Přihlas se." }, 401);
  if (user.demo) return json({ error: "V demu se zprávy neodesílají." }, 403);
  if (!rateLimit(`feedback:${user.id}`, 6, 3600)) return json({ error: "Poslal jsi už několik zpráv, zkus to za chvíli." }, 429);

  let fd: FormData;
  try {
    const body = await readBytes(req, FEEDBACK_MAX_TOTAL + 512 * 1024);
    fd = await new Response(new Uint8Array(body), { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch (e) {
    if (e instanceof BodyTooLarge) return json({ error: "Přílohy jsou dohromady moc velké (nejvýš 20 MB)." }, 413);
    return json({ error: "Zprávu se nepodařilo přečíst." }, 400);
  }

  const v = Input.safeParse({ kind: fd.get("kind"), message: fd.get("message") });
  if (!v.success) return json({ error: v.error.issues[0].message }, 400);

  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > FEEDBACK_MAX_FILES) return json({ error: `Příloh může být nejvýš ${FEEDBACK_MAX_FILES}.` }, 400);
  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  let total = 0;
  for (const f of files) {
    if (f.size > FEEDBACK_MAX_FILE) return json({ error: `Soubor ${f.name} je moc velký (nejvýš 8 MB).` }, 413);
    const a = checkAttachment(f.name, Buffer.from(await f.arrayBuffer()));
    if (!a) return json({ error: `Soubor ${f.name} nejde přiložit, použij obrázek, PDF nebo text.` }, 415);
    total += a.content.length;
    attachments.push(a);
  }
  if (total > FEEDBACK_MAX_TOTAL) return json({ error: "Přílohy jsou dohromady moc velké (nejvýš 20 MB)." }, 413);

  const lines: [string, string][] = [["Typ", KINDS[v.data.kind]], ["Od", `${user.name} <${user.email}>`], ["Škola/třída", `${user.school_name} · ${user.class_name}`]];
  if (fd.get("tech") === "1" || v.data.kind === "nahlasit") {
    const page = String(fd.get("page") ?? "");
    lines.push(["Stránka", /^\/[\w\-/?=&%.#]{0,200}$/.test(page) ? page : "-"], ["Verze", versionTitle()], ["Prohlížeč", (req.headers.get("user-agent") ?? "-").slice(0, 200)]);
  }
  if (attachments.length) lines.push(["Přílohy", attachments.map((a) => a.filename).join(", ")]);
  const sent = await mailOwner({ subject: `Classmate: ${KINDS[v.data.kind]}`, lines, message: v.data.message, replyTo: user.email, attachments });
  if (v.data.kind === "nahlasit") audit(user, "report", { detail: `stránka ${/^\/[\w\-/?=&%.#]{0,200}$/.test(String(fd.get("page") ?? "")) ? String(fd.get("page")) : "-"}`.slice(0, 220) }); // text hlášení se nezapisuje, je v e-mailu
  if (!sent) return json({ error: ownerEmail() ? "Zprávu se teď nepodařilo odeslat, zkus to prosím za chvíli." : "Odesílání zpráv není na serveru nastavené." }, 503);
  return json({ ok: true });
}
