export type Vec2 = { u: number; v: number };

export type CompiledExpr = {
  source: string;
  js: string;
  usesTime: boolean;
  evaluate: (x: number, y: number, t: number) => number;
};

export type CompiledField = {
  fx: CompiledExpr;
  fy: CompiledExpr;
  usesTime: boolean;
  evaluate: (x: number, y: number, t: number) => Vec2;
};

export type CompileFailure = {
  ok: false;
  which: "fx" | "fy";
  message: string;
};

export type CompileSuccess = { ok: true; field: CompiledField };

export type CompileResult = CompileSuccess | CompileFailure;

const FUNCTIONS: Record<string, { js: string; min: number; max: number }> = {
  sin: { js: "Math.sin", min: 1, max: 1 },
  cos: { js: "Math.cos", min: 1, max: 1 },
  tan: { js: "Math.tan", min: 1, max: 1 },
  asin: { js: "Math.asin", min: 1, max: 1 },
  acos: { js: "Math.acos", min: 1, max: 1 },
  atan: { js: "Math.atan", min: 1, max: 1 },
  atan2: { js: "Math.atan2", min: 2, max: 2 },
  sinh: { js: "Math.sinh", min: 1, max: 1 },
  cosh: { js: "Math.cosh", min: 1, max: 1 },
  tanh: { js: "Math.tanh", min: 1, max: 1 },
  abs: { js: "Math.abs", min: 1, max: 1 },
  sqrt: { js: "Math.sqrt", min: 1, max: 1 },
  exp: { js: "Math.exp", min: 1, max: 1 },
  log: { js: "Math.log10", min: 1, max: 1 },
  ln: { js: "Math.log", min: 1, max: 1 },
  log10: { js: "Math.log10", min: 1, max: 1 },
  log2: { js: "Math.log2", min: 1, max: 1 },
  floor: { js: "Math.floor", min: 1, max: 1 },
  ceil: { js: "Math.ceil", min: 1, max: 1 },
  round: { js: "Math.round", min: 1, max: 1 },
  sign: { js: "Math.sign", min: 1, max: 1 },
  min: { js: "Math.min", min: 2, max: 8 },
  max: { js: "Math.max", min: 2, max: 8 },
  hypot: { js: "Math.hypot", min: 1, max: 8 },
  pow: { js: "Math.pow", min: 2, max: 2 },
};

const CONSTANTS: Record<string, string> = {
  pi: "Math.PI",
  e: "Math.E",
  tau: "(2*Math.PI)",
};

const VARS = new Set(["x", "y", "t", "r", "theta", "phi"]);

type TokType = "num" | "id" | "op" | "lp" | "rp" | "comma" | "eof";
type Tok = { type: TokType; value: string; pos: number };

type Ast =
  | { kind: "num"; value: string }
  | { kind: "var"; name: string }
  | { kind: "call"; name: string; args: Ast[] }
  | { kind: "unary"; op: "-"; arg: Ast }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: Ast; right: Ast };

class ParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

function normalize(src: string): string {
  return src
    .replace(/[−–—]/g, "-")
    .replace(/[×⋅·]/g, "*")
    .replace(/π/g, "pi")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(src: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === " ") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lp", value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rp", value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch, pos: i });
      i += 1;
      continue;
    }
    if ("+-*/^".includes(ch)) {
      tokens.push({ type: "op", value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === "." || (ch >= "0" && ch <= "9")) {
      const start = i;
      const m = src.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (!m) throw new ParseError("Niepoprawna liczba", i);
      tokens.push({ type: "num", value: m[0], pos: start });
      i += m[0].length;
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      const start = i;
      i += 1;
      while (i < src.length) {
        const c = src[i]!;
        if (
          (c >= "a" && c <= "z") ||
          (c >= "A" && c <= "Z") ||
          (c >= "0" && c <= "9") ||
          c === "_"
        ) {
          i += 1;
        } else break;
      }
      tokens.push({
        type: "id",
        value: src.slice(start, i).toLowerCase(),
        pos: start,
      });
      continue;
    }
    throw new ParseError(`Nieoczekiwany znak „${ch}”`, i);
  }
  tokens.push({ type: "eof", value: "", pos: src.length });
  return tokens;
}

function isFuncCall(id: Tok, next: Tok | undefined): boolean {
  return id.type === "id" && Boolean(FUNCTIONS[id.value]) && next?.type === "lp";
}

function insertImplicitMul(tokens: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const a = tokens[i]!;
    const b = tokens[i + 1];
    out.push(a);
    if (!b || a.type === "eof" || b.type === "eof") continue;
    if (isFuncCall(a, b)) continue;
    const aEnd = a.type === "num" || a.type === "rp" || a.type === "id";
    const bStart = b.type === "num" || b.type === "lp" || b.type === "id";
    if (aEnd && bStart) {
      out.push({ type: "op", value: "*", pos: b.pos });
    }
  }
  return out;
}

