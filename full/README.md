# Classmate (plná verze pro jednoho člověka)

Původní Classmate se vším: rozvrh a suplování, **úkoly, testy a zkoušení, poznámky** (LaTeX, tabule, nahrávky, spolupráce), studium s AI, kalendář, známky, absence, Komens, obědy ze **Strava.cz**, Todoist, MCP server, trofeje a oznámení. Upravené pro **jeden účet** na vlastním serveru.

**Oproti původnímu Classmate chybí:** registrace a další účty, spolužáci, nástěnka třídy, třídní služby, pokladna, žebříček, sdílení známek a rozvrhu se spolužáky, demo. Správa je zjednodušená na jednu školu.

**Navíc:** widgety a plugin pro nový Classmate (stránka **Widgety**, viz níže).

## Spuštění

```bash
cp .env.example .env     # APP_SECRET, PUBLIC_URL, EMBED_ORIGINS, volitelně SETUP_TOKEN
docker compose -f docker-compose.tunnel.yml up -d --build   # za Cloudflare Tunnelem (CasaOS apod.)
# nebo docker compose up -d --build (s Caddy a automatickým HTTPS), nebo docker-compose.lan.yml pro domácí síť
```

Bez Dockeru: `npm install && npm run build && npm start` (Node 22+).

1. Otevři adresu serveru. Průvodce prvním spuštěním (`/zprovozneni`) chce instalační kód (`SETUP_TOKEN`, jinak je v logu) a vytvoří tvůj účet, školu (s adresou Bakalářů) a třídu.
2. **Nastavení → Propojení:** přihlas se do Bakalářů, propoj Strava.cz (číslo jídelny, volitelně jméno a heslo pro objednávání) a případně Todoist.
3. **Správa:** klíče pro AI (Gemini), pošta, stav serveru, audit log.

## Widgety pro nový Classmate

Stránka **Widgety** (v menu) ukáže adresu pluginu `/embed/widgets.json?k=…`. V novém Classmate: **Nastavení → Pluginy → Přidat plugin z adresy**. Nabídne rozvržení „Klasický Classmate“.

Widgety: `rozvrh`, `suplovani`, `znamky`, `prumery`, `absence`, `komens`, `obedy`, `ukoly`, `testy` na adrese `/embed/<widget>?k=…`, parametry `&theme=light|dark` a `&bg=transparent`. Propojení bez kopírování adres: `/classmate/connect?origin=<adresa Classmate>` (po přihlášení a potvrzení se adresa pošle přes `postMessage`).

- Klíč `k` otevře jen widgety a manifest. Vyměníš ho na stránce Widgety.
- Vložit widgety smí jen tento server a domény z `EMBED_ORIGINS` (`frame-ancestors`), manifest dostanou přes CORS taky jen ony.
- Widgety čtou jen z paměti serveru, Bakaláře kvůli nim nevolají. Kód: `src/lib/embed/`, `src/app/embed/`.

## Upozornění

Neoficiální klient Bakalářů (rozhraní mobilní aplikace) a Strava.cz. Hostuj si ho jen pro sebe s vlastním účtem, data nesdílej s dalšími lidmi a používej ho na vlastní odpovědnost.

## Architektura

- **Next.js 15 (App Router) + TypeScript**, server actions, žádné API vrstvy navíc.
- **SQLite** (`better-sqlite3`, WAL) v `DATA_DIR`. Schéma se mění jen přidáním migrace do `src/lib/migrations.ts`.
- `src/lib/bakalari.ts` – klient API Bakalářů · `normalize.ts` – převod odpovědí · `sync.ts` – cache, tokeny, mapování předmětů a skupin.
- Heslo do Bakalářů se **neukládá**; drží se jen refresh token šifrovaný AES-256-GCM (`APP_SECRET` / `data/.secret`).
- Hesla: scrypt. Relace: náhodný token v httpOnly cookie, v DB jen jeho hash. 2FA: TOTP (RFC 6238) + 10 jednorázových záložních kódů, ochrana proti opakování kódu a rate limit.
- Úkoly, testy a zkoušení mají `group_id` (NULL = celá třída), takže u předmětů dělených na skupiny je vidí jen ta správná skupina.

## Než to půjde ven na internet

- Nastav `APP_SECRET` a zálohuj `DATA_DIR` (databáze + klíč).
- Provozuj za HTTPS (cookies jsou `secure`); v LAN přes http dej `COOKIE_SECURE=false`.
- Běží jedna instance (cache tokenů a zámky jsou v paměti procesu). Při škálování přesunout na Redis a SQLite na Postgres – přístup k DB je soustředěný v `src/lib/db.ts`.

## MCP server (AI asistenti)

