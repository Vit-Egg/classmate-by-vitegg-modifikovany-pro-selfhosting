# Nasazení na vlastní server

**Produkční provoz, výkon a doporučený hardware podle počtu uživatelů: [PRODUKCE.md](PRODUKCE.md).**

Víc samostatných instancí na jednom stroji, vlastní instance pro instituci a co je na instanci oddělené popisuje [INSTANCES.md](INSTANCES.md).

Cíl: aplikace dostupná přes `https://tvoje-domena.cz`, běžící v Dockeru na domácím serveru.

## Co potřebuješ
1. Server s Dockerem a `docker compose` (Linux, Raspberry Pi 4+/NAS s Dockerem jsou v pořádku).
2. **Doménu** nebo DDNS jméno (např. DuckDNS, Cloudflare), které míří na veřejnou IP tvého routeru.
3. Na routeru **přesměrovat porty 80 a 443** na server. Bez veřejné IP (CGNAT) použij Cloudflare Tunnel nebo Tailscale Funnel – pak Caddy nepotřebuješ, tunelu stačí směřovat na `app:3000`.

## Postup
```bash
git clone https://github.com/classmatecz/classmate-server.git && cd classmate-server
cp .env.production.example .env
nano .env            # DOMAIN a APP_SECRET (openssl rand -base64 48)
docker compose up -d --build
docker compose logs -f
```
Caddy sám získá certifikát Let's Encrypt, jakmile doména míří na server a porty 80/443 jsou otevřené.

Pak otevři `https://tvoje-domena.cz`: na čerstvém serveru tě aplikace pošle na **průvodce prvním spuštěním** (`/zprovozneni`), kde vytvoříš účet správce, první školu a svoji třídu. Průvodce jde použít jen jednou, dokud v databázi není žádný uživatel; na čerstvém serveru ho zamkni instalačním kódem `SETUP_TOKEN` v `.env`. Běžná registrace správce nevytváří.

## Aktualizace
```bash
git pull && docker compose up -d --build
```
Na malém serveru (2 GB RAM) build padá na paměti, použij `LOW_MEMORY=1 docker compose up -d --build` (bez minifikace). Hotový obraz z GitHubu (viz níže) je minifikovaný a rychlejší.
Databáze žije v Docker volume `classmate-data`, aktualizace ji nesmaže; migrace se aplikují samy při startu.

## Zálohy (důležité)
Dvě vrstvy, obě doporučuju:

1. **Záloha databáze (aplikace).** Skript `scripts/backup.sh` udělá konzistentní zálohu SQLite za běhu a ověří ji. Denně z cronu na serveru:
   ```bash
   echo '30 3 * * * root /root/classmate-server/scripts/backup.sh /root/backups >> /var/log/classmate-backup.log 2>&1' > /etc/cron.d/classmate-backup
   ```
   Drží se posledních 30 záloh. `BACKUP_IMAGES=1` přibalí i obrázky z poznámek. **Záloha jen na stejném serveru nestačí**, kopíruj ji i jinam: například na svůj počítač (`rsync -a root@SERVER:/root/backups/ ~/Zalohy/classmate/`) nebo do cloudu přes `rclone`.
2. **Záloha celého kontejneru (Proxmox).** V Proxmoxu: Datacenter → Backup → Add, vyber CT s aplikací, denně nebo týdně, režim *Snapshot*, úložiště mimo disk serveru (jiný disk nebo NAS), retence aspoň 7 dní. Vrátí celý server včetně Dockeru, `.env` a dat.

**`APP_SECRET` zálohuj zvlášť** (správce hesel), nejlépe ne na stejné místo jako databázi: bez něj jsou uložené tokeny Bakalářů a klíče nečitelné a uživatelé se musí znovu propojit.

**Zkus obnovu** aspoň jednou, záloha, kterou jsi nikdy neobnovil, je jen naděje.

**Nahrávky z hodin** leží jako soubory ve volume v `/data/audio` (databáze obsahuje jen jejich seznam). `backup.sh` je nezálohuje, protože jsou velké. Chceš-li je mít v záloze, zkopíruj složku `audio` zvlášť (`docker compose cp app:/data/audio ./zalohy/audio`). **Obrázky v poznámkách** leží ve `/data/images` (limit 12 MB na obrázek, velké fotky se při vložení zmenší, `IMAGE_QUOTA_MB` na uživatele) a `backup.sh` je také nezálohuje. Limit nahrávek je 100 MB na soubor (kvůli Cloudflare Tunnelu) a 2 GB na uživatele, měnit jde `AUDIO_QUOTA_MB`.

