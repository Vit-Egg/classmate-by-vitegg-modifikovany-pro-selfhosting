# Jak udělat plugin pro Classmate

Plugin je obyčejný web, který Classmate umí vložit tak, aby vypadal jako jeho součást: **stránky v menu**, **widgety na stránce Dnes** a **doporučené rozvržení** widgetů. Uživatel v Classmate zadá jen adresu webu (**Nastavení → Pluginy a weby → Přidat web**), žádné klíče ani dlouhé adresy.

Hotové příklady jsou v tomhle repozitáři: [`lite/`](lite/) a [`full/`](full/). Společný kód je v `src/lib/embed/core.ts`, `src/components/CmLogin.tsx`, `src/components/EmbedWidget.tsx` a `src/lib/embed/cm.css`.

## Jak to funguje

```
Uživatel zadá https://muj-web.cz
        │
        ▼
Classmate stáhne https://muj-web.cz/.well-known/classmate.json
        │
        ├─ není tam → web se přidá jako jedna stránka do menu
        │
        └─ je tam → Classmate nabídne:
              ☑ stránky do menu (každá jako vlastní položka, třeba Rozvrh, Známky, Obědy)
              ☑ widgety na Dnes
              ◉ rozvržení widgetů („Klasický Classmate“) – nahradit, nebo přidat k ostatním
```

Stránky i widgety Classmate načítá v rámu (`<iframe>`) přímo z tvého webu. Server Classmate data pluginu nikdy nevidí.

## 1. Manifest

Na adrese `/.well-known/classmate.json` vrať JSON s hlavičkou `Access-Control-Allow-Origin: *` (manifest stahuje prohlížeč a je veřejný, nedávej do něj nic tajného):

```json
{
  "format": "classmate-plugin/2",
  "name": "Bakaláři a obědy",
  "description": "Rozvrh, známky a obědy z mého serveru.",
  "icon": "star",
  "pages": [
    { "id": "rozvrh", "title": "Rozvrh z Bakalářů", "path": "/rozvrh", "icon": "calendar" },
    { "id": "znamky", "title": "Známky", "path": "/znamky", "icon": "star" },
    { "id": "obedy", "title": "Obědy", "path": "/obedy", "icon": "utensils" }
  ],
  "widgets": [
    { "id": "rozvrh", "title": "Rozvrh", "path": "/embed/rozvrh", "height": 340 },
    { "id": "znamky", "title": "Poslední známky", "path": "/embed/znamky", "height": 300 },
    { "id": "obedy", "title": "Obědy", "path": "/embed/obedy", "height": 280 }
  ],
  "layouts": [
    {
      "id": "klasicky",
      "title": "Klasický Classmate",
      "widgets": [
        { "widget": "rozvrh", "col": "l" },
        { "widget": "znamky", "col": "l" },
        { "widget": "obedy", "col": "r", "height": 260 }
      ]
    }
  ]
}
```

| Pole | Význam |
|---|---|
| `format` | vždy `classmate-plugin/2` |
| `name`, `description` | název (max. 60 znaků) a popis (max. 300) |
| `icon` | ikona: `calendar`, `caldays`, `star`, `absence`, `mail`, `utensils`, `check`, `exam`, `pen`, `book`, `cap`, `pulse`, `trophy`, `sun`, `pin`, `bell`, `file`, `users`, `coin`, `broom`, `settings`, `link` |
| `pages` | max. 12 stránek do menu: `id` (písmena, číslice, `-`, `_`), `title` (max. 40), `path`, `icon`. Uživatel si vybere, které chce. |
| `widgets` | max. 20 widgetů: `id`, `title`, `path`, `height` v pixelech (80–1200) |
| `layouts` | max. 10 rozvržení: `id`, `title` a seznam `widgets` s `col` (`l` vlevo, `r` vpravo) a volitelnou `height` |

- `path` je **cesta na tvém webu** (začíná `/`). Adresy na jiný web Classmate zahodí.
- Neznámá pole se ignorují, texty se zobrazují jen jako prostý text.
- Stačí jen stránky, nebo jen widgety. Plugin bez widgetů je třeba web s několika položkami do menu.

## 2. Dovol vložení

