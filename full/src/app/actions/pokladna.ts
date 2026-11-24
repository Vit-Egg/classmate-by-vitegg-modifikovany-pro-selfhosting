"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action";
import { CashError, adminClearStripe, setExempt, adminSetMethods, claimPaid, rejectClaim, withdrawClaim, adminSetCash, adminSetStripe, adminSetTreasurer, createRequest, deleteRequest, markCash, setClosed, setPaymentAmount, addPeople, removePerson } from "@/lib/cash";
import { requireAdmin, requireUser } from "@/lib/session";

const msg = (e: unknown): ActionState => {
  if (e instanceof CashError) return { error: e.message };
  console.error("pokladna action failed", e);
  return { error: "Něco se nepovedlo, zkus to znovu." };
};
const refresh = () => {
  revalidatePath("/pokladna", "layout");
  revalidatePath("/sprava");
};

/** Nová požadovaná platba pro celou třídu nebo skupinu. Práva se kontrolují v createRequest. */
export async function addRequest(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const amounts: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("amt_")) amounts[k.slice(4)] = v; // vlastní částky po lidech (amt_<id člena>)
    const people = fd.get("group") === "people" ? fd.getAll("people").map(Number) : [];
    if (fd.get("group") === "people" && !people.length) return { error: "Vyber aspoň jednoho člověka." };
    createRequest(user, Number(fd.get("class")), { title: fd.get("title"), note: fd.get("note"), amount: fd.get("amount"), due: fd.get("due"), group: fd.get("group") === "people" ? "" : fd.get("group"), people, amounts });
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true, message: "Platba je zadaná, členům se hned ukáže." };
}

/** Ruční označení „zaplatil osobně“ (nebo vrácení). Při chybě se vrátí na stránku s hláškou. */
export async function markPayment(fd: FormData) {
  const user = await requireUser();
  const back = `/pokladna/${Number(fd.get("request")) || ""}`;
  try {
    markCash(user, Number(fd.get("payment")), fd.get("paid") === "1");
  } catch (e) {
    redirect(`${back}?chyba=${encodeURIComponent(e instanceof CashError ? e.message : "Nepovedlo se.")}`);
  }
  refresh();
}

export async function closeRequest(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("request"));
  try {
    setClosed(user, id, fd.get("closed") === "1");
  } catch (e) {
    redirect(`/pokladna/${id}?chyba=${encodeURIComponent(e instanceof CashError ? e.message : "Nepovedlo se.")}`);
  }
  refresh();
}

export async function removeRequest(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("request"));
  try {
    deleteRequest(user, id);
  } catch (e) {
    redirect(`/pokladna/${id}?chyba=${encodeURIComponent(e instanceof CashError ? e.message : "Nepovedlo se.")}`);
  }
  refresh();
  redirect("/pokladna");
}

/* ---------- jen správce ---------- */

export async function setCash(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    adminSetCash(admin, Number(fd.get("class")), fd.get("enabled") === "on");
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true };
}

export async function setTreasurer(fd: FormData) {
  const admin = await requireAdmin();
  try {
    adminSetTreasurer(admin, Number(fd.get("user")), fd.get("on") === "1");
  } catch (e) {
    console.error("treasurer", e instanceof Error ? e.message : e);
  }
  refresh();
}

export async function saveStripe(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    adminSetStripe(admin, Number(fd.get("class")), String(fd.get("key") ?? ""), String(fd.get("webhook") ?? ""));
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true, message: "Stripe je nastavený." };
}

export async function clearStripe(fd: FormData) {
  const admin = await requireAdmin();
  try {
    adminClearStripe(admin, Number(fd.get("class")));
  } catch (e) {
    console.error("stripe clear", e instanceof Error ? e.message : e);
  }
  refresh();
}

/** Způsoby platby třídy (osobně, QR, karta; aspoň jeden) a účet pro QR. */
export async function saveMethods(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const on = (k: string) => fd.get(k) === "on";
  try {
    adminSetMethods(admin, Number(fd.get("class")), { personal: on("personal"), qr: on("qr"), card: on("card"), account: String(fd.get("account") ?? ""), name: String(fd.get("holder") ?? "") });
  } catch (e) {
    return msg(e);
  }
  refresh();
  return { ok: true, message: "Uloženo." };
}

/** Člen hlásí, že zaplatil (QR převodem nebo osobně). */
export async function claimPayment(fd: FormData) {
  const user = await requireUser();
  try {
    claimPaid(user, Number(fd.get("payment")), String(fd.get("how")));
  } catch (e) {
    redirect(`/pokladna?chyba=${encodeURIComponent(e instanceof CashError ? e.message : "Nepovedlo se.")}`);
  }
  refresh();
}

export async function withdrawPayment(fd: FormData) {
  const user = await requireUser();
  try {
    withdrawClaim(user, Number(fd.get("payment")));
  } catch (e) {
    console.error("claim withdraw", e instanceof Error ? e.message : e);
  }
  refresh();
}

/** Pokladník odmítne hlášenou platbu (nedorazila). */
export async function rejectPayment(fd: FormData) {
  const user = await requireUser();
  const back = `/pokladna/${Number(fd.get("request")) || ""}`;
  try {
    rejectClaim(user, Number(fd.get("payment")));
  } catch (e) {
    redirect(`${back}?chyba=${encodeURIComponent(e instanceof CashError ? e.message : "Nepovedlo se.")}`);
  }
  refresh();
}

/** Pokladník označí, že člen u platby platit nemusí (nebo ho zařadí zpět). */
export async function exemptPayment(fd: FormData) {
  const user = await requireUser();
  const back = `/pokladna/${Number(fd.get("request")) || ""}`;
  try {
    setExempt(user, Number(fd.get("payment")), fd.get("exempt") === "1");
  } catch (e) {
    redirect(`${back}?chyba=${encodeURIComponent(e instanceof CashError ? e.message : "Nepovedlo se.")}`);
  }
  refresh();
}

const back = (id: number) => `/pokladna/${id || ""}`;
const fail = (id: number, e: unknown): never => redirect(`${back(id)}?chyba=${encodeURIComponent(e instanceof CashError ? e.message : "Nepovedlo se.")}`);

/** Vlastní částka u jedné platby (prázdné pole = běžná částka). */
export async function setAmount(fd: FormData) {
  const user = await requireUser();
  try {
    setPaymentAmount(user, Number(fd.get("payment")), fd.get("amount"));
  } catch (e) {
    fail(Number(fd.get("request")), e);
  }
  refresh();
}

/** Přidá k platbě další lidi z třídy (volitelně s vlastní částkou). */
export async function addPersonToRequest(fd: FormData) {
  const user = await requireUser();
  try {
    addPeople(user, Number(fd.get("request")), fd.getAll("people").map(Number), fd.get("amount"));
  } catch (e) {
    fail(Number(fd.get("request")), e);
  }
  refresh();
}

/** Odebere z platby jen pro vybrané lidi člověka, který ještě nezaplatil. */
export async function removePersonFromRequest(fd: FormData) {
  const user = await requireUser();
  try {
    removePerson(user, Number(fd.get("payment")));
  } catch (e) {
    fail(Number(fd.get("request")), e);
  }
  refresh();
}
