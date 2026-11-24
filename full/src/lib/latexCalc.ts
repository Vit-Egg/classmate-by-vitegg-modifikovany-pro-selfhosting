/**
 * Výpočet výrazu zapsaného v LaTeXu pro návrh výsledku po „=“ v poznámkách.
 * Zvládne čísla (i desetinná s tečkou, čárkou nebo {,}), + − · × ÷ : /, \frac, \sqrt (i s odmocninou n-tou), závorky (i \left \right), mocniny,
 * \pi, procenta, sin/cos/tan/ln/log/exp (ve stupních, když za argumentem následuje ^\circ) a násobení bez znaku (2\pi, 3(4+1)).
 * Počítá se zlomky (BigInt), takže 1/2+1/3 vyjde přesně jako 5/6. Co se spočítat nedá (písmena, neznámé příkazy), vrátí null.
 */

type Frac = { n: bigint; d: bigint };
type Val = { q: Frac } | { f: number };

const big = (n: number | bigint) => BigInt(n);
const ZERO = big(0);
const ONE = big(1);
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < ZERO ? -a : a;
  b = b < ZERO ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
const frac = (n: bigint, d: bigint): Val | null => {
  if (d === ZERO) return null;
  if (d < ZERO) (n = -n), (d = -d);
  const g = gcd(n, d) || ONE;
  n /= g;
  d /= g;
  // příliš dlouhá čísla se dál nepočítají přesně
  if (n.toString().length > 60 || d.toString().length > 60) return { f: Number(n) / Number(d) };
  return { q: { n, d } };
};
const num = (v: Val) => ("q" in v ? Number(v.q.n) / Number(v.q.d) : v.f);
const flt = (x: number): Val | null => (Number.isFinite(x) ? { f: x } : null);

const add = (a: Val, b: Val, sign = 1): Val | null => ("q" in a && "q" in b ? frac(a.q.n * b.q.d + big(sign) * b.q.n * a.q.d, a.q.d * b.q.d) : flt(num(a) + sign * num(b)));
const mul = (a: Val, b: Val): Val | null => ("q" in a && "q" in b ? frac(a.q.n * b.q.n, a.q.d * b.q.d) : flt(num(a) * num(b)));
const div = (a: Val, b: Val): Val | null => {
  if (num(b) === 0) return null;
  return "q" in a && "q" in b ? frac(a.q.n * b.q.d, a.q.d * b.q.n) : flt(num(a) / num(b));
};
const neg = (a: Val): Val => ("q" in a ? { q: { n: -a.q.n, d: a.q.d } } : { f: -a.f });

function pow(a: Val, b: Val): Val | null {
  if ("q" in b && b.q.d === ONE && "q" in a) {
    const e = b.q.n;
    const ae = e < ZERO ? -e : e;
    if (ae <= big(200) && (a.q.n.toString().length * Number(ae) < 400 || a.q.n === ZERO || a.q.n === ONE)) {
      const p = Number(ae);
      const n = a.q.n ** big(p);
      const d = a.q.d ** big(p);
      return e < ZERO ? frac(d, n) : frac(n, d);
    }
  }
  const x = Math.pow(num(a), num(b));
  return flt(x);
}

/** Odmocnina: přesná, když je výsledek racionální (√(9/4) = 3/2), jinak desetinná. */
function root(a: Val, k: number): Val | null {
  if (k < 1 || !Number.isInteger(k)) return null;
  const x = num(a);
  if (x < 0 && k % 2 === 0) return null;
  if ("q" in a && a.q.n >= ZERO) {
    const iroot = (v: bigint): bigint | null => {
      const g = BigInt(Math.round(Math.pow(Number(v), 1 / k)));
      for (const c of [g - ONE, g, g + ONE]) if (c >= ZERO && c ** big(k) === v) return c;
      return null;
    };
    const n = iroot(a.q.n);
    const d = iroot(a.q.d);
    if (n !== null && d !== null) return frac(n, d);
  }
  return flt(x < 0 ? -Math.pow(-x, 1 / k) : Math.pow(x, 1 / k));
}

