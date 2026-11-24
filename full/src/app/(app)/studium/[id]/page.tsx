import Link from "next/link";
import { notFound } from "next/navigation";
import { StudyClient } from "@/components/study/StudyClient";
import { aiEnabled } from "@/lib/ai";
import { visibleTest } from "@/lib/content";
import { dayName, dowOf, fmtShort, pragueNow, relativeDay } from "@/lib/dates";
import { getPref } from "@/lib/prefs";
import { requireUser } from "@/lib/session";
import { getProgress, studyInputs, studyState } from "@/lib/study";

export const metadata = { title: "Studium" };
export const dynamic = "force-dynamic";

export default async function StudyTestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const today = pragueNow().date;
  const t = visibleTest(user.id, user.class_id, Number((await params).id), today);
  if (!t || !aiEnabled() || user.demo) notFound();
  const state = studyState(t);
  const inputs = studyInputs(t);

  return (
    <div className="wide" style={{ ["--hue" as string]: `var(--h-${t.hue})` }}>
      <Link href="/studium" className="link-all">← Studium</Link>
      <div className="page-head" style={{ marginTop: 14 }}>
        <div>
          <h1 className="title subj-title"><span className="dot" />{t.subject_name}</h1>
          <p className="subtitle">
            {[t.oral ? "zkoušení" : "test", `${dayName(dowOf(t.date))} ${fmtShort(t.date)} (${relativeDay(t.date, today)})`, t.makeup ? "náhradní termín" : "", t.group_label ?? "", t.topic].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <StudyClient testId={t.id} initial={state} progress={getProgress(user.id, t.id)} canStart={inputs.ok} noteCount={inputs.notes.length} when={relativeDay(t.date, today)} subject={t.subject_name} testLine={[t.oral ? "zkoušení" : "test", `${dayName(dowOf(t.date))} ${fmtShort(t.date)}`, t.makeup ? "náhradní termín" : "", t.topic ? `zadání: ${t.topic}` : ""].filter(Boolean).join(", ")} chatProvider={getPref(user, "ai_chat") ?? "chatgpt"} />
    </div>
  );
}