Obnova: zastav aplikaci (`docker compose -f docker-compose.lan.yml stop app`), nahraj zálohu do volume jako `/data/classmate.db` (například `docker run --rm -v classmate-data:/data -v /root/backups:/b alpine cp /b/classmate-RRRRMMDD-HHMMSS.db /data/classmate.db`), smaž případné `classmate.db-wal` a `classmate.db-shm` a spusť znovu (`up -d`).

## Kontrola provozu
- `https://tvoje-domena.cz/api/health` → `{"ok":true}` (použij v Uptime Kuma apod.)
- `docker compose ps` ukazuje stav healthchecku.

## Bezpečnostní poznámky
- Aplikace posílá HSTS, CSP a další hlavičky; cookies jsou `Secure`, `HttpOnly`, `SameSite=Lax`.
- Rate limit přihlášení a registrace stojí na IP klienta. Za Cloudflare Tunnelem je v compose `TRUST_CLOUDFLARE=true` (bere se `CF-Connecting-IP`). Bez něj se bere poslední adresa z `X-Forwarded-For`, tedy ta, kterou připsala tvoje proxy (Caddy). Nikdy nevystavuj aplikaci přímo do internetu bez proxy, jinak jde IP podvrhnout.
- Požadavky, které něco mění (POST, PUT, PATCH, DELETE), musí přijít ze stejného původu (middleware), kromě webhooku Stripe a rozhraní OAuth a MCP, která mají vlastní ověření. Těla požadavků mají horní meze.
- `APP_SECRET` má mít aspoň 32 znaků (`openssl rand -base64 48`). Při kratším aplikace při startu varuje. Z něj se odvozuje šifrování uložených hesel a klíčů, jeho změnou je znehodnotíš.
- Běží **jedna instance** (cache tokenů a zámky jsou v paměti). Pro víc instancí je potřeba Redis a Postgres.
- Registrace je omezená na třídu: zaregistruje se jen ten, kdo má platný účet Bakalářů školy uvedené ve Správě **a jehož jméno z Bakalářů je v seznamu studentů jeho třídy** (Správa → třída → Seznam studentů). Třída s **prázdným seznamem** přijme všechny studenty s touto třídou v Bakalářích (jméno se vezme z Bakalářů); jakmile do seznamu vložíš jména, platí jen on. Třídu musí napřed založit správce (její název se shoduje se zkratkou třídy v Bakalářích), žádná nevznikne sama. Jméno v aplikaci pak nastavuje seznam, uživatel si ho sám změnit nemůže.
- Než pustíš cizí uživatele, přečti a případně doplň `/zasady-ochrany-osobnich-udaju` (kontakt na správce, právní základ).

## Velký počet uživatelů (nápor po zpopularizování)
Aplikace běží v **jednom procesu** s jednou SQLite databází (WAL). Na jednom jádru zvládne zhruba stovku vykreslených stránek za sekundu a tisíce uživatelů, kteří ji otevřou jednou za pár minut. Co je pro nápor ošetřené:
- **Přihlášení a registrace** hashují hesla asynchronně (vlákna libuv, `UV_THREADPOOL_SIZE=8` v Dockerfile), takže dávka přihlášení nezastaví server. Limity podle IP jsou štědré (za školní sítí je za jednou IP celá škola), přísný je limit podle e-mailu a uživatelského jména Bakalářů.
- **Bakaláři**: na jednu školu běží nejvýš `BAKALARI_CONCURRENCY` (6) požadavků naráz, další čekají nejvýš 20 s. Když škola pětkrát za sebou neodpoví, jistič ji na 45 s přestane zkoušet a stránky ukážou poslední uloženou kopii. Souběžné obnovy téhož uživatele se sdílejí.
- **Synchronizace na pozadí** jde po školách, `BACKGROUND_SYNC_PARALLEL` (8) škol naráz, a přeskakuje uživatele, kteří jsou čerství.
- **Disk**: když volné místo klesne pod `DISK_MIN_FREE_MB` (1024), nahrávky, obrázky a přílohy se odmítají (zbytek aplikace běží dál). Převody zvuku (`FFMPEG_CONCURRENCY`, 2) a dotazy na AI (`AI_CONCURRENCY`, 6) mají frontu.
- **Stav serveru** je vidět ve Správě: paměť, databáze, disk, aktivní uživatelé, poslední synchronizace a zdraví Bakalářů po školách (kdo neodpovídá). Při náporu se dívej sem.
- Spadne-li něco v aplikaci, uživatel uvidí českou chybovou stránku s tlačítkem Zkusit znovu místo prázdné obrazovky.

