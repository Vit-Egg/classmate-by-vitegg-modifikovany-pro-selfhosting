/** Most k nativní části mobilní aplikace (`window.ClassmateNative`). V prohlížeči neexistuje; popis kontraktu: classmate-app/docs/BRIDGE.md. */
export type NativeInfo = {
  platform: "android" | "ios";
  version: string;
  device: string;
  linked: boolean;
  fcmToken: string | null;
  pushAvailable: boolean;
  /** je zapnutá trvalá notifikace „Průběh dne“ */
  live: boolean;
  /** má aplikace v systému povolená oznámení */
  notifications: boolean;
  /** zapnuté automatické Nerušit během hodin a zda má aplikace přístup k režimu Nerušit (od verze 1.0.20) */
  dnd?: boolean;
  dndAccess?: boolean;
  /** smí aplikace plánovat přesné budíky (změna hodiny na vteřinu přesně) */
  exactAlarms: boolean;
  /** smí aplikace nabídnout přidání widgetu na plochu (pinWidget); starší verze aplikace pole nemají */
  canPinWidgets?: boolean;
  /** widgety, které aplikace umí (starší verze pole nemají) */
  widgets?: string[];
  /** adresa serveru, ke kterému je aplikace připojená (od verze 1.0.10) */
  server?: string;
  canChangeServer?: boolean;
};

export type ClassmateNative = {
  info(): string;
  link(deviceToken: string): void;
  unlink(): void;
  setLive(enabled: boolean): void;
  requestNotifications(): void;
  openSettings(what: "notifications" | "exact" | "dnd"): void;
  setBars(color: string, lightBackground: boolean): void;
  refresh(): void;
  /** nabídne přidání widgetu na plochu; od verze 1.0.8 */
  pinWidget?(kind: string): boolean;
  /** zapne/vypne Nerušit během hodin; od verze 1.0.20 */
  setDnd?(enabled: boolean): void;
  /** otevře výběr serveru; od verze 1.0.10 */
  changeServer?(): void;
};

declare global {
  interface Window {
    ClassmateNative?: ClassmateNative;
  }
}

export const getNative = () => (typeof window === "undefined" ? undefined : window.ClassmateNative);

export function nativeInfo(): NativeInfo | null {
  try {
    const raw = getNative()?.info();
    const i = raw ? (JSON.parse(raw) as Partial<NativeInfo>) : null;
    return i && i.platform ? (i as NativeInfo) : null;
  } catch {
    return null;
  }
}
