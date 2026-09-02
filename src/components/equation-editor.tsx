import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SNIPPETS = ["sin", "cos", "tan", "abs", "sqrt", "exp", "ln", "r", "theta", "t"];

type Props = {
  fx: string;
  fy: string;
  error: { which: "fx" | "fy"; message: string } | null;
  usesTime: boolean;
  onFx: (value: string) => void;
  onFy: (value: string) => void;
};

export function EquationEditor({ fx, fy, error, usesTime, onFx, onFy }: Props) {
  const fxRef = useRef<HTMLInputElement>(null);
  const fyRef = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState<"fx" | "fy">("fx");

  const insert = (token: string) => {
    const snippet = token === "r" || token === "theta" || token === "t" ? token : `${token}(`;
    const target = last === "fy" ? fyRef.current : fxRef.current;
    const current = last === "fy" ? fy : fx;
    const set = last === "fy" ? onFy : onFx;
    if (!target) {
      set(current + snippet);
      return;
    }
    const start = target.selectionStart ?? current.length;
    const end = target.selectionEnd ?? current.length;
    const next = current.slice(0, start) + snippet + current.slice(end);
    set(next);
    requestAnimationFrame(() => {
      target.focus();
      const pos = start + snippet.length;
      target.setSelectionRange(pos, pos);
    });
  };

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg italic leading-tight text-foreground">
            Pole wektorowe
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            F(x, y{usesTime ? ", t" : ""}) w ℝ²
          </p>
        </div>
        <span
          className={cn(
            "mb-0.5 size-2 rounded-full",
            error ? "bg-warn" : "bg-arrow-hi",
          )}
          title={error ? error.message : "Równanie poprawne"}
        />
      </div>

      <div className="flex min-w-0 items-stretch gap-3 rounded-xl bg-muted/60 p-3 shadow-[var(--shadow-border)]">
        <div className="flex shrink-0 flex-col items-center justify-center px-1">
          <span className="font-serif text-2xl italic leading-none text-foreground">F</span>
          <span className="mt-1 font-mono text-xs text-muted-foreground">
            (x,y{usesTime ? ",t" : ""})
          </span>
        </div>
        <div className="flex items-center font-serif text-xl text-muted-foreground">=</div>
        <div className="flex min-w-0 flex-1 border-l-2 border-foreground/35 pl-3">
          <div className="flex w-full min-w-0 flex-col gap-2 py-0.5">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="fx" className="font-mono">
                Fₓ
              </Label>
              <Input
                id="fx"
                ref={fxRef}
                value={fx}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error?.which === "fx"}
                aria-describedby={error?.which === "fx" ? "fx-error" : undefined}
                className={cn(
                  "italic",
                  error?.which === "fx" && "ring-2 ring-warn/70",
                )}
                onFocus={() => setLast("fx")}
                onChange={(e) => onFx(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="fy" className="font-mono">
                Fᵧ
              </Label>
              <Input
                id="fy"
                ref={fyRef}
                value={fy}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error?.which === "fy"}
                aria-describedby={error?.which === "fy" ? "fy-error" : undefined}
                className={cn(
                  "italic",
                  error?.which === "fy" && "ring-2 ring-warn/70",
                )}
                onFocus={() => setLast("fy")}
                onChange={(e) => onFy(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p
          id={error.which === "fx" ? "fx-error" : "fy-error"}
          className="text-xs text-warn"
          role="alert"
        >
          {error.which === "fx" ? "Fₓ: " : "Fᵧ: "}
          {error.message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Dozwolone: x y t r theta, stałe pi e, funkcje sin cos tan abs sqrt exp ln
          oraz nawiasy, ^, + − × /. Ułamki z kropką.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {SNIPPETS.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => insert(token)}
            className="h-8 rounded-md px-2 font-mono text-xs text-muted-foreground shadow-[var(--shadow-border)] transition-[color,background-color,box-shadow] duration-(--motion-quick) ease-[var(--ease-out)] hover:bg-secondary hover:text-foreground hover:shadow-[var(--shadow-border-hover)]"
          >
            {token}
            {token !== "r" && token !== "theta" && token !== "t" ? "()" : ""}
          </button>
        ))}
      </div>
    </section>
  );
}
