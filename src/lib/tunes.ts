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

export const TUNES: Tune[] = [
  {
    id: "beethoven-ode",
    name: "Oda do radości",
    composer: "Beethoven",
    bpm: 88,
    legato: true,
    notes: phrase(`
      64:1 64:1 65:1 67:1 67:1 65:1 64:1 62:1
      60:1 60:1 62:1 64:1 64:1.5 62:0.5 62:2
      64:1 64:1 65:1 67:1 67:1 65:1 64:1 62:1
      60:1 60:1 62:1 64:1 62:1.5 60:0.5 60:2
    `),
  },
  {
    id: "beethoven-elise",
    name: "Dla Elizy",
    composer: "Beethoven",
    bpm: 58,
    legato: true,
    notes: phrase(`
      76:0.5 75:0.5 76:0.5 75:0.5 76:0.5 71:0.5 74:0.5 72:0.5 69:1.5
      r:0.5 60:0.5 64:0.5 69:0.5 71:1.5
      r:0.5 64:0.5 68:0.5 71:0.5 72:1.5
      r:0.5
    `),
  },
  {
    id: "beethoven-fifth",
    name: "V symfonia",
    composer: "Beethoven",
    bpm: 68,
    legato: true,
    notes: phrase(`
      67:0.4 67:0.4 67:0.4 63:1.8 r:1
      65:0.4 65:0.4 65:0.4 62:1.8 r:1.2
    `),
  },
  {
    id: "chopin-prelude7",
    name: "Preludium A-dur",
    composer: "Chopin",
    bpm: 48,
    legato: true,
    notes: phrase(`
      76:1 73:1 69:1 76:1 73:1 69:1
      78:1 74:1 71:1 76:1 73:1 69:1
      74:1 71:1 68:1 73:1 69:1 66:1
      71:1 68:1 64:1 69:3
    `),
  },
  {
    id: "chopin-nocturne",
    name: "Nokturn Es-dur",
    composer: "Chopin",
    bpm: 50,
    legato: true,
    notes: phrase(`
      r:0.5 70:0.5 75:0.5 79:1 82:1
      84:0.75 82:0.25 79:0.5 75:0.5
      77:0.5 80:0.5 79:0.5 77:0.5
      75:1.5 74:0.5 75:2
    `),
  },
  {
    id: "chopin-prelude4",
    name: "Preludium e-moll",
    composer: "Chopin",
    bpm: 42,
    legato: true,
    notes: phrase(`
      71:3 69:3 67:3 66:3
      64:3 63:3 64:2 66:2
      67:3 66:3 64:3 62:3
    `),
  },
  {
    id: "chopin-waltz",
    name: "Walc cis-moll",
    composer: "Chopin",
    bpm: 66,
    legato: true,
    notes: phrase(`
      68:1 73:1 76:1 75:0.5 73:0.5 71:1 70:1 68:2
      r:1 68:1 73:1 76:1 75:0.5 73:0.5 71:1 68:1 76:2
    `),
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
