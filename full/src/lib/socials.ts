/**
 * Kontakty v profilu (sloupec users.socials, JSON): telefon, e-mail, sociální sítě, hudba a hry, tvorba a vlastní web.
 * Ukládá se jen uživatelské jméno (bez @ a bez adresy), telefon, e-mail nebo adresa webu; odkaz se skládá z pevné šablony,
 * takže se do profilu nedá dostat cizí adresa ani skript.
 */
export type SocialKind = "handle" | "web" | "phone" | "email" | "fediverse";
type Net = { key: string; label: string; group: string; kind: SocialKind; url: ((h: string) => string) | null; hosts: string[]; at: boolean; placeholder?: string };

const net = (key: string, label: string, group: string, url: ((h: string) => string) | null, hosts: string[] = [], at = true, kind: SocialKind = "handle", placeholder?: string): Net => ({ key, label, group, kind, url, hosts, at, placeholder });

export const SOCIAL_GROUPS = ["Kontakt", "Sociální sítě", "Zprávy a chat", "Video a streamování", "Hudba a hry", "Práce a tvorba", "Web"] as const;

export const SOCIALS = [
  net("phone", "Telefon", "Kontakt", (h) => `tel:${h}`, [], false, "phone", "+420 123 456 789"),
  net("email", "E-mail", "Kontakt", (h) => `mailto:${h}`, [], false, "email", "jmeno@example.cz"),

  net("instagram", "Instagram", "Sociální sítě", (h) => `https://www.instagram.com/${h}/`, ["instagram.com"]),
  net("tiktok", "TikTok", "Sociální sítě", (h) => `https://www.tiktok.com/@${h}`, ["tiktok.com"]),
  net("facebook", "Facebook", "Sociální sítě", (h) => `https://www.facebook.com/${h}`, ["facebook.com", "fb.com"], false),
  net("x", "X (Twitter)", "Sociální sítě", (h) => `https://x.com/${h}`, ["x.com", "twitter.com"]),
  net("threads", "Threads", "Sociální sítě", (h) => `https://www.threads.com/@${h}`, ["threads.net", "threads.com"]),
  net("bluesky", "Bluesky", "Sociální sítě", (h) => `https://bsky.app/profile/${h}`, ["bsky.app"], true, "handle", "jmeno.bsky.social"),
  net("mastodon", "Mastodon", "Sociální sítě", null, [], true, "fediverse", "jmeno@mastodon.social"),
  net("reddit", "Reddit", "Sociální sítě", (h) => `https://www.reddit.com/user/${h}`, ["reddit.com"]),
  net("pinterest", "Pinterest", "Sociální sítě", (h) => `https://www.pinterest.com/${h}/`, ["pinterest.com", "pinterest.cz"]),
  net("tumblr", "Tumblr", "Sociální sítě", (h) => `https://www.tumblr.com/${h}`, ["tumblr.com"], false),
  net("linkedin", "LinkedIn", "Sociální sítě", (h) => `https://www.linkedin.com/in/${h}/`, ["linkedin.com"], false),
  net("bereal", "BeReal", "Sociální sítě", null),
  net("snapchat", "Snapchat", "Sociální sítě", (h) => `https://www.snapchat.com/add/${h}`, ["snapchat.com"]),

  net("discord", "Discord", "Zprávy a chat", null, [], false),
  net("telegram", "Telegram", "Zprávy a chat", (h) => `https://t.me/${h}`, ["t.me", "telegram.me"]),
  net("whatsapp", "WhatsApp", "Zprávy a chat", (h) => `https://wa.me/${h.replace(/^\+/, "")}`, [], false, "phone", "+420 123 456 789"),
  net("signal", "Signal", "Zprávy a chat", null, [], true),
  net("messenger", "Messenger", "Zprávy a chat", (h) => `https://m.me/${h}`, ["m.me", "messenger.com"], false),
  net("viber", "Viber", "Zprávy a chat", (h) => `viber://chat?number=${encodeURIComponent(h)}`, [], false, "phone", "+420 123 456 789"),
  net("skype", "Skype", "Zprávy a chat", null, [], false),

  net("youtube", "YouTube", "Video a streamování", (h) => `https://www.youtube.com/@${h}`, ["youtube.com"]),
  net("twitch", "Twitch", "Video a streamování", (h) => `https://www.twitch.tv/${h}`, ["twitch.tv"], false),
  net("kick", "Kick", "Video a streamování", (h) => `https://kick.com/${h}`, ["kick.com"], false),
  net("vimeo", "Vimeo", "Video a streamování", (h) => `https://vimeo.com/${h}`, ["vimeo.com"], false),
  net("letterboxd", "Letterboxd", "Video a streamování", (h) => `https://letterboxd.com/${h}/`, ["letterboxd.com"], false),

  net("spotify", "Spotify", "Hudba a hry", (h) => `https://open.spotify.com/user/${h}`, ["open.spotify.com", "spotify.com"], false),
  net("soundcloud", "SoundCloud", "Hudba a hry", (h) => `https://soundcloud.com/${h}`, ["soundcloud.com"], false),
  net("lastfm", "Last.fm", "Hudba a hry", (h) => `https://www.last.fm/user/${h}`, ["last.fm"], false),
  net("steam", "Steam", "Hudba a hry", (h) => `https://steamcommunity.com/id/${h}`, ["steamcommunity.com"], false),
  net("playstation", "PlayStation", "Hudba a hry", null, [], false),
  net("minecraft", "Minecraft", "Hudba a hry", null, [], false),
  net("strava", "Strava", "Hudba a hry", (h) => `https://www.strava.com/athletes/${h}`, ["strava.com"], false, "handle", "číslo z adresy profilu"),

  net("github", "GitHub", "Práce a tvorba", (h) => `https://github.com/${h}`, ["github.com"], false),
  net("gitlab", "GitLab", "Práce a tvorba", (h) => `https://gitlab.com/${h}`, ["gitlab.com"], false),
  net("behance", "Behance", "Práce a tvorba", (h) => `https://www.behance.net/${h}`, ["behance.net"], false),
  net("dribbble", "Dribbble", "Práce a tvorba", (h) => `https://dribbble.com/${h}`, ["dribbble.com"], false),
  net("medium", "Medium", "Práce a tvorba", (h) => `https://medium.com/@${h}`, ["medium.com"]),

  net("web", "Vlastní web", "Web", (h) => `https://${h}`, [], false, "web", "moje-stranka.cz"),
] as const;

