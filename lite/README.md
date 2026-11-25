# Classmate lite

Odlehčená verze Classmate jen s tím, co se bere z **Bakalářů** a **Strava.cz**, pro jednoho člověka na vlastním serveru. Vypadá stejně jako starý Classmate (menu, písma, barvy, motivy).

- **Dnes** poskládané z widgetů jako nástěnka starého Classmate
- **Rozvrh** (tento a příští týden) se suplováním a zrušenými hodinami
- **Známky** a průměry po předmětech, předběžné známky
- **Absence** po předmětech i po dnech, s hranicí pro neklasifikaci
- **Komens** (přijaté a nástěnka), jen ke čtení
- **Obědy** ze Strava.cz: jídelníček, kredit, objednání a zrušení oběda
- **Plugin pro nový Classmate** (stránky do menu, widgety, rozvržení), **kalendář ICS** se suplováním
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

## Propojení s Classmate

V Classmate: **Nastavení → Pluginy a weby → Přidat web** a zadej adresu tohoto serveru. Classmate nabídne stránky Rozvrh z Bakalářů, Známky, Absence, Komens a Obědy do menu, widgety na Dnes a rozvržení „Klasický Classmate“. Uvnitř Classmate se schová vlastní menu lite a převezme se motiv a barva z Classmate, takže stránky vypadají jako jeho součást.

Přihlášení: když v rámu chybí, ukáže se tlačítko **Přihlásit se**, které otevře okno s přihlášením. Okno předá rámu jednorázový token a ten si ho vymění za relaci v dělené cookie (`Partitioned`). Do `EMBED_ORIGINS` dej adresu svého Classmate.

| Adresa | Co to je |
|---|---|
| `/.well-known/classmate.json` | veřejný popis pluginu (bez dat a klíčů) |
| `/embed/rozvrh`, `/embed/suplovani`, `/embed/znamky`, `/embed/prumery`, `/embed/absence`, `/embed/komens`, `/embed/obedy` | widgety |
| `/classmate/login`, `/classmate/session` | přihlášení pro rám v Classmate |
| `/kalendar.ics?k=…` | rozvrh se suplováním jako kalendář |

Pro jiné dashboardy jdou widgety otevřít i se záložním tajným klíčem `?k=…` (stránka Widgety). Jak udělat vlastní plugin: [PLUGINY.md](../PLUGINY.md).

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
