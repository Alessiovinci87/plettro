// Strumenti di studio nel player: loop A–B su battute, conteggio, velocità progressiva, click sui battiti.
// Funzioni pure, testate in tests/practice.test.ts.
import type { Analysis } from '../pages/analysis-types';
import { sectionFirstBars } from '../pages/songTime';
import { barTimes } from './edit';

/** Battute da ripetere, indici globali nei "downbeats", estremi compresi. */
export interface LoopRange {
  startBar: number;
  endBar: number;
}

export function sectionRange(a: Analysis, sectionIndex: number, firstBars = sectionFirstBars(a)): LoopRange {
  const s = a.sections[sectionIndex];
  const startBar = firstBars[sectionIndex];
  return { startBar, endBar: startBar + Math.max(1, s.chart.length) - 1 };
}

/** Istanti di inizio e fine del loop. La prima sezione può partire prima del primo "uno". */
export function loopTimes(a: Analysis, r: LoopRange): { start: number; end: number } {
  return { start: barTimes(a, r.startBar).start, end: barTimes(a, r.endBar).end };
}

export const sameRange = (x: LoopRange | null, y: LoopRange | null) => !!x && !!y && x.startBar === y.startBar && x.endBar === y.endBar;
export const inRange = (r: LoopRange | null, bar: number) => !!r && bar >= r.startBar && bar <= r.endBar;

/** Selezione in due tocchi: il primo fissa A, il secondo B (in qualunque ordine). */
export interface Selection {
  anchor: number | null;
  range: LoopRange | null;
}

export function tapBar(sel: Selection, bar: number): Selection {
  if (sel.anchor === null) return { anchor: bar, range: { startBar: bar, endBar: bar } };
  return { anchor: null, range: { startBar: Math.min(sel.anchor, bar), endBar: Math.max(sel.anchor, bar) } };
}

/** Durata di un battito vicino all'istante `t`, dai battiti analizzati. */
export function beatPeriodAt(a: Analysis, t: number): number {
  const fallback = 60 / a.bpm;
  const i = a.beats.findIndex((b) => b >= t - 0.05);
  const p = i >= 0 && i + 1 < a.beats.length ? a.beats[i + 1] - a.beats[i] : fallback;
  return p > 0.2 && p < 2 ? p : fallback;
}

/** Conteggio "1-2-3-4": istanti dei click (secondi dall'inizio del conteggio) e durata totale, alla velocità scelta. */
export function countIn(period: number, meter: number, rate: number): { clicks: number[]; total: number } {
  const step = period / rate;
  return { clicks: Array.from({ length: meter }, (_, i) => i * step), total: meter * step };
}

/** Allenamento progressivo: +5% a ogni giro, senza superare il 100%. */
export function nextRate(rate: number, step = 0.05, max = 1): number {
  return Math.min(max, Math.round((rate + step) * 100) / 100);
}

export const TRAINER_STARTS = [0.5, 0.6, 0.7, 0.8, 0.9];
/** Velocità del selettore: dal 50% al 100% a passi del 5%. */
export const RATES = Array.from({ length: 11 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);

/** Click del metronomo sui battiti analizzati nell'intervallo [from, to) del brano. Accento sugli "uno". */
export function clicksBetween(a: Analysis, from: number, to: number): { t: number; accent: boolean }[] {
  const downs = new Set(a.downbeats.map((d) => Math.round(d * 100)));
  const out: { t: number; accent: boolean }[] = [];
  for (const b of a.beats) {
    if (b < from) continue;
    if (b >= to) break;
    out.push({ t: b, accent: downs.has(Math.round(b * 100)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preferenze, salvate nel browser

export interface PracticePrefs {
  countIn: boolean;
  metronome: boolean;
  /** 0..1 */
  volume: number;
  trainer: boolean;
  trainerStart: number;
}

export const DEFAULT_PREFS: PracticePrefs = { countIn: false, metronome: false, volume: 0.6, trainer: false, trainerStart: 0.7 };
export const PREFS_KEY = 'plettro.practice.v1';

export function parsePrefs(raw: string | null): PracticePrefs {
  try {
    const p = JSON.parse(raw ?? '{}') as Partial<PracticePrefs>;
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    return {
      countIn: bool(p.countIn, DEFAULT_PREFS.countIn),
      metronome: bool(p.metronome, DEFAULT_PREFS.metronome),
      volume: num(p.volume, DEFAULT_PREFS.volume, 0, 1),
      trainer: bool(p.trainer, DEFAULT_PREFS.trainer),
      trainerStart: num(p.trainerStart, DEFAULT_PREFS.trainerStart, 0.5, 0.95),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
