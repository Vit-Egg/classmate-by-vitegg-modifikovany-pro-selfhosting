"use client";

import { useEffect } from "react";

/**
 * Hezké rozbalovací nabídky: každý <select> v aplikaci dostane vlastní tlačítko a nabídku v barvách aplikace.
 * Původní <select> zůstává v dokumentu (skrytý), takže odesílání formulářů, přístupnost i React fungují beze změny;
 * výběr se do něj zapisuje a vyvolá se událost „change“. Chce-li někdo nativní nabídku, stačí `data-native` na <select>.
 */
type Entry = { btn: HTMLButtonElement; sync: () => void };

export function SelectEnhancer() {
  useEffect(() => {
    const entries = new Map<HTMLSelectElement, Entry>();
    let pop: HTMLDivElement | null = null;
    let popFor: HTMLSelectElement | null = null;
    let active = -1;
    let typed = "";
    let typedAt = 0;

    const close = (focusBack = true) => {
      if (!pop) return;
      const sel = popFor;
      pop.remove();
      pop = null;
      popFor = null;
      if (sel && focusBack) entries.get(sel)?.btn.focus({ preventScroll: true });
      if (sel) entries.get(sel)?.btn.setAttribute("aria-expanded", "false");
    };

    const options = (sel: HTMLSelectElement) => [...sel.options].filter((o) => !o.hidden);

    const choose = (sel: HTMLSelectElement, opt: HTMLOptionElement) => {
      if (opt.disabled) return;
      const changed = sel.selectedIndex !== opt.index;
      sel.selectedIndex = opt.index;
      if (changed) {
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      entries.get(sel)?.sync();
      close();
    };

    const setActive = (i: number, scroll = true) => {
      if (!pop) return;
      const items = [...pop.querySelectorAll<HTMLElement>(".cs-opt")];
      items.forEach((el, k) => el.classList.toggle("act", k === i));
      active = i;
      if (scroll) items[i]?.scrollIntoView({ block: "nearest" });
    };

    const open = (sel: HTMLSelectElement) => {
      close(false);
      const e = entries.get(sel);
      if (!e || sel.disabled) return;
      const rect = e.btn.getBoundingClientRect();
      const host = e.btn.closest("dialog[open]") ?? document.fullscreenElement ?? document.body;
      const el = document.createElement("div");
      el.className = "cs-pop";
      el.setAttribute("role", "listbox");
      const opts = options(sel);
      let group: Element | null = null;
      opts.forEach((o) => {
        const g = o.parentElement instanceof HTMLOptGroupElement ? o.parentElement : null;
        if (g && g !== group) {
          const h = document.createElement("div");
          h.className = "cs-group";
          h.textContent = g.label;
          el.append(h);
        }
        group = g;
        const item = document.createElement("div");
        item.className = "cs-opt" + (o.selected ? " on" : "") + (o.disabled ? " dis" : "");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(o.selected));
        item.dataset.i = String(o.index);
        const t = document.createElement("span");
        t.textContent = o.text || " ";
        item.append(t);
        if (o.selected) {
          const c = document.createElement("i");
          c.className = "cs-check";
          item.append(c);
        }
        item.addEventListener("pointerup", (ev) => {
          ev.preventDefault();
          choose(sel, o);
        });
        item.addEventListener("pointermove", () => setActive([...el.querySelectorAll(".cs-opt")].indexOf(item), false));
        el.append(item);
      });
      host.append(el);
      pop = el;
      popFor = sel;
      e.btn.setAttribute("aria-expanded", "true");
      // poloha: pod tlačítkem, a když tam není místo, nad ním
      const vh = window.innerHeight;
      const below = vh - rect.bottom - 12;
      const above = rect.top - 12;
      const wanted = Math.min(el.scrollHeight, 340);
      const up = below < Math.min(wanted, 200) && above > below;
      const maxH = Math.max(120, Math.min(340, up ? above : below));
      el.style.maxHeight = `${maxH}px`;
      el.style.minWidth = `${Math.max(rect.width, 180)}px`;
      const hostRect = host === document.body ? { left: 0, top: 0 } : host.getBoundingClientRect();
      // uvnitř dialogu (top layer) se `fixed` počítá od okna, proto stačí souřadnice okna
      void hostRect;
      const width = Math.max(rect.width, 180);
      el.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)}px`;
      if (up) el.style.bottom = `${vh - rect.top + 6}px`;
      else el.style.top = `${rect.bottom + 6}px`;
      setActive(Math.max(0, opts.findIndex((o) => o.selected)));
    };

    const onKey = (ev: KeyboardEvent) => {
      if (!pop || !popFor) return;
      const sel = popFor;
      const opts = options(sel);
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        close();
      } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        let i = active;
        do i = ev.key === "ArrowDown" ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1);
        while (opts[i]?.disabled && i > 0 && i < opts.length - 1);
        setActive(i);
      } else if (ev.key === "Home" || ev.key === "End") {
        ev.preventDefault();
        setActive(ev.key === "Home" ? 0 : opts.length - 1);
      } else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (opts[active]) choose(sel, opts[active]);
      } else if (ev.key === "Tab") {
        close(false);
      } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) {
        // psaním se skočí na položku podle začátku názvu
        const now = Date.now();
        typed = now - typedAt > 700 ? ev.key.toLowerCase() : typed + ev.key.toLowerCase();
        typedAt = now;
        const i = opts.findIndex((o) => o.text.trim().toLowerCase().startsWith(typed));
        if (i >= 0) setActive(i);
      }
    };

    const enhance = (sel: HTMLSelectElement) => {
      if (entries.has(sel) || sel.multiple || sel.size > 1 || sel.hasAttribute("data-native")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${sel.className} cs-btn`;
      btn.setAttribute("aria-haspopup", "listbox");
      btn.setAttribute("aria-expanded", "false");
      const label = sel.getAttribute("aria-label") ?? sel.closest("label")?.querySelector("span")?.textContent;
      if (label) btn.setAttribute("aria-label", label);
      const text = document.createElement("span");
      btn.append(text);
      sel.classList.add("cs-native");
      sel.tabIndex = -1;
      sel.setAttribute("aria-hidden", "true");
      sel.after(btn);
      const sync = () => {
        const o = sel.selectedOptions[0];
        const t = o?.text ?? "";
        if (text.textContent !== t) text.textContent = t;
        text.classList.toggle("ph", !!o && o.value === "" && !!t);
        if (btn.disabled !== sel.disabled) btn.disabled = sel.disabled;
      };
      sync();
      btn.addEventListener("click", () => (pop && popFor === sel ? close() : open(sel)));
      btn.addEventListener("keydown", (ev) => {
        if (["ArrowDown", "ArrowUp"].includes(ev.key)) {
          ev.preventDefault();
          open(sel);
        }
      });
      sel.addEventListener("focus", () => btn.focus()); // klik na popisek formuláře
      sel.addEventListener("change", sync);
      entries.set(sel, { btn, sync });
    };

    const scan = () => {
      // dokud React select „nepřevzal“ (hydratace), do něj nesahám, jinak by se HTML neshodovalo a stránka se přestavěla
      document.querySelectorAll("select").forEach((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber$")) && enhance(el));
      for (const [sel, e] of entries) {
        if (!sel.isConnected) {
          if (popFor === sel) close(false);
          e.btn.remove();
          entries.delete(sel);
        } else e.sync();
      }
    };

    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
    const timer = setInterval(scan, 500); // hodnotu může změnit i aplikace (React), takže se popisky občas obnoví
    const down = (ev: PointerEvent) => {
      if (pop && !pop.contains(ev.target as Node) && !(ev.target as HTMLElement).closest?.(".cs-btn")) close(false);
    };
    const away = () => close(false);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", (ev) => !(pop && ev.target instanceof Node && pop.contains(ev.target)) && away(), true);
    return () => {
      clearInterval(timer);
      mo.disconnect();
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", away);
      close(false);
      for (const [sel, e] of entries) {
        e.btn.remove();
        sel.classList.remove("cs-native");
      }
    };
  }, []);
  return null;
}
