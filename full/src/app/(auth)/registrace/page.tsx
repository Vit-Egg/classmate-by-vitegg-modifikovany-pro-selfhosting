import { redirect } from "next/navigation";

/** Verze pro jednoho člověka: registrace není, jediný účet vzniká v průvodci prvním spuštěním. */
export default function RegisterPage() {
  redirect("/prihlaseni");
}
