/** Velikonoční vajíčko: jedenáct klepnutí na verzi během sedmi sekund spustí hru. */
let taps: number[] = [];
export function tapVersion() {
  const now = Date.now();
  taps = [...taps.filter((t) => now - t < 7000), now];
  if (taps.length >= 11) {
    taps = [];
    window.dispatchEvent(new Event("classmate:egg-game"));
  }
}
