import { Clamp } from "@/components/Clamp";
import { ReportButton } from "@/components/ReportButton";
import { credit } from "@/lib/credit";
import Link from "next/link";
import { createTask, deleteTask, updateTask } from "@/app/actions/content";
import { Icon } from "@/components/Icon";
import { TaskCheck } from "@/components/TaskCheck";
import { emptyTasks } from "@/lib/voice";
import { EditItemDialog } from "@/components/EditItemDialog";
import { ItemDialog } from "@/components/ItemDialog";
import { listTasks } from "@/lib/content";
import { getHomework } from "@/lib/sync";
import { subjectHues } from "@/lib/content";
import { addDays, diffDays, fmtShort, pragueNow, relativeDay, fmtDateTime } from "@/lib/dates";
import { FilterBar } from "@/components/FilterBar";
import { untilDate } from "@/lib/filters";
import { requireUser } from "@/lib/session";
import { subjectOptions } from "@/lib/options";

import { startTimes } from "@/lib/starttime";

export const metadata = { title: "Úkoly" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ v?: string; new?: string; due?: string; edit?: string; s?: string; do?: string }> }) {
  const user = await requireUser();
  const history = (await searchParams).v === "historie";
  const done = (await searchParams).v === "hotove";
  const editId = Number((await searchParams).edit) || 0;
  const today = pragueNow().date;
  const sp = await searchParams;
  const until = untilDate(sp.do, today);
  const subjectFilter = sp.s ?? "";
  const tasks = listTasks(user.id, user.class_id, done, history).filter((t) => (!subjectFilter || (subjectFilter === "-" ? !t.subject_name : t.subject_name === subjectFilter)) && (!until || (!!t.due_date && t.due_date <= until)));
  const startAt = startTimes(user);
  // domácí úkoly z Bakalářů (jen ke čtení): otevřené nebo hotové podle přepínače, filtry předmětu a termínu platí i pro ně
  const hw = (await getHomework(user)).data?.items ?? [];
  const hues = subjectHues(user.class_id);
  const homework = hw.filter((h) => (history ? false : done ? h.done : !h.done && h.end >= addDays(today, -7)) && (!subjectFilter || (subjectFilter !== "-" && h.subject === subjectFilter)) && (!until || h.end <= until));
  const filtered = !!(subjectFilter || until);
  const sub = history ? "Úkoly, jejichž termín už uplynul" : "Co ještě zbývá udělat";

  return (
    <div className="wide">
      <div className="page-head">
        <div>
          <h1 className="title">Úkoly</h1>
          <p className="subtitle">{sub}</p>
        </div>
        <ItemDialog kind="task" allowNone subjects={subjectOptions(user)} action={createTask} today={today} autoOpen={(await searchParams).new === "1"} defaultDate={/^\d{4}-\d{2}-\d{2}$/.test((await searchParams).due ?? "") ? (await searchParams).due : undefined} />
      </div>
      <div className="toolbar">
        <nav className="seg" aria-label="Filtr">
          <Link href="/ukoly" aria-current={!done && !history}>Otevřené</Link>
          <Link href="/ukoly?v=hotove" aria-current={done}>Hotové</Link>
          <Link href="/ukoly?v=historie" aria-current={history}>Historie</Link>
        </nav>
      </div>
      <FilterBar dateParam="do" dateLabel="Termín do" filters={[{ param: "s", label: "Předmět", options: [...subjectOptions(user).map((s) => ({ value: s.name, label: s.name })), { value: "-", label: "Bez předmětu" }] }]} />
      {tasks.length ? (
        <div className="card rows split">
          {tasks.map((t) => {
            const days = t.due_date ? diffDays(today, t.due_date) : null;
            const canDelete = t.created_by === user.id || user.role === "admin";
            return (
              <div key={t.id} className={`item${t.done ? " is-done" : ""}`}>
                <TaskCheck id={t.id} done={!!t.done} />
                <div className="item-main">
                  <div className="item-title">{t.title}</div>
                  <div className="item-meta">
                    {t.subject_name && <span className="chip" style={{ ["--hue" as string]: `var(--h-${t.hue ?? "gray"})` }}>{t.subject_name}</span>}
                    {t.group_label && <span className="chip plain">{t.group_label}</span>}
                    {t.created_by !== user.id && t.created_by != null && <ReportButton what={`úkol „${t.title}“ (/ukoly)`} />}
                    {credit(t, user.id).text && <span className="by" title={t.updated_at ? `Naposledy upraveno ${fmtDateTime(t.updated_at)}` : "Kdo úkol zadal"}>{credit(t, user.id).text}</span>}
                    {t.due_date && (
                      <span className={`due${!t.done && days! < 0 ? " late" : !t.done && days! <= 1 ? " soon" : ""}`}>
                        {[`${fmtShort(t.due_date)} · ${relativeDay(t.due_date, today)}`, startAt(t.due_date, t.subject_name)].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                  {t.note && <Clamp text={t.note} />}
                </div>
                {canDelete && (
                  <div className="item-actions">
                    <EditItemDialog item={{ kind: "task", id: t.id, title: t.title, due: t.due_date ?? "", note: t.note }} action={updateTask} autoOpen={editId === t.id} />
                    <form action={deleteTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="icon-btn" aria-label="Smazat úkol"><Icon name="trash" size={16} /></button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !homework.length ? (
        <div className="empty">{filtered ? "Filtru nic neodpovídá." : history ? "Historie je zatím prázdná. Úkoly po termínu se tu schovají, nic se nemaže." : done ? "Zatím nemáš nic hotového." : emptyTasks()}</div>
      ) : null}
      {homework.length > 0 && (
        <section style={{ marginTop: tasks.length ? 28 : 0 }}>
          <h2 className="group-title">Domácí úkoly z Bakalářů</h2>
          <div className="card rows split">
            {homework.map((h) => {
              const days = diffDays(today, h.end);
              return (
                <div key={h.id} className={`item${h.done ? " is-done" : ""}`}>
                  <span className="hw-ico" title="Z Bakalářů, jen ke čtení"><Icon name="book" size={18} /></span>
                  <div className="item-main">
                    <div className="item-title">{h.content.split("\n")[0].slice(0, 140) || "Domácí úkol"}</div>
                    <div className="item-meta">
                      {h.subject && <span className="chip" style={{ ["--hue" as string]: `var(--h-${hues.get(h.subjectId) ?? "gray"})` }}>{h.subject}</span>}
                      <span className="chip plain">Bakaláři</span>
                      {h.teacher && <span className="by">{h.teacher}</span>}
                      <span className={`due${!h.done && days < 0 ? " late" : !h.done && days <= 1 ? " soon" : ""}`}>{[`${fmtShort(h.end)} · ${relativeDay(h.end, today)}`, startAt(h.end, h.subject)].filter(Boolean).join(" · ")}</span>
                    </div>
                    {h.attachments.length > 0 && (
                      <div className="item-meta hw-atts">
                        {h.attachments.map((a) => <a key={a.id} className="btn small" href={`/komunikace/priloha?k=komens&id=${encodeURIComponent(a.id)}&n=${encodeURIComponent(a.name)}`} download><Icon name="download" size={14} /> {a.name}{a.size ? ` · ${a.size < 1048576 ? Math.max(1, Math.round(a.size / 1024)) + " kB" : (a.size / 1048576).toFixed(1).replace(".", ",") + " MB"}` : ""}</a>)}
                      </div>
                    )}
                    {(h.content.includes("\n") || h.content.length > 140 || h.notice) && <Clamp text={[h.content, h.notice].filter(Boolean).join("\n\n")} />}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="hint">Domácí úkoly se jen čtou z Bakalářů. Odškrtnout nebo upravit je můžeš v Bakalářích.</p>
        </section>
      )}
    </div>
  );
}
