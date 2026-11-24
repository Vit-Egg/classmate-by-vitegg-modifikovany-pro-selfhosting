/* Service worker Classmate: offline režim (naposledy otevřené stránky), rychlé načítání statických souborů a Web Push.
   Při změně tohoto souboru zvyš V, staré cache se pak samy smažou. */
const V = "v5";
const STATIC = `classmate-static-${V}`;
const PAGES = `classmate-pages-${V}`;
const OFFLINE = "/offline.html";
const MAX_PAGES = 120;
const MAX_STATIC = 400;
// při pomalém připojení se po této době ukáže uložená stránka (síť dál běží a stránku v pozadí obnoví)
const SLOW_MS = 4000;

// Lokální vývoj (next dev na localhost) nesmí cachovat, jinak by se tam držely staré soubory.
const DEV = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

// Stránky aplikace, které se po úspěšném otevření uloží pro offline režim. Všechno ostatní jde vždy ze sítě.
const APP_PAGE = /^\/(dnes|rozvrh|kalendar|ukoly|testy|testy-a-zkouseni|predmety|poznamky|znamky|absence|nastaveni|komunikace|nastenka|obedy|studium)(\/|$)/;
// stahování a přehrávání souborů (nahrávky, export poznámky, export dat) se nikdy nezachytává
const FILES = /\/(audio|obrazek|stahnout|data|priloha|pripojit)(\/|$)/;
const PUBLIC_PAGE = /^\/(zasady-ochrany-osobnich-udaju|pravidla-pouzivani)?$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE, "/icon-192.png", "/icon.svg"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== STATIC && k !== PAGES) await caches.delete(k);
      // Navigation preload se nepoužívá: při výpadku sítě by jeho neúspěšný požadavek v Android WebView vyvolal chybu načtení, i když stránku service worker úspěšně vrátí z uložených.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

const isStatic = (u) => u.pathname.startsWith("/_next/static/") || /^\/(icon|apple-touch-icon|manifest)/.test(u.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (DEV || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Statické soubory mají v názvu otisk obsahu, takže stačí cache-first.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy)).then(() => trim(STATIC, MAX_STATIC));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Otevření stránky: nejdřív síť, při výpadku nebo pomalém připojení naposledy uložená verze, jinak offline stránka.
  if (req.mode === "navigate" && !FILES.test(url.pathname) && (APP_PAGE.test(url.pathname) || PUBLIC_PAGE.test(url.pathname))) {
    event.respondWith(
      (async () => {
        const key = url.pathname + url.search;
        const cached = async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(key)) || (await cache.match(url.pathname));
        };
        const network = (async () => {
          if (self.navigator && self.navigator.onLine === false) throw new Error("offline"); // bez sítě se o ni ani nepokouší
          const res = await fetch(req);
          // jen skutečně načtená stránka (ne přesměrování na přihlášení ani chyba)
          if (res.ok && !res.redirected && (res.headers.get("content-type") || "").includes("text/html") && APP_PAGE.test(url.pathname)) {
            const copy = res.clone();
            const saving = storePage(key, copy).catch(() => {});
            try {
              event.waitUntil(saving); // po předání odpovědi už to nemusí jít, ukládání pak doběhne samo
            } catch {}
          }
          return res;
        })();
        const hit = await cached();
        // uložená stránka existuje: při pomalé síti se ukáže hned po SLOW_MS, jinak se čeká na síť
        if (hit && APP_PAGE.test(url.pathname)) {
          const slow = new Promise((resolve) => setTimeout(() => resolve(hit), SLOW_MS));
          return Promise.race([network.catch(() => hit), slow]);
        }
        try {
          return await network;
        } catch {
          if (hit) return hit;
          // v aplikaci (Android WebView) selhání převezme nativní offline stránka s posledními daty
          if (/; wv\)/.test(self.navigator.userAgent)) return Response.error();
          return (await caches.match(OFFLINE)) || Response.error();
        }
      })(),
    );
  }
});

/** Uloží stránku a soubory, které potřebuje k oživení (JS a CSS), ať se offline nejen zobrazí, ale i funguje. */
async function storePage(key, res) {
  const html = await res.clone().text();
  const cache = await caches.open(PAGES);
  await cache.put(key, res);
  await trim(PAGES, MAX_PAGES);
  // JS a CSS, které stránka potřebuje (v HTML i v datech pro klientské přechody); názvy mohou obsahovat závorky, např. app/(app)/ukoly
  const found = html.match(/(?:\/_next\/)?static\/(?:chunks|css)\/[^"'\s\\]+?\.(?:js|css)/g) || [];
  const assets = [...new Set(found.map((a) => (a.startsWith("/_next/") ? a : "/_next/" + a)))];
  const statics = await caches.open(STATIC);
  await Promise.all(
    assets.map(async (a) => {
      if (await statics.match(a)) return;
      try {
        const r = await fetch(a);
        if (r.ok) await statics.put(a, r);
      } catch {}
    }),
  );
  await trim(STATIC, MAX_STATIC);
}

/** Stáhne stránky dopředu (aby byly k dispozici offline, i když je uživatel ještě neotevřel). Vrací počet uložených. */
async function precache(urls) {
  let saved = 0;
  for (const u of urls) {
    try {
      const url = new URL(u, self.location.origin);
      if (url.origin !== self.location.origin || !APP_PAGE.test(url.pathname) || FILES.test(url.pathname)) continue;
      const res = await fetch(url.pathname + url.search, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (res.ok && !res.redirected && (res.headers.get("content-type") || "").includes("text/html")) {
        await storePage(url.pathname + url.search, res);
        saved++;
      }
    } catch {
      break; // bez sítě nemá smysl pokračovat
    }
  }
  return saved;
}

self.addEventListener("message", (event) => {
  const t = event.data && event.data.type;
  // po odhlášení se uložené stránky smažou, aby na sdíleném zařízení nezůstaly cizí data
  if (t === "CLEAR_PAGES") event.waitUntil(caches.delete(PAGES));
  if (t === "SKIP_WAITING") self.skipWaiting();
  if (t === "PRECACHE" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      precache(event.data.urls.slice(0, 60)).then((n) => event.source && event.source.postMessage({ type: "PRECACHED", saved: n, at: Date.now() })),
    );
  }
});

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "Classmate", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title || "Classmate", {
        body: d.body || "",
        tag: d.tag || undefined,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        lang: "cs",
        data: { url: d.url || "/dnes" },
      });
      // odznak na ikoně aplikace (přesný počet nastaví aplikace po otevření)
      if (self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge().catch(() => {});
    })(),
  );
});

// prohlížeč odběr změnil nebo zrušil: obnovit ho a poslat serveru (cookie se pošlou, je to stejný původ)
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
      const sub = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
      if (sub) await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()), credentials: "same-origin" });
    })().catch(() => {}),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/dnes", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