type Tok = { t: "num"; v: Val; dec: boolean } | { t: "op"; v: string } | { t: "cmd"; v: string } | { t: "open" | "close" } | { t: "lb" | "rb" };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  const s = src.replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°").replace(/\\left|\\right/g, "").replace(/\\[,;:! ]|~/g, " ");
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "&") {
      i++;
    } else if (/\d/.test(c) || (/[.,]/.test(c) && /\d/.test(s[i + 1] ?? ""))) {
      let j = i;
      let whole = "";
      let part = "";
      let dec = false;
      while (j < s.length && /\d/.test(s[j])) whole += s[j++];
      // desetinná část: 3.5, 3,5 nebo 3{,}5
      const m = /^(?:\{,\}|[.,])(\d+)/.exec(s.slice(j));
      if (m && !(s[j] === "," && /\s/.test(s[j + 1] ?? ""))) {
        part = m[1];
        j += m[0].length;
        dec = true;
      }
      const n = BigInt((whole || "0") + part);
      const d = big(10) ** big(part.length);
      const v = frac(n, d);
      if (!v) return null;
      out.push({ t: "num", v, dec });
      i = j;
    } else if (c === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      if (!m) return null;
      const name = m[1];
      i += m[0].length;
      if (name === "{" || name === "}") return null;
      if (name === "cdot" || name === "times" || name === "ast") out.push({ t: "op", v: "*" });
      else if (name === "div") out.push({ t: "op", v: "/" });
      else if (name === "%") out.push({ t: "op", v: "%" });
      else if (name === "circ") out.push({ t: "op", v: "°" });
      else out.push({ t: "cmd", v: name });
    } else if ("+-*/:^".includes(c)) {
      out.push({ t: "op", v: c === ":" ? "/" : c });
      i++;
    } else if (c === "(" || c === "[") {
      out.push({ t: "open" });
      i++;
    } else if (c === ")" || c === "]") {
      out.push({ t: "close" });
      i++;
    } else if (c === "{") {
      out.push({ t: "lb" });
      i++;
    } else if (c === "}") {
      out.push({ t: "rb" });
      i++;
    } else if (c === "%") {
      out.push({ t: "op", v: "%" });
      i++;
    } else if (c === "°") {
      out.push({ t: "op", v: "°" });
      i++;
    } else return null; // písmeno, dolní index, rovnítko…
  }
  return out;
}

const FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, exp: Math.exp, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, lg: Math.log10,
};

class Parser {
  i = 0;
  decimal = false;
  approxForced = false;
  constructor(private toks: Tok[]) {}
  private peek = () => this.toks[this.i];
  private isOp = (v: string) => {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  };
  done = () => this.i >= this.toks.length;

  /** součet a rozdíl */
  expr(): Val | null {
    let a = this.term();
    while (a && (this.isOp("+") || this.isOp("-"))) {
      const sign = (this.peek() as { v: string }).v === "+" ? 1 : -1;
      this.i++;
      const b = this.term();
      a = b && add(a, b, sign);
    }
    return a;
  }

