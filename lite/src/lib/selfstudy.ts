/**
 * Samostudium: v Bakalářích je u takové hodiny učebna „SamS“. Student je doma, do školy chodit nemusí
 * a jen když chce, může s učitelem komunikovat libovolným způsobem. Aplikace s tím počítá při odhadu začátku
 * a konce školního dne a hodinu ukazuje jinak než běžnou.
 */
export const isSelfStudy = (room?: string | null) => /^\s*sams\s*$/i.test(room ?? "");

export const SELF_STUDY = "Samostudium";
export const SELF_STUDY_HINT = "Ve škole být nemusíš. Chceš-li, můžeš se s učitelem spojit libovolným způsobem.";

/** Učebna pro lidský zápis: „SamS“ se ukáže jako „samostudium“. */
export const roomText = (room?: string | null) => (isSelfStudy(room) ? "Samostudium" : (room ?? ""));
