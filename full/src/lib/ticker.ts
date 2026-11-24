/**
 * Pravidelné volání zarovnané na skutečné hranice času (celé vteřiny, pětivteřiny…), ne na to, kdy se stránka načetla.
 * Běžný setInterval se časem rozjíždí a zobrazené vteřiny a minuty pak skáčou nerovnoměrně; tady se každý další tik naplánuje
 * podle hodin zařízení, takže se text změní přesně v okamžiku, kdy má. Vrací funkci, která tikání zastaví.
 */
export function tickAligned(fn: () => void, ms: number): () => void {
  let id: ReturnType<typeof setTimeout>;
  const loop = () => {
    fn();
    id = setTimeout(loop, ms - (Date.now() % ms) + 12);
  };
  loop();
  return () => clearTimeout(id);
}