  /** součin, podíl a násobení bez znaménka */
  term(): Val | null {
    let a = this.unary();
    while (a) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.peek() as { v: string }).v;
        this.i++;
        const b = this.unary();
        a = b && (op === "*" ? mul(a, b) : div(a, b));
      } else if (this.startsFactor()) {
        const b = this.power();
        a = b && mul(a, b);
      } else break;
    }
    return a;
  }

  private startsFactor() {
    const t = this.peek();
    return !!t && (t.t === "num" || t.t === "open" || t.t === "lb" || (t.t === "cmd" && t.v !== "cdot"));
  }

  unary(): Val | null {
    if (this.isOp("-")) {
      this.i++;
      const v = this.unary();
      return v && neg(v);
    }
    if (this.isOp("+")) {
      this.i++;
      return this.unary();
    }
    return this.power();
  }

  power(): Val | null {
    let base = this.postfix();
    if (base && this.isOp("^")) {
      this.i++;
      const e = this.isOp("-") ? (this.i++, this.primaryAfterSign()) : this.atom();
      base = e && pow(base, e);
    }
    return base;
  }

  private primaryAfterSign() {
    const v = this.atom();
    return v && neg(v);
  }

  /** procento a stupně za činitelem */
  postfix(): Val | null {
    let a = this.atom();
    while (a && (this.isOp("%") || this.isOp("°"))) {
      const op = (this.peek() as { v: string }).v;
      this.i++;
      if (op === "%") a = div(a, { q: { n: big(100), d: ONE } });
      else a = { f: num(a) * (Math.PI / 180) }; // stupně se převedou na radiány
    }
    return a;
  }

  private group(): Val | null {
    const t = this.peek();
    if (t?.t === "lb") {
      this.i++;
      const v = this.expr();
      if (this.peek()?.t !== "rb") return null;
      this.i++;
      return v;
    }
    return null;
  }

  /** číslo, závorka, {skupina} nebo příkaz */
  atom(): Val | null {
    const t = this.peek();
    if (!t) return null;
    if (t.t === "num") {
      this.i++;
      if (t.dec) this.decimal = true;
      return t.v;
    }
    if (t.t === "open") {
      this.i++;
      const v = this.expr();
      if (this.peek()?.t !== "close") return null;
      this.i++;
      return v;
    }
    if (t.t === "lb") return this.group();
    if (t.t === "cmd") {
      this.i++;
      const name = t.v;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const a = this.group();
        const b = a && this.group();
        return a && b && div(a, b);
      }
      if (name === "sqrt") {
        let k = 2;
        if (this.peek()?.t === "open") {
          // \sqrt[3]{8}
          this.i++;
          const kv = this.expr();
          if (!kv || this.peek()?.t !== "close") return null;
          this.i++;
          k = num(kv);
        }
        const a = this.group() ?? this.atom();
        return a && root(a, k);
      }
      if (name === "pi") {
        this.approxForced = true;
        return { f: Math.PI };
      }
      if (name in FUNCS) {
        const arg = this.group() ?? this.funcArg();
        if (!arg) return null;
        this.approxForced = true;
        const x = num(arg);
        return flt(FUNCS[name](x));
      }
      return null;
    }
    return null;
  }

  /** argument funkce bez závorek: sin 30° (zapsané i sin 30^\circ), stupně se převedou v postfix() */
  private funcArg(): Val | null {
    return this.postfix();
  }
}

export type CalcResult = { text: string; approx: boolean };

const trimDecimals = (x: number, digits = 6) => {
  const s = x.toFixed(digits);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

/** Spočítá výraz v LaTeXu a vrátí text, který se dá vložit za „=“ (nebo null, když to nejde). */
export function calcLatex(src: string): CalcResult | null {
  if (src.length > 300) return null;
  const toks = tokenize(src);
  if (!toks || !toks.length) return null;
  // samotné číslo nebo jen znaménko nemá smysl počítat
  if (toks.length === 1 && toks[0].t === "num") return null;
  const p = new Parser(toks);
  let v: Val | null = null;
  try {
    v = p.expr();
  } catch {
    return null;
  }
  if (!v || !p.done()) return null;
  const comma = /\{,\}|\d,\d/.test(src);
  const dot = (s: string) => (comma ? s.replace(".", "{,}") : s);
  const exactRational = "q" in v;
  if (exactRational) {
    const { n, d } = (v as { q: Frac }).q;
    if (d === ONE) return { text: n.toString(), approx: false };
    if (!p.decimal) return { text: `${n < ZERO ? "-" : ""}\\frac{${(n < ZERO ? -n : n).toString()}}{${d.toString()}}`, approx: false };
    // desetinná vstupní čísla → desetinný výsledek
    const x = Number(n) / Number(d);
    let dd = d;
    while (dd % big(2) === ZERO) dd /= big(2);
    while (dd % big(5) === ZERO) dd /= big(5);
    return { text: dot(trimDecimals(x, 10)), approx: dd !== ONE };
  }
  const x = (v as { f: number }).f;
  if (!Number.isFinite(x)) return null;
  const rounded = trimDecimals(x, 6);
  const exact = Number.isInteger(x) && !p.approxForced;
  return { text: dot(rounded === "-0" ? "0" : rounded), approx: !exact && Math.abs(Number(rounded) - x) > 1e-12 };
}
