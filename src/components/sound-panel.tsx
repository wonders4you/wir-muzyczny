import { useEffect, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  describeTimbre,
  formatHz,
  resolveVoice,
  voiceName,
  VOICES,
  SCALES,
  type AudioSources,
  type FieldMetrics,
  type ScaleId,
  type SpeakerHz,
  type VoiceId,
} from "@/lib/field-audio";
import { formatPlain } from "@/lib/field-math";
import { TUNES } from "@/lib/tunes";
import { cn } from "@/lib/utils";

type Props = {
  listening: boolean;
  onStart: () => void;
  onStop: () => void;
  volume: number;
  onVolume: (value: number) => void;
  sources: AudioSources;
  onSources: (next: AudioSources) => void;
  voice: VoiceId;
  onVoice: (next: VoiceId) => void;
  scale: ScaleId;
  onScale: (next: ScaleId) => void;
  musicOn: boolean;
  onMusicOn: (next: boolean) => void;
  tuneId: string;
  onTuneId: (next: string) => void;
  metrics: FieldMetrics | null;
  analyser: AnalyserNode | null;
  playing: boolean;
  presetName: string;
  hz: SpeakerHz | null;
};

export function SoundPanel({
  listening,
  onStart,
  onStop,
  volume,
  onVolume,
  sources,
  onSources,
  voice,
  onVoice,
  scale,
  onScale,
  musicOn,
  onMusicOn,
  tuneId,
  onTuneId,
  metrics,
  analyser,
  playing,
  presetName,
  hz,
}: Props) {
  const timbre = metrics ? describeTimbre(metrics) : "Włącz słuchanie, żeby usłyszeć pole.";

  return (
    <section className="min-w-0 space-y-5">
      <div>
        <h2 className="font-serif text-lg italic leading-tight text-foreground">
          Sonifikacja
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fala z pola {presetName.toLowerCase()} — skręt kręci stereo, |F| ustala
          stopień skali, dywergencja jasność.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        variant={listening ? "secondary" : "default"}
        className="w-full"
        onClick={() => (listening ? onStop() : void onStart())}
      >
        {listening ? (
          <VolumeX className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
        {listening ? "Wycisz pole" : "Słuchaj pola"}
      </Button>

      <Waveform analyser={analyser} active={listening && playing} />

      <p className="text-sm leading-snug text-foreground">{timbre}</p>

      {metrics ? (
        <dl className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums text-muted-foreground">
          <div>
            <dt className="text-xs tracking-wide">|F|</dt>
            <dd className="text-foreground">{formatPlain(metrics.mag, 2)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide">skręt</dt>
            <dd className="text-foreground">{formatPlain(metrics.curl, 2)}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide">div</dt>
            <dd className="text-foreground">{formatPlain(metrics.div, 2)}</dd>
          </div>
        </dl>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-3">
          <Label>Głośność</Label>
          <span className="font-mono text-xs tabular-nums text-foreground">
            {Math.round(volume * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[volume]}
          onValueChange={(vals) => {
            const next = vals[0];
            if (typeof next === "number") onVolume(next);
          }}
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            Barwa
          </p>
          {metrics ? (
            <p className="font-mono text-xs tabular-nums text-foreground">
              {voice === "auto" ? `auto · ${voiceName(resolveVoice("auto", metrics))}` : voiceName(resolveVoice(voice, metrics))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VOICES.map((item) => (
            <VoiceToggle
              key={item.id}
              pressed={voice === item.id}
              label={item.name}
              onPressedChange={(on) => {
                if (on) onVoice(item.id);
              }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {VOICES.find((item) => item.id === voice)?.blurb}
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          Skala
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SCALES.map((item) => (
            <VoiceToggle
              key={item.id}
              pressed={scale === item.id}
              label={item.name}
              onPressedChange={(on) => {
                if (on) onScale(item.id);
              }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {SCALES.find((item) => item.id === scale)?.blurb}
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="music-toggle">Odtwarzaj muzykę</Label>
          <Switch
            id="music-toggle"
            checked={musicOn}
            onCheckedChange={onMusicOn}
          />
        </div>
        <label className="block">
          <span className="sr-only">Utwór</span>
          <select
            value={tuneId}
            disabled={!musicOn}
            onChange={(e) => onTuneId(e.target.value)}
            className="h-11 w-full min-w-0 rounded-md bg-background px-3 text-sm text-foreground shadow-[var(--shadow-border)] outline-none disabled:opacity-40"
          >
            <optgroup label="Beethoven">
              {TUNES.filter((t) => t.composer === "Beethoven").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Chopin">
              {TUNES.filter((t) => t.composer === "Chopin").map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Dłuższe frazy, pętla z oddechem na ok. 10 min. Strój A = 430 Hz,
          łagodne ześlizgi. Pauza zatrzymuje. Melodie z domeny publicznej.
        </p>
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          Źródła
        </p>
        <div className="flex flex-wrap gap-1.5">
          <VoiceToggle
            pressed={sources.field}
            label="Wir"
            onPressedChange={(v) => onSources({ ...sources, field: v })}
          />
          <VoiceToggle
            pressed={sources.probe}
            label="Sonda"
            onPressedChange={(v) => onSources({ ...sources, probe: v })}
          />
          <VoiceToggle
            pressed={sources.particles}
            label="Cząstki"
            onPressedChange={(v) => onSources({ ...sources, particles: v })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Sonda śpiewa w punkcie kursora. Cząstki to pięć cichych głosów idących
          z przepływem. Pauza wycisza falę.
        </p>
      </div>

      <SpeakerHzStrip hz={listening ? hz : null} />
    </section>
  );
}

export function SpeakerHzStrip({ hz }: { hz: SpeakerHz | null }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium tracking-wide text-muted-foreground">
        Hz w głośniku
      </p>
      {hz && hz.live ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-xs tabular-nums sm:grid-cols-5">
          <HzCell label="nuta" value={hz.melody} />
          <HzCell label="ton" value={hz.field} />
          <HzCell label="drugi" value={hz.second} />
          <HzCell label="sub" value={hz.sub} />
          <HzCell label="sonda" value={hz.probe} />
        </dl>
      ) : (
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
          cisza
        </p>
      )}
    </div>
  );
}

function HzCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        {value == null ? "—" : formatHz(value)}
      </dd>
    </div>
  );
}

function VoiceToggle({
  pressed,
  onPressedChange,
  label,
}: {
  pressed: boolean;
  onPressedChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "h-10 rounded-full px-3.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-(--motion-quick) ease-[var(--ease-out)]",
        pressed
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground shadow-[var(--shadow-border)] hover:bg-secondary hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function Waveform({
  analyser,
  active,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let running = true;
    const data = new Uint8Array(analyser ? analyser.fftSize : 256);

    const draw = () => {
      if (!running) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const styles = getComputedStyle(canvas);
      const bg = styles.getPropertyValue("--color-muted").trim() || "#1c1f26";
      const fg = styles.getPropertyValue("--color-arrow-hi").trim() || "#b7d0c8";
      const axis = styles.getPropertyValue("--color-axis").trim() || "rgb(236 236 230 / 0.32)";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2 + 0.5);
      ctx.lineTo(w, h / 2 + 0.5);
      ctx.stroke();

      if (analyser && active) {
        analyser.getByteTimeDomainData(data);
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < data.length; i += 1) {
          const x = (i / (data.length - 1)) * w;
          const y = ((data[i]! - 128) / 128) * (h * 0.42) + h / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [analyser, active]);

  return (
    <canvas
      ref={canvasRef}
      className="h-16 w-full rounded-md bg-muted shadow-[var(--shadow-border)]"
      aria-hidden="true"
    />
  );
}
