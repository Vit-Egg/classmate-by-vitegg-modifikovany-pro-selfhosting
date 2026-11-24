import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { joinBoard } from "@/app/actions/trofeje";
import { leaderboard, SELF_PER_DAY } from "@/lib/leaderboard";
import { plural } from "@/lib/dates";
import type { User } from "@/lib/session";

const cs = (n: number) => n.toLocaleString("cs-CZ");

/** Žebříček třídy (zapnutý všem, kdo z něj neodešli). Pravidla a ochrana proti podvodům jsou popsané v lib/leaderboard.ts. */
export function Board({ user }: { user: User }) {
  const { joined, rows } = leaderboard(user);

  if (!joined)
    return (
      <section className="card ach-join">
        <span className="ach-join-ico"><Icon name="trophy" size={22} /></span>
        <div>
          <h2>Jsi skrytý(á) ze žebříčku</h2>
          <p>Ostatní tě v žebříčku nevidí a ty nevidíš jejich pořadí. Vrátit se můžeš kdykoli.</p>
          <form action={joinBoard}><input type="hidden" name="on" value="1" /><button className="btn primary" type="submit">Zobrazit se v žebříčku</button></form>
        </div>
      </section>
    );

  const top = rows[0]?.score ?? 0;
  const me = rows.find((r) => r.me);
  return (
    <>
      <section className="ach-section">
        <div className="ach-me">
          {me ? <p>Jsi na <b>{me.rank}. místě</b> z {rows.length}{me.rank > 1 && <> · do prvního místa ti chybí <b>{cs(top - me.score)}</b> bodů</>}.</p> : <p />}
          {!user.demo && <form action={joinBoard}><input type="hidden" name="on" value="0" /><button className="btn small" type="submit">Skrýt se ze žebříčku</button></form>}
        </div>
        {rows.length ? (
          <div className="card rows ach-board">
            {rows.map((r) => (
              <div key={r.id} className={`item ach-brow${r.me ? " me" : ""}`}>
                <span className={`ach-rank r${r.rank}`}>{r.rank}</span>
                <Avatar id={r.id} name={r.name} className="ach-bav" />
                <div className="item-main">
                  <div className="item-title">{r.name}{r.me && <span className="chip plain" style={{ marginLeft: 8 }}>ty</span>}</div>
                  <div className="ach-bsub">{r.level} · {r.trophies} {plural(r.trophies, "trofej", "trofeje", "trofejí")}</div>
                  <div className="ach-bbar" aria-hidden><i style={{ width: `${top ? (r.score / top) * 100 : 0}%` }} /></div>
                </div>
                <div className="ach-bscore"><b>{cs(r.score)}</b><span>bodů</span></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">V žebříčku zatím nikdo není.</div>
        )}
      </section>
      <p className="hint">
        Žebříček je zapnutý všem a kdo nechce, může se z něj skrýt (tlačítko nahoře). Do žebříčku se počítají trofeje z Domácí přípravy, Sešitů, Třídy a Aplikace. Známky, absence, kuriozity a tajné trofeje ne. Trofeje, které jdou získat vlastní činností (poznámky, úkoly, události…), se započítávají nejvýš {SELF_PER_DAY} body za každý den, co máš účet, takže z jednoho večera se nedá udělat vítězství. Trofeje za dlouhodobé používání, série, služby a placení se počítají celé. Body vznikají jen na serveru a nikdo je nemůže ručně změnit.
      </p>
    </>
  );
}