Meze: jeden proces znamená jedno jádro, jeden stroj a jednu databázi. Až uvidíš ve Správě, že procesor dlouhodobě stojí na 100 %, je čas na větší stroj (víc jader ale proces nevyužije) nebo na rozdělení po školách do samostatných instancí. Skutečné chování Bakalářů při velkém náporu nešlo vyzkoušet (jen proti vlastní simulaci), proto jsou limity opatrné.

## Automatické aktualizace
Na serveru jednou:
```bash
git config credential.helper store && git pull      # zadej GitHub token, uloží se
echo '*/10 * * * * root /root/classmate-server/scripts/auto-update.sh >> /var/log/classmate-update.log 2>&1' > /etc/cron.d/classmate-update
```
Každých 10 minut se zkontroluje GitHub a při novém commitu se (jakmile GitHub Actions sestaví obraz, asi 5 minut) aplikace sama aktualizuje, data zůstávají. Vyžaduje jednorázové `docker login ghcr.io` (viz Nasazení z hotového obrazu). Pro jiný compose soubor nastav `COMPOSE_FILE=` před příkaz v cronu.

## MCP / OAuth
Do `.env` doplň `PUBLIC_URL=https://classmate.cz` (jinak se adresa odvozuje z hlaviček, což za tunelem nemusí sedět). Po nasazení zkontroluj:
- `https://classmate.cz/.well-known/oauth-protected-resource/mcp` vrací JSON s `resource` na `…/mcp`,
- `https://classmate.cz/.well-known/oauth-authorization-server` vrací adresy `authorization_endpoint` a `token_endpoint` s tvojí doménou.
Cloudflare nesmí na `/mcp`, `/oauth/*` a `/.well-known/*` přidávat výzvu (WAF / Bot Fight Mode), jinak se AI klienti nepřipojí.

## Shrnutí předmětů (volitelné)

Na stránce předmětu může být shrnutí ze známek, témat hodin, testů, úkolů a poznámek, které sestaví Google Gemini na bezplatné úrovni. Klíče vytvoř na https://aistudio.google.com/apikey a vlož je ve Správě v sekci Umělá inteligence (tam se nastavují i modely a zálohy, do `.env` se nic nedává). Bez klíče se shrnutí nikde nezobrazuje. Výchozí modely jsou `gemini-3.8-flash` a záloha `gemini-3.5-flash-lite`, jdou změnit ve Správě. Shrnutí se vytvoří až při otevření předmětu, uloží se a platí do poledne, resp. do půlnoci. Uživatel ho musí napoprvé sám zapnout (v Nastavení jde vypnout), protože se podklady odesílají do Googlu a na bezplatné úrovni je Google smí využívat k vylepšování služeb. Jméno se neposílá, položky „jen pro mě“ ano (jsou to vlastní podklady uživatele). Pokud chceš tohle vyloučit, připoj k účtu na AI Studiu fakturaci (placená úroveň data k trénování nepoužívá).

## Studium (volitelné)

Modul Studium používá stejnou umělou inteligenci jako shrnutí předmětů (klíče a modely ve Správě). K nadcházejícímu testu vytvoří jednu společnou sadu (souhrn, kartičky, procvičování) ze zadání testu a ze sdílených poznámek spolužáků. Sada se maže po termínu testu a když generování selže. Student ji musí napoprvé sám povolit (Nastavení, Umělá inteligence). Bez nastaveného klíče se modul v menu nezobrazuje.

## Nasazení z hotového obrazu (doporučeno na malém serveru)

Build aplikace potřebuje hodně paměti a na malém serveru (LXC, 2 GB RAM) padá na `Segmentation fault`. Proto se obraz sestavuje na GitHubu (workflow `Obraz aplikace`, spouští se při každém pushi na `main`) a server si ho jen stáhne:

