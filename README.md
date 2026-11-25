# classmate by vitegg modifikovaný pro selfhosting

Původní Classmate upravený tak, aby si ho každý mohl provozovat **sám pro sebe** na vlastním serveru, s jedním účtem, a vložit si ho jako **widgety (plugin)** do nového Classmate.

Dvě varianty:

| | [`full/`](full/) – plná verze | [`lite/`](lite/) – lite |
|---|---|---|
| Rozvrh, suplování, známky, absence, Komens (Bakaláři) | ✓ | ✓ |
| Obědy ze Strava.cz (jídelníček, kredit, objednávky) | ✓ | ✓ |
| Úkoly, testy a zkoušení, poznámky, kalendář, předměty | ✓ | – |
| Studium s AI, Todoist, MCP server, trofeje | ✓ | – |
| Plugin pro nový Classmate (stránky do menu, widgety, rozvržení) | ✓ (9 stránek, 9 widgetů) | ✓ (5 stránek, 7 widgetů) |
| Vzhled starého Classmate | ✓ | ✓ |
| Kalendář ICS se suplováním | ✓ | ✓ |
| Upozornění | web push, e-mail | ntfy |
| Účty | jeden | jeden (jen heslo) |
| Velikost | velká (Next.js, tiptap, excalidraw, ffmpeg) | malá (Next.js + SQLite) |

Obě varianty jsou bez registrace, spolužáků, nástěnky třídy, služeb a pokladny.

## Propojení s novým Classmate

V Classmate otevři **Nastavení → Pluginy a weby → Přidat web** a zadej jen adresu svého serveru (třeba `https://bakalari.muj-server.cz`). Žádné klíče se nekopírují.

- Classmate si sám najde, co server nabízí (`/.well-known/classmate.json`): **stránky do menu** (Rozvrh z Bakalářů, Známky, Absence, Komens, Obědy, u plné verze i Úkoly, Testy, Poznámky a Studium), **widgety na Dnes** a rozvržení **„Klasický Classmate“**.
- Stránky a widgety se zobrazují ve vzhledu Classmate (stejná písma, barvy, světlý i tmavý motiv), takže vypadají jako jeho součást.
- Když je potřeba přihlášení, ukáže se tlačítko a otevře **okno s přihlášením**. Server pak rámu v Classmate dá vlastní přihlášení v dělené cookie, která platí jen pro vložení v Classmate.
- Do `.env` přidej `EMBED_ORIGINS=https://classmate.cz` (adresa tvého Classmate), jinak prohlížeč vložení nedovolí.

Chceš udělat vlastní plugin (jen widgety, nebo víc položek do menu)? Návod je v **[PLUGINY.md](PLUGINY.md)**.

## Rychlý start

```bash
git clone https://github.com/Vit-Egg/classmate-by-vitegg-modifikovany-pro-selfhosting.git
cd classmate-by-vitegg-modifikovany-pro-selfhosting/lite    # nebo full
cp .env.example .env
docker compose up -d --build
```

Podrobnosti: [full/README.md](full/README.md), [lite/README.md](lite/README.md).

## Upozornění

Neoficiální projekt, není spojený se společnostmi Bakaláři Software ani Strava.cz. Používá neveřejné rozhraní mobilní aplikace Bakaláři OnLine a webu Strava.cz.

- Hostuj si ho **jen pro sebe** s vlastním účtem. Neprovozuj veřejnou instanci pro jiné lidi.
- Data z Bakalářů nesdílej se třídou ani s nikým dalším.
- Z Bakalářů se jen čte. Do Strava.cz se zapisuje jen objednávka nebo zrušení oběda, když o ně sám požádáš.
- Používáš ho na vlastní odpovědnost.

## Autoři a licence

Classmate původně vytvořil **plojharsim**. Tyhle varianty pro selfhosting upravuje **vitegg**. Licence [MIT](LICENSE).
