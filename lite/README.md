# Classmate lite

Odlehčená verze Classmate jen s tím, co se bere z **Bakalářů** a **Strava.cz**, pro jednoho člověka na vlastním serveru:

- **Přehled** poskládaný z widgetů
- **Rozvrh** (tento a příští týden) se suplováním a zrušenými hodinami
- **Známky** a průměry po předmětech, předběžné známky
- **Absence** po předmětech i po dnech, s hranicí pro neklasifikaci
- **Komens** (přijaté a nástěnka), jen ke čtení
- **Obědy** ze Strava.cz: jídelníček, kredit, objednání a zrušení oběda
- **Widgety** a plugin pro nový Classmate, **kalendář ICS** se suplováním
- Upozornění přes **ntfy** na nové známky, změny v rozvrhu, absenci a zprávy

Žádné úkoly, poznámky ani AI. To má [plná verze](../full/).

## Spuštění

```bash
cp .env.example .env      # vyplň PUBLIC_URL, APP_SECRET, EMBED_ORIGINS
docker compose up -d --build
```

Bez Dockeru: `npm install && npm run build && npm start` (Node 22+), běží na portu 3100.

1. Otevři adresu serveru. Průvodce chce **instalační kód** (`SETUP_TOKEN` z `.env`, jinak se vypíše do logu: `docker compose logs app`) a nastavíš heslo.
2. **Nastavení → Bakaláři:** adresa Bakalářů školy, jméno a heslo. Heslo se neukládá, server si drží jen šifrovaný přihlašovací token.
3. **Nastavení → Strava.cz:** číslo jídelny. Se jménem a heslem i kredit a objednávání.

## Widgety v Classmate

Stránka **Widgety** ukazuje adresu pluginu (`/embed/widgets.json?k=…`). V Classmate: **Nastavení → Pluginy → Přidat plugin z adresy**. Plugin nabídne rozvržení „Klasický Classmate“ (rozvrh, suplování, známky, průměry, absence, Komens, obědy).

Jde to i bez kopírování: Classmate otevře `https://<tvůj-server>/classmate/connect?origin=<adresa Classmate>`, ty potvrdíš a adresa se předá přes `postMessage`.

| Adresa | Co to je |
|---|---|
| `/embed/rozvrh?k=…` | dnešek (po vyučování zítřek) a další školní den |
| `/embed/suplovani?k=…` | změny v rozvrhu na příštích 10 školních dní |
| `/embed/znamky?k=…` | poslední známky |
| `/embed/prumery?k=…` | průměry po předmětech |
| `/embed/absence?k=…` | absence a předměty nejblíž hranici |
| `/embed/komens?k=…` | poslední zprávy |
| `/embed/obedy?k=…` | obědy na příští 3 dny |
| `/kalendar.ics?k=…` | rozvrh se suplováním jako kalendář |

Parametry: `&theme=light|dark`, `&bg=transparent`. Widgety čtou jen z místní databáze, kvůli nim se Bakaláři nevolají.

**Bezpečnost:** klíč `k` otevře jen widgety, manifest a kalendář, nic jiného. Na stránce Widgety ho jde vyměnit. Vložit widgety smí jen domény z `EMBED_ORIGINS` (hlavička `frame-ancestors`) a jen ty dostanou manifest (CORS).

## Nastavení (.env)

| Proměnná | Význam |
|---|---|
| `PUBLIC_URL` | veřejná adresa serveru (adresy widgetů) |
| `EMBED_ORIGINS` | kdo smí vložit widgety, např. `https://classmate.cz` |
| `APP_SECRET` | šifrovací klíč (token Bakalářů, heslo Strava.cz) |
| `SETUP_TOKEN` | instalační kód pro první spuštění |
| `SYNC_MINUTES` | jak často se na pozadí stahují data (výchozí 15, nejméně 10, `0` = vypnuto) |
| `NTFY_URL` | upozornění přes ntfy, např. `https://ntfy.sh/tajny-kanal` |
| `COOKIE_SECURE` | `false` jen pro http v LAN |

## Upozornění

Neoficiální klient. Používá stejné rozhraní jako mobilní aplikace Bakaláři OnLine (není veřejně dokumentované) a interní rozhraní Strava.cz. Aplikace z Bakalářů **jen čte**, nic do nich neposílá a zprávy neoznačuje jako přečtené.

- Hostuj si ho **jen pro sebe**, s vlastním účtem. Neprovozuj ho pro jiné lidi.
- Data z Bakalářů nesdílej se třídou ani nikým dalším.
- Interval synchronizace nech šetrný.
- Používáš ho na vlastní odpovědnost. Bakaláři i Strava.cz můžou rozhraní kdykoli změnit.