1. **Jednou:** na GitHubu v repozitáři `classmatecz/classmate-server` počkej, až workflow dojede (záložka Actions, zelená fajfka). U balíčku `classmate` (Packages) nech viditelnost *Private*.
2. **Jednou na serveru:** vytvoř na GitHubu token (Settings → Developer settings → Personal access tokens → *Tokens (classic)*) s jediným právem `read:packages` a přihlas Docker:
   ```bash
   echo TVŮJ_TOKEN | docker login ghcr.io -u plojharsim --password-stdin
   ```
3. **Při každé aktualizaci:**
   ```bash
   cd /root/classmate-server && git pull && docker compose -f docker-compose.lan.yml pull && docker compose -f docker-compose.lan.yml up -d && docker image prune -f
   ```
   (bez `--build`). Počkej ale, až workflow po pushi dojede, jinak se stáhne předchozí verze.

Statistika návštěvnosti (`ANALYTICS_SRC`) se do obrazu vkládá při sestavení: nastav ji na GitHubu v Settings → Secrets and variables → Actions → *Variables*.

## Třídní služby (volitelné, po třídách)

Ve Správě u třídy otevři **Přídavné moduly** a zapni **Třídní služby**. Každý týden (pondělí až pátek, o víkendu se ukazuje už příští týden) slouží dva náhodně vylosovaní lidé a nikdo se neopakuje, dokud neodslouží všichni (pak začne nové kolo). Rozpis se losuje předem tak, aby měl každý aspoň jeden týden služby před sebou (celé kolo, nejméně čtyři týdny) a po vylosování je pevný, vylosovaným přijde oznámení. Správce na stránce Služby může týden přelosovat (přelosují se i další týdny), označit ho jako volno nebo někoho ze služeb vynechat (třeba kvůli dlouhodobé nepřítomnosti). Losování běží i na pozadí, takže oznámení chodí bez otevření aplikace.

## Pokladna (volitelné, po třídách)

Ve Správě u třídy otevři **Přídavné moduly** a zapni **Pokladnu**. Správce pak u uživatele může zvolit **Jmenovat pokladníkem** (role patří ke třídě a při přesunu do jiné třídy se ruší). Pokladník a správce zadávají požadované platby pro celou třídu, skupinu nebo jen vybrané lidi (u nové platby volba „Jen vybraní lidé…“, další lidi jde přidat i později). Částku můžou nastavit každému zvlášť (při zadání „Někomu nastavit jinou částku“, nebo později u člověka tlačítkem Částka; běžná částka platí, dokud se neupraví). Platbu jde smazat kdykoliv, i když už někdo zaplatil (smažou se i záznamy o zaplacení a v historii třídy zůstane, kolik se vybralo; platby kartou se ve Stripe nevracejí samy). Pokladník a správce vidí, kdo nezaplatil, a mohou označit „zaplatil osobně“. Členové vidí jen své platby.

**Způsoby platby** se nastavují u třídy ve Správě → Přídavné moduly → Pokladna (aspoň jeden musí být zapnutý): **osobně pokladníkovi**, **QR kód** na účet třídy (číslo účtu `19-2000145399/0800` nebo IBAN, aplikace ověří kontrolní číslice) a **karta** přes Stripe. U QR a osobní platby člen klikne na **Zaplaceno**, pokladníkovi (a když žádný není, správci) přijde oznámení a platbu potvrdí, nebo odmítne („nedorazilo“, člen se to dozví). Aplikace se na banku nenapojuje, QR platby nepozná sama. QR kód jde stáhnout jako obrázek.

**Platby kartou (Stripe)** jsou nepovinné a nastavují se u třídy zvlášť, peníze jdou přímo na účet Stripe té třídy:

1. Ve Stripe vytvoř **omezený klíč** (Restricted key) s právy *Checkout Sessions: zápis a čtení* a nic víc.
2. Ve Stripe přidej webhook na adresu `https://tvoje-adresa/api/pokladna/stripe/ID_TŘÍDY` (přesnou adresu ukáže Správa u třídy) s událostmi `checkout.session.completed` a `checkout.session.async_payment_succeeded`.
3. Klíč a podpisový klíč webhooku (`whsec_…`) vlož ve Správě u třídy. Ukládají se šifrovaně a znovu se nezobrazí.
4. V `.env` musí být nastavené `PUBLIC_URL` (adresa pro návrat ze Stripe).

