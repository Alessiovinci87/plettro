// Dove siamo nel brano a un certo istante: battuta, battito, sedicesimo, accordo, sezione.
// Funzioni pure, testate in tests/songTime.test.ts.
import type { Analysis } from './analysis-types';

/** Indice dell'ultimo elemento <= t (−1 se t precede tutto). */
export function lastAtOrBefore(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t + 1e-6) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export interface Position {
  sectionIndex: number; // −1 prima dell'inizio
  barIndex: number; // indice globale in downbeats, −1 prima del primo "uno"
  barInSection: number; // indice della battuta dentro la sezione (per la griglia)
  beatInBar: number; // 0..meter-1, −1 prima del primo battito
  step: number; // sedicesimo nella battuta, −1 se fuori
  beatProgress: number; // 0..1 dentro il battito
  chordIndex: number; // accordo che suona, −1 se nessuno
  nextChordIndex: number; // prossimo accordo diverso, −1 se finito
  beatsToNext: number; // battiti che mancano al prossimo accordo
}

/** Indice del primo "uno" che apre ogni sezione. */
export function sectionFirstBars(a: Analysis): number[] {
  return a.sections.map((s) => {
    const i = a.downbeats.findIndex((d) => d >= s.start - 0.08);
    return i < 0 ? a.downbeats.length - 1 : i;
  });
}

export function positionAt(a: Analysis, t: number, firstBars = sectionFirstBars(a)): Position {
  const sectionIndex = lastAtOrBefore(
    a.sections.map((s) => s.start - 0.05),
    t,
  );
  const barIndex = lastAtOrBefore(a.downbeats, t);
  const barInSection = sectionIndex >= 0 ? Math.max(0, barIndex - firstBars[sectionIndex]) : -1;

  const b = lastAtOrBefore(a.beats, t);
  let beatInBar = -1;
  let step = -1;
  let beatProgress = 0;
  if (b >= 0 && barIndex >= 0) {
    const firstBeatOfBar = lastAtOrBefore(a.beats, a.downbeats[barIndex]);
    beatInBar = Math.max(0, b - firstBeatOfBar) % a.meter;
    const next = a.beats[b + 1] ?? a.beats[b] + 60 / a.bpm;
    beatProgress = Math.min(0.999, Math.max(0, (t - a.beats[b]) / (next - a.beats[b])));
    step = beatInBar * 4 + Math.floor(beatProgress * 4);
  }

  const chordIndex = a.chords.findIndex((c) => c.start <= t + 1e-6 && t < c.end);
  let nextChordIndex = -1;
  for (let i = 0; i < a.chords.length; i++) {
    const c = a.chords[i];
    if (c.start > t + 1e-6 && (chordIndex < 0 || c.symbol !== a.chords[chordIndex].symbol)) {
      nextChordIndex = i;
      break;
    }
  }
  let beatsToNext = 0;
  if (nextChordIndex >= 0) {
    const target = a.chords[nextChordIndex].start;
    beatsToNext = a.beats.filter((x) => x > t + 1e-6 && x <= target + 0.03).length;
  }
  return { sectionIndex, barIndex, barInSection, beatInBar, step, beatProgress, chordIndex, nextChordIndex, beatsToNext };
}

export const fmtTime = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
