import { useCallback, useEffect, useRef, useState } from "react";
import type { CompiledField } from "@/lib/field-math";

export type AudioProbe = {
  x: number;
  y: number;
  mag: number;
};

export type FieldMetrics = {
  mag: number;
  curl: number;
  curlAbs: number;
  div: number;
  divAbs: number;
};

export type AudioSources = {
  field: boolean;
  probe: boolean;
  particles: boolean;
};

export type VoiceKind = "pad" | "strings" | "organ" | "flute" | "bell" | "wind";
export type VoiceId = "auto" | VoiceKind;

export const VOICES: { id: VoiceId; name: string; blurb: string }[] = [
  { id: "auto", name: "Z pola", blurb: "Barwa idzie za skrętem i dywergencją" },
  { id: "pad", name: "Pad", blurb: "Miękki chór, niskie sinusy" },
  { id: "strings", name: "Smyczki", blurb: "Ciepłe alikwoty, bez ostrego brzęczenia" },
  { id: "organ", name: "Organ", blurb: "Czyste rejestry, jak flety organowe" },
  { id: "flute", name: "Flet", blurb: "Powietrzny, wyższy rejestr" },
  { id: "bell", name: "Dzwon", blurb: "Lekkie wybrzmienie, prawie oktawa" },
  { id: "wind", name: "Szum", blurb: "Miękki szum, bez syku" },
];

export function isVoiceId(v: unknown): v is VoiceId {
  return VOICES.some((item) => item.id === v);
}

export function voiceName(id: VoiceKind): string {
  return VOICES.find((item) => item.id === id)?.name ?? "Pad";
}

export function resolveVoice(id: VoiceId, m: FieldMetrics): VoiceKind {
  if (id !== "auto") return id;
  if (m.mag < 0.12) return "pad";
  if (m.curlAbs > 0.45 && m.curlAbs > m.divAbs * 1.15) return "pad";
  if (m.div > 0.35) return "strings";
  if (m.div < -0.35) return "organ";
  if (m.curlAbs > 0.2 && m.divAbs > 0.18) return "flute";
  if (m.divAbs < 0.12 && m.curlAbs < 0.12) return "wind";
  return "pad";
}

export type SpeakerHz = {
  field: number | null;
  second: number | null;
  sub: number | null;
  probe: number | null;
  spin: number;
  live: boolean;
};

export function formatHz(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 10) return `${n.toFixed(2)} Hz`;
  if (n < 100) return `${n.toFixed(1)} Hz`;
  return `${Math.round(n)} Hz`;
}

export function speakerParts(hz: SpeakerHz): string[] {
  const parts: string[] = [];
  if (hz.field != null) parts.push(formatHz(hz.field));
  if (hz.second != null) parts.push(formatHz(hz.second));
  if (hz.sub != null) parts.push(formatHz(hz.sub));
  if (hz.probe != null) parts.push(`sonda ${formatHz(hz.probe)}`);
  return parts;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function sampleMetrics(
  field: CompiledField,
  domain: number,
  t: number,
): FieldMetrics {
  const n = 7;
  const h = Math.max(domain * 0.06, 0.08);
  let magSum = 0;
  let curlSum = 0;
  let curlAbs = 0;
  let divSum = 0;
  let divAbs = 0;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const x = ((i + 0.5) / n) * 2 * domain - domain;
      const y = ((j + 0.5) / n) * 2 * domain - domain;
      const f = field.evaluate(x, y, t);
      const fx = field.evaluate(x + h, y, t);
      const fy = field.evaluate(x, y + h, t);
      const dFxdx = (fx.u - f.u) / h;
      const dFydy = (fy.v - f.v) / h;
      const dFydx = (fx.v - f.v) / h;
      const dFxdy = (fy.u - f.u) / h;
      const mag = Math.hypot(f.u, f.v);
      const curl = dFydx - dFxdy;
      const div = dFxdx + dFydy;
      magSum += Number.isFinite(mag) ? mag : 0;
      if (Number.isFinite(curl)) {
        curlSum += curl;
        curlAbs += Math.abs(curl);
      }
      if (Number.isFinite(div)) {
        divSum += div;
        divAbs += Math.abs(div);
      }
      count += 1;
    }
  }
  const inv = 1 / Math.max(1, count);
  return {
    mag: magSum * inv,
    curl: curlSum * inv,
    curlAbs: curlAbs * inv,
    div: divSum * inv,
    divAbs: divAbs * inv,
  };
}

