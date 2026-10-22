// Forma del risultato restituito dal backend (backend/app/analysis/pipeline.py).

export interface ChordSeg {
  symbol: string;
  root: number;
  quality: string;
  start: number;
  end: number;
  beats: number;
}

export interface Effect {
  block: string;
  model: string;
  settings: Record<string, string | number>;
  why: string;
}

export interface Section {
  label: string;
  group?: string;
  start: number;
  end: number;
  bars: number;
  energy: number;
  dynamics: { level: number; advice: string };
  chords: ChordSeg[];
  chart: string[][];
  strum: { steps: string; subdivision: string; swing: boolean; palm_mute: boolean; confidence: number; advice: string };
  tone: { gain: string; brightness: string; ambience: string; delay: string | null; compression: string };
  effects: Effect[];
  presets: { id: string | null; name: string; author?: string | null; query?: string }[];
}

export interface Analysis {
  duration: number;
  bpm: number;
  bpm_alternatives?: number[];
  meter: number;
  time_signature: string;
  key: { name: string; label: string; confidence: number; tonic: number; mode: string };
  separation: { method: string; note: string };
  beats: number[];
  downbeats: number[];
  chords: ChordSeg[];
  sections: Section[];
  melody: { notes: { midi: number; start: number; dur: number; string: number; fret: number }[]; suggested_position: number; method: string };
  capo: { fret: number; reason: string; shapes: { sounds: string; play: string }[] };
  tuning: { id: string; name: string; reason: string };
  warnings: string[];
  example?: boolean;
}
