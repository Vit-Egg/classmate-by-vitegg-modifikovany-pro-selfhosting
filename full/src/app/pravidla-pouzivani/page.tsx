import Link from "next/link";
import { operator } from "@/lib/instance";

export const metadata = { title: "Pravidla používání" };
// provozovatel a kontakt se čtou z .env až za běhu
export const dynamic = "force-dynamic";

const UPDATED = "8. listopadu 2026";

export default function Terms() {
  const op = operator();
  const mail = op.email ? <a href={`mailto:${op.email}`} className="link-u">{op.email}</a> : null;
  return (
    <main className="main prose" style={{ margin: "0 auto" }}>
      <p><Link href="/" className="link-u">← Zpět</Link></p>
      <h1 className="title" style={{ marginTop: 16 }}>Pravidla používání</h1>
      <p className="hint">Platí od {UPDATED}. O osobních údajích se píše v <Link href="/zasady-ochrany-osobnich-udaju" className="link-u">zásadách ochrany osobních údajů</Link>.</p>

      <h2>Pro koho a kdo to provozuje</h2>
      <p>Classmate je pomůcka pro žáky a studenty, kteří používají Bakaláře. Tento server provozuje {op.name ? (op.url ? <a href={op.url} className="link-u">{op.name}</a> : op.name) : "správce tvé školy nebo třídy"}{mail && <> ({mail})</>}. Aplikace je určená od 13 let a účet si zakládá každý sám za sebe.</p>

      <h2>Jak se chovat</h2>
      <p>Poznámky, úkoly, testy, události, sady k učení a další věci, které vytvoříš, mohou vidět spolužáci. Proto platí:</p>
      <ul>
        <li>Nepiš ani nenahrávej nic, co je nezákonné, násilné, vulgární, sexuální, nenávistné, šikanující, uráží nebo zesměšňuje konkrétního člověka.</li>
        <li>Nesdílej cizí osobní údaje, fotky ani nahrávky bez souhlasu dotyčného (nahrávání hodin se řídí pravidly tvé školy a učitele).</li>
        <li>Nevkládej cizí texty, obrázky a materiály, ke kterým nemáš práva (například komerční učebnice a testy).</li>
        <li>Nevydávej se za jiného, nezneužívej cizí účet a neobcházej zabezpečení ani omezení aplikace.</li>
        <li>Nepoužívej aplikaci k podvádění při testech a zkoušení ani k šíření spamu.</li>
      </ul>

      <h2 id="nahlaseni">Nahlášení nevhodného obsahu</h2>
      <p>Narazíš-li na obsah, který porušuje tato pravidla, použij u něj tlačítko <b>Nahlásit</b> (u cizích poznámek, úkolů, testů a zkoušení), nebo napiš přes <b>Zpětná vazba → Nahlásit nevhodný obsah</b>. Hlášení dostane správce serveru, který ho posoudí a podle závažnosti obsah odstraní, upozorní autora, případně jeho účet zruší. Hlášení se dá poslat nejvýš několikrát za hodinu, aby se nezneužívalo. V naléhavém případě (ohrožení, trestný čin) se obrať přímo na školu, rodiče nebo policii, ne jen na aplikaci.</p>
      <p>Svůj vlastní obsah můžeš kdykoliv smazat. Smazat nebo upravit obsah ve třídě může také správce serveru.</p>

      <h2>Odpovědnost za obsah</h2>
      <p>Za obsah, který vložíš, odpovídáš ty. Správce serveru obsah předem nekontroluje, ale pokud se dozví o porušení pravidel nebo zákona, odstraní ho. Autor aplikace nemá k serverům přístup a za obsah na nich nenese odpovědnost.</p>

      <h2>Bakaláři a data školy</h2>
      <p>Přihlašovací údaje do Bakalářů zadáváš dobrovolně a jen pro čtení rozvrhu, známek a dalších údajů tvého účtu; heslo se neukládá. Classmate není oficiální aplikace Bakalářů ani tvé školy. Známky, rozvrh a absence v Bakalářích jsou vždy závazné, údaje v Classmate jsou jen pomůcka (mohou se zpozdit a předvídač známek je jen odhad).</p>

      <h2>Dostupnost a odpovědnost za provoz</h2>
      <p>Aplikace se poskytuje bez záruky, tak jak je. Může se stát, že bude chvíli nedostupná nebo že se v ní objeví chyba. Spoléhat se jen na ni při termínech a testech nemusí být dobrý nápad. Správce serveru může funkce měnit, omezit nebo ukončit provoz serveru; v tom případě si můžeš v Nastavení stáhnout svoje data.</p>

      <h2>Ukončení</h2>
      <p>Účet můžeš kdykoliv smazat v <b>Nastavení → Moje data</b>. Správce serveru může účet zrušit nebo omezit, pokud porušuješ tato pravidla, ohrožuješ ostatní nebo zneužíváš službu.</p>

      <h2>Změny pravidel</h2>
      <p>Pravidla se mohou měnit. Datum poslední změny je nahoře; podstatné změny správce serveru oznámí v aplikaci. Pokračováním v používání s novými pravidly souhlasíš.</p>
    </main>
  );
}
