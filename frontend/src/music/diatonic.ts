// Accordi della tonalità: triadi o settime costruite per terze sulle note della scala.
// Funzioni pure, testate in tests/library-extras.test.ts.
import { mod12, QUALITIES, SCALES, type Quality } from './theory';

/** Scale con 7 note, quelle che hanno senso per gli accordi della tonalità. */
export const KEY_MODES = SCALES.filter((s) => s.intervals.length === 7);

export interface DiatonicChord {
  degree: number; // 0..6
  roman: string;
  root: number;
  quality: Quality;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Qualità con esattamente questi intervalli (dentro l'ottava). */
function qualityFor(intervals: number[]): Quality | null {
  const key = intervals.join(',');
  return QUALITIES.find((q) => q.intervals.map(mod12).join(',') === key) ?? null;
}

function romanFor(degree: number, q: Quality): string {
  const third = q.intervals.includes(3) ? 'minor' : 'major';
  const base = third === 'minor' ? ROMAN[degree].toLowerCase() : ROMAN[degree];
  const suffix: Record<string, string> = {
    dim: '°', aug: '+', '7': '7', maj7: 'maj7', m7: '7', m7b5: 'ø7', dim7: '°7', mmaj7: '(maj7)', aug7: '+7', 'maj7#5': '+maj7',
  };
  return base + (suffix[q.id] ?? '');
}

/** I 7 accordi della scala che parte da `tonic`, in triadi o in settime. */
export function diatonicChords(tonic: number, scaleIntervals: number[], sevenths = false): DiatonicChord[] {
  const n = scaleIntervals.length;
  return scaleIntervals.map((_, d) => {
    const stack = (sevenths ? [0, 2, 4, 6] : [0, 2, 4]).map((k) => {
      const i = d + k;
      return scaleIntervals[i % n] + (i >= n ? 12 : 0) - scaleIntervals[d];
    });
    const quality = qualityFor(stack) ?? QUALITIES[0];
    return { degree: d, roman: romanFor(d, quality), root: mod12(tonic + scaleIntervals[d]), quality };
  });
}
