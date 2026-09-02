import { useEffect, useRef } from "react";
import type { CompiledField } from "@/lib/field-math";

export type ProbeReadout = {
  x: number;
  y: number;
  u: number;
  v: number;
  mag: number;
  angle: number;
};

type Props = {
  field: CompiledField;
  density: number;
  particleCount: number;
  speed: number;
  domain: number;
  playing: boolean;
  showArrows: boolean;
  showParticles: boolean;
  showFlow: boolean;
  normalize: boolean;
  resetToken: number;
  onProbe: (probe: ProbeReadout | null) => void;
};

type View = {
  width: number;
  height: number;
  domain: number;
  scale: number;
  cx: number;
  cy: number;
};

type Particle = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  trail: Array<{ x: number; y: number }>;
  seeded: boolean;
};

type Streamline = { points: Array<{ x: number; y: number }> };

type Palette = {
  field: string;
  grid: string;
  axis: string;
  arrowLo: [number, number, number];
  arrowHi: [number, number, number];
  particle: string;
  flow: string;
  probe: string;
  foreground: string;
  muted: string;
  mono: string;
};

function makeView(width: number, height: number, domain: number): View {
  const pad = 28;
  const scale = Math.min(width - pad * 2, height - pad * 2) / (2 * domain);
  return { width, height, domain, scale, cx: width / 2, cy: height / 2 };
}

function toScreen(view: View, x: number, y: number) {
  return { sx: view.cx + x * view.scale, sy: view.cy - y * view.scale };
}

function toWorld(view: View, sx: number, sy: number) {
  return { x: (sx - view.cx) / view.scale, y: (view.cy - sy) / view.scale };
}