export function describeTimbre(m: FieldMetrics): string {
  if (m.mag < 0.12) return "Cisza — słabe pole";
  if (m.curlAbs > 0.45 && m.curlAbs > m.divAbs * 1.15) {
    if (Math.abs(m.curl) < m.curlAbs * 0.35) {
      return "Para wirów — dwa głosy w przeciwnych kanałach";
    }
    return m.curl > 0
      ? "Wir — stereo kręci się w lewo"
      : "Wir — stereo kręci się w prawo";
  }
  if (m.div > 0.35) return "Źródło — spektrum się otwiera";
  if (m.div < -0.35) return "Ujście — ton zbiega do środka";
  if (m.curlAbs > 0.2 && m.divAbs > 0.18) return "Spirala — obrót z ssaniem";
  if (m.divAbs < 0.12 && m.curlAbs < 0.12) return "Prąd — równy, poziomy ton";
  return "Przepływ — mieszane pole";
}

type Walker = { x: number; y: number };

function makeNoiseBuffer(ctx: AudioContext) {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i += 1) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    data[i] = (b0 + b1 + b2 + w * 0.12) * 0.2;
  }
  return buffer;
}

function makeWave(ctx: AudioContext, partials: number[]) {
  const imag = new Float32Array(partials.length);
  const real = new Float32Array(partials.length);
  for (let i = 0; i < partials.length; i += 1) imag[i] = partials[i]!;
  return ctx.createPeriodicWave(real, imag);
}

const GRAIN_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

