/** Stahování stránek dopředu pro offline režim v aplikaci (service worker je uloží; viz public/sw.js). Jen v prohlížeči. */
const KEY = "classmate:offline-prefetch";
const EVERY = 3 * 60 * 60 * 1000;
const CORE = ["/dnes", "/rozvrh", "/ukoly", "/testy-a-zkouseni", "/znamky", "/absence", "/kalendar", "/predmety", "/poznamky", "/obedy", "/komunikace", "/nastenka", "/nastaveni"];
const MAX_NOTES = 25;

/** Aplikace v telefonu (WebView) nebo nainstalovaná PWA; v běžném prohlížeči se nic nestahuje na zapas. */
const wantsOffline = () => !!window.ClassmateNative || window.matchMedia("(display-mode: standalone)").matches;

const saveData = () => !!(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;

/** Odkazy na poznámky ze seznamu poznámek (nejnovější první, jak je řadí stránka). */
async function noteLinks(): Promise<string[]> {
  try {
    const html = await (await fetch("/poznamky", { credentials: "same-origin" })).text();
    const ids = [...html.matchAll(/href="(\/poznamky\/[A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
    return [...new Set(ids)].slice(0, MAX_NOTES);
  } catch {
    return [];
  }
}

/** Po otevření aplikace (nejvýš jednou za pár hodin) uloží hlavní stránky a poslední poznámky, ať jsou k dispozici i bez internetu. */
export async function prefetchForOffline(force = false) {
  if (!wantsOffline() || !navigator.onLine || saveData() || !("serviceWorker" in navigator)) return;
  try {
    const last = Number(localStorage.getItem(KEY) || 0);
    if (!force && Date.now() - last < EVERY) return;
    const reg = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) return;
    // čas se zapíše až po potvrzení od service workeru, takže nepovedené stahování se zkusí znovu při dalším otevření
    const done = (e: MessageEvent) => {
      if (e.data?.type !== "PRECACHED") return;
      navigator.serviceWorker.removeEventListener("message", done);
      if (e.data.saved > 0) localStorage.setItem(KEY, String(Date.now()));
    };
    navigator.serviceWorker.addEventListener("message", done);
    sw.postMessage({ type: "PRECACHE", urls: [...CORE, ...(await noteLinks())] });
  } catch {
    /* offline je jen bonus, nesmí nic rozbít */
  }
}

/** Po odhlášení se čas posledního stažení zapomene, ať se po dalším přihlášení stáhne všechno znovu. */
export const forgetPrefetch = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {}
};
