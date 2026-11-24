import Image from "@tiptap/extension-image";

export const IMG_MIN = 8;
export const IMG_PRESETS = [25, 50, 75, 100];
const clampWidth = (n: number) => Math.min(100, Math.max(IMG_MIN, Math.round(n)));

/** Obrázek v poznámce s nastavitelnou šířkou (v % šířky textu). V editoru má úchyt pro tažení a tlačítka s předvolbami. */
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const n = Number(el.getAttribute("data-w"));
          return n >= IMG_MIN && n <= 100 ? Math.round(n) : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => (attrs.width ? { "data-w": String(attrs.width), style: `width:${attrs.width}%` } : {}),
      },
    };
  },
  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial;
      const wrap = document.createElement("div");
      wrap.className = "note-img-wrap";
      const img = document.createElement("img");
      img.className = "note-img";
      img.loading = "lazy";
      img.draggable = false;
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "note-img-rs";
      handle.tabIndex = -1;
      handle.setAttribute("aria-label", "Změnit velikost obrázku (táhni)");
      handle.title = "Táhni pro změnu velikosti";
      const presets = document.createElement("div");
      presets.className = "note-img-presets";
      for (const p of IMG_PRESETS) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `${p} %`;
        b.addEventListener("click", () => commit(p === 100 ? null : p));
        presets.append(b);
      }
      wrap.append(img, handle, presets);

      const apply = (w: number | null) => {
        wrap.style.width = w ? `${w}%` : "";
        wrap.toggleAttribute("data-sized", !!w);
      };
      const paint = () => {
        img.src = node.attrs.src;
        img.alt = node.attrs.alt ?? "";
        apply(node.attrs.width ?? null);
      };
      const commit = (w: number | null) => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, "width", w));
      };

      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const parent = wrap.parentElement;
        if (!parent) return;
        handle.setPointerCapture(e.pointerId);
        const full = parent.getBoundingClientRect().width;
        const left = wrap.getBoundingClientRect().left;
        let w = node.attrs.width ?? null;
        const move = (ev: PointerEvent) => {
          const pct = clampWidth(((ev.clientX - left) / full) * 100);
          w = pct >= 96 ? null : pct; // blízko plné šířky se přichytí na 100 %
          apply(w);
        };
        const up = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          commit(w);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });

      paint();
      return {
        dom: wrap,
        update: (n) => {
          if (n.type !== node.type) return false;
          node = n;
          paint();
          return true;
        },
        stopEvent: (e) => e.target instanceof Node && (handle.contains(e.target) || presets.contains(e.target)),
        ignoreMutation: () => true,
      };
    };
  },
});
