import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { EquationEditor } from "@/components/equation-editor";
import { PresetPicker } from "@/components/preset-picker";
import { SoundPanel } from "@/components/sound-panel";
import { SteerPanel } from "@/components/steer-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  VectorFieldCanvas,
  type ProbeReadout,
} from "@/components/vector-field-canvas";
import {
  compileField,
  formatPlain,
  formatSigned,
  type CompiledField,
} from "@/lib/field-math";
import { DEFAULT_PRESET, FEATURED_PRESETS, PRESETS } from "@/lib/presets";
import { useFieldAudio, speakerParts, type AudioSources, type SpeakerHz, isVoiceId, type VoiceId, isScaleId, type ScaleId } from "@/lib/field-audio";
import { DEFAULT_TUNE_ID, isTuneId } from "@/lib/tunes";
import {
  mapTilt,
  specFor,
  useDeviceTilt,
  type TiltTarget,
} from "@/lib/tilt-control";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "wir:v1";

const FALLBACK_FIELD: CompiledField = (() => {
  const result = compileField("-y", "x");
  if (!result.ok) throw new Error(result.message);
  return result.field;
})();

type PanelTab = "field" | "sound" | "steer";

type Saved = {
  fx: string;
  fy: string;
  presetId: string | null;
  density: number;
  particleCount: number;
  speed: number;
  domain: number;
  showArrows: boolean;
  showParticles: boolean;
  showFlow: boolean;
  normalize: boolean;
  panel: PanelTab;
  volume: number;
  listenField: boolean;
  listenProbe: boolean;
  listenParticles: boolean;
  voice: VoiceId;
  scale: ScaleId;
  musicOn: boolean;
  tuneId: string;
  recentIds: string[];
  pitchTarget: TiltTarget;
  rollTarget: TiltTarget;
};

function loadSaved(): Partial<Saved> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Saved;
  } catch {
    return null;
  }
}

function isTiltTarget(v: unknown): v is TiltTarget {
  return (
    v === "none" ||
    v === "density" ||
    v === "particles" ||
    v === "speed" ||
    v === "domain" ||
    v === "volume"
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-card" />
      <circle
        cx="16"
        cy="16"
        r="9"
        fill="none"
        className="stroke-arrow-hi"
        strokeWidth="1.4"
        strokeDasharray="4 3.2"
      />
      <path
        d="M16 7.2 A8.8 8.8 0 0 1 24.8 16"
        fill="none"
        className="stroke-foreground"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M23.2 13.4 L24.8 16 L21.6 16.3"
        fill="none"
        className="stroke-foreground"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="1.6" className="fill-primary" />
    </svg>
  );
}

