import Link from "next/link";
import { Icon } from "@/components/Icon";
import { aiEnabled } from "@/lib/ai";
import { listTests } from "@/lib/content";
import { fmtShort, pragueNow, relativeDay } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { studyStatuses } from "@/lib/study";

export const metadata = { title: "Studium" };
export const dynamic = "force-dynamic";

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

export default async function StudyPage() {
  const user = await requireUser();
  const today = pragueNow().date;
  const tests = aiEnabled() && !user.demo ? listTests(user.id, user.class_id, today) : [];
  const status = studyStatuses(user.id, tests.map((t) => t.id));
  const ready = tests.filter((t) => status.get(t.id)?.status === "ready").length;
  const next = tests[0];

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Studium</h1>
          <p className="subtitle">Vyber test nebo zkoušení a nauč se na něj: souhrn, kartičky a procvičování</p>
        </div>
      </div>
      {user.demo ? (
        <div className="empty">V demu studijní sady nejsou k dispozici, protože je tvoří umělá inteligence. Ve skutečném účtu se vytvoří z tvých poznámek.</div>
      ) : !aiEnabled() ? (
        <div className="empty">Studium zatím není zapnuté. Správce musí ve Správě nastavit umělou inteligenci.</div>
      ) : tests.length ? (
        <>
          <div className="stat-row study-stats">
            <div className="stat"><small>Nadcházející testy a zkoušení</small><b>{tests.length}</b></div>
            <div className="stat"><small>Nejbližší test nebo zkoušení</small><b>{next ? relativeDay(next.date, today) : "–"}</b></div>
            <div className="stat"><small>Hotové sady</small><b>{ready} z {tests.length}</b></div>
          </div>
          <div className="subj-grid study-grid">
            {tests.map((t) => {
              const st = status.get(t.id);
              const isReady = st?.status === "ready";
              const pct = isReady && st.cards ? Math.round((st.known / st.cards) * 100) : 0;
              return (
                <Link key={t.id} href={`/studium/${t.id}`} className="subj-card study-test" style={{ ["--hue" as string]: `var(--h-${t.hue})` }}>
                  <div className="subj-top">
                    <span className="dot" />
                    <h2>{t.subject_name}</h2>
                    <span className="chip danger">{relativeDay(t.date, today)}</span>
                  </div>
                  <p className="subj-sub">{[t.oral ? "Zkoušení" : "Test", fmtShort(t.date), t.makeup ? "náhradní termín" : "", t.group_label ?? "", t.topic].filter(Boolean).join(" · ")}</p>
                  <div className="study-test-foot">
                    {isReady ? (
                      <>
                        <div className="study-meter">
                          <div className="study-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Kolik kartiček umíš"><span style={{ width: `${pct}%` }} /></div>
                          <span>{st.known} z {st.cards} {plural(st.cards, "kartičky", "kartiček", "kartiček")}</span>
                        </div>
                        <span className="study-cta"><Icon name="cap" size={15} />{st.best != null ? `Procvičování nejlépe ${st.best} %` : "Pokračovat ve studiu"}</span>
                      </>
                    ) : st ? (
                      <span className="study-cta busy"><Icon name="refresh" size={15} />Sada se připravuje…</span>
                    ) : (
                      <span className="study-cta"><Icon name="plus" size={15} />Vytvořit studijní sadu</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card study-hero">
          <div className="study-hero-ic"><Icon name="cap" size={26} /></div>
          <h2>Žádný test ani zkoušení na obzoru</h2>
          <p>Jakmile někdo zadá test nebo zkoušení, můžeš si k němu tady nechat vytvořit souhrn, kartičky a procvičování.</p>
          <Link href="/testy-a-zkouseni?new=1" className="btn primary">Přidat test nebo zkoušení</Link>
        </div>
      )}
    </div>
  );
}
