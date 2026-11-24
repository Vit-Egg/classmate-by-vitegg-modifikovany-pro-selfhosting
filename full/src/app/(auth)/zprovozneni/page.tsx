import { redirect } from "next/navigation";
import { needsSetup, setupTokenFromEnv } from "@/lib/setup";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "První spuštění" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (!needsSetup()) redirect("/prihlaseni");
  return <SetupForm fromEnv={setupTokenFromEnv()} />;
}
