import { SOCIALS, type SocialKey } from "@/lib/socials";

const COLOR: Record<string, string> = {
  phone: "var(--accent)", email: "var(--accent)", whatsapp: "#25d366", telegram: "#2aabee", signal: "#3a76f0", messenger: "#0a7cff", viber: "#7360f2", skype: "#00aff0", discord: "#5865f2",
  instagram: "#e1306c", tiktok: "currentColor", facebook: "#1877f2", x: "currentColor", threads: "currentColor", bluesky: "#1185fe", mastodon: "#6364ff", reddit: "#ff4500", pinterest: "#e60023", tumblr: "#36465d", linkedin: "#0a66c2", bereal: "currentColor", snapchat: "#f5c400",
  youtube: "#ff2d2d", twitch: "#9146ff", kick: "#53fc18", vimeo: "#1ab7ea", letterboxd: "#00b020",
  spotify: "#1db954", soundcloud: "#ff5500", lastfm: "#d51007", steam: "currentColor", playstation: "#0070d1", minecraft: "#62a63a", strava: "#fc4c02",
  github: "currentColor", gitlab: "#fc6d26", behance: "#1769ff", dribbble: "#ea4c89", medium: "currentColor", web: "var(--accent)",
};
/** Barva ikony u každé sítě (tmavé značky mají barvu textu, ať jsou vidět v obou režimech). */
export const socialColor = (key: string) => COLOR[key] ?? "var(--accent)";