class FieldSynth {
  ctx: AudioContext;
  analyser: AnalyserNode;
  private master: GainNode;
  private drone: OscillatorNode;
  private drone2: OscillatorNode;
  private sub: OscillatorNode;
  private droneGain: GainNode;
  private drone2Gain: GainNode;
  private subGain: GainNode;
  private filter: BiquadFilterNode;
  private warmth: BiquadFilterNode;
  private panner: StereoPannerNode;
  private panner2: StereoPannerNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private lfoGain2: GainNode;
  private noise: AudioBufferSourceNode;
  private noiseFilter: BiquadFilterNode;
  private noiseGain: GainNode;
  private probeOsc: OscillatorNode;
  private probeGain: GainNode;
  private probePan: StereoPannerNode;
  private grains: Array<{
    osc: OscillatorNode;
    gain: GainNode;
    pan: StereoPannerNode;
  }>;
  private walkers: Walker[] = [];
  private built = false;
  private volume = 0.45;
  private voice: VoiceKind = "pad";
  private waves: Partial<Record<VoiceKind, PeriodicWave>> = {};

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 20;
    comp.ratio.value = 2.8;
    comp.attack.value = 0.025;
    comp.release.value = 0.32;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.7;
    this.warmth = this.ctx.createBiquadFilter();
    this.warmth.type = "lowpass";
    this.warmth.frequency.value = 2400;
    this.warmth.Q.value = 0.35;
    this.master.connect(this.warmth);
    this.warmth.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.drone = this.ctx.createOscillator();
    this.drone2 = this.ctx.createOscillator();
    this.sub = this.ctx.createOscillator();
    this.droneGain = this.ctx.createGain();
    this.drone2Gain = this.ctx.createGain();
    this.subGain = this.ctx.createGain();
    this.filter = this.ctx.createBiquadFilter();
    this.panner = this.ctx.createStereoPanner();
    this.panner2 = this.ctx.createStereoPanner();
    this.lfo = this.ctx.createOscillator();
    this.lfoGain = this.ctx.createGain();
    this.lfoGain2 = this.ctx.createGain();
    this.noise = this.ctx.createBufferSource();
    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseGain = this.ctx.createGain();
    this.probeOsc = this.ctx.createOscillator();
    this.probeGain = this.ctx.createGain();
    this.probePan = this.ctx.createStereoPanner();
    this.grains = [];
  }

  private build() {
    if (this.built) return;
    const ctx = this.ctx;
    const pad = makeWave(ctx, [0, 1, 0.16, 0.05, 0.02]);
    const strings = makeWave(ctx, [0, 1, 0.42, 0.2, 0.11, 0.06, 0.035, 0.02]);
    const organ = makeWave(ctx, [0, 1, 0.5, 0.06, 0.32, 0, 0.14, 0, 0.07]);
    const flute = makeWave(ctx, [0, 1, 0.1, 0.03]);
    const bell = makeWave(ctx, [0, 1, 0.1, 0.32, 0.05, 0.14]);
    this.waves = { pad, strings, organ, flute, bell };
    this.drone.setPeriodicWave(pad);
    this.drone2.setPeriodicWave(pad);
    this.sub.setPeriodicWave(pad);
    this.drone.frequency.value = 96;
    this.drone2.frequency.value = 144;
    this.sub.frequency.value = 48;
    this.droneGain.gain.value = 0;
    this.drone2Gain.gain.value = 0;
    this.subGain.gain.value = 0;
    this.filter.type = "lowpass";
    this.filter.frequency.value = 780;
    this.filter.Q.value = 0.5;
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.2;
    this.lfoGain.gain.value = 0;
    this.lfoGain2.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfo.connect(this.lfoGain2);
    this.lfoGain.connect(this.panner.pan);
    this.lfoGain2.connect(this.panner2.pan);

    this.drone.connect(this.droneGain);
    this.droneGain.connect(this.filter);
    this.filter.connect(this.panner);
    this.panner.connect(this.master);
    this.drone2.connect(this.drone2Gain);
    this.drone2Gain.connect(this.panner2);
    this.panner2.connect(this.master);
    this.sub.connect(this.subGain);
    this.subGain.connect(this.master);

    this.noise.buffer = makeNoiseBuffer(ctx);
    this.noise.loop = true;
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 800;
    this.noiseFilter.Q.value = 1.2;
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.master);

    this.probeOsc.setPeriodicWave(flute);
    this.probeOsc.frequency.value = 220;
    this.probeGain.gain.value = 0;
    this.probeOsc.connect(this.probeGain);
    this.probeGain.connect(this.probePan);
    this.probePan.connect(this.master);

    for (let i = 0; i < 5; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      osc.setPeriodicWave(flute);
      osc.frequency.value = 180 + i * 18;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);
      this.grains.push({ osc, gain, pan });
    }

    this.drone.start();
    this.drone2.start();
    this.sub.start();
    this.lfo.start();
    this.noise.start();
    this.probeOsc.start();
    for (const g of this.grains) g.osc.start();
    this.built = true;
  }

  private applyVoice(kind: VoiceKind) {
    if (!this.built || this.voice === kind) return;
    const wave = this.waves[kind] ?? this.waves.pad;
    const pad = this.waves.pad;
    const flute = this.waves.flute;
    if (!wave || !pad) return;
    this.drone.setPeriodicWave(wave);
    this.drone2.setPeriodicWave(kind === "flute" || kind === "wind" ? pad : wave);
    this.sub.setPeriodicWave(pad);
    this.probeOsc.setPeriodicWave(kind === "bell" ? wave : (flute ?? wave));
    const grainWave = kind === "strings" ? (flute ?? wave) : wave;
    for (const g of this.grains) g.osc.setPeriodicWave(grainWave);
    this.voice = kind;
  }

  async start() {
    this.build();
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (this.ctx.state !== "running") return false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.volume * 0.42, now, 0.06);
    return true;
  }

  stop() {
    if (!this.built) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.04);
    if (this.ctx.state === "running") void this.ctx.suspend();
  }

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    if (this.ctx.state === "running") {
      this.master.gain.setTargetAtTime(
        this.volume * 0.42,
        this.ctx.currentTime,
        0.05,
      );
    }
  }

  resetWalkers(domain: number) {
    this.walkers = this.grains.map(() => ({
      x: (Math.random() * 2 - 1) * domain * 0.8,
      y: (Math.random() * 2 - 1) * domain * 0.8,
    }));
  }

  tick(opts: {
    field: CompiledField;
    domain: number;
    t: number;
    dt: number;
    speed: number;
    playing: boolean;
    probe: AudioProbe | null;
    sources: AudioSources;
    metrics: FieldMetrics;
    voice: VoiceId;
  }) {
    if (!this.built || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const { domain, dt, speed, playing, probe, sources, metrics, field, t, voice } =
      opts;
    const kind = resolveVoice(voice, metrics);
    this.applyVoice(kind);
    const live = playing ? 1 : 0.0008;
    const magN = clamp(metrics.mag / 3.2, 0, 1);
    const curlN = clamp(metrics.curlAbs / 2.4, 0, 1);
    const divN = clamp(metrics.div / 3, -1, 1);
    const register =
      kind === "flute" ? 196 : kind === "bell" ? 147 : kind === "wind" ? 98 : 116.54;
    const base = register * 2 ** (magN * 0.5);
    const ratio =
      kind === "bell"
        ? 2.003
        : kind === "organ" || kind === "flute"
          ? 2
          : kind === "wind"
            ? 1.0015
            : 1.5;
    const cut =
      kind === "strings"
        ? 620 + magN * 680
        : kind === "flute"
          ? 1500 + magN * 800
          : kind === "bell"
            ? 1000 + magN * 500
            : kind === "organ"
              ? 880 + magN * 720
              : kind === "wind"
                ? 380 + magN * 320
                : 720 + magN * 780;
    const q =
      kind === "strings"
        ? 0.85
        : kind === "bell"
          ? 1.6
          : kind === "flute"
            ? 0.32
            : kind === "organ"
              ? 0.4
              : 0.5;
    const droneMix =
      kind === "wind" ? 0.04 : kind === "strings" ? 0.09 : kind === "bell" ? 0.1 : 0.13;
    const secondMix =
      kind === "wind" ? 0.02 : kind === "flute" ? 0.035 : kind === "organ" ? 0.07 : 0.048;
    const subMix = kind === "wind" ? 0.045 : kind === "flute" ? 0.035 : 0.09;

    this.drone.frequency.setTargetAtTime(base, now, 0.12);
    this.drone2.frequency.setTargetAtTime(base * ratio, now, 0.12);
    this.sub.frequency.setTargetAtTime(base * 0.5, now, 0.14);
    this.drone2.detune.setTargetAtTime(clamp(metrics.curl * 5, -8, 8), now, 0.16);
    this.filter.frequency.setTargetAtTime(cut + divN * 80, now, 0.16);
    this.filter.Q.setTargetAtTime(q, now, 0.16);
    this.warmth.frequency.setTargetAtTime(kind === "flute" ? 3200 : 2300, now, 0.2);
    this.lfo.frequency.setTargetAtTime(0.06 + curlN * 1.6, now, 0.16);
    const spin = curlN * 0.38 * (metrics.curl >= 0 ? 1 : -1);
    this.lfoGain.gain.setTargetAtTime(spin, now, 0.16);
    this.lfoGain2.gain.setTargetAtTime(-spin * 0.8, now, 0.16);

    const fieldAmp = sources.field && playing ? 1 : 0;
    this.droneGain.gain.setTargetAtTime(droneMix * magN * fieldAmp * live, now, 0.1);
    this.drone2Gain.gain.setTargetAtTime(
      secondMix * (0.35 + curlN * 0.5) * fieldAmp * live,
      now,
      0.1,
    );
    this.subGain.gain.setTargetAtTime(subMix * magN * fieldAmp * live, now, 0.12);
    this.noiseFilter.frequency.setTargetAtTime(
      kind === "wind" ? 320 + magN * 220 : kind === "flute" ? 1900 : 700 + magN * 400,
      now,
      0.14,
    );
    this.noiseFilter.Q.setTargetAtTime(kind === "wind" ? 0.7 : 0.9, now, 0.14);
    const noiseMix =
      kind === "wind"
        ? 0.08 * (0.4 + magN)
        : kind === "flute"
          ? 0.01
          : kind === "bell"
            ? 0.006 * magN
            : 0.0035 * curlN;
    this.noiseGain.gain.setTargetAtTime(noiseMix * fieldAmp * live, now, 0.12);

    if (sources.probe && probe && probe.mag > 1e-6) {
      const pMag = clamp(probe.mag / 4, 0, 1);
      const freq = clamp(160 + (probe.y / domain) * 90 + pMag * 70, 80, 720);
      this.probeOsc.frequency.setTargetAtTime(freq, now, 0.04);
      this.probePan.pan.setTargetAtTime(
        clamp(probe.x / domain, -0.9, 0.9),
        now,
        0.05,
      );
      this.probeGain.gain.setTargetAtTime(0.045 * (0.2 + pMag) * live, now, 0.06);
    } else {
      this.probeGain.gain.setTargetAtTime(0, now, 0.08);
    }

    if (this.walkers.length !== this.grains.length) this.resetWalkers(domain);
    const grainAmp = sources.particles && playing ? 1 : 0;
    for (let i = 0; i < this.grains.length; i += 1) {
      const w = this.walkers[i]!;
      const g = this.grains[i]!;
      if (playing) {
        const f = field.evaluate(w.x, w.y, t);
        const mag = Math.hypot(f.u, f.v);
        if (mag > 1e-6) {
          const vel = domain * 0.22 * speed;
          w.x += (f.u / mag) * vel * dt;
          w.y += (f.v / mag) * vel * dt;
        }
        if (Math.abs(w.x) > domain * 1.15 || Math.abs(w.y) > domain * 1.15) {
          w.x = (Math.random() * 2 - 1) * domain * 0.85;
          w.y = (Math.random() * 2 - 1) * domain * 0.85;
        }
      }
      const freq = clamp(base * (GRAIN_RATIOS[i] ?? 1), 80, 720);
      g.osc.frequency.setTargetAtTime(freq, now, 0.1);
      g.pan.pan.setTargetAtTime(clamp(w.x / domain, -0.95, 0.95), now, 0.1);
      g.gain.gain.setTargetAtTime(0.014 * grainAmp * live, now, 0.1);
    }
  }

  readHz(): SpeakerHz {
    const audible = (g: GainNode) => g.gain.value > 0.004;
    const fieldOn = audible(this.droneGain);
    const secondOn = audible(this.drone2Gain);
    const subOn = audible(this.subGain);
    const probeOn = audible(this.probeGain);
    const grainsOn = this.grains.some((g) => audible(g.gain));
    return {
      field: fieldOn ? this.drone.frequency.value : null,
      second: secondOn ? this.drone2.frequency.value : null,
      sub: subOn ? this.sub.frequency.value : null,
      probe: probeOn ? this.probeOsc.frequency.value : null,
      spin: this.lfo.frequency.value,
      live: fieldOn || secondOn || subOn || probeOn || grainsOn,
    };
  }
}

