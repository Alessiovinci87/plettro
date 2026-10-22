// Pattern di pennata personali, salvati nel browser e usabili in Ritmo e nel player.
// Funzioni pure, testate in tests/library-extras.test.ts.
import type { StrumPattern } from './rhythm';

export const PATTERNS_KEY = 'plettro.patterns.v1';
export const PATTERN_METERS = ['4/4', '3/4'] as const;
export type PatternMeter = (typeof PATTERN_METERS)[number];

export interface CustomPattern {
  id: string;
  name: string;
  meter: PatternMeter;
  steps: string;
}

/** Sedicesimi per battuta: 16 in 4/4, 12 in 3/4. */
export const stepsFor = (m: PatternMeter) => (m === '3/4' ? 12 : 16);
export const emptySteps = (m: PatternMeter) => '-'.repeat(stepsFor(m));

export function validPattern(p: Partial<CustomPattern>): p is CustomPattern {
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    p.name.trim().length > 0 &&
    (p.meter === '4/4' || p.meter === '3/4') &&
    typeof p.steps === 'string' &&
    p.steps.length === stepsFor(p.meter) &&
    /^[DUdux-]+$/.test(p.steps)
  );
}

export function parsePatterns(raw: string | null): CustomPattern[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((p) => !!p && validPattern(p)) : [];
  } catch {
    return [];
  }
}

/** Salva un pattern nuovo o aggiornato (stesso id); nome ripulito. Restituisce null se non è valido. */
export function upsertPattern(list: CustomPattern[], p: CustomPattern): CustomPattern[] | null {
  const clean = { ...p, name: p.name.trim().replace(/\s+/g, ' ').slice(0, 40) };
  if (!validPattern(clean)) return null;
  const i = list.findIndex((x) => x.id === clean.id);
  return i < 0 ? [...list, clean] : list.map((x, k) => (k === i ? clean : x));
}

export const removePattern = (list: CustomPattern[], id: string) => list.filter((x) => x.id !== id);

export const newPatternId = (list: CustomPattern[]) => {
  let n = list.length + 1;
  while (list.some((x) => x.id === `mio-${n}`)) n++;
  return `mio-${n}`;
};

/** Un pattern personale nel formato dei pattern di Ritmo. */
export const asStrumPattern = (p: CustomPattern): StrumPattern => ({ id: p.id, name: p.name, meter: p.meter, steps: p.steps, feel: 'Pattern tuo', tip: '' });

/** Lettura sicura dal browser (anche in navigazione privata). */
export function loadPatterns(): CustomPattern[] {
  try {
    return parsePatterns(localStorage.getItem(PATTERNS_KEY));
  } catch {
    return [];
  }
}
export function storePatterns(list: CustomPattern[]): boolean {
  try {
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
