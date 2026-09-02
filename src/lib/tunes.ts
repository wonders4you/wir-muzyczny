export type TuneNote = { midi: number | null; beats: number };

export type Tune = {
  id: string;
  name: string;
  composer: string;
  bpm: number;
  legato: boolean;
  notes: TuneNote[];
};

function phrase(src: string): TuneNote[] {
  return src
    .trim()
    .split(/\s+/)
    .map((tok) => {
      if (tok.startsWith("r:")) return { midi: null, beats: Number(tok.slice(2)) };
      const [midi, beats] = tok.split(":");
      return { midi: Number(midi), beats: Number(beats ?? 1) };
    });
}

function fillMinutes(notes: TuneNote[], bpm: number, minutes: number): TuneNote[] {
  const beats = notes.reduce((sum, n) => sum + n.beats, 0);
  const seconds = (beats * 60) / Math.max(1, bpm);
  const times = Math.max(1, Math.ceil((minutes * 60) / Math.max(1, seconds)));
  const breath: TuneNote = { midi: null, beats: Math.max(3, bpm / 12) };
  const out: TuneNote[] = [];
  for (let i = 0; i < times; i += 1) {
    out.push(...notes);
    if (i < times - 1) out.push(breath);
  }
  return out;
}

const ODE = phrase(`
  64:1 64:1 65:1 67:1 67:1 65:1 64:1 62:1
  60:1 60:1 62:1 64:1 64:1.5 62:0.5 62:2
  64:1 64:1 65:1 67:1 67:1 65:1 64:1 62:1
  60:1 60:1 62:1 64:1 62:1.5 60:0.5 60:2
  62:1 62:1 64:1 60:1 62:1 64:0.5 65:0.5 64:1 60:1
  62:1 64:0.5 65:0.5 64:1 62:1 60:1 62:1 55:2
  64:1 64:1 65:1 67:1 67:1 65:1 64:1 62:1
  60:1 60:1 62:1 64:1 62:1.5 60:0.5 60:3
`);

const ELISE = phrase(`
  76:0.5 75:0.5 76:0.5 75:0.5 76:0.5 71:0.5 74:0.5 72:0.5 69:1.5
  r:0.5 60:0.5 64:0.5 69:0.5 71:1.5
  r:0.5 64:0.5 68:0.5 71:0.5 72:1.5
  r:0.5 76:0.5 75:0.5 76:0.5 75:0.5 76:0.5 71:0.5 74:0.5 72:0.5 69:1.5
  r:0.5 60:0.5 64:0.5 69:0.5 71:1.5
  r:0.5 64:0.5 72:0.5 71:0.5 69:2.5
  r:1
  72:0.5 74:0.5 76:0.5 77:1 76:0.5 74:0.5 72:0.5 71:1
  69:0.5 71:0.5 72:0.5 74:1 72:0.5 71:0.5 69:0.5 68:1
  69:0.5 71:0.5 72:1 71:0.5 69:0.5 68:1.5 64:1.5
  r:1
  76:0.5 75:0.5 76:0.5 75:0.5 76:0.5 71:0.5 74:0.5 72:0.5 69:1.5
  r:0.5 60:0.5 64:0.5 69:0.5 71:1.5
  r:0.5 64:0.5 72:0.5 71:0.5 69:3
`);

const FIFTH = phrase(`
  67:0.4 67:0.4 67:0.4 63:2 r:1.2
  65:0.4 65:0.4 65:0.4 62:2 r:1.2
  67:0.4 67:0.4 67:0.4 63:2 r:0.8
  65:0.4 65:0.4 65:0.4 62:2 r:1
  63:0.5 65:0.5 67:0.5 68:0.5 67:1 65:1 63:1 62:1
  60:1 62:1 63:1 65:1 67:2 r:1
  67:0.4 67:0.4 67:0.4 63:2 r:1.2
  65:0.4 65:0.4 65:0.4 62:3 r:2
`);

const PRELUDE7 = phrase(`
  76:1 73:1 69:1 76:1 73:1 69:1
  78:1 74:1 71:1 76:1 73:1 69:1
  74:1 71:1 68:1 73:1 69:1 66:1
  71:1 68:1 64:1 69:3
  76:1 73:1 69:1 76:1 73:1 69:1
  78:1 74:1 71:1 80:1 76:1 73:1
  81:1 76:1 73:1 78:1 74:1 71:1
  76:1 73:1 68:1 69:4
`);

