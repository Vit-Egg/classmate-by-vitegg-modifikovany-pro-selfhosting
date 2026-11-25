import { redirect } from "next/navigation";
import { CmLoginDone } from "@/components/CmLogin";
import { loggedIn } from "@/lib/auth";
import { issueLoginToken } from "@/lib/embed/core";

export const metadata = { title: "Přihlášení pro Classmate" };
export const dynamic = "force-dynamic";

/** Okno s přihlášením otevřené z rámu v Classmate. Po přihlášení předá rámu jednorázový token a zavře se. */
export default async function CmLoginPage() {
  if (!(await loggedIn())) redirect("/prihlaseni?next=/classmate/login");
  return <CmLoginDone token={issueLoginToken(1)} />;
}