Classmate tvoje stránky vkládá do rámu. Pošli u všech stránek a widgetů hlavičku:

```
Content-Security-Policy: frame-ancestors 'self' https://classmate.cz
```

kde `https://classmate.cz` je adresa Classmate, ve kterém má plugin běžet. V `lite/` a `full/` se nastavuje proměnnou `EMBED_ORIGINS` v `.env`. Nepovoluj vložení odkudkoli (`*`), jinak by tvoje stránky mohl vložit kdokoli (clickjacking).

Rám má sandbox `allow-scripts allow-same-origin allow-forms allow-popups`: stránka smí používat JavaScript, formuláře a otevřít okno s přihlášením, ale nesmí přesměrovat celý Classmate.

## 3. Vypadej jako Classmate

Ke každé adrese stránky i widgetu Classmate přidá `?theme=light|dark&accent=<barva>` (`mint`, `blue`, `cyan`, `violet`, `pink`, `red`, `orange`, `yellow`, `graphite`). Při změně motivu v Classmate se rám načte znovu.

Doporučení:
- **V rámu schovej vlastní menu a pozadí.** Stačí v `<head>` zjistit `window.self !== window.top` a přidat třídu na `<html>`. Hotový skript je `CM_FRAME_SCRIPT` v `src/lib/embed/core.ts` (přidá třídu `in-cm` a převezme motiv a barvu, i pro další stránky v rámu).
- **Widget:** nadpis kreslí Classmate nad rámem, ve widgetu ho neopakuj. Obsah dej do karty, pozadí stránky nech průhledné.
- **Stránka v menu:** Classmate kolem ní nic nekreslí. Nadpis stránky (`h1`) a obsah jsou tvoje.
- Barvy, písma a třídy starého Classmate jsou v `lite/src/app/globals.css` a `src/lib/embed/cm.css`. Kdo je převezme, bude vypadat stejně.

## 4. Přihlášení (bez klíčů v adrese)

Prohlížeče v cizím rámu běžné cookies neposílají. Proto:

1. Když stránka nebo widget v rámu nemá relaci, ukáže tlačítko **Přihlásit se**.
2. Tlačítko otevře okno `/classmate/login` na tvém webu. Tam se uživatel přihlásí normálně (i s dvoufázovým ověřením).
3. Okno vytvoří **jednorázový token** (platí 2 minuty) a pošle ho rámu, který ho otevřel:
   ```js
   window.opener.postMessage({ type: "classmate-login", token }, location.origin);
   window.close();
   ```
4. Rám token pošle na `POST /classmate/session` a server odpoví **dělenou cookie** (CHIPS):
   ```
   Set-Cookie: sid=…; Path=/; HttpOnly; Secure; SameSite=None; Partitioned
   ```
   Taková cookie platí jen pro tvůj web vložený v Classmate. Pak se rám načte znovu.

Okno s přihlášením (`/classmate/login`) se samo vkládat nesmí (`frame-ancestors 'none'`). Funguje v Chrome, Edge, Firefoxu a novém Safari. Hotová komponenta: `CmLogin` a `CmLoginDone` v `src/components/CmLogin.tsx`, endpoint v `src/app/classmate/session/route.ts`.

Když plugin nic přihlašovat nepotřebuje (veřejná data), tenhle krok vynech.

## 5. Vyzkoušej

1. Spusť Classmate a svůj plugin, do `EMBED_ORIGINS` (nebo `frame-ancestors`) dej adresu Classmate.
2. V Classmate: **Nastavení → Pluginy a weby → Přidat web**, zadej adresu svého webu.
3. Vyber stránky, widgety nebo rozvržení a přidej.
4. Zkontroluj stránky v menu a widgety na Dnes ve světlém i tmavém motivu, na telefonu i na počítači.

Kontrola manifestu: `curl -i https://muj-web.cz/.well-known/classmate.json` musí vrátit `200`, JSON a `Access-Control-Allow-Origin: *`.

## Starší formát `classmate-plugin/1`

Manifest na libovolné adrese s absolutními adresami (často s tajným klíčem `?k=`). Classmate ho pořád umí (přidání přes obchod s pluginy, nebo zadáním přímé adresy `.json`), ale pro nové pluginy použij verzi 2.