const NOCTURNE = phrase(`
  r:0.5 70:0.5 75:0.5 79:1 82:1
  84:0.75 82:0.25 79:0.5 75:0.5
  77:0.5 80:0.5 79:0.5 77:0.5
  75:1.5 74:0.5 75:2
  r:0.5 79:0.5 82:0.5 87:1 89:1
  91:0.75 89:0.25 87:0.5 84:0.5
  86:0.5 89:0.5 87:0.5 86:0.5
  84:1.5 82:0.5 84:2
  79:1 82:1 87:1 89:0.5 87:0.5
  86:1 84:1 82:1 80:1
  79:1.5 77:0.5 75:2 74:1 75:3
`);

const PRELUDE4 = phrase(`
  71:3 72:1 71:3 69:3 71:3 72:1.5 71:1.5 69:3
  67:3 69:1.5 67:1.5 66:3 67:3 66:2 64:4
  63:3 64:3 66:3 67:3 66:3 64:3 62:3 64:2 62:4
  60:3 59:3 57:3 59:3 60:3 62:3 64:4
  66:3 64:3 62:3 60:3 59:3 57:6
`);

const WALTZ = phrase(`
  68:1 73:1 76:1 75:0.5 73:0.5 71:1 70:1 68:2
  r:1 68:1 73:1 76:1 75:0.5 73:0.5 71:1 68:1 76:2
  r:1 76:1 75:1 73:1 71:1 70:1 68:1 66:1 68:2
  r:1 73:1 75:1 76:1 78:0.5 76:0.5 75:1 73:1 71:2
  r:1 68:1 73:1 76:1 75:0.5 73:0.5 71:1 70:1 68:3
`);

export const TUNES: Tune[] = [
  {
    id: "beethoven-ode",
    name: "Oda do radości",
    composer: "Beethoven",
    bpm: 88,
    legato: true,
    notes: fillMinutes(ODE, 88, 10),
  },
  {
    id: "beethoven-elise",
    name: "Dla Elizy",
    composer: "Beethoven",
    bpm: 58,
    legato: true,
    notes: fillMinutes(ELISE, 58, 10),
  },
  {
    id: "beethoven-fifth",
    name: "V symfonia",
    composer: "Beethoven",
    bpm: 68,
    legato: true,
    notes: fillMinutes(FIFTH, 68, 10),
  },
  {
    id: "chopin-prelude7",
    name: "Preludium A-dur",
    composer: "Chopin",
    bpm: 48,
    legato: true,
    notes: fillMinutes(PRELUDE7, 48, 10),
  },
  {
    id: "chopin-nocturne",
    name: "Nokturn Es-dur",
    composer: "Chopin",
    bpm: 50,
    legato: true,
    notes: fillMinutes(NOCTURNE, 50, 10),
  },
  {
    id: "chopin-prelude4",
    name: "Preludium e-moll",
    composer: "Chopin",
    bpm: 42,
    legato: true,
    notes: fillMinutes(PRELUDE4, 42, 10),
  },
  {
    id: "chopin-waltz",
    name: "Walc cis-moll",
    composer: "Chopin",
    bpm: 66,
    legato: true,
    notes: fillMinutes(WALTZ, 66, 10),
  },
];

export const DEFAULT_TUNE_ID = TUNES[0]!.id;

export function isTuneId(v: unknown): v is string {
  return typeof v === "string" && TUNES.some((t) => t.id === v);
}

export function tuneById(id: string | null | undefined): Tune {
  return TUNES.find((t) => t.id === id) ?? TUNES[0]!;
}

export const CONCERT_A = 430;

export function midiToHz(midi: number) {
  return CONCERT_A * 2 ** ((midi - 69) / 12);
}

export function noteAt(tune: Tune, seconds: number): TuneNote {
  const totalBeats = tune.notes.reduce((sum, n) => sum + n.beats, 0);
  if (totalBeats <= 0) return { midi: null, beats: 1 };
  let beat = ((seconds * tune.bpm) / 60) % totalBeats;
  if (beat < 0) beat += totalBeats;
  for (const n of tune.notes) {
    if (beat < n.beats) return n;
    beat -= n.beats;
  }
  return tune.notes[0]!;
}