**Poplatek Stripe platí student.** Kartou zaplatí cenu platby plus poplatek (na stránce Stripe je to druhá položka „Poplatek za platbu kartou“) a pokladníkovi zbyde přesně požadovaná částka. Poplatek se dopočítá ze sazby `STRIPE_FEE_PERCENT` a `STRIPE_FEE_FIXED_CZK` v `.env` (výchozí 1,5 % + 6,50 Kč, standardní karta z EHP; aktuální sazby najdeš na stripe.com/cz/pricing). U prémiových a zahraničních karet bere Stripe víc, takže u nich pokladníkovi o pár korun zbude méně; sazbu můžeš zvýšit. `STRIPE_PASS_FEE=0` přičítání poplatku vypne. **Pozor:** přirážka za platbu kartou je v EHP u spotřebitelských karet podle PSD2 zakázaná (a nesmí se lišit ani cena kartou oproti QR a hotovosti). Zapnuté přičítání je tedy na odpovědnost provozovatele; kdo se zákazu chce vyhnout, nastaví `STRIPE_PASS_FEE=0`. QR kódem a osobně se platí jen cena platby. Platba kartou se uzná jen po ověření u Stripe (podepsaný webhook, nebo dotaz na Stripe API po návratu) a shodě částky, měny a řádku. Kartou jdou platby od 15 Kč, Stripe si z každé strhne poplatek. Vratky se dělají ve Stripe, aplikace je nesleduje.

## Veřejný web a SEO

Server se neindexuje a nemá veřejnou úvodní stránku. Prezentace, SEO (sitemap, JSON-LD, llms.txt), statistika návštěvnosti a kontaktní formulář jsou v samostatném projektu **classmate-landing**. V `.env` serveru proto není nic kolem SEO, jen `PUBLIC_URL` (veřejná adresa serveru, pro odkazy v e-mailech, OAuth a MCP). Úvodní web se u návštěvníka přihlášeného v aplikaci ptá na `/api/session` (odpovídá jen ano/ne), aby místo „Přihlásit se“ ukázal „Do aplikace“. Server to povolí webu na nadřazené doméně (z `aplikace.classmate.cz` jde o `classmate.cz` a `www.classmate.cz`); jiné adresy webu přidej do `LANDING_ORIGINS` v `.env` serveru (čárkami). V Nastavení → O aplikaci je tlačítko **Sdílet Classmate spolužákům** (odkaz na tvůj server).

## Svátky na stránce Dnes

Jméno, které má dnes svátek, se bere z veřejné databáze Nameday API (nameday.abalin.net, český kalendář). Server pošle jen datum, odpověď si pro každý den uloží a ptá se nejvýš jednou za den (limit služby je 60 dotazů za hodinu). Když služba nejde, svátek se prostě neukáže. Nic se nenastavuje.

## Zprávy správci („Mám nápad“)

Zprávy z okna **Mám nápad** v aplikaci (nápad, chyba, otázka) chodí **e-mailem**. Potřebuješ nastavené SMTP (viz níže) a adresu v `.env`: `FEEDBACK_EMAIL=tvuj@email.cz` (když chybí, použije se `CONTACT_EMAIL`, a když chybí i ta, výchozí `kontakt@classmate.cz`). E-mail má jako odpověď adresu odesílatele, takže stačí odpovědět. Když se e-mail nepodaří odeslat, zpráva se uloží ve Správě („Neodeslané zprávy“), aby se neztratila.

## Todoist (volitelné)

Každý uživatel si v Nastavení → Propojení může připojit svůj Todoist, buď **přihlášením přes Todoist (OAuth)**, nebo **osobním API tokenem** (Todoist → Nastavení → Integrace → Vývojáři). Otevřené úkoly uživatele se zapisují do jeho projektu (výchozí název Classmate). Token je šifrovaný jako ostatní klíče (`APP_SECRET`), provoz jde jen na `todoist.com` a `api.todoist.com`.