export type SocialKey = (typeof SOCIALS)[number]["key"];
export type Socials = Partial<Record<SocialKey, string>>;

const HANDLE = /^[A-Za-z0-9._-]{2,40}$/;
/** Vlastní web se ukládá jako adresa bez https:// (například „moje.cz/projekty“). */
const WEBSITE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s<>"']*)?$/i;
const PHONE = /^\+?\d{6,15}$/;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const FEDI = /^[A-Za-z0-9_.-]{1,40}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

const find = (key: string): Net | undefined => (SOCIALS as readonly Net[]).find((s) => s.key === key);

/** Telefon: jen číslice a případné + na začátku („+420 123-456 789“ → „+420123456789“); číslo bez předvolby se bere jako české. */
export function cleanPhone(raw: string): string | null {
  let v = raw.trim().replace(/[\s().-]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (/^\d{9}$/.test(v)) v = `+420${v}`;
  return PHONE.test(v) ? v : null;
}

/** Telefon pro zobrazení: české a slovenské číslo po trojicích („+420 123 456 789“), ostatní beze změny. */
export function showPhone(v: string): string {
  const m = v.match(/^(\+42[01])(\d{3})(\d{3})(\d{3})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : v;
}

/** Z psané adresy (s https:// i bez) udělá „domena/cesta“, nebo null, když to není rozumná veřejná adresa webu. */
export function cleanWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 100) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || /^\d+(\.\d+){3}$/.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return null;
    const out = `${host}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}${u.search}`;
    return out.length <= 100 && WEBSITE.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** Z psaného textu (jméno, @jméno, telefon, e-mail nebo odkaz na profil) vytáhne hodnotu k uložení, nebo null, když to nedává smysl. */
export function cleanHandle(key: SocialKey, raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  const n = find(key);
  if (!n) return null;
  if (n.kind === "web") return cleanWebsite(v);
  if (n.kind === "phone") return cleanPhone(v);
  if (n.kind === "email") return EMAIL.test(v) && v.length <= 120 ? v.toLowerCase() : null;
  if (n.kind === "fediverse") {
    v = v.replace(/^@/, "");
    return FEDI.test(v) ? v.toLowerCase() : null;
  }
  if (/^https?:\/\//i.test(v) || n.hosts.some((h) => v.toLowerCase().startsWith(h) || v.toLowerCase().startsWith(`www.${h}`))) {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      if (!n.hosts.some((h) => host === h)) return null;
      v = u.pathname.split("/").filter(Boolean).filter((p) => p !== "add").pop() ?? "";
    } catch {
      return null;
    }
  }
  v = v.replace(/^@/, "");
  if (key === "discord") v = v.toLowerCase();
  return HANDLE.test(v) ? v : null;
}

/** Hodnota tak, jak se ukazuje v profilu (s @ tam, kde se píše). */
export function showSocial(key: SocialKey, v: string): string {
  const n = find(key);
  if (!n) return v;
  if (n.kind === "phone") return showPhone(v);
  if (n.kind === "fediverse") return `@${v}`;
  return n.at && n.kind === "handle" ? `@${v}` : v;
}

/** Odkaz pro uloženou hodnotu, nebo null (Discord, Signal a podobné sítě nemají veřejný odkaz). */
export function socialHref(key: SocialKey, v: string): string | null {
  const n = find(key);
  if (!n) return null;
  if (n.kind === "fediverse") {
    const [user, host] = v.split("@");
    return `https://${host}/@${user}`;
  }
  return n.url ? n.url(v) : null;
}

export function parseSocials(json: string | null | undefined): Socials {
  if (!json) return {};
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const out: Socials = {};
    for (const s of SOCIALS) {
      const v = o[s.key];
      if (typeof v !== "string") continue;
      const ok = s.kind === "web" ? WEBSITE.test(v) && v.length <= 100 : s.kind === "phone" ? PHONE.test(v) : s.kind === "email" ? EMAIL.test(v) && v.length <= 120 : s.kind === "fediverse" ? FEDI.test(v) : HANDLE.test(v);
      if (ok) out[s.key] = v;
    }
    return out;
  } catch {
    return {};
  }
}
