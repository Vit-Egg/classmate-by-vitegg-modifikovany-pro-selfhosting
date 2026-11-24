import { z } from "zod";
import { audit } from "@/lib/audit";
import { listDevices, registerDevice, revokeDevice, revokeUserDevice } from "@/lib/app-devices";
import { API_HEADERS, authenticate, coerce, coercePath, fail, reply, replyCached, requestId } from "@/lib/api/http";
import { openApi } from "@/lib/api/openapi";
import { matchRoute } from "@/lib/api/routes";
import { BodyTooLarge, readJson, readText } from "@/lib/body";
import { hashPassword, randomToken, sha256, verifyPasswordAsync } from "@/lib/crypto";
import { get, rateLimit, run } from "@/lib/db";
import { jsonSchema, toolByName, tools } from "@/lib/mcp/tools";
import { originOf } from "@/lib/oauth";
import { ServiceError } from "@/lib/services";
import { clientIp, USER_SELECT, type User } from "@/lib/session";
import { verifySecondFactor } from "@/lib/twofa";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PREFIX = "/api/v1";
let dummyHash: string | null = null;

const deviceSchema = z.object({ name: z.string().trim().max(80).default("API klient"), platform: z.enum(["android", "ios", "web", "other"]).default("other"), fcmToken: z.string().min(20).max(500).regex(/^[A-Za-z0-9_:.-]+$/).nullish(), appVersion: z.string().max(40).nullish() }).default({ name: "API klient", platform: "other" });
const loginSchema = z.object({ email: z.string().trim().toLowerCase().min(1).max(200), password: z.string().min(1).max(200), device: deviceSchema });
const twoFaSchema = z.object({ challenge: z.string().min(10).max(100), code: z.string().min(1).max(30), device: deviceSchema });

const userView = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role, school: u.school_name, class: u.class_name, classId: u.class_id, twoFactorEnabled: !!u.totp_enabled, boardEnabled: !!u.board_enabled });

function issueToken(userId: number, d: z.infer<typeof deviceSchema>) {
  const user = get<User>(`${USER_SELECT} WHERE u.id = ?`, userId)!;
  const token = registerDevice(userId, { platform: d.platform, name: d.name, fcmToken: d.fcmToken, appVersion: d.appVersion });
  audit({ id: user.id, name: user.name }, "login", { detail: `aplikace (API): ${d.name}` });
  return { token, tokenType: "Bearer", user: userView(user) };
}