Synchronizace je **oboustranná**: co uživatel odškrtne, přejmenuje nebo přesune na jiný termín (i smaže) v Classmate, projeví se v Todoistu, a naopak. Z Todoistu se přebere jen to, co by smět udělat v aplikaci i sám uživatel. Úkol zadaný spolužákem jde z Todoistu odškrtnout, ale ne přejmenovat, přesunout ani smazat: taková změna se nepřevezme, položka se v Todoistu vrátí do původního stavu a uživateli přijde zpráva. Smazání víc než tří položek najednou (třeba celého projektu) se nepřebírá. Když se úkol změní na obou stranách, vyhrává Classmate. Změny se berou přírůstkově každé 2 minuty (a pár vteřin po změně v Classmate).

**OAuth (volitelné, jednou na serveru):** na https://developer.todoist.com/appconsole.html vytvoř aplikaci, jako **OAuth redirect URL** zadej `https://aplikace.classmate.cz/nastaveni/todoist/callback` (tvoje `PUBLIC_URL` + `/nastaveni/todoist/callback`) a Client ID a Client secret dej do `.env` jako `TODOIST_CLIENT_ID` a `TODOIST_CLIENT_SECRET` (a `docker compose up -d`). Pak se v Nastavení objeví tlačítko **Propojit přihlášením přes Todoist**, API token zůstává jako druhá možnost. Bez těchto proměnných se nabízí jen API token.

## Obědy: Strava.cz (volitelné)

Modul **Obědy** (jídelníček, kredit, objednávání a rušení obědů) si zapíná každý student sám jen pro sebe v Nastavení → Strava.cz: zadá číslo jídelny (z přihlašovací stránky Strava.cz) a svoje přihlašovací údaje. Dokud se nezapne, modul se mu v menu nezobrazuje a škola nic nenastavuje. Strava.cz nemá jiný způsob dlouhodobého přihlášení, proto se heslo ukládá v databázi šifrované (AES-256, klíč z `APP_SECRET`). Zálohu databáze proto ukládej stejně pečlivě jako `APP_SECRET`. Aplikace používá interní API webu Strava.cz, které není oficiální a může se změnit.

## Komunikace: Komens a školní e-mail (volitelné)

**Komens a nástěnka** z Bakalářů fungují hned po propojení Bakalářů (jen čtení, příloha se stahuje přes aplikaci).

**Školní e-mail a Teams** (pošta: čtení i odpovídání; Teams: zadání a schůzky, jen čtení) se nastavuje u každé školy ve Správě (u školy tlačítko **Pošta**): vybereš Microsoft 365, nebo obecný IMAP/SMTP, a koncovku adres (třeba `ssps.cz`). Uživatel se pak připojí v Nastavení → Školní e-mail a Teams (jedno propojení pro e-mail i Teams).

- **Obecný IMAP/SMTP:** stačí server a port (IMAP 993, SMTP 587 nebo 465). Uživatel zadá adresu a heslo, které se uloží šifrovaně. Hodí se tam, kde poskytovatel povoluje přihlášení heslem.
- **Microsoft 365:** přihlášení účtem školy přes Microsoft (heslo se do aplikace nedostane). Musíš jednou zaregistrovat aplikaci: v Microsoft Entra (portal.azure.com → Microsoft Entra ID → App registrations → New registration) zvol **Accounts in any organizational directory (multitenant)**, jako Web redirect URI zadej `https://classmate.cz/komunikace/pripojit/microsoft/callback`, v API permissions přidej delegovaná oprávnění `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read`, `EduAssignments.Read`, `EduRoster.ReadBasic`, `Chat.Read`, `ChatMessage.Send`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `ChannelMessage.Send`, `Files.Read.All`, `offline_access`, `User.Read` (kalendář, zadání, chaty, týmy, kanály a soubory slouží záložce Teams; všechno jsou delegovaná oprávnění, takže aplikace vidí jen to, co vidí sám uživatel, a schvalují se společně s poštou jedním souhlasem správce), vytvoř Client secret a dej hodnoty do `.env` jako `MS_CLIENT_ID` a `MS_CLIENT_SECRET`. Poznámka: škola může povolit cizím aplikacím přístup k poště jen se souhlasem správce. Pak uživatel uvidí hlášku „potřebuje souhlas správce“ a je potřeba požádat školní IT, aby aplikaci schválilo.

## E-mailová upozornění (volitelné)

Aplikace umí posílat upozornění (suplování, nové známky, testy od spolužáků…) e-mailem. Zapneš to v `.env` údaji o SMTP serveru, ze kterého se má pošta odesílat (Gmail s heslem aplikace, e-mail u poskytovatele domény, Mailgun, Brevo apod.):

