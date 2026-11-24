import { pickDaily } from "./dates";

export const emptyTasks = () => pickDaily(["Všechno hotovo.", "Čistý stůl.", "Nic nehoří.", "Zadání došla, užij si to.", "Nic k odevzdání."], 1);
export const emptyTests = () => pickDaily(["V nejbližších týdnech žádný test ani zkoušení.", "Na obzoru klid, žádný test ani zkoušení.", "Žádný test ani zkoušení nikde. Zatím.", "Testy a zkoušení si dávají pauzu."], 2);