async function login(req: Request, rid: string) {
  const body = await readJson(req, 8 * 1024);
  const p = loginSchema.safeParse(body);
  if (!p.success) return fail(400, "invalid_arguments", "Vyplň e-mail a heslo.", rid);
  const { email, password, device } = p.data;
  // stejné limity jako u webového přihlášení: štědré podle IP (škola sdílí jednu adresu), přísné podle e-mailu
  if (!rateLimit(`login:ip:${await clientIp()}`, 600, 900) || !rateLimit(`login:email:${email}`, 8, 900)) return fail(429, "rate_limited", "Příliš mnoho pokusů. Zkus to za chvíli.", rid, { "Retry-After": "900" });
  const row = get<{ id: number; name: string; password_hash: string; totp_enabled: number; demo: number }>("SELECT id, name, password_hash, totp_enabled, demo FROM users WHERE email = ?", email);
  const valid = await verifyPasswordAsync(password, row?.password_hash ?? (dummyHash ??= hashPassword("dummy")));
  if (!row || !valid) {
    audit(null, "login_failed", row ? { targetUser: { id: row.id, name: row.name }, detail: "API" } : { detail: "neznámý e-mail (API)" });
    return fail(401, "bad_credentials", "Nesprávný e-mail nebo heslo.", rid);
  }
  if (row.demo) return fail(403, "demo", "Demo účet přes API nejde.", rid);
  if (row.totp_enabled) {
    const token = randomToken(24);
    run("DELETE FROM login_challenges WHERE expires_at < ?", Date.now());
    run("INSERT INTO login_challenges (id, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), row.id, Date.now() + 5 * 60_000);
    return reply({ twoFactorRequired: true, challenge: token, expiresIn: 300 }, 200, rid);
  }
  return reply(issueToken(row.id, device), 200, rid);
}

async function twoFactor(req: Request, rid: string) {
  const p = twoFaSchema.safeParse(await readJson(req, 8 * 1024));
  if (!p.success) return fail(400, "invalid_arguments", "Pošli challenge a code.", rid);
  const id = sha256(p.data.challenge);
  const row = get<{ user_id: number; expires_at: number; attempts: number }>("SELECT user_id, expires_at, attempts FROM login_challenges WHERE id = ?", id);
  if (!row || row.expires_at < Date.now()) return fail(401, "challenge_expired", "Přihlášení vypršelo, přihlas se znovu.", rid);
  if (row.attempts >= 5) {
    run("DELETE FROM login_challenges WHERE id = ?", id);
    return fail(401, "too_many_codes", "Příliš mnoho nesprávných kódů. Přihlas se znovu.", rid);
  }
  run("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?", id);
  if (!rateLimit(`2fa:user:${row.user_id}`, 15, 3600)) return fail(429, "rate_limited", "Příliš mnoho pokusů. Zkus to za chvíli.", rid, { "Retry-After": "3600" });
  if (!verifySecondFactor(row.user_id, p.data.code)) {
    audit(null, "login_2fa_failed", { targetUser: { id: row.user_id, name: get<{ name: string }>("SELECT name FROM users WHERE id = ?", row.user_id)?.name ?? null }, detail: "API" });
    return fail(401, "bad_code", "Kód nesedí. Zkus to znovu.", rid);
  }
  run("DELETE FROM login_challenges WHERE id = ?", id);
  return reply(issueToken(row.user_id, p.data.device), 200, rid);
}

async function callTool(req: Request, user: User, name: string, args: Record<string, unknown>, rid: string, method: string) {
  const tool = toolByName.get(name);
  if (!tool) return fail(404, "unknown_tool", `Neznámý nástroj: ${name}`, rid);
  if (tool.admin && user.role !== "admin") return fail(403, "admin_only", "Tohle smí jen správce.", rid);
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) return fail(400, "invalid_arguments", "Neplatné argumenty: " + parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "), rid);
  try {
    const data = await tool.run(user, parsed.data);
    // nástroje pro AI vracejí selhání Bakalářů jako { error: "…" }; v API je to řádná chyba
    if (data && typeof data === "object" && Object.keys(data).length === 1 && typeof (data as any).error === "string") {
      const msg = (data as any).error as string;
      return /nejsou propojené/.test(msg) ? fail(409, "bakalari_not_connected", msg, rid) : fail(502, "bakalari_unavailable", msg, rid);
    }
    const out = data === undefined ? { ok: true } : data;
    return method === "GET" ? replyCached(req, out, rid) : reply(out, 200, rid);
  } catch (e) {
    if (e instanceof ServiceError) {
      if (/neexistuje|nenalezen|nenalezena/i.test(e.message)) return fail(404, "not_found", e.message, rid);
      if (/není (u téhle třídy |ve vaší třídě )?(zapnut|zapnuté)|nejsou zapnut|není zapnut|nejsou u téhle třídy zapnut/i.test(e.message)) return fail(409, "module_disabled", e.message, rid);
      return fail(400, "rejected", e.message, rid);
    }
    console.error("api tool failed", name, e);
    return fail(500, "server_error", "Něco se pokazilo na straně serveru.", rid);
  }
}

/** Prázdné tělo je {}; null = neplatný JSON nebo ne objekt. */
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = (await readText(req, 512 * 1024)).trim();
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  const rid = requestId();
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const path = (url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname).replace(/\/+$/, "") || "/";
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: API_HEADERS });

  try {
    // veřejné
    if (path === "/" && method === "GET")
      return reply({ name: "Classmate API", version: "1.0.0", docs: `${originOf(req.headers, req.url)}/dokumentace-api`, openapi: `${originOf(req.headers, req.url)}/api/v1/openapi.json`, login: `${originOf(req.headers, req.url)}/api/v1/auth/login` }, 200, rid);
    if (path === "/openapi.json" && method === "GET") return replyCached(req, openApi(originOf(req.headers, req.url)), rid);
    if (path === "/auth/login" && method === "POST") return await login(req, rid);
    if (path === "/auth/2fa" && method === "POST") return await twoFactor(req, rid);

    const auth = authenticate(req);
    if (!auth) return fail(401, "unauthorized", "Chybí nebo neplatí token. Přihlas se přes /auth/login.", rid, { "WWW-Authenticate": 'Bearer realm="classmate"' });
    const { user } = auth;
    if (!rateLimit(`api:${user.id}`, 600, 60)) return fail(429, "rate_limited", "Příliš mnoho požadavků, zpomal.", rid, { "Retry-After": "60" });

    // přihlášení a zařízení
    if (path === "/auth/me" && method === "GET") return reply({ user: userView(user), device: auth.device ? { id: auth.device.id, name: auth.device.name, platform: auth.device.platform } : null, via: auth.via }, 200, rid);
    if (path === "/auth/logout" && method === "POST") {
      if (auth.device) revokeDevice(auth.device.id);
      return reply({ ok: true, revoked: !!auth.device }, 200, rid);
    }
    if (path === "/auth/devices" && method === "GET") return reply({ devices: listDevices(user.id).map((d) => ({ id: d.id, name: d.name, platform: d.platform, appVersion: d.app_version, createdAt: new Date(d.created_at).toISOString(), lastSeenAt: d.last_seen_at ? new Date(d.last_seen_at).toISOString() : null, current: d.id === auth.device?.id })) }, 200, rid);
    const dev = /^\/auth\/devices\/(\d+)$/.exec(path);
    if (dev && method === "DELETE") {
      revokeUserDevice(user.id, Number(dev[1]));
      return reply({ ok: true }, 200, rid);
    }

    // nástroje
    if (path === "/tools" && method === "GET")
      return replyCached(req, { tools: tools.filter((t) => !t.admin || user.role === "admin").map((t) => ({ name: t.name, title: t.title, description: t.description, readOnly: !!t.annotations.readOnlyHint, destructive: !!t.annotations.destructiveHint, admin: !!t.admin, inputSchema: jsonSchema(t) })) }, rid);
    const tm = /^\/tools\/([\w]+)$/.exec(path);
    if (tm && method === "POST") {
      const body = await readBody(req);
      if (body === null) return fail(400, "invalid_body", "Tělo musí být platný JSON objekt (nebo je moc velké).", rid);
      return await callTool(req, user, tm[1], body, rid, method);
    }

    // hezké cesty
    const m = matchRoute(method, path);
    if (!m) return fail(404, "not_found", "Taková cesta neexistuje. Seznam je v /openapi.json.", rid);
    if ("allowed" in m) return fail(405, "method_not_allowed", "Tahle metoda tu není.", rid, { Allow: m.allowed.join(", ") });
    const tool = toolByName.get(m.route.tool);
    if (!tool) return fail(500, "server_error", "Cesta ukazuje na neexistující nástroj.", rid);
    const props = ((jsonSchema(tool) as any).properties ?? {}) as Record<string, any>;
    const query: Record<string, string[]> = {};
    for (const k of new Set(url.searchParams.keys())) query[k] = url.searchParams.getAll(k);
    let body: Record<string, unknown> = {};
    if (method !== "GET") {
      const b = await readBody(req);
      if (b === null) return fail(400, "invalid_body", "Tělo musí být platný JSON objekt (nebo je moc velké).", rid);
      body = b;
    }
    return await callTool(req, user, m.route.tool, { ...coerce(query, props), ...body, ...(m.route.fixed ?? {}), ...coercePath(m.params, props) }, rid, method);
  } catch (e) {
    if (e instanceof BodyTooLarge) return fail(413, "too_large", "Požadavek je moc velký.", rid);
    console.error("api failed", e);
    return fail(500, "server_error", "Něco se pokazilo na straně serveru.", rid);
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
