/**
 * Sezónní motivy: zapnou se samy v daném období a samy zmizí. Uživatel je může vypnout v Nastavení (localStorage „season“ = „off“).
 * Období je v měsících (1–12) a dnech; od-do včetně. Po skončení sezóny stačí položku smazat i s pravidly v globals.css.
 */
export const SEASONS = [{ id: "halloween", name: "Halloween", from: [10, 24], to: [11, 2] }] as const;


const inRange = (d: Date, from: readonly number[], to: readonly number[]) => {
  const k = (d.getMonth() + 1) * 100 + d.getDate();
  const a = from[0] * 100 + from[1];
  const b = to[0] * 100 + to[1];
  return a <= b ? k >= a && k <= b : k >= a || k <= b;
};

/** Sezóna, která právě platí (podle data), nebo null. */
export const activeSeason = (d = new Date()) => SEASONS.find((s) => inRange(d, s.from, s.to)) ?? null;

/** Inicializační skript: dřív než se vykreslí stránka nastaví na <html> atribut data-season, aby nebliklo. */
export const seasonInit = `try{if(localStorage.getItem("season")!=="off"){var n=new Date(),k=(n.getMonth()+1)*100+n.getDate(),S=${JSON.stringify(SEASONS.map((s) => ({ id: s.id, a: s.from[0] * 100 + s.from[1], b: s.to[0] * 100 + s.to[1] })))};for(var i=0;i<S.length;i++){var s=S[i];if(s.a<=s.b?k>=s.a&&k<=s.b:k>=s.a||k<=s.b){document.documentElement.dataset.season=s.id;break}}}}catch(e){}`;