export function FieldStudio() {
  const [fx, setFx] = useState(DEFAULT_PRESET.fx);
  const [fy, setFy] = useState(DEFAULT_PRESET.fy);
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id);
  const [density, setDensity] = useState(16);
  const [particleCount, setParticleCount] = useState(180);
  const [speed, setSpeed] = useState(1);
  const [domain, setDomain] = useState(DEFAULT_PRESET.domain);
  const [playing, setPlaying] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [showParticles, setShowParticles] = useState(true);
  const [showFlow, setShowFlow] = useState(true);
  const [normalize, setNormalize] = useState(true);
  const [panel, setPanel] = useState<PanelTab>("field");
  const [volume, setVolume] = useState(0.45);
  const [sources, setSources] = useState<AudioSources>({
    field: true,
    probe: true,
    particles: true,
  });
  const [voice, setVoice] = useState<VoiceId>("auto");
  const [scale, setScale] = useState<ScaleId>("penta");
  const [musicOn, setMusicOn] = useState(false);
  const [tuneId, setTuneId] = useState(DEFAULT_TUNE_ID);
  const [probe, setProbe] = useState<ProbeReadout | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    FEATURED_PRESETS.slice(0, 6).map((p) => p.id),
  );
  const [tiltOn, setTiltOn] = useState(false);
  const [pitchTarget, setPitchTarget] = useState<TiltTarget>("speed");
  const [rollTarget, setRollTarget] = useState<TiltTarget>("density");
  const lastGood = useRef<CompiledField>(FALLBACK_FIELD);
  const tiltCenters = useRef({
    density: 16,
    particles: 180,
    speed: 1,
    domain: DEFAULT_PRESET.domain,
    volume: 0.45,
  });

  useEffect(() => {
    const saved = loadSaved();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (saved) {
      if (typeof saved.fx === "string") setFx(saved.fx);
      if (typeof saved.fy === "string") setFy(saved.fy);
      if (saved.presetId === null || typeof saved.presetId === "string") {
        setPresetId(saved.presetId ?? null);
      }
      if (typeof saved.density === "number") setDensity(saved.density);
      if (typeof saved.particleCount === "number") {
        setParticleCount(saved.particleCount);
      }
      if (typeof saved.speed === "number") setSpeed(saved.speed);
      if (typeof saved.domain === "number") setDomain(saved.domain);
      if (typeof saved.showArrows === "boolean") setShowArrows(saved.showArrows);
      if (typeof saved.showParticles === "boolean") {
        setShowParticles(saved.showParticles);
      }
      if (typeof saved.showFlow === "boolean") setShowFlow(saved.showFlow);
      if (typeof saved.normalize === "boolean") setNormalize(saved.normalize);
      if (saved.panel === "field" || saved.panel === "sound" || saved.panel === "steer") {
        setPanel(saved.panel);
      }
      if (isTiltTarget(saved.pitchTarget)) setPitchTarget(saved.pitchTarget);
      if (isTiltTarget(saved.rollTarget)) setRollTarget(saved.rollTarget);
      if (typeof saved.volume === "number") setVolume(saved.volume);
      setSources((prev) => ({
        field:
          typeof saved.listenField === "boolean" ? saved.listenField : prev.field,
        probe:
          typeof saved.listenProbe === "boolean" ? saved.listenProbe : prev.probe,
        particles:
          typeof saved.listenParticles === "boolean"
            ? saved.listenParticles
            : prev.particles,
      }));
      if (isVoiceId(saved.voice)) setVoice(saved.voice);
      if (isScaleId(saved.scale)) setScale(saved.scale);
      if (typeof saved.musicOn === "boolean") setMusicOn(saved.musicOn);
      if (isTuneId(saved.tuneId)) setTuneId(saved.tuneId);
      if (Array.isArray(saved.recentIds)) {
        const valid = saved.recentIds.filter(
          (id): id is string =>
            typeof id === "string" && PRESETS.some((p) => p.id === id),
        );
        if (valid.length > 0) {
          const padded = [...valid];
          for (const p of FEATURED_PRESETS) {
            if (padded.length >= 6) break;
            if (!padded.includes(p.id)) padded.push(p.id);
          }
          setRecentIds(padded.slice(0, 6));
        }
      }
    }
    setPlaying(!reduce);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Saved = {
      fx,
      fy,
      presetId,
      density,
      particleCount,
      speed,
      domain,
      showArrows,
      showParticles,
      showFlow,
      normalize,
      panel,
      volume,
      listenField: sources.field,
      listenProbe: sources.probe,
      listenParticles: sources.particles,
      voice,
      scale,
      musicOn,
      tuneId,
      recentIds,
      pitchTarget,
      rollTarget,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }, [
    hydrated,
    fx,
    fy,
    presetId,
    density,
    particleCount,
    speed,
    domain,
    showArrows,
    showParticles,
    showFlow,
    normalize,
    panel,
    volume,
    sources,
    voice,
    scale,
    musicOn,
    tuneId,
    recentIds,
    pitchTarget,
    rollTarget,
  ]);

  const compiled = useMemo(() => compileField(fx, fy), [fx, fy]);
  if (compiled.ok) lastGood.current = compiled.field;
  const activeField = compiled.ok ? compiled.field : lastGood.current;
  const error = compiled.ok
    ? null
    : { which: compiled.which, message: compiled.message };

  const audio = useFieldAudio({
    field: activeField,
    domain,
    playing,
    speed,
    probe,
    volume,
    sources,
    voice,
    scale,
    musicOn,
    tuneId,
  });

  const tilt = useDeviceTilt(tiltOn);

  const snapshotCenters = () => {
    tiltCenters.current = {
      density,
      particles: particleCount,
      speed,
      domain,
      volume,
    };
  };

  const applyTiltAxis = (target: TiltTarget, deg: number) => {
    const spec = specFor(target);
    if (!spec || target === "none") return;
    const center = tiltCenters.current[target];
    const next = mapTilt(deg, spec, center);
    if (target === "density") setDensity((p) => (p === next ? p : next));
    else if (target === "particles") setParticleCount((p) => (p === next ? p : next));
    else if (target === "speed") setSpeed((p) => (p === next ? p : next));
    else if (target === "domain") setDomain((p) => (p === next ? p : next));
    else if (target === "volume") setVolume((p) => (p === next ? p : next));
  };

  useEffect(() => {
    if (!tiltOn) return;
    applyTiltAxis(pitchTarget, tilt.pitch);
    applyTiltAxis(rollTarget, tilt.roll);
  }, [tiltOn, tilt.pitch, tilt.roll, pitchTarget, rollTarget]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      setPlaying((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const applyPreset = (id: string, remember: boolean) => {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setPresetId(preset.id);
    setFx(preset.fx);
    setFy(preset.fy);
    setDomain(preset.domain);
    setResetToken((n) => n + 1);
    if (!remember) return;
    setRecentIds((prev) => {
      if (prev.includes(id)) return prev;
      return [id, ...prev].slice(0, 6);
    });
  };

  const onFx = (value: string) => {
    setFx(value);
    setPresetId(null);
  };
  const onFy = (value: string) => {
    setFy(value);
    setPresetId(null);
  };

  const angleDeg = probe ? (probe.angle * 180) / Math.PI : 0;
  const presetName = presetId
    ? PRESETS.find((p) => p.id === presetId)?.name
    : "Własne";
  const presetBlurb = presetId
    ? PRESETS.find((p) => p.id === presetId)?.blurb
    : "Własne równanie — pole rysuje się na bieżąco.";

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark />
            <div className="min-w-0">
              <h1 className="font-serif text-2xl italic leading-none tracking-tight">
                Wir Muzyczny
              </h1>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Pole wektorowe i dźwięk
              </p>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="font-mono text-xs text-muted-foreground">{presetName}</p>
            <p className="font-mono text-xs text-muted-foreground/80">
              [−{domain}, {domain}]²
            </p>
          </div>
        </header>

        <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
          <section className="relative min-h-80 min-w-0 p-3 sm:p-4 lg:min-h-0 lg:p-5">
            <div className="relative h-[min(68dvh,720px)] min-h-80 overflow-hidden rounded-xl bg-field shadow-[var(--shadow-border)] lg:h-[calc(100dvh-8.75rem)]">
              <VectorFieldCanvas
                field={activeField}
                density={density}
                particleCount={particleCount}
                speed={speed}
                domain={domain}
                playing={playing}
                showArrows={showArrows}
                showParticles={showParticles}
                showFlow={showFlow}
                normalize={normalize}
                resetToken={resetToken}
                onProbe={setProbe}
              />

              <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
                <div className="pointer-events-auto absolute bottom-12 left-3 flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        aria-label={playing ? "Pauza" : "Odtwarzaj"}
                        onClick={() => setPlaying((v) => !v)}
                      >
                        {playing ? (
                          <Pause className="size-4" />
                        ) : (
                          <Play className="size-4 translate-x-px" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {playing ? "Pauza" : "Odtwarzaj"} · spacja
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        aria-label="Zresetuj cząstki"
                        onClick={() => setResetToken((n) => n + 1)}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Zresetuj cząstki</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant={audio.listening ? "pressed" : "secondary"}
                        aria-label={
                          audio.listening ? "Wycisz pole" : "Słuchaj pola"
                        }
                        onClick={() =>
                          audio.listening ? audio.stop() : void audio.start()
                        }
                      >
                        {audio.listening ? (
                          <Volume2 className="size-4" />
                        ) : (
                          <VolumeX className="size-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {audio.listening ? "Wycisz pole" : "Słuchaj pola"}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="pointer-events-none absolute right-3 bottom-12 max-w-[min(18rem,calc(100%-5.5rem))] rounded-lg bg-card/85 px-3 py-2 shadow-[var(--shadow-border)]">
                  {probe ? (
                    <div className="font-mono text-xs leading-relaxed tabular-nums">
                      <p className="text-muted-foreground">
                        ({formatSigned(probe.x)}, {formatSigned(probe.y)})
                      </p>
                      <p className="text-foreground">
                        F = ({formatSigned(probe.u)}, {formatSigned(probe.v)})
                      </p>
                      <p className="text-muted-foreground">
                        |F| {formatPlain(probe.mag)} · θ {formatSigned(angleDeg, 1)}°
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Najedź lub dotknij, aby odczytać F(x, y). Kliknięcie dodaje
                      cząstkę.
                    </p>
                  )}
                </div>
              </div>

              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 flex items-baseline justify-between gap-3 border-t border-border/70 bg-card/90 px-3 py-1.5"
                aria-live="polite"
              >
                <span className="shrink-0 text-xs text-muted-foreground">
                  Głośnik
                </span>
                {audio.listening && audio.hz?.live ? (
                  <SpeakerLine hz={audio.hz} />
                ) : (
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    cisza
                  </p>
                )}
              </div>
            </div>
          </section>

          <aside className="flex min-w-0 flex-col gap-5 overflow-x-hidden border-t border-border px-4 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:px-5">
            <div
              className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
              role="tablist"
              aria-label="Panel boczny"
            >
              <button
                type="button"
                role="tab"
                aria-selected={panel === "field"}
                onClick={() => setPanel("field")}
                className={cn(
                  "h-10 rounded-md px-1 text-xs font-medium transition-[color,background-color] duration-(--motion-quick) ease-[var(--ease-out)] sm:text-sm",
                  panel === "field"
                    ? "bg-background text-foreground shadow-[var(--shadow-border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Pole
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panel === "sound"}
                onClick={() => setPanel("sound")}
                className={cn(
                  "h-10 rounded-md px-1 text-xs font-medium transition-[color,background-color] duration-(--motion-quick) ease-[var(--ease-out)] sm:text-sm",
                  panel === "sound"
                    ? "bg-background text-foreground shadow-[var(--shadow-border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Dźwięk
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panel === "steer"}
                onClick={() => setPanel("steer")}
                className={cn(
                  "h-10 rounded-md px-1 text-xs font-medium transition-[color,background-color] duration-(--motion-quick) ease-[var(--ease-out)] sm:text-sm",
                  panel === "steer"
                    ? "bg-background text-foreground shadow-[var(--shadow-border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Sterowanie
              </button>
            </div>

            {panel === "field" ? (
              <PresetPicker
                presetId={presetId}
                blurb={presetBlurb ?? ""}
                recentIds={recentIds}
                onPickCatalog={(id) => applyPreset(id, true)}
                onPickRecent={(id) => applyPreset(id, false)}
              />
            ) : null}

            {panel === "sound" ? (
              <SoundPanel
                listening={audio.listening}
                onStart={audio.start}
                onStop={audio.stop}
                volume={volume}
                onVolume={setVolume}
                sources={sources}
                onSources={setSources}
                voice={voice}
                onVoice={setVoice}
                scale={scale}
                onScale={setScale}
                musicOn={musicOn}
                onMusicOn={setMusicOn}
                tuneId={tuneId}
                onTuneId={setTuneId}
                metrics={audio.metrics}
                analyser={audio.analyser}
                playing={playing}
                presetName={presetName ?? "Własne"}
                hz={audio.hz}
              />
            ) : panel === "steer" ? (
              <SteerPanel
                enabled={tiltOn}
                onEnabled={async (next) => {
                  if (next) {
                    snapshotCenters();
                    await tilt.requestAccess();
                    setTiltOn(true);
                    tilt.calibrate();
                  } else {
                    setTiltOn(false);
                    tilt.setPad(null);
                  }
                }}
                permission={tilt.permission}
                source={tilt.source}
                pitch={tilt.pitch}
                roll={tilt.roll}
                pitchTarget={pitchTarget}
                rollTarget={rollTarget}
                onPitchTarget={(id) => {
                  setPitchTarget(id);
                  snapshotCenters();
                }}
                onRollTarget={(id) => {
                  setRollTarget(id);
                  snapshotCenters();
                }}
                onCalibrate={() => {
                  snapshotCenters();
                  tilt.calibrate();
                }}
                onPad={tilt.setPad}
              />
            ) : (
              <>
            <EquationEditor
              fx={fx}
              fy={fy}
              error={error}
              usesTime={activeField.usesTime}
              onFx={onFx}
              onFy={onFy}
            />

            <Separator />

            <div className="space-y-4">
              <ControlSlider
                label="Gęstość strzałek"
                value={density}
                display={String(density)}
                min={6}
                max={32}
                step={1}
                onChange={setDensity}
              />
              <ControlSlider
                label="Liczba cząstek"
                value={particleCount}
                display={String(particleCount)}
                min={40}
                max={420}
                step={10}
                onChange={setParticleCount}
              />
              <ControlSlider
                label="Prędkość"
                value={speed}
                display={speed.toFixed(1)}
                min={0.2}
                max={2.6}
                step={0.1}
                onChange={setSpeed}
              />
              <ControlSlider
                label="Zakres osi"
                value={domain}
                display={`±${domain}`}
                min={2}
                max={10}
                step={1}
                onChange={setDomain}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                Warstwy
              </p>
              <div className="flex flex-wrap gap-1.5">
                <LayerToggle
                  pressed={showArrows}
                  onPressedChange={setShowArrows}
                  label="Strzałki"
                />
                <LayerToggle
                  pressed={showParticles}
                  onPressedChange={setShowParticles}
                  label="Cząstki"
                />
                <LayerToggle
                  pressed={showFlow}
                  onPressedChange={setShowFlow}
                  label="Przepływ"
                />
              </div>
              <div className="flex h-11 items-center justify-between gap-3">
                <p className="text-sm text-foreground">Stała prędkość cząstek</p>
                <LayerToggle
                  pressed={normalize}
                  onPressedChange={setNormalize}
                  label={normalize ? "Włączona" : "Wyłączona"}
                />
              </div>
            </div>
              </>
            )}
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-4 py-2 sm:px-6">
          <p className="text-xs text-muted-foreground">
            Autor{" "}
            <a
              href="https://wonders4you.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-serif italic text-foreground underline-offset-4 transition-colors hover:underline"
            >
              Tomasz Urban
            </a>
          </p>
          <nav className="flex flex-wrap items-center gap-x-3 text-xs">
            <a
              href="https://wonders4you.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              wonders4you.com
            </a>
            <span className="text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <a
              href="https://gazetkakreatywna.pl/tools/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Więcej narzędzi
            </a>
          </nav>
        </footer>
      </div>
    </TooltipProvider>
  );
}

function SpeakerLine({ hz }: { hz: SpeakerHz }) {
  const parts = speakerParts(hz);
  const primary = parts[0] ?? "—";
  const rest = parts.slice(1).join(" · ");
  return (
    <p className="min-w-0 truncate text-right font-mono text-xs tabular-nums text-foreground">
      <span className="text-sm">{primary}</span>
      {rest ? <span className="text-muted-foreground"> · {rest}</span> : null}
    </p>
  );
}

function ControlSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="font-mono text-xs tabular-nums text-foreground">
          {display}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(vals) => {
          const next = vals[0];
          if (typeof next === "number") onChange(next);
        }}
      />
    </div>
  );
}

function LayerToggle({
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
