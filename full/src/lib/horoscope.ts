/** Denní horoskop pro zábavu: text se z data a znamení vždy stejně složí, žádná předpověď to není. */
export const SIGNS = [
  { id: "beran", label: "Beran", range: "21. 3. – 19. 4." },
  { id: "byk", label: "Býk", range: "20. 4. – 20. 5." },
  { id: "blizenci", label: "Blíženci", range: "21. 5. – 20. 6." },
  { id: "rak", label: "Rak", range: "21. 6. – 22. 7." },
  { id: "lev", label: "Lev", range: "23. 7. – 22. 8." },
  { id: "panna", label: "Panna", range: "23. 8. – 22. 9." },
  { id: "vahy", label: "Váhy", range: "23. 9. – 22. 10." },
  { id: "stir", label: "Štír", range: "23. 10. – 21. 11." },
  { id: "strelec", label: "Střelec", range: "22. 11. – 21. 12." },
  { id: "kozoroh", label: "Kozoroh", range: "22. 12. – 19. 1." },
  { id: "vodnar", label: "Vodnář", range: "20. 1. – 18. 2." },
  { id: "ryby", label: "Ryby", range: "19. 2. – 20. 3." },
] as const;

export type SignId = (typeof SIGNS)[number]["id"];
export const isSign = (v: unknown): v is SignId => SIGNS.some((s) => s.id === v);

const GENERAL = [
  "Dnes se ti bude dařit v drobnostech, kterých si ostatní ani nevšimnou.",
  "Den začne pomalu, ale odpoledne se rozjedeš.",
  "Čeká tě nečekané setkání, třeba jen na chodbě.",
  "Hvězdy radí: nic neodkládej na večer.",
  "Dnes máš výjimečně jasnou hlavu, využij to.",
  "Někdo ti dnes bude chtít něco půjčit. Rozmysli si, co a komu.",
  "Energie bude kolísat, kafe nebo svačina pomůžou.",
  "Dobrý den na rozhovory, které se už dlouho odkládají.",
  "Co se ti nepovede napoprvé, vyjde podruhé.",
  "Dnes tě něco příjemně překvapí, i když to zatím netušíš.",
  "Nenech se rozhodit cizí náladou, tvoje je dnes lepší.",
  "Malý krok dnes udělá větší rozdíl, než čekáš.",
];
const SCHOOL = [
  "Ve škole ti dnes půjde zapamatovat si i to, co jsi zrovna neposlouchal.",
  "Při zkoušení máš štěstí, ale hlavně se připrav.",
  "Poznámky si dnes piš pečlivě, ještě se hodí.",
  "Spolužák ti dnes pomůže s něčím, s čím jsi počítal sám.",
  "Úkol, který odkládáš, zabere míň času, než si myslíš.",
  "Dnes je dobrý den začít se učit na něco dopředu.",
  "Při práci ve dvojici se budeš dobře doplňovat.",
  "Pozor na rozptylování, mobil dnes láká víc než obvykle.",
  "Hodina, na kterou se netěšíš, uteče rychleji.",
  "Dnes se ti povede vysvětlit někomu látku.",
];
const COLORS = ["červená", "modrá", "zelená", "žlutá", "fialová", "oranžová", "bílá", "černá", "růžová", "tyrkysová"];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dailyHoroscope(sign: SignId, date: string) {
  const h = hash(`${sign}|${date}`);
  return {
    general: GENERAL[h % GENERAL.length],
    school: SCHOOL[(h >>> 8) % SCHOOL.length],
    number: (h >>> 16) % 9 + 1,
    color: COLORS[(h >>> 20) % COLORS.length],
  };
}
