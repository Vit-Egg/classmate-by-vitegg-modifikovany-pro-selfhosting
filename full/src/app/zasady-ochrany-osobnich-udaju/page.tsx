import Link from "next/link";
import { operator } from "@/lib/instance";

export const metadata = { title: "Zásady ochrany osobních údajů" };
// provozovatel a kontakt se čtou z .env až za běhu, stránka se proto nesmí předgenerovat při sestavení obrazu
export const dynamic = "force-dynamic";

const PRIVACY_UPDATED = "10. listopadu 2026";

export default function Privacy() {
  const op = operator();
  const mail = op.email ? <a href={`mailto:${op.email}`} className="link-u">{op.email}</a> : null;
  return (
    <main className="main prose" style={{ margin: "0 auto" }}>
      <p><Link href="/" className="link-u">← Zpět</Link></p>
      <h1 className="title" style={{ marginTop: 16 }}>Zásady ochrany osobních údajů</h1>
      <p className="hint">Platí od {PRIVACY_UPDATED}. Pravidla chování v aplikaci jsou zvlášť v <Link href="/pravidla-pouzivani" className="link-u">pravidlech používání</Link>.</p>

      <h2 id="spravce">Kdo je správce</h2>
      <p>Classmate je software, který si každá škola nebo třída provozuje na vlastním serveru. Správcem osobních údajů je ten, kdo tenhle server provozuje (správce serveru), ne autor aplikace. Servery o sobě nevědí a nic si nepředávají: tvoje data jsou jen na serveru, na kterém máš účet.</p>
      <p><b>Správce tohoto serveru:</b> {op.name ? (op.url ? <a href={op.url} className="link-u">{op.name}</a> : op.name) : "neuvedeno, obrať se na správce své školy nebo třídy"}{mail && <> · kontakt: {mail}</>}</p>
      <p>Autor aplikace osobní údaje ze serverů neobdržuje, nemá k nim přístup a nezpracovává je.</p>

      <h2 id="ucel">Co zpracováváme, proč a na jakém základě</h2>
      <ul>
        <li><b>Účet</b>: jméno, e-mail, hash hesla (heslo samotné nikdy), škola a třída, role, nastavení aplikace, profilovka a kontakty (telefon, e-mail a sociální sítě, když je vyplníš; uvidí je spolužáci ze třídy). Je to nutné, aby aplikace fungovala (plnění smlouvy o poskytování služby, čl. 6 odst. 1 písm. b GDPR).</li>
        <li><b>Bakaláři</b>: jméno do Bakalářů a šifrovaný přístupový token. <b>Heslo do Bakalářů se neukládá</b>, jen se jednorázově ověří. Z Bakalářů se stahuje rozvrh, známky, absence, zprávy z Komens, domácí úkoly, události a jméno s třídou; kopie se dočasně drží v mezipaměti, aby aplikace byla rychlá. Odpojením Bakalářů se mezipaměť smaže. Vše je jen ke čtení, do Bakalářů se nic nezapisuje.</li>
        <li><b>Obsah, který vytvoříš</b>: poznámky (včetně verzí, obrázků, příloh a hlasových nahrávek), úkoly, testy a zkoušení, vlastní události, sady k učení, souhrny předmětů, tréninkový deník, označení hotových úkolů a zpětná vazba, kterou odešleš. Zpracovává se, protože ho sám vytvoříš a využíváš (plnění smlouvy).</li>
        <li><b>Bezpečnost a provoz</b>: přihlášení (čas a údaj o prohlížeči), tajný klíč dvoufázového ověření a záložní kódy (šifrovaně), omezení počtu pokusů o přihlášení (IP adresa se drží jen krátce a pak se maže) a audit log: záznam o přihlášeních a odhlášeních, nepovedených přihlášeních, změnách zabezpečení účtu (e-mail, dvoufázové ověření, obnovení hesla), registraci, smazání účtu, zásazích správce a nahlášeních obsahu. U každé události se ukládá čas, jméno a číslo účtu, koho se týká, krátký popis a IP adresa; hesla, klíče ani obsah poznámek a zpráv se nezapisují. Audit log vidí jen správce serveru. Je to oprávněný zájem správce na ochraně účtů a serveru (čl. 6 odst. 1 písm. f).</li>
        <li><b>Spárovaná zařízení mobilní aplikace</b>: název zařízení, verze aplikace, token pro oznámení, čas posledního použití (viz níže).</li>
        <li><b>Volitelné funkce</b>, které si sám zapneš: třídní pokladna, rozpis služeb, sdílení poznámek, kalendář v jiné aplikaci, propojení s Todoist, Intervals.icu, školním e-mailem nebo jídelnou, umělá inteligence, anonymní statistiky známek. Základem je tvoje rozhodnutí funkci zapnout (souhlas, čl. 6 odst. 1 písm. a, který můžeš kdykoliv odvolat vypnutím funkce nebo odpojením služby).</li>
      </ul>

      <h2 id="prijemci">Komu se údaje předávají</h2>
      <p>Údaje se mimo server odesílají jen tehdy, když to funkce, kterou sám použiješ, nutně vyžaduje:</p>
      <ul>
        <li><b>Bakaláři</b> (server tvé školy): přihlášení a stahování školních dat.</li>
        <li><b>Google (Gemini API)</b>: když použiješ funkce s umělou inteligencí (sada k učení z poznámky, souhrn předmětu, chat), odešle se na server Google text, ze kterého se má odpověď vytvořit. Funkce jsou volitelné a bez nastavených klíčů se nezobrazují. U bezplatného tarifu Google podle svých podmínek může odeslaný obsah používat ke zlepšování svých služeb, proto do těchto funkcí nevkládej nic, co nechceš sdílet.</li>
        <li><b>Google Firebase Cloud Messaging</b>: doručování oznámení do mobilní aplikace (token zařízení, identifikátor instalace a text oznámení).</li>
        <li><b>Služba Web Push tvého prohlížeče</b> (Google, Mozilla, Apple, Microsoft): doručování oznámení v prohlížeči; prochází jím adresa koncového bodu a text oznámení.</li>
        <li><b>Microsoft 365</b> (Microsoft Graph, přihlášení přes Microsoft): jen když propojíš školní e-mail; čte se pošta a ukládá šifrovaný token. Propojení lze kdykoliv zrušit.</li>
        <li><b>Pošta přes IMAP</b>: jen když zadáš vlastní poštovní účet; přihlašovací údaje se ukládají šifrovaně.</li>
        <li><b>Todoist</b> a <b>Intervals.icu</b>: jen když propojíš svůj účet; posílají se úkoly, resp. se stahují tréninky.</li>
        <li><b>Strava.cz</b> (školní jídelna): jen když zadáš přístup; ukládá se šifrovaně, objednávky se posílají jídelně.</li>
        <li><b>Stripe</b>: platba přes třídní pokladnu, pokud ji třída používá. Platbu zpracovává Stripe pod klíčem třídy; Classmate platební kartu nikdy nevidí ani neukládá.</li>
        <li><b>nameday.abalin.net</b>: pro zobrazení svátků se posílá pouze dnešní datum, žádné osobní údaje.</li>
        <li><b>Odesílání e-mailů</b> (potvrzení adresy, zapomenuté heslo, upozornění): přes poštovní server, který nastavil správce serveru.</li>
        <li><b>Spolužáci a správce</b>: viz sekci Kdo co vidí.</li>
      </ul>
      <p>Společnosti Google a Microsoft mohou údaje zpracovávat i mimo EU. Předání se opírá o jejich rámec ochrany (rozhodnutí Evropské komise o odpovídající ochraně pro certifikované firmy, resp. standardní smluvní doložky). Pokud nechceš, funkce, které je používají, prostě nezapínej.</p>

      <h2 id="kdo-vidi">Kdo co vidí</h2>
      <p>Úkoly, testy a zkoušení vidí spolužáci ve stejné třídě (nebo skupině); u položek, které zadal někdo jiný, můžeš nahlásit nevhodný obsah. Poznámky vidí spolužáci jen tehdy, když je sdílíš (jednotlivě, nebo všechny), sdílení můžeš kdykoliv vypnout. Známky, absence a rozvrh z Bakalářů vidíš jen ty. Správce serveru vidí seznam uživatelů a technický stav, jejich známky ne. Správce serveru má ale z podstaty věci přístup k databázi serveru, proto je důležité, kdo server provozuje.</p>

      <h2 id="mobilni-aplikace">Mobilní aplikace (Android)</h2>
      <p>Aplikace pro Android zobrazuje stejné Classmate jako webový prohlížeč a přidává oznámení, trvalou notifikaci a widgety. Neobsahuje reklamy, analytiku ani sledování a žádná data neprodává. Při prvním spuštění zadáš adresu serveru Classmate (oficiální je aplikace.classmate.cz). Aplikace pak komunikuje jen s ním a údaje ukládá a spravuje provozovatel zvoleného serveru podle jeho zásad; serverem může být i jiná škola či třída, která si Classmate provozuje sama.</p>
      <ul>
        <li><b>V telefonu</b> si pamatuje přihlášení k tomuto zařízení (přístupový token, šifrovaně v úložišti klíčů Androidu) a poslední stažený rozvrh, úkoly, testy a zkoušení, několik posledních známek a jídelníček, aby widgety a notifikace fungovaly i bez připojení. Odhlášením se to smaže.</li>
        <li><b>Na serveru</b> o spárovaném telefonu ukládá název zařízení (výrobce a model), verzi aplikace, token pro oznámení, čas posledního použití a otisk přístupového tokenu. Zařízení můžeš mít nejvýš 10. Zruší je odhlášení v aplikaci, změna hesla nebo smazání účtu.</li>
        <li><b>Oznámení</b> na oficiálním serveru doručuje služba Google Firebase Cloud Messaging; na serveru, který ji nepodporuje, si je aplikace zjišťuje dotazováním serveru a Google se na nich nepodílí. Přes Firebase prochází token zařízení, identifikátor instalace aplikace a text oznámení (například nadpis a stručný popis změny rozvrhu nebo nové známky). Oznámení lze vypnout v Nastavení (Oznámení) i v systému telefonu.</li>
        <li><b>Mikrofon</b> aplikace používá jen když v poznámce sám spustíš nahrávání. Nahrávka se uloží k poznámce na server, stejně jako na webu.</li>
        <li><b>Oprávnění</b>: oznámení, mikrofon (nahrávání v poznámkách), přesné časování (změna hodiny v trvalé notifikaci na vteřinu), spuštění po restartu (obnovení notifikace a widgetů) a internet.</li>
      </ul>

      <h2 id="cookies">Cookies a úložiště v prohlížeči</h2>
      <p>Používáme pouze nezbytné a funkční cookies a místní úložiště, bez kterých by aplikace nefungovala nebo by si nepamatovala tvoje nastavení. Žádné reklamní, analytické ani sledovací cookies nepoužíváme, proto se na souhlas neptáme žádnou lištou. Pokud správce serveru zapnul vlastní statistiku návštěvnosti (Umami na vlastním serveru), pracuje bez cookies a bez ukládání čehokoli v tvém zařízení: počítá jen zobrazení stránek bez čísel v adrese, bez titulku stránky, hledaného textu a odkazující stránky, bez tvého jména a bez ukládání IP adresy; návštěvník se rozlišuje jen anonymním otiskem, který se pravidelně mění. Prohlížeč s Do Not Track se nepočítá.</p>
      <ul>
        <li><b>Cookie <code>sid</code></b>: přihlášení (platí 30 dní, jen pro přenos po HTTPS a nedostupná skriptům). Na serveru se ukládá jen otisk, ne samotná hodnota.</li>
        <li><b>Krátkodobé cookies</b> při přihlášení (dvoufázové ověření, návrat na původní stránku, 5 minut) a při propojení s Microsoft nebo Todoist.</li>
        <li><b>Cookies s volbou zobrazení</b> (například řazení poznámek a typ rozvrhu).</li>
        <li><b>Místní úložiště (localStorage)</b>: vzhled aplikace (motiv, barva, sezónní výzdoba).</li>
        <li><b>Service worker a mezipaměť prohlížeče</b>: ukládá si vzhled aplikace a naposledy otevřené stránky, aby se aplikace rychle načetla a jako instalovatelná aplikace fungovala i při výpadku připojení. Při odhlášení se stránky z mezipaměti odstraní. Lze je smazat v nastavení prohlížeče.</li>
      </ul>

      <h2 id="uchovani">Jak dlouho údaje uchováváme</h2>
      <ul>
        <li>Údaje účtu a tvůj obsah, dokud účet nesmažeš.</li>
        <li>Přihlášení 30 dní od posledního prodloužení; po vypršení se smaže.</li>
        <li>Mezipaměť dat z Bakalářů nejdéle 30 dní, nebo do odpojení Bakalářů.</li>
        <li>Testy a zkoušení se automaticky odstraní 2 dny po termínu, úkoly po termínu odevzdání.</li>
        <li>Smazané poznámky zůstávají 30 dní v koši, pak se smažou natrvalo.</li>
        <li>Technické záznamy o přijatých platbách od Stripe (jen identifikátor události) 90 dní; samotná evidence plateb ve třídní pokladně zůstává, dokud ji třída nesmaže nebo nesmažeš účet.</li>
        <li>Údaje o pokusech o přihlášení (IP adresa) jen po dobu omezení, pak se mažou.</li>
        <li>Audit log (včetně IP adresy) 365 dní, pak se záznamy mažou (správce serveru může dobu změnit). Při smazání účtu se z jeho záznamů odstraní jméno a IP adresa, zůstane jen údaj, co se kdy stalo.</li>
        <li>Zprávy zpětné vazby a nahlášení, dokud je správce serveru nevyřídí a nesmaže.</li>
      </ul>

      <h2 id="smazani-uctu">Smazání účtu a dat</h2>
      <p>Účet i všechna data smažeš sám v aplikaci i na webu: <b>Nastavení → Účet a zabezpečení → Moje data → Smazat účet</b> (potvrzuje se heslem). Tamtéž si můžeš stáhnout všechna svá data (přenositelnost). Smazání odstraní účet, přihlášení, spárovaná zařízení, mezipaměť, propojené služby, nahrávky, obrázky, přílohy a tvé příspěvky ke statistikám známek. Úkoly, testy a zkoušení, které jsi zadal pro třídu, zůstanou spolužákům bez uvedení autora. Odinstalováním aplikace se smažou data v telefonu, na serveru zůstane účet, dokud ho nesmažeš. Když se do účtu nedostaneš, napiš správci tohoto serveru{mail ? <> na {mail}</> : ""} a účet smaže.</p>

      <h2 id="statistiky">Anonymní statistiky známek (jen se souhlasem)</h2>
      <p>Pokud to výslovně povolíš, tvoje číselné známky se započítají do průměrů u jednotlivých písemek. Ukládá se jen číselná hodnota, označení písemky (předmět, název, datum) a pseudonym vytvořený tajným klíčem aplikace – bez jména, e-mailu i třídy. Průměr se zobrazuje až od 3 přispěvatelů. Souhlas můžeš kdykoliv změnit v Nastavení; odvoláním se všechny tvé příspěvky smažou (stejně tak při smazání účtu). Bez souhlasu se nic nesdílí a aplikace funguje stejně.</p>

      <h2 id="prava">Tvoje práva</h2>
      <p>Máš právo na přístup k údajům (stažení dat v Nastavení), opravu (údaje a obsah můžeš upravit v aplikaci), výmaz (smazání účtu), přenositelnost (export), omezení zpracování a námitku proti zpracování založenému na oprávněném zájmu. Souhlas můžeš kdykoliv odvolat, aniž by tím byla dotčena zákonnost zpracování před odvoláním. Většinu věcí vyřídíš sám v Nastavení, ostatní napiš správci serveru{mail ? <> na {mail}</> : ""}. Pokud máš pocit, že se s údaji nakládá nesprávně, máš právo podat stížnost u dozorového úřadu: <a href="https://uoou.gov.cz" className="link-u">Úřad pro ochranu osobních údajů</a> (Pplk. Sochora 27, 170 00 Praha 7).</p>
      <p>Nic z toho nevyžaduje automatizované rozhodování ani profilování, které by mělo právní účinky.</p>

      <h2 id="vek">Děti a mladiství</h2>
      <p>Aplikace je určena středoškolákům a podobným studentům od 13 let, kteří mají přístup do Bakalářů; děti do 13 let ji používat nesmí. Pokud je ti méně než 15 let, měl by s používáním souhlasit tvůj zákonný zástupce. Aplikace to neověřuje, odpovědnost za zajištění souhlasu nese správce serveru. Zákonný zástupce může kdykoliv požádat o smazání účtu.</p>

      <h2 id="zabezpeceni">Zabezpečení</h2>
      <p>Hesla se ukládají jen jako hash, přístupové tokeny a tajné klíče šifrovaně, spojení je šifrované (HTTPS), relace jsou chráněné proti zneužití (CSRF, omezení pokusů o přihlášení, nepřístupné skriptům) a lze zapnout dvoufázové ověření. Žádný systém není dokonale bezpečný; zjistíš-li chybu, dej nám vědět přes zpětnou vazbu v aplikaci.</p>

      <h2 id="zmeny">Změny těchto zásad</h2>
      <p>Zásady se mění s tím, jak se mění aplikace. Datum poslední změny je nahoře. Podstatné změny oznámí správce serveru v aplikaci.</p>
    </main>
  );
}
