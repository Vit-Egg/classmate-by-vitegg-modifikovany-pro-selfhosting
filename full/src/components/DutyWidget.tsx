import Link from "next/link";
import { myDuty, thisWeek } from "@/lib/duty";
import type { User } from "@/lib/session";

/** Třídní služba na Dnes: kdo ji má tenhle týden, a když ty, výrazně. */
export function DutyWidget({ user }: { user: User }) {
  const names = thisWeek(user.class_id);
  if (!names.length) return null;
  const mine = myDuty(user);
  return (
    <section>
      <div className="section-head">
        <h2 className="section">Třídní služba</h2>
        <Link href="/sluzby" className="link-all">Rozpis →</Link>
      </div>
      <div className={`card card-pad duty-mini${mine ? " mine" : ""}`}>
        {mine && <span className="chip">Máš službu{mine.partners.length ? ` s ${mine.partners.join(", ")}` : ""}</span>}
        <p>Tenhle týden slouží: <b>{names.join(" a ")}</b></p>
      </div>
    </section>
  );
}