Aplikace je zároveň vzdálený **MCP server** (Streamable HTTP) na adrese `https://<tvoje-doména>/mcp`.
**Společná úprava poznámek:** vlastník pozve spolužáka z třídy (tabulka `note_collaborators`), který poznámku vidí a upravuje s ním v reálném čase. Text se u takové poznámky drží jako sdílený dokument (Yjs, tabulka `note_ydocs`), prohlížeče se připojují přes SSE (`/poznamky/[id]/spoluprace`, příchozí změny) a POST (odchozí), takže to nepotřebuje WebSocket a projde Cloudflare Tunnelem. Server drží „místnost“ poznámky v paměti (`src/lib/collab.ts`, jediný proces, stejně jako SQLite), změny po chvíli zapisuje do `notes.content`, takže hledání, historie, stažení a MCP fungují beze změny. Poznámka bez spolupracovníků se ukládá jako dřív.

AI (Claude, ChatGPT, Cursor, …) se připojí jako uživatel a může dělat **přesně to, co on v aplikaci**: rozvrh, známky, úkoly, testy a zkoušení, poznámky (Markdown), synchronizaci; správce navíc i správu škol, tříd a uživatelů.
AI umí všechno, co uživatel v aplikaci, se stejnými právy a omezeními (nástroje volají stejnou logiku jako web): kromě výše uvedeného třeba Komens, jídelníček a objednávky obědů, Pokladnu (člen i pokladník), třídní služby, spolužáky, koš a historii poznámek, odběr kalendáře, nastavení oznámení a volby zobrazení; správce navíc seznamy studentů tříd, služby, oznámení a role. Nejsou k dispozici akce vyžadující heslo nebo vložení přihlašovacích údajů (změna e-mailu a hesla, 2FA, propojení Bakalářů, Strava.cz a Todoistu, smazání účtu), nahrávání souborů (nahrávky, obrázky, profilovka, import poznámky), nastavení tajných klíčů (AI, Stripe, pošta školy), školní e-mail a Teams a generování Studia.

- **Přihlášení:** OAuth 2.1 (authorization code + PKCE S256, dynamická registrace klientů, refresh tokeny). Při připojení se uživatel přihlásí (včetně 2FA) a schválí přístup.
- **Připojení:** v AI aplikaci přidej vlastní konektor / MCP server s adresou `https://<tvoje-doména>/mcp`; zbytek proběhne sám. Připojené aplikace se spravují v Nastavení → AI aplikace.
- **Nastav `PUBLIC_URL`** (např. `https://aplikace.classmate.cz`), aby metadata OAuth ukazovala na správnou veřejnou adresu i za proxy / tunelem.
- Zdrojový kód: `src/lib/mcp/tools.ts` (nástroje), `src/app/mcp/route.ts` (protokol), `src/lib/oauth.ts` (OAuth), `src/lib/services.ts` (logika sdílená s webem).

## Tréninkový deník (Aktivní sportovec)

Volitelný modul pro školu (ne třídu): správce ho zapne ve Správě u školy (Moduly školy), každý student si ho pak zapne sám v Nastavení → Propojení. Student zapisuje aktivity a týdenní reflexe (ručně, nebo načtením z Intervals.icu osobním API klíčem, který se ukládá šifrovaně) a stáhne si tabulku Sportovní deník. Tabulka se vyplňuje ze školní šablony `public/sportovni-denik-sablona.xlsx` (vzorce, výběry i list Hodnocení zůstávají; do jednoho pololetí se vejde 160 zápisů a 24 reflexí). Pololetí: 1. září–31. ledna a 1. února–31. srpna. Aktivity ze Stravy Intervals.icu přes API nepředává.

## Zprávy
Aplikace sama hlídá změny a ukládá je jako zprávy (zvoneček vlevo nahoře u názvu, klávesa `m`): suplování, zrušené hodiny a změny učeben, nové známky, nová absence a úkoly, testy či zkoušení od spolužáků. Kategorie jde v Nastavení vypnout.
Aby zprávy přišly i bez otevřené aplikace, běží na serveru synchronizace na pozadí každých `BACKGROUND_SYNC_MINUTES` minut (výchozí 15, `0` = vypnuto) pro uživatele aktivní v posledních 14 dnech. Počítej s tím, že to zvyšuje počet dotazů na Bakaláře (4 na uživatele a běh).