function parseExpr(src: string): { ast: Ast; usesTime: boolean } {
  const tokens = insertImplicitMul(tokenize(src));
  let i = 0;
  let usesTime = false;

  const peek = () => tokens[i]!;
  const eat = () => {
    const t = tokens[i]!;
    i += 1;
    return t;
  };

  const parsePrimary = (): Ast => {
    const t = peek();
    if (t.type === "op" && t.value === "-") {
      eat();
      return { kind: "unary", op: "-", arg: parsePower() };
    }
    if (t.type === "op" && t.value === "+") {
      eat();
      return parsePower();
    }
    if (t.type === "num") {
      eat();
      return { kind: "num", value: t.value };
    }
    if (t.type === "lp") {
      eat();
      const inner = parseAdd();
      if (peek().type !== "rp") {
        throw new ParseError("Brakujący nawias zamykający", peek().pos);
      }
      eat();
      return inner;
    }
    if (t.type === "id") {
      eat();
      const name = t.value;
      if (peek().type === "lp") {
        const spec = FUNCTIONS[name];
        if (!spec) {
          throw new ParseError(`Nieznana funkcja „${name}”`, t.pos);
        }
        eat();
        const args: Ast[] = [];
        if (peek().type !== "rp") {
          args.push(parseAdd());
          while (peek().type === "comma") {
            eat();
            args.push(parseAdd());
          }
        }
        if (peek().type !== "rp") {
          throw new ParseError("Brakujący nawias zamykający", peek().pos);
        }
        eat();
        if (args.length < spec.min || args.length > spec.max) {
          throw new ParseError(
            `Funkcja ${name} oczekuje ${spec.min === spec.max ? spec.min : `${spec.min}–${spec.max}`} argumentów`,
            t.pos,
          );
        }
        return { kind: "call", name, args };
      }
      if (FUNCTIONS[name]) {
        throw new ParseError(`Użyj nawiasów: ${name}(…)`, t.pos);
      }
      if (CONSTANTS[name]) {
        return { kind: "var", name };
      }
      if (VARS.has(name)) {
        if (name === "t") usesTime = true;
        return { kind: "var", name };
      }
      throw new ParseError(`Nieznana nazwa „${name}”`, t.pos);
    }
    throw new ParseError("Oczekiwano wyrażenia", t.pos);
  };

  const parsePower = (): Ast => {
    const left = parsePrimary();
    const t = peek();
    if (t.type === "op" && t.value === "^") {
      eat();
      return { kind: "bin", op: "^", left, right: parsePower() };
    }
    return left;
  };

  const parseMul = (): Ast => {
    let left = parsePower();
    for (;;) {
      const t = peek();
      if (t.type === "op" && (t.value === "*" || t.value === "/")) {
        eat();
        left = { kind: "bin", op: t.value, left, right: parsePower() };
      } else break;
    }
    return left;
  };

  const parseAdd = (): Ast => {
    let left = parseMul();
    for (;;) {
      const t = peek();
      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        eat();
        left = { kind: "bin", op: t.value, left, right: parseMul() };
      } else break;
    }
    return left;
  };

  const ast = parseAdd();
  if (peek().type !== "eof") {
    throw new ParseError("Nieoczekiwane znaki na końcu", peek().pos);
  }
  return { ast, usesTime };
}

function emit(ast: Ast): string {
  switch (ast.kind) {
    case "num":
      return ast.value;
    case "var": {
      if (ast.name === "pi") return "Math.PI";
      if (ast.name === "e") return "Math.E";
      if (ast.name === "tau") return "(2*Math.PI)";
      return ast.name;
    }
    case "call": {
      const spec = FUNCTIONS[ast.name]!;
      return `${spec.js}(${ast.args.map(emit).join(",")})`;
    }
    case "unary":
      return `(-(${emit(ast.arg)}))`;
    case "bin":
      if (ast.op === "^") return `Math.pow(${emit(ast.left)},${emit(ast.right)})`;
      return `(${emit(ast.left)}${ast.op}${emit(ast.right)})`;
  }
}

export function compileExpr(source: string): CompiledExpr {
  const normalized = normalize(source);
  if (!normalized) {
    throw new ParseError("Puste równanie", 0);
  }
  if (normalized.length > 220) {
    throw new ParseError("Równanie jest za długie", 0);
  }
  const { ast, usesTime } = parseExpr(normalized);
  const js = emit(ast);
  const fn = new Function(
    "x",
    "y",
    "t",
    "r",
    "theta",
    "phi",
    `"use strict"; return (${js});`,
  ) as (
    x: number,
    y: number,
    t: number,
    r: number,
    theta: number,
    phi: number,
  ) => number;

  const evaluate = (x: number, y: number, t: number) => {
    const r = Math.hypot(x, y);
    const theta = Math.atan2(y, x);
    const raw = fn(x, y, t, r, theta, theta);
    return typeof raw === "number" && Number.isFinite(raw) ? raw : NaN;
  };

  return { source: normalized, js, usesTime, evaluate };
}

export function compileField(fxSrc: string, fySrc: string): CompileResult {
  let fx: CompiledExpr;
  try {
    fx = compileExpr(fxSrc);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Błąd w Fx";
    return { ok: false, which: "fx", message };
  }
  let fy: CompiledExpr;
  try {
    fy = compileExpr(fySrc);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Błąd w Fy";
    return { ok: false, which: "fy", message };
  }

  const evaluate = (x: number, y: number, t: number): Vec2 => {
    const u = fx.evaluate(x, y, t);
    const v = fy.evaluate(x, y, t);
    if (!Number.isFinite(u) || !Number.isFinite(v)) return { u: 0, v: 0 };
    const mag = Math.hypot(u, v);
    if (mag > 1e6) {
      const s = 1e6 / mag;
      return { u: u * s, v: v * s };
    }
    return { u, v };
  };

  return {
    ok: true,
    field: {
      fx,
      fy,
      usesTime: fx.usesTime || fy.usesTime,
      evaluate,
    },
  };
}

export function formatSigned(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const v = Math.abs(n) >= 1000 || (Math.abs(n) > 0 && Math.abs(n) < 0.005)
    ? n.toExponential(2)
    : n.toFixed(digits);
  if (n > 0) return `+${v}`;
  return v;
}

export function formatPlain(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000 || (Math.abs(n) > 0 && Math.abs(n) < 0.005)) {
    return n.toExponential(2);
  }
  return n.toFixed(digits);
}
