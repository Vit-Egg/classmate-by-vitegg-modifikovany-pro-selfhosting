# classmate by vitegg modifikovaný pro selfhosting

Původní Classmate upravený tak, aby si ho každý mohl provozovat **sám pro sebe** na vlastním serveru, s jedním účtem, a vložit si ho jako **widgety (plugin)** do nového Classmate.

Dvě varianty:

| | [`full/`](full/) – plná verze | [`lite/`](lite/) – lite |
|---|---|---|
| Rozvrh, suplování, známky, absence, Komens (Bakaláři) | ✓ | ✓ |
| Obědy ze Strava.cz (jídelníček, kredit, objednávky) | ✓ | ✓ |
| Úkoly, testy a zkoušení, poznámky, kalendář, předměty | ✓ | – |
| Studium s AI, Todoist, MCP server, trofeje | ✓ | – |
| Widgety a plugin pro nový Classmate | ✓ (9 widgetů) | ✓ (7 widgetů) |
| Kalendář ICS se suplováním | ✓ | ✓ |
| Upozornění | web push, e-mail | ntfy |
| Účty | jeden | jeden (jen heslo) |
| Velikost | velká (Next.js, tiptap, excalidraw, ffmpeg) | malá (Next.js + SQLite) |

Obě varianty jsou bez registrace, spolužáků, nástěnky třídy, služeb a pokladny.

## Widgety v novém Classmate

Obě varianty mají stránku **Widgety** s adresou pluginu ve formátu `classmate-plugin/1`:

```
https://<tvůj-server>/embed/widgets.json?k=<tajný klíč>
```

V Classmate ji vložíš do **Nastavení → Pluginy → Přidat plugin z adresy** a použiješ rozvržení **„Klasický Classmate“**, které poskládá nástěnku jako ve starém Classmate. Nebo bez kopírování přes `/classmate/connect?origin=<adresa Classmate>`.

Do `.env` přidej `EMBED_ORIGINS=https://classmate.cz` (adresa tvého Classmate), jinak prohlížeč vložení nedovolí.

Widgety jsou čisté HTML bez JavaScriptu, ladí se parametry `&theme=light|dark` a `&bg=transparent` a čtou jen data uložená na serveru. Kód je v obou variantách stejný: `src/lib/embed/core.ts`.

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
