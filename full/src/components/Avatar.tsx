import { avatarUrl, avatarVersion } from "@/lib/avatar";
import { AvatarZoom } from "./AvatarZoom";

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/** Kolečko s profilovkou, nebo s iniciálami, když ji člověk nemá. Velikost a vzhled určuje třída (výchozí je kolečko ze seznamu služeb). */
export function Avatar({ id, name, className = "duty-av" }: { id: number; name: string; className?: string }) {
  const v = avatarVersion(id);
  return (
    <span className={className}>
      {v ? <img className="av-img" src={avatarUrl(id, v)} alt="" loading="lazy" decoding="async" /> : initialsOf(name)}
    </span>
  );
}

/** Velká profilovka, na kterou jde kliknout a zvětšit ji (bez fotky jsou jen iniciály, není co zvětšovat). */
export function AvatarBig({ id, name, className = "duty-av" }: { id: number; name: string; className?: string }) {
  const v = avatarVersion(id);
  const av = <Avatar id={id} name={name} className={className} />;
  return v ? <AvatarZoom src={avatarUrl(id, v)} name={name}>{av}</AvatarZoom> : av;
}