```
SMTP_HOST=smtp.example.cz
SMTP_PORT=587
SMTP_USER=classmate@example.cz
SMTP_PASS=heslo
SMTP_FROM=Classmate <classmate@example.cz>
```

Pak `docker compose up -d`. Každý uživatel si e-maily zapne sám v Nastavení → E-mailová upozornění a musí potvrdit adresu odkazem z e-mailu (nikdo tedy nemůže posílat poštu na cizí adresu). Jde vybrat „hned“ (v nočním klidu 22–6 se čeká do rána) nebo denní souhrn v 7:00. V každém e-mailu je odkaz na odhlášení. Odkazy v e-mailech vedou na `PUBLIC_URL`, proto ho nastav.

Když je SMTP zapnuté, platí navíc:
- **Nově zaregistrovaný uživatel musí potvrdit e-mail**, než se do aplikace dostane (dostane odkaz poštou). Starší účty to potvrzují až při zapnutí e-mailových upozornění.
- Na přihlášení je odkaz **Zapomněl(a) jsi heslo?**. Odkaz na nové heslo platí hodinu, jde použít jednou a po změně se uživatel odhlásí na všech zařízeních. Dvoufázové ověření zůstává v platnosti.
- Bez SMTP se nic z toho nezapíná a heslo uživateli může nastavit správce ve Správě.

## Dva projekty: web (classmate.cz) a server (aplikace.classmate.cz)

Classmate se skládá ze dvou samostatných projektů:

| Projekt | Co dělá | Obraz | Port |
|---|---|---|---|
| **classmate-landing** | veřejný web classmate.cz, kontaktní formulář | `ghcr.io/classmatecz/classmate-landing` | 3001 |
| **classmate-server** (tenhle) | aplikace, databáze, správa škol | `ghcr.io/classmatecz/classmate` | 3000 |

Jednorázový přechod instance, která dřív běžela celá na classmate.cz:

1. **Server (aplikace.classmate.cz).** V Cloudflare Zero Trust → Tunnels → Public hostname přidej `aplikace.classmate.cz` na `http://IP-serveru:3000`. V `.env` na serveru změň `PUBLIC_URL=https://aplikace.classmate.cz`. Aktualizuj (`git pull` a nasazovací příkaz výše). Uživatelé se na nové adrese musí **znovu přihlásit** (cookie je vázané na doménu).
2. **Web (classmate.cz).** Na serveru: `git clone https://github.com/classmatecz/classmate-landing.git && cd classmate-landing && cp .env.example .env`, doplň `PUBLIC_URL=https://classmate.cz`, `APP_URL=https://aplikace.classmate.cz`, `CONTACT_EMAIL` a `SMTP_*`, pak `docker compose pull && docker compose up -d`. V tunelu přepni hostname `classmate.cz` (a `www`) na `http://IP-serveru:3001`. Staré odkazy na `classmate.cz/dnes`, `/prihlaseni` a podobně web sám přesměruje na `aplikace.classmate.cz`.
3. **Stripe.** Uprav adresu webhooku na `https://aplikace.classmate.cz/api/pokladna/stripe/<id třídy>` (Stripe přesměrování nenásleduje).
4. **Microsoft 365 a AI klienti (MCP).** Přidej redirect URI na novou adresu a AI klienty připoj znovu.
5. **Zálohy** a skript `scripts/auto-update.sh` zůstávají beze změny.

## Nový server pro někoho jiného

Server si může provozovat kdokoli: `git clone`, `.env` (`DOMAIN`, `APP_SECRET`, volitelně `SETUP_TOKEN`), `docker compose up -d` a při prvním otevření průvodce vytvoří správce a školu. Každý server má vlastní databázi, vlastní správce a žádné napojení na ostatní servery. Jedna instance zvládne víc škol (Správa → Školy), jen počítej s tím, že cache tokenů a zámky jsou v paměti jednoho procesu.

## Přesun na nový stroj (nový kontejner v Proxmoxu)

