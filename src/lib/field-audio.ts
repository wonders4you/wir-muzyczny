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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

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

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.01;
    comp.release.value = 0.18;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.7;
    this.master.connect(comp);
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
    this.drone.type = "sine";
    this.drone2.type = "sine";
    this.sub.type = "sine";
    this.drone.frequency.value = 96;
    this.drone2.frequency.value = 144;
    this.sub.frequency.value = 48;
    this.droneGain.gain.value = 0;
    this.drone2Gain.gain.value = 0;
    this.subGain.gain.value = 0;
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.7;
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

    this.probeOsc.type = "sine";
    this.probeOsc.frequency.value = 220;
    this.probeGain.gain.value = 0;
    this.probeOsc.connect(this.probeGain);
    this.probeGain.connect(this.probePan);
    this.probePan.connect(this.master);

    for (let i = 0; i < 5; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      osc.type = "sine";
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
  }) {
    if (!this.built || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const { domain, dt, speed, playing, probe, sources, metrics, field, t } =
      opts;
    const live = playing ? 1 : 0.0008;
    const magN = clamp(metrics.mag / 3.2, 0, 1);
    const curlN = clamp(metrics.curlAbs / 2.4, 0, 1);
    const divN = clamp(metrics.div / 3, -1, 1);
    const base = 78 + magN * 110;
    const fifth = sources.field ? lerp(1.002, 1.5, clamp(divN, 0, 1)) : 1.01;
    const detune = clamp(metrics.curl * 2.2, -18, 18);

    this.drone.frequency.setTargetAtTime(base, now, 0.08);
    this.drone2.frequency.setTargetAtTime(base * fifth + detune, now, 0.08);
    this.sub.frequency.setTargetAtTime(base * 0.5, now, 0.1);
    this.filter.frequency.setTargetAtTime(
      420 + magN * 2200 - divN * 280,
      now,
      0.1,
    );
    this.lfo.frequency.setTargetAtTime(0.08 + curlN * 2.6, now, 0.12);
    const spin = curlN * 0.55 * (metrics.curl >= 0 ? 1 : -1);
    this.lfoGain.gain.setTargetAtTime(spin, now, 0.12);
    this.lfoGain2.gain.setTargetAtTime(-spin * 0.85, now, 0.12);

    const fieldAmp = sources.field && playing ? 1 : 0;
    this.droneGain.gain.setTargetAtTime(0.11 * magN * fieldAmp * live, now, 0.08);
    this.drone2Gain.gain.setTargetAtTime(
      0.07 * (0.25 + curlN) * fieldAmp * live,
      now,
      0.08,
    );
    this.subGain.gain.setTargetAtTime(0.09 * magN * fieldAmp * live, now, 0.1);
    this.noiseFilter.frequency.setTargetAtTime(500 + magN * 1600, now, 0.1);
    this.noiseGain.gain.setTargetAtTime(
      0.018 * curlN * fieldAmp * live,
      now,
      0.1,
    );

    if (sources.probe && probe && probe.mag > 1e-6) {
      const pMag = clamp(probe.mag / 4, 0, 1);
      const freq = clamp(160 + (probe.y / domain) * 90 + pMag * 70, 80, 720);
      this.probeOsc.frequency.setTargetAtTime(freq, now, 0.04);
      this.probePan.pan.setTargetAtTime(
        clamp(probe.x / domain, -0.9, 0.9),
        now,
        0.05,
      );
      this.probeGain.gain.setTargetAtTime(0.07 * (0.2 + pMag) * live, now, 0.05);
    } else {
      this.probeGain.gain.setTargetAtTime(0, now, 0.06);
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
      const freq = clamp(190 + (w.y / domain) * 80 + i * 11, 90, 640);
      g.osc.frequency.setTargetAtTime(freq, now, 0.06);
      g.pan.pan.setTargetAtTime(clamp(w.x / domain, -0.95, 0.95), now, 0.08);
      g.gain.gain.setTargetAtTime(0.028 * grainAmp * live, now, 0.08);
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
};

export function useFieldAudio({
  field,
  domain,
  playing,
  speed,
  probe,
  volume,
  sources,
}: HookArgs) {
  const synthRef = useRef<FieldSynth | null>(null);
  const propsRef = useRef({ field, domain, playing, speed, probe, volume, sources });
  propsRef.current = { field, domain, playing, speed, probe, volume, sources };
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
    let raf = 0;
    let last = performance.now();
    let sim = 0;
    let lastUi = 0;
    let running = true;
    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.033, (now - last) / 1000);
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
      });
      if (now - lastUi > 80) {
        lastUi = now;
        setMetrics(m);
        setHz(synthRef.current?.readHz() ?? null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      const synth = synthRef.current;
      if (!synth || !listeningRef.current) return;
      if (document.hidden) synth.stop();
      else void synth.start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
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
