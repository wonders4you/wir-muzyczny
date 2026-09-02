import { useCallback, useEffect, useRef, useState } from "react";

export type TiltTarget =
  | "none"
  | "density"
  | "particles"
  | "speed"
  | "domain"
  | "volume";

export type TiltSpec = {
  id: TiltTarget;
  label: string;
  min: number;
  max: number;
  step: number;
};

export const TILT_TARGETS: TiltSpec[] = [
  { id: "none", label: "Nic", min: 0, max: 0, step: 1 },
  { id: "density", label: "Gęstość", min: 6, max: 32, step: 1 },
  { id: "particles", label: "Cząstki", min: 40, max: 420, step: 10 },
  { id: "speed", label: "Prędkość", min: 0.2, max: 2.6, step: 0.1 },
  { id: "domain", label: "Zakres", min: 2, max: 10, step: 1 },
  { id: "volume", label: "Głośność", min: 0, max: 1, step: 0.01 },
];

export function specFor(id: TiltTarget): TiltSpec | null {
  if (id === "none") return null;
  return TILT_TARGETS.find((t) => t.id === id) ?? null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function angleDelta(value: number, origin: number) {
  let d = value - origin;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function quantize(value: number, spec: TiltSpec) {
  const stepped = Math.round(value / spec.step) * spec.step;
  const decimals = spec.step < 1 ? String(spec.step).split(".")[1]?.length ?? 1 : 0;
  return clamp(Number(stepped.toFixed(decimals)), spec.min, spec.max);
}

const RANGE = 30;
const DEAD = 3;

export function mapTilt(deltaDeg: number, spec: TiltSpec, center: number): number {
  const mag = Math.abs(deltaDeg);
  if (mag < DEAD) return quantize(center, spec);
  const n = clamp(deltaDeg / RANGE, -1, 1);
  const span = n >= 0 ? spec.max - center : center - spec.min;
  return quantize(center + n * span, spec);
}

export type TiltPermission = "idle" | "pending" | "granted" | "denied" | "missing";

type Orient = { beta: number; gamma: number };

export function useDeviceTilt(active: boolean) {
  const [permission, setPermission] = useState<TiltPermission>("idle");
  const [source, setSource] = useState<"gyro" | "pad">("pad");
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);
  const originRef = useRef<Orient>({ beta: 0, gamma: 0 });
  const rawRef = useRef<Orient>({ beta: 0, gamma: 0 });
  const padRef = useRef<Orient | null>(null);
  const smoothRef = useRef({ pitch: 0, roll: 0 });
  const hasOrigin = useRef(false);

  const applyOrigin = useCallback((o: Orient) => {
    originRef.current = o;
    hasOrigin.current = true;
  }, []);

  const calibrate = useCallback(() => {
    applyOrigin(rawRef.current);
    smoothRef.current = { pitch: 0, roll: 0 };
    setPitch(0);
    setRoll(0);
  }, [applyOrigin]);

  const setPad = useCallback((next: { pitch: number; roll: number } | null) => {
    if (next == null) {
      padRef.current = null;
      return;
    }
    padRef.current = {
      beta: originRef.current.beta + next.pitch,
      gamma: originRef.current.gamma + next.roll,
    };
    rawRef.current = padRef.current;
    setSource("pad");
  }, []);

  const requestAccess = useCallback(async () => {
    if (typeof window === "undefined") return false;
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    if (!DOE) {
      setPermission("missing");
      return false;
    }
    if (typeof DOE.requestPermission === "function") {
      setPermission("pending");
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setPermission("denied");
          return false;
        }
      } catch {
        setPermission("denied");
        return false;
      }
    }
    setPermission("granted");
    return true;
  }, []);

  useEffect(() => {
    if (!active) {
      hasOrigin.current = false;
      padRef.current = null;
      setPitch(0);
      setRoll(0);
      smoothRef.current = { pitch: 0, roll: 0 };
      return;
    }
    let raf = 0;
    let running = true;
    const onOri = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      rawRef.current = { beta: e.beta, gamma: e.gamma };
      if (!hasOrigin.current) applyOrigin(rawRef.current);
      if (padRef.current == null) setSource("gyro");
    };
    window.addEventListener("deviceorientation", onOri);
    const loop = () => {
      if (!running) return;
      const sample = padRef.current ?? rawRef.current;
      const targetP = angleDelta(sample.beta, originRef.current.beta);
      const targetR = angleDelta(sample.gamma, originRef.current.gamma);
      const s = smoothRef.current;
      s.pitch += (targetP - s.pitch) * 0.22;
      s.roll += (targetR - s.roll) * 0.22;
      const p = Math.abs(s.pitch) < 0.15 ? 0 : s.pitch;
      const r = Math.abs(s.roll) < 0.15 ? 0 : s.roll;
      setPitch((prev) => (Math.abs(prev - p) > 0.08 ? p : prev));
      setRoll((prev) => (Math.abs(prev - r) > 0.08 ? r : prev));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("deviceorientation", onOri);
    };
  }, [active, applyOrigin]);

  return {
    permission,
    source,
    pitch,
    roll,
    calibrate,
    setPad,
    requestAccess,
  };
}
