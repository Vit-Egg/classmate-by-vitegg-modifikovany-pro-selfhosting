import { redirect } from "next/navigation";
import { CmLoginDone } from "@/components/CmLogin";
import { issueLoginToken } from "@/lib/embed/core";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Přihlášení pro Classmate" };
export const dynamic = "force-dynamic";

/** Okno s přihlášením otevřené z rámu v Classmate (běžné přihlášení včetně 2FA). Po přihlášení předá rámu jednorázový token a zavře se. */
export default async function CmLoginPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/prihlaseni?next=/classmate/login");
  return <CmLoginDone token={issueLoginToken(user.id)} />;
}
