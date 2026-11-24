import type { ActionState } from "./action";

export const DEMO_BLOCKED = "V demu to nejde. Vytvoř si skutečný účet.";

/** U citlivých akcí (e-mail, heslo, propojení služeb, odesílání zpráv ven) ukázkový účet vrátí chybu místo provedení. */
export const demoBlocked = (user: { demo: number }): ActionState | null => (user.demo ? { error: DEMO_BLOCKED } : null);