function parseRgb(input: string): [number, number, number] {
  const s = input.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (h.length === 3) {
      return [
        parseInt(h[0]! + h[0], 16),
        parseInt(h[1]! + h[1], 16),
        parseInt(h[2]! + h[2], 16),
      ];
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1]!.split(/[,/ ]+/).filter(Boolean).map(Number);
    return [parts[0] ?? 180, parts[1] ?? 180, parts[2] ?? 180];
  }
  return [180, 180, 180];
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
) {
  const u = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * u)} ${Math.round(a[1] + (b[1] - a[1]) * u)} ${Math.round(a[2] + (b[2] - a[2]) * u)})`;
}

function readPalette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const token = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    field: token("--color-field", "#101217"),
    grid: token("--color-grid", "rgb(236 236 230 / 0.07)"),
    axis: token("--color-axis", "rgb(236 236 230 / 0.32)"),
    arrowLo: parseRgb(token("--color-arrow-lo", "#6d7370")),
    arrowHi: parseRgb(token("--color-arrow-hi", "#b7d0c8")),
    particle: token("--color-particle", "#e4efe9"),
    flow: token("--color-flow", "rgb(183 208 200 / 0.5)"),
    probe: token("--color-probe", "#ecece6"),
    foreground: token("--color-foreground", "#ecece6"),
    muted: token("--color-muted-foreground", "#8b8d88"),
    mono: token("--font-mono", "monospace"),
  };
}

function tickStep(view: View): number {
  const px = view.scale;
  if (px < 18) return 5;
  if (px < 36) return 2;
  return 1;
}

function visibleRange(view: View) {
  const xSpan = view.width / 2 / view.scale;
  const ySpan = view.height / 2 / view.scale;
  return { xSpan, ySpan };
}

function spawnParticle(
  domain: number,
  seeded = false,
  x?: number,
  y?: number,
): Particle {
  const jitter = () => (Math.random() * 2 - 1) * domain * 0.92;
  const maxLife = seeded ? 4.2 : 1.8 + Math.random() * 2.4;
  return {
    x: x ?? jitter(),
    y: y ?? jitter(),
    life: maxLife,
    maxLife,
    trail: [],
    seeded,
  };
}

function integrate(
  field: CompiledField,
  x: number,
  y: number,
  t: number,
  dt: number,
  domain: number,
  speed: number,
  normalize: boolean,
) {
  const a = field.evaluate(x, y, t);
  let u = a.u;
  let v = a.v;
  const mag = Math.hypot(u, v);
  if (mag < 1e-8) return { x, y, mag: 0 };
  if (normalize) {
    u /= mag;
    v /= mag;
    const vel = domain * 0.28 * speed;
    u *= vel;
    v *= vel;
  } else {
    u *= speed;
    v *= speed;
  }
  const mid = field.evaluate(x + u * dt * 0.5, y + v * dt * 0.5, t);
  let mu = mid.u;
  let mv = mid.v;
  const mm = Math.hypot(mu, mv);
  if (mm < 1e-8) return { x, y, mag };
  if (normalize) {
    mu = (mu / mm) * domain * 0.28 * speed;
    mv = (mv / mm) * domain * 0.28 * speed;
  } else {
    mu *= speed;
    mv *= speed;
  }
  let nx = x + mu * dt;
  let ny = y + mv * dt;
  const step = Math.hypot(nx - x, ny - y);
  const cap = domain * 0.08;
  if (step > cap) {
    const s = cap / step;
    nx = x + (nx - x) * s;
    ny = y + (ny - y) * s;
  }
  return { x: nx, y: ny, mag };
}

function traceLine(
  field: CompiledField,
  x0: number,
  y0: number,
  t: number,
  domain: number,
  dir: 1 | -1,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  const maxSteps = 110;
  for (let i = 0; i < maxSteps; i += 1) {
    const { u, v } = field.evaluate(x, y, t);
    const mag = Math.hypot(u, v);
    if (mag < 1e-6) break;
    const h = (dir * domain * 0.05) / mag;
    const cap = domain * 0.09 * dir;
    const hh = Math.abs(h) > Math.abs(cap) ? cap : h;
    const mid = field.evaluate(x + u * hh * 0.5, y + v * hh * 0.5, t);
    const mm = Math.hypot(mid.u, mid.v);
    if (mm < 1e-6) break;
    x += (mid.u / mm) * domain * 0.05 * dir;
    y += (mid.v / mm) * domain * 0.05 * dir;
    if (Math.abs(x) > domain * 1.25 || Math.abs(y) > domain * 1.25) break;
    pts.push({ x, y });
    if (i > 14 && Math.hypot(x - x0, y - y0) < domain * 0.04) break;
  }
  return pts;
}

function computeStreamlines(
  field: CompiledField,
  domain: number,
  t: number,
): Streamline[] {
  const lines: Streamline[] = [];
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const x = ((i + 0.5) / n) * 2 * domain - domain;
      const y = ((j + 0.5) / n) * 2 * domain - domain;
      if (Math.hypot(x, y) < domain * 0.08) continue;
      const fwd = traceLine(field, x, y, t, domain, 1);
      const back = traceLine(field, x, y, t, domain, -1);
      back.reverse();
      back.pop();
      lines.push({ points: back.concat(fwd) });
    }
  }
  return lines;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  head: number,
) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang - 0.42), y1 - head * Math.sin(ang - 0.42));
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(ang + 0.42), y1 - head * Math.sin(ang + 0.42));
  ctx.stroke();
}

export function VectorFieldCanvas({
  field,
  density,
  particleCount,
  speed,
  domain,
  playing,
  showArrows,
  showParticles,
  showFlow,
  normalize,
  resetToken,
  onProbe,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const dynRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({
    field,
    density,
    particleCount,
    speed,
    domain,
    playing,
    showArrows,
    showParticles,
    showFlow,
    normalize,
    resetToken,
    onProbe,
  });
  propsRef.current = {
    field,
    density,
    particleCount,
    speed,
    domain,
    playing,
    showArrows,
    showParticles,
    showFlow,
    normalize,
    resetToken,
    onProbe,
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const staticCv = staticRef.current;
    const dynCv = dynRef.current;
    if (!wrap || !staticCv || !dynCv) return;

    const staticCtx = staticCv.getContext("2d");
    const dynCtx = dynCv.getContext("2d");
    if (!staticCtx || !dynCtx) return;

    let view = makeView(1, 1, propsRef.current.domain);
    let palette = readPalette(wrap);
    let dpr = 1;
    let particles: Particle[] = [];
    let streamlines: Streamline[] = [];
    let simTime = 0;
    let last = performance.now();
    let raf = 0;
    let dirtyStatic = true;
    let lastStreamT = -999;
    let probe: ProbeReadout | null = null;
    let lastReset = propsRef.current.resetToken;
    let lastStaticKey = "";
    let running = true;

    const syncSize = () => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const cv of [staticCv, dynCv]) {
        cv.width = Math.floor(w * dpr);
        cv.height = Math.floor(h * dpr);
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
      }
      staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dynCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view = makeView(w, h, propsRef.current.domain);
      palette = readPalette(wrap);
      dirtyStatic = true;
    };

    const ensureParticles = (count: number, domainNow: number) => {
      const seeded = particles.filter((p) => p.seeded);
      let ambient = particles.filter((p) => !p.seeded);
      if (ambient.length > count) ambient = ambient.slice(0, count);
      while (ambient.length < count) ambient.push(spawnParticle(domainNow));
      particles = seeded.concat(ambient);
    };

    const drawStatic = () => {
      const p = propsRef.current;
      view = makeView(view.width, view.height, p.domain);
      const ctx = staticCtx;
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.fillStyle = palette.field;
      ctx.fillRect(0, 0, view.width, view.height);

      const { xSpan, ySpan } = visibleRange(view);
      const step = tickStep(view);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.grid;
      ctx.beginPath();
      for (let x = Math.ceil(-xSpan / step) * step; x <= xSpan; x += step) {
        const { sx } = toScreen(view, x, 0);
        ctx.moveTo(sx + 0.5, 0);
        ctx.lineTo(sx + 0.5, view.height);
      }
      for (let y = Math.ceil(-ySpan / step) * step; y <= ySpan; y += step) {
        const { sy } = toScreen(view, 0, y);
        ctx.moveTo(0, sy + 0.5);
        ctx.lineTo(view.width, sy + 0.5);
      }
      ctx.stroke();

      ctx.strokeStyle = palette.axis;
      ctx.lineWidth = 1.25;
      const o = toScreen(view, 0, 0);
      ctx.beginPath();
      ctx.moveTo(0, o.sy + 0.5);
      ctx.lineTo(view.width, o.sy + 0.5);
      ctx.moveTo(o.sx + 0.5, 0);
      ctx.lineTo(o.sx + 0.5, view.height);
      ctx.stroke();

      ctx.fillStyle = palette.muted;
      ctx.font = `400 11px ${palette.mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let x = Math.ceil(-xSpan / step) * step; x <= xSpan; x += step) {
        if (x === 0) continue;
        const { sx, sy } = toScreen(view, x, 0);
        ctx.fillText(String(x), sx, sy + 6);
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = Math.ceil(-ySpan / step) * step; y <= ySpan; y += step) {
        if (y === 0) continue;
        const { sx, sy } = toScreen(view, 0, y);
        ctx.fillText(String(y), sx - 8, sy);
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("0", o.sx - 8, o.sy + 6);

      if (p.showArrows) {
        const n = p.density;
        const samples: Array<{
          x: number;
          y: number;
          u: number;
          v: number;
          mag: number;
        }> = [];
        const mags: number[] = [];
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            const x = ((i + 0.5) / n) * 2 * p.domain - p.domain;
            const y = ((j + 0.5) / n) * 2 * p.domain - p.domain;
            const { u, v } = p.field.evaluate(x, y, simTime);
            const mag = Math.hypot(u, v);
            samples.push({ x, y, u, v, mag });
            if (Number.isFinite(mag)) mags.push(mag);
          }
        }
        mags.sort((a, b) => a - b);
        const magMax = mags[Math.floor(mags.length * 0.88)] || 1;
        const cell = (2 * p.domain * view.scale) / n;
        const maxLen = cell * 0.78;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const s of samples) {
          if (s.mag < 1e-8) {
            const pt = toScreen(view, s.x, s.y);
            ctx.fillStyle = mix(palette.arrowLo, palette.arrowHi, 0);
            ctx.beginPath();
            ctx.arc(pt.sx, pt.sy, 1.4, 0, Math.PI * 2);
            ctx.fill();
            continue;
          }
          const t = Math.min(1, s.mag / magMax);
          const len = maxLen * (0.22 + 0.78 * t);
          const ux = s.u / s.mag;
          const uy = s.v / s.mag;
          const tailX = s.x - ux * (len / view.scale) * 0.5;
          const tailY = s.y - uy * (len / view.scale) * 0.5;
          const headX = s.x + ux * (len / view.scale) * 0.5;
          const headY = s.y + uy * (len / view.scale) * 0.5;
          const a = toScreen(view, tailX, tailY);
          const b = toScreen(view, headX, headY);
          ctx.strokeStyle = mix(palette.arrowLo, palette.arrowHi, t);
          ctx.lineWidth = 1.15 + t * 0.5;
          drawArrow(ctx, a.sx, a.sy, b.sx, b.sy, 5 + t * 2);
        }

        const barX = view.width - 22;
        const barY = 18;
        const barH = 72;
        const grd = ctx.createLinearGradient(0, barY + barH, 0, barY);
        grd.addColorStop(0, mix(palette.arrowLo, palette.arrowHi, 0));
        grd.addColorStop(1, mix(palette.arrowLo, palette.arrowHi, 1));
        ctx.fillStyle = grd;
        ctx.fillRect(barX, barY, 6, barH);
        ctx.strokeStyle = palette.axis;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX + 0.5, barY + 0.5, 5, barH);
        ctx.fillStyle = palette.muted;
        ctx.font = `400 10px ${palette.mono}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText("|F|", barX - 6, barY - 8);
        ctx.fillText(
          magMax >= 100 ? magMax.toExponential(0) : magMax.toFixed(1),
          barX - 6,
          barY + 4,
        );
        ctx.fillText("0", barX - 6, barY + barH);
      }

      if (p.showFlow) {
        ctx.lineCap = "round";
        ctx.strokeStyle = palette.flow;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35;
        for (const line of streamlines) {
          if (line.points.length < 2) continue;
          ctx.beginPath();
          const p0 = toScreen(view, line.points[0]!.x, line.points[0]!.y);
          ctx.moveTo(p0.sx, p0.sy);
          for (let i = 1; i < line.points.length; i += 1) {
            const pt = toScreen(view, line.points[i]!.x, line.points[i]!.y);
            ctx.lineTo(pt.sx, pt.sy);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    const drawDynamic = () => {
      const p = propsRef.current;
      const ctx = dynCtx;
      ctx.clearRect(0, 0, view.width, view.height);

      if (p.showFlow) {
        const phase = (simTime * (0.35 + p.speed * 0.45)) % 1;
        ctx.lineCap = "round";
        ctx.lineWidth = 2.2;
        for (let i = 0; i < streamlines.length; i += 1) {
          const pts = streamlines[i]!.points;
          if (pts.length < 4) continue;
          for (let b = 0; b < 3; b += 1) {
            const u = (phase + i * 0.13 + b / 3) % 1;
            const idx = Math.min(
              pts.length - 2,
              Math.floor(u * (pts.length - 1)),
            );
            const span = Math.max(2, Math.floor(pts.length * 0.08));
            ctx.beginPath();
            const start = Math.max(0, idx - 1);
            const end = Math.min(pts.length - 1, idx + span);
            const s0 = toScreen(view, pts[start]!.x, pts[start]!.y);
            ctx.moveTo(s0.sx, s0.sy);
            for (let k = start + 1; k <= end; k += 1) {
              const sk = toScreen(view, pts[k]!.x, pts[k]!.y);
              ctx.lineTo(sk.sx, sk.sy);
            }
            ctx.strokeStyle = palette.particle;
            ctx.globalAlpha = 0.55;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      if (p.showParticles) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const particle of particles) {
          if (particle.trail.length > 1) {
            ctx.beginPath();
            const t0 = particle.trail[0]!;
            const s0 = toScreen(view, t0.x, t0.y);
            ctx.moveTo(s0.sx, s0.sy);
            for (let i = 1; i < particle.trail.length; i += 1) {
              const tr = particle.trail[i]!;
              const s = toScreen(view, tr.x, tr.y);
              ctx.lineTo(s.sx, s.sy);
            }
            ctx.strokeStyle = particle.seeded ? palette.probe : palette.particle;
            ctx.globalAlpha = particle.seeded ? 0.55 : 0.28;
            ctx.lineWidth = particle.seeded ? 1.8 : 1.1;
            ctx.stroke();
          }
          const s = toScreen(view, particle.x, particle.y);
          ctx.globalAlpha = 0.35 + 0.65 * (particle.life / particle.maxLife);
          ctx.fillStyle = particle.seeded ? palette.probe : palette.particle;
          ctx.beginPath();
          ctx.arc(s.sx, s.sy, particle.seeded ? 2.4 : 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (probe) {
        const origin = toScreen(view, probe.x, probe.y);
        ctx.save();
        ctx.strokeStyle = palette.probe;
        ctx.fillStyle = palette.probe;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(origin.sx, origin.sy, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(origin.sx, origin.sy, 2, 0, Math.PI * 2);
        ctx.fill();
        if (probe.mag > 1e-6) {
          const len = Math.min(view.scale * 1.15, 56);
          const ux = probe.u / probe.mag;
          const uy = probe.v / probe.mag;
          const tip = toScreen(
            view,
            probe.x + (ux * len) / view.scale,
            probe.y + (uy * len) / view.scale,
          );
          ctx.lineWidth = 2;
          ctx.strokeStyle = mix(palette.arrowLo, palette.arrowHi, 1);
          drawArrow(ctx, origin.sx, origin.sy, tip.sx, tip.sy, 8);
        }
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const p = propsRef.current;
      view = makeView(view.width, view.height, p.domain);

      if (lastReset !== p.resetToken) {
        lastReset = p.resetToken;
        particles = [];
        dirtyStatic = true;
      }

      if (p.playing) simTime += dt;

      const staticKey = [
        p.density,
        p.domain,
        p.showArrows,
        p.showFlow,
        p.field.fx.source,
        p.field.fy.source,
        p.field.usesTime && p.playing ? Math.floor(simTime * 8) : "static",
      ].join("|");

      if (p.showFlow && (streamlines.length === 0 || staticKey !== lastStaticKey)) {
        const due =
          !p.field.usesTime || streamlines.length === 0 || now - lastStreamT > 220;
        if (due) {
          streamlines = computeStreamlines(p.field, p.domain, simTime);
          lastStreamT = now;
        }
      }

      if (staticKey !== lastStaticKey) {
        lastStaticKey = staticKey;
        dirtyStatic = true;
      }

      if (p.showParticles) {
        ensureParticles(p.particleCount, p.domain);
        if (p.playing) {
          for (const particle of particles) {
            const next = integrate(
              p.field,
              particle.x,
              particle.y,
              simTime,
              dt,
              p.domain,
              p.speed,
              p.normalize,
            );
            particle.trail.push({ x: particle.x, y: particle.y });
            const cap = particle.seeded ? 28 : 12;
            if (particle.trail.length > cap) particle.trail.shift();
            particle.x = next.x;
            particle.y = next.y;
            particle.life -= dt;
            const out =
              Math.abs(particle.x) > p.domain * 1.2 ||
              Math.abs(particle.y) > p.domain * 1.2 ||
              particle.life <= 0;
            if (out) {
              if (particle.seeded) {
                particle.life = 0;
              } else {
                const fresh = spawnParticle(p.domain);
                particle.x = fresh.x;
                particle.y = fresh.y;
                particle.life = fresh.life;
                particle.maxLife = fresh.maxLife;
                particle.trail = [];
              }
            }
          }
          particles = particles.filter((pt) => !(pt.seeded && pt.life <= 0));
        }
      }

      if (dirtyStatic) {
        drawStatic();
        dirtyStatic = false;
      }
      drawDynamic();
      raf = requestAnimationFrame(frame);
    };

    const pointer = (ev: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const w = toWorld(view, sx, sy);
      const vec = propsRef.current.field.evaluate(w.x, w.y, simTime);
      const mag = Math.hypot(vec.u, vec.v);
      probe = {
        x: w.x,
        y: w.y,
        u: vec.u,
        v: vec.v,
        mag,
        angle: Math.atan2(vec.v, vec.u),
      };
      propsRef.current.onProbe(probe);
    };

    const onMove = (ev: PointerEvent) => {
      pointer(ev);
    };
    const onLeave = () => {
      probe = null;
      propsRef.current.onProbe(null);
    };
    const onDown = (ev: PointerEvent) => {
      pointer(ev);
      const rect = wrap.getBoundingClientRect();
      const w = toWorld(view, ev.clientX - rect.left, ev.clientY - rect.top);
      particles.push(spawnParticle(propsRef.current.domain, true, w.x, w.y));
    };

    const ro = new ResizeObserver(() => {
      syncSize();
    });
    ro.observe(wrap);
    syncSize();
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-72 w-full cursor-crosshair overflow-hidden rounded-lg bg-field"
      role="img"
      aria-label="Wykres pola wektorowego"
    >
      <canvas ref={staticRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas ref={dynRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
