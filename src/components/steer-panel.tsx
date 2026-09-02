import { useRef } from "react";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TILT_TARGETS,
  type TiltPermission,
  type TiltTarget,
} from "@/lib/tilt-control";
import { cn } from "@/lib/utils";

type Props = {
  enabled: boolean;
  onEnabled: (value: boolean) => Promise<void> | void;
  permission: TiltPermission;
  source: "gyro" | "pad";
  pitch: number;
  roll: number;
  pitchTarget: TiltTarget;
  rollTarget: TiltTarget;
  onPitchTarget: (id: TiltTarget) => void;
  onRollTarget: (id: TiltTarget) => void;
  onCalibrate: () => void;
  onPad: (next: { pitch: number; roll: number } | null) => void;
};

export function SteerPanel({
  enabled,
  onEnabled,
  permission,
  source,
  pitch,
  roll,
  pitchTarget,
  rollTarget,
  onPitchTarget,
  onRollTarget,
  onCalibrate,
  onPad,
}: Props) {
  return (
    <section className="min-w-0 space-y-5">
      <div>
        <h2 className="font-serif text-lg italic leading-tight text-foreground">
          Sterowanie
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pochyl telefon, żeby kręcić parametrami. Kalibracja ustawia obecne
          nachylenie jako zero.
        </p>
      </div>

      <div className="flex h-11 items-center justify-between gap-3">
        <p className="text-sm text-foreground">Pochylenie</p>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => void onEnabled(!enabled)}
          className={cn(
            "h-10 rounded-full px-3.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-(--motion-quick) ease-[var(--ease-out)]",
            enabled
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground shadow-[var(--shadow-border)] hover:bg-secondary hover:text-foreground",
          )}
        >
          {enabled ? "Włączone" : "Wyłączone"}
        </button>
      </div>

      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        {statusLine(permission, source, enabled)}
      </p>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={onCalibrate}
        disabled={!enabled}
      >
        <Compass className="size-4" />
        Kalibruj
      </Button>

      <TiltPad
        pitch={pitch}
        roll={roll}
        enabled={enabled}
        onPad={onPad}
      />

      <AxisBlock
        title="Pion · góra–dół"
        hint="beta"
        deg={pitch}
        value={pitchTarget}
        taken={rollTarget}
        onChange={onPitchTarget}
      />
      <AxisBlock
        title="Poziom · lewo–prawo"
        hint="gamma"
        deg={roll}
        value={rollTarget}
        taken={pitchTarget}
        onChange={onRollTarget}
      />
    </section>
  );
}

function statusLine(
  permission: TiltPermission,
  source: "gyro" | "pad",
  enabled: boolean,
) {
  if (!enabled) return "pochylenie wyłączone";
  if (permission === "denied") return "brak zgody na żyroskop";
  if (permission === "pending") return "czekam na zgodę…";
  if (source === "gyro") return "żyroskop";
  if (permission === "missing") return "brak czujnika — przeciągnij tarczę";
  return "tarcza (żyroskop, gdy telefon go da)";
}

function AxisBlock({
  title,
  hint,
  deg,
  value,
  taken,
  onChange,
}: {
  title: string;
  hint: string;
  deg: number;
  value: TiltTarget;
  taken: TiltTarget;
  onChange: (id: TiltTarget) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="font-mono text-xs tabular-nums text-foreground">
          {hint} {formatDeg(deg)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TILT_TARGETS.map((t) => {
          const disabled = t.id !== "none" && t.id === taken;
          const pressed = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              aria-pressed={pressed}
              onClick={() => onChange(t.id)}
              className={cn(
                "h-10 rounded-full px-3 text-sm font-medium transition-[color,background-color,box-shadow] duration-(--motion-quick) ease-[var(--ease-out)] disabled:opacity-40",
                pressed
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground shadow-[var(--shadow-border)] hover:bg-secondary hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatDeg(n: number) {
  const sign = n > 0.05 ? "+" : "";
  return `${sign}${n.toFixed(0)}°`;
}

function TiltPad({
  pitch,
  roll,
  enabled,
  onPad,
}: {
  pitch: number;
  roll: number;
  enabled: boolean;
  onPad: (next: { pitch: number; roll: number } | null) => void;
}) {
  const dragging = useRef(false);
  const areaRef = useRef<HTMLDivElement>(null);

  const fromPoint = (clientX: number, clientY: number) => {
    const el = areaRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const nx = ((clientX - box.left) / box.width) * 2 - 1;
    const ny = ((clientY - box.top) / box.height) * 2 - 1;
    onPad({
      roll: Math.max(-1, Math.min(1, nx)) * 30,
      pitch: Math.max(-1, Math.min(1, -ny)) * 30,
    });
  };

  const x = Math.max(-1, Math.min(1, roll / 30));
  const y = Math.max(-1, Math.min(1, pitch / 30));

  return (
    <div
      ref={areaRef}
      role="application"
      aria-label="Tarcza nachylenia"
      className={cn(
        "relative aspect-square w-full max-w-40 overflow-hidden rounded-md bg-muted shadow-[var(--shadow-border)]",
        enabled ? "cursor-pointer" : "opacity-50",
      )}
      onPointerDown={(e) => {
        if (!enabled) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPoint(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        fromPoint(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        dragging.current = false;
        onPad(null);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        onPad(null);
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border" />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" />
      <div
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
        style={{
          left: `${50 + x * 42}%`,
          top: `${50 - y * 42}%`,
        }}
      />
    </div>
  );
}