const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Jednoduché čárové ikony sítí (nejsou to přesná loga, jen rozpoznatelné značky). */
export function SocialIcon({ name, size = 18 }: { name: SocialKey; size?: number }) {
  let body;
  switch (name) {
    case "instagram":
      body = (<><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" /></>);
      break;
    case "tiktok":
      body = <path d="M14 3.5v11a3.6 3.6 0 1 1-3.6-3.6M14 3.5c.3 2.4 1.9 4 4.5 4.3" />;
      break;
    case "snapchat":
      body = <path d="M12 3.5c-2.8 0-4.5 2-4.5 4.6v2.2c-.9.4-2 .4-2.6.5.7 1 1.6 1.2 2.6 1.4-.4 1.4-1.6 2-2.7 2.4.9.7 2 .7 3.2.9.4.6.9 1.2 2 1.2s1.6-.6 2-1.2c1.2-.2 2.3-.2 3.2-.9-1.1-.4-2.3-1-2.7-2.4 1-.2 1.9-.4 2.6-1.4-.6-.1-1.7-.1-2.6-.5V8.1c0-2.6-1.7-4.6-4.5-4.6z" />;
      break;
    case "discord":
      body = (<><path d="M7 6.5c1.5-.7 3-1 5-1s3.5.3 5 1c1.3 2.3 2.2 5 2.4 8.3-1 .9-2.3 1.7-3.8 2.2l-.9-1.5c.5-.2 1-.5 1.4-.8M7 6.5C5.7 8.8 4.8 11.5 4.6 14.8c1 .9 2.3 1.7 3.8 2.2l.9-1.5c-.5-.2-1-.5-1.4-.8M8.5 14.5c2.2.8 4.8.8 7 0" /><circle cx="9.3" cy="11.3" r="1" fill="currentColor" /><circle cx="14.7" cy="11.3" r="1" fill="currentColor" /></>);
      break;
    case "x":
      body = <path d="M5 4.5l14 15M19 4.5L5 19.5" />;
      break;
    case "youtube":
      body = (<><rect x="3" y="5.5" width="18" height="13" rx="4" /><path d="M10.2 9.4v5.2l4.4-2.6z" fill="currentColor" /></>);
      break;
    case "github":
      body = <path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5M13.3 5l-2.6 14" />;
      break;
    case "twitch":
      body = <path d="M5 3.5L3.5 7v12.5H8V22h2.5l2.5-2.5h3.5l4.5-4.5V3.5zM12 8.5v4M16.5 8.5v4" />;
      break;
    case "phone":
      body = <path d="M6.6 3.5h2.8l1.4 3.7-1.8 1.3a11 11 0 0 0 5.5 5.5l1.3-1.8 3.7 1.4v2.8a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />;
      break;
    case "email":
      body = (<><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M3.8 7.5l8.2 6 8.2-6" /></>);
      break;
    case "whatsapp":
      body = (<><path d="M4 20l1.2-4.1A8.3 8.3 0 1 1 8.2 18.9z" /><path d="M9.2 8.9c.4 2.6 2.6 4.8 5.4 5.7l1-1.3-1.9-1-.8.7a4 4 0 0 1-1.9-1.9l.7-.8-1-1.9z" /></>);
      break;
    case "telegram":
      body = <path d="M20.5 4.5L3.7 11l4.6 1.7 1.7 5.3 2.6-3.2 4.2 3.1zM8.3 12.7l8.6-5.4-6.9 6.5" />;
      break;
    case "facebook":
      body = <path d="M14 21v-8h2.7l.5-3.3H14V7.8c0-1 .5-1.7 1.8-1.7h1.6V3.3A18 18 0 0 0 15 3c-2.4 0-4.1 1.5-4.1 4.2v2.5H8.2V13h2.7v8z" />;
      break;
    case "linkedin":
      body = (<><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 10.5V16M8 7.9v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1 1 2.1 2.5V16" /></>);
      break;
    case "reddit":
      body = (<><ellipse cx="12" cy="14" rx="7.5" ry="5" /><circle cx="9.3" cy="13.3" r="0.9" fill="currentColor" /><circle cx="14.7" cy="13.3" r="0.9" fill="currentColor" /><path d="M9.5 16c1.4.9 3.6.9 5 0M12 9l.9-4.3 3.2.8M18.5 11.2a1.8 1.8 0 1 0-1.4-3M5.5 11.2a1.8 1.8 0 1 1 1.4-3" /></>);
      break;
    case "spotify":
      body = (<><circle cx="12" cy="12" r="8.5" /><path d="M7.5 9.8c3.2-1 6.7-.7 9.5 1M8 12.6c2.7-.8 5.5-.5 7.9.9M8.6 15.3c2.1-.6 4.1-.4 6 .6" /></>);
      break;
    case "threads":
      body = <path d="M17.5 11.4c-.4-3-2.3-4.7-5.2-4.7-3 0-4.8 2.2-4.8 5.3s1.9 5.3 4.8 5.3c2.4 0 4-1.2 4-3 0-1.9-1.7-2.7-3.6-2.7-1.4 0-2.3.6-2.3 1.5 0 .8.7 1.3 1.6 1.3 1.6 0 2.5-1.2 2.5-3.6" />;
      break;
    case "bluesky":
      body = <path d="M12 11c-1.2-2.4-3.5-5-6-5.5-1.2-.2-1.5 1.5-1.2 3 .4 1.8 1.7 2.7 3.4 3-2 .4-3 1.5-1.8 3.1 2 2.5 4 .3 5.6-2.1 1.6 2.4 3.6 4.6 5.6 2.1 1.2-1.6.2-2.7-1.8-3.1 1.7-.3 3-1.2 3.4-3 .3-1.5 0-3.2-1.2-3-2.5.5-4.8 3.1-6 5.5z" />;
      break;
    case "steam":
      body = (<><circle cx="12" cy="12" r="8.5" /><circle cx="15" cy="10" r="2" /><circle cx="9.2" cy="15" r="1.6" /><path d="M10.5 13.6l3.1-2.6" /></>);
      break;
    case "web":
    case "discord_web":
      body = (<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5S14.5 18.1 12 20.5M12 3.5C9.5 5.9 8.4 8.7 8.4 12s1.1 6.1 3.6 8.5" /></>);
      break;
    default:
      // ostatní sítě: čtvereček s počátečním písmenem
      body = (<><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">{(SOCIALS.find((x) => x.key === name)?.label ?? "?").charAt(0).toUpperCase()}</text></>);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" {...common}>
      {body}
    </svg>
  );
}