type HookArgs = {
  field: CompiledField;
  domain: number;
  playing: boolean;
  speed: number;
  probe: AudioProbe | null;
  volume: number;
  sources: AudioSources;
  voice: VoiceId;
};

export function useFieldAudio({
  field,
  domain,
  playing,
  speed,
  probe,
  volume,
  sources,
  voice,
}: HookArgs) {
  const synthRef = useRef<FieldSynth | null>(null);
  const propsRef = useRef({ field, domain, playing, speed, probe, volume, sources, voice });
  propsRef.current = { field, domain, playing, speed, probe, volume, sources, voice };
  const [listening, setListening] = useState(false);
  const [metrics, setMetrics] = useState<FieldMetrics | null>(null);
  const [hz, setHz] = useState<SpeakerHz | null>(null);
  const listeningRef = useRef(false);
  const wantedRef = useRef(true);

  const start = useCallback(async () => {
    wantedRef.current = true;
    if (!synthRef.current) synthRef.current = new FieldSynth();
    const synth = synthRef.current;
    if (listeningRef.current && synth.ctx.state === "running") return;
    synth.setVolume(propsRef.current.volume);
    if (!listeningRef.current) synth.resetWalkers(propsRef.current.domain);
    const ok = await synth.start();
    if (!ok) return;
    listeningRef.current = true;
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    synthRef.current?.stop();
    listeningRef.current = false;
    setListening(false);
    setHz(null);
  }, []);

  useEffect(() => {
    synthRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    let cancelled = false;
    const tryStart = () => {
      if (cancelled || !wantedRef.current) return;
      void start();
    };
    tryStart();
    window.addEventListener("pointerdown", tryStart);
    window.addEventListener("keydown", tryStart);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", tryStart);
      window.removeEventListener("keydown", tryStart);
    };
  }, [start]);

  useEffect(() => {
    if (!listening) return;
    let timer = 0;
    let last = performance.now();
    let sim = 0;
    let lastUi = 0;
    let running = true;
    const loop = () => {
      if (!running) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = propsRef.current;
      if (p.playing) sim += dt;
      const m = sampleMetrics(p.field, p.domain, sim);
      synthRef.current?.tick({
        field: p.field,
        domain: p.domain,
        t: sim,
        dt,
        speed: p.speed,
        playing: p.playing,
        probe: p.probe,
        sources: p.sources,
        metrics: m,
        voice: p.voice,
      });
      if (!document.hidden && now - lastUi > 80) {
        lastUi = now;
        setMetrics(m);
        setHz(synthRef.current?.readHz() ?? null);
      }
    };
    timer = window.setInterval(loop, 40);
    loop();
    const onVis = () => {
      if (!wantedRef.current || !listeningRef.current) return;
      if (!document.hidden) void synthRef.current?.start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      running = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [listening]);

  useEffect(() => {
    return () => {
      synthRef.current?.stop();
    };
  }, []);

  return {
    listening,
    start,
    stop,
    analyser: listening ? (synthRef.current?.analyser ?? null) : null,
    metrics,
    hz,
  };
}