1. Na starém serveru: `cd /root/classmate-server && git pull && ./scripts/backup-full.sh` (aplikace se na pár vteřin zastaví). Vznikne `plna-zaloha-*.tar.gz` (data, nahrávky, obrázky), `env-*` a `web-env-*`. Stáhni je mimo server (například `scp`).
2. V Proxmoxu založ **nový LXC kontejner**: šablona Debian 12 (nebo Ubuntu), hostname `classmate`, **neprivilegovaný**, 2 jádra, 2 GB RAM + 512 MB swap, disk 20 GB, síť podle potřeby, v *Options → Features* zapni **Nesting** a **keyctl** (bez toho Docker v LXC nepoběží), *Start at boot*.
3. V novém kontejneru nahraj soubory ze zálohy (například přes `scp`) a spusť (jako root):
   ```bash
   apt-get update && apt-get install -y git && git clone https://github.com/classmatecz/classmate-server.git /root/classmate-server
   /root/classmate-server/scripts/bootstrap-server.sh /root/plna-zaloha-….tar.gz /root/env-… /root/web-env-…
   ```
   Skript nainstaluje Docker, přihlásí se do ghcr.io, naklonuje server i web, obnoví data a spustí je.
4. Otestuj v LAN na `http://IP-NOVEHO:3000`. Pak v Cloudflare Tunelu přepni cíle (`aplikace.classmate.cz` na port 3000, `classmate.cz` na 3001) na novou IP.
5. Starý kontejner zastav, a až bude nový pár dní fungovat, smaž ho.

## Veřejné demo

Na přihlášení a registraci je odkaz **Vyzkoušet demo bez registrace** (stránka `/demo`, odkaz je i na úvodním webu classmate-landing). Každý návštěvník dostane vlastní ukázkovou třídu s vymyšlenými daty (rozvrh, známky, úkoly, testy, spolužáci, poznámky, zprávy, jídelna), do které může psát. Po 24 hodinách se celá třída smaže, nebo hned po kliknutí na Ukončit demo. Dema se nepočítají do uživatelů, škol a tříd a neukazují se v registraci ani ve Správě (jen počet aktivních dem ve Stavu instance).

V `.env`: `DEMO_PUBLIC=off` demo vypne, `DEMO_HOURS` (výchozí 24) je doba do smazání, `DEMO_MAX` (výchozí 300) nejvyšší počet dem naráz. V demu nejde propojit školní služby, měnit e-mail a heslo, nahrávat soubory ani používat umělou inteligenci. Samostatný trvalý ukázkový účet pro recenzenty obchodu zůstává přes `DEMO_EMAIL` a `DEMO_PASSWORD`.

## Statistiky návštěvnosti (Umami)

Vlastní statistika běží vedle Classmate, bez cookies, a data zůstávají na tvém serveru. Měří se **jen úvodní web** (classmate-landing): odkud lidé chodí a kolik jich klikne na Vyzkoušet demo, Přihlásit se a Napište mi. V aplikaci se statistika nezapíná, přihlášené uživatele znáš z databáze (Správa a Stav serveru). Podpora v aplikaci (`ANALYTICS_SRC` a `ANALYTICS_WEBSITE_ID` v `.env` serveru) v kódu zůstává, ale bez těchto proměnných je vypnutá a nic se neměří.

1. **Spuštění Umami** (na serveru): do `.env` přidej `STATS_DB_PASSWORD` (libovolné silné heslo) a `STATS_SECRET` (`openssl rand -base64 32`), pak `cd /root/classmate-server && docker compose -f docker-compose.stats.yml up -d`. Umami poslouchá na portu 3002 a potřebuje stovky MB paměti, na malém serveru to zvaž.
2. **Adresa:** v Cloudflare Zero Trust → Tunnels → Public hostname přidej `stats.classmate.cz` na `http://IP-serveru:3002`.
3. **První přihlášení:** otevři `https://stats.classmate.cz`, přihlas se jako `admin` s heslem `umami` a hned ho změň (Settings → Profile).
4. **Web:** Settings → Websites → Add website: `classmate.cz`. Zkopíruj si Website ID.
5. **Zapnutí na úvodním webu:** do `.env` webu: `ANALYTICS_SRC=https://stats.classmate.cz/script.js` a `ANALYTICS_WEBSITE_ID=<id webu>`, pak `cd /root/classmate-landing && git pull && docker compose pull && docker compose up -d`. Kliknutí na Vyzkoušet demo, Přihlásit se a Napište mi se ukazují jako události.
6. **Záloha:** data jsou ve volume `classmate-stats-db` (`docker exec classmate-stats-db-1 pg_dump -U umami umami > umami.sql`).