## Push upozornění (Web Push)
Zprávy umí přijít i do zavřeného prohlížeče nebo na telefon. Uživatel je zapne v Nastavení → Zprávy pro konkrétní zařízení.
- Vyžaduje **HTTPS** (u tebe ho zajišťuje Cloudflare), na iPhonu a iPadu navíc přidání Classmate na plochu.
- Klíče VAPID se samy vygenerují do `data/.vapid.json` (součást záloh). Změna klíčů zneplatní všechny odběry. Lze je zadat i přes `VAPID_PUBLIC_KEY` a `VAPID_PRIVATE_KEY`.
- Audit log: ve Správě → Audit log vidí správce, kdo a kdy se přihlásil, změnil zabezpečení účtu nebo udělal zásah ve správě (včetně IP adresy; hesla ani obsah se nezapisují). Záznamy se drží `AUDIT_RETENTION_DAYS` dní (výchozí 365), při smazání účtu se z nich odstraní jméno a IP.
- Noční klid: mezi 22. a 6. hodinou se upozornění neposílají (zprávy zůstanou ve Zprávách). Změníš v `PUSH_QUIET_HOURS` (např. `23-5`, nebo `off`).
- Když přijde víc než 3 zprávy za minutu, pošle se jen jedno shrnutí.
- Adresy odběrů jsou omezené na známé push služby Googlu, Mozilly, Applu a Microsoftu (proti zneužití serveru k posílání požadavků). Další hosty jen pro testy: `PUSH_ALLOWED_HOSTS`.

## Telefon
Celá aplikace je přizpůsobená telefonu: spodní lišta (Dnes, Rozvrh, Úkoly, Známky a „Více“ pro zbytek), název a zvoneček nahoře, rozvrh po dnech místo široké mřížky, dialogy a okna jako spodní panely, větší políčka (16 px, ať iPhone nepřibližuje stránku). Na iPhonu a Androidu jde Classmate přidat na plochu jako aplikaci.

## Úvodní stránka

Server nemá veřejnou úvodní stránku: `/` pošle nový server na průvodce, přihlášeného do aplikace a ostatní na přihlášení. Prezentace, SEO a kontaktní formulář jsou v projektu classmate-landing. Server se kvůli tomu neindexuje (`robots.txt` zakazuje vše, odpovědi mají `noindex`).

## Aplikace (PWA)

Classmate jde nainstalovat na plochu telefonu i počítače (Nastavení → Aplikace). `public/manifest.webmanifest` popisuje aplikaci (ikony včetně maskable, zkratky na ploše, cíl systémového „Sdílet“ na `/sdilet`). `public/sw.js` zajišťuje:

- **offline režim**: naposledy otevřené stránky aplikace se uloží a při výpadku připojení se ukážou (nahoře je lišta „Jsi offline“), neznámá stránka ukáže `offline.html`. Po odhlášení se uložené stránky smažou.
- **rychlé načítání** statických souborů (cache-first),
- **Web Push** a odznak s počtem zpráv na ikoně,
- **aktualizace**: nová verze se stáhne sama a aplikace nabídne „Obnovit“.

Na `localhost` se nic necachuje (kvůli vývoji). Změníš-li `sw.js`, zvyš v něm konstantu `V`, ať se staré cache smažou.

## Mobilní aplikace (Android)

Samostatný projekt [classmate-app](https://github.com/classmatecz/classmate-app): nativní obal kolem tohoto webu, který se nemusí aktualizovat při změně webu. Navíc umí push oznámení, trvalou notifikaci s průběhem dne („Zvonění za 14:03“) a widget. Server k tomu poskytuje:

- `POST /api/app/device` (přihlášená stránka v aplikaci spáruje zařízení a dostane token; v databázi je jen jeho otisk), `PUT`/`DELETE` (Bearer token zařízení),
- `GET /api/app/snapshot` (rozvrh a hotové texty pro widget a notifikaci, popis v classmate-app/contract/snapshot.md; texty vznikají ze stejných funkcí jako na webu, `src/lib/app-snapshot.ts`),
- push přes Firebase (`src/lib/fcm.ts`): zapne se uložením účtu služby do `/data/.fcm.json` ve volume (v Dockeru `docker compose cp`, mimo Docker i `FCM_SERVICE_ACCOUNT` s cestou k souboru). Bez toho vše funguje, jen nechodí push do aplikace. Postup: classmate-app/docs/FIREBASE.md.

Aplikaci poznáš v User-Agentu (`ClassmateApp/<verze>`); v Nastavení pak místo instalace PWA a Web Push ukazuje nastavení aplikace. Změnou hesla a odhlášením uživatele všude se zařízení aplikace odpojí.

## Samostudium

Hodina s učebnou `SamS` v Bakalářích znamená samostudium: student je doma a do školy chodit nemusí. Aplikace ji ukazuje čárkovaně s označením „Doma“, nepočítá ji do začátku ani konce školního dne (logika v `src/lib/schedule.ts`, pomocné funkce v `src/lib/selfstudy.ts`) a v textech a zprávách ji nazývá samostudiem.
