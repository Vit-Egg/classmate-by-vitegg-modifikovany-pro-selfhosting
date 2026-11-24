import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/setup";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Kořen serveru nemá vlastní obsah: nový server pošle na průvodce, přihlášeného do aplikace, ostatní na přihlášení. */
export default async function Root() {
  if (needsSetup()) redirect("/zprovozneni");
  redirect((await getCurrentUser()) ? "/dnes" : "/prihlaseni");
}
