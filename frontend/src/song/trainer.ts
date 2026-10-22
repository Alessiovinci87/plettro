// Allenatore dei cambi: coppie d'accordi, prove da 60 secondi, storico nel browser.
// Funzioni pure, testate in tests/trainer.test.ts.
import { parseChord } from '../music/theory';

export const ROUND_SECONDS = 60;
export const HISTORY_KEY = 'plettro.trainer.v1';
const MAX_ENTRIES = 500;

/** Coppie classiche per chi inizia, dalle più facili. */
export const SUGGESTED_PAIRS: [string, string][] = [
  ['Em', 'Am'],
  ['G', 'C'],
  ['C', 'Am'],
  ['D', 'G'],
  ['A', 'D'],
  ['E', 'A'],
  ['G', 'Em'],
  ['Am', 'Dm'],
  ['C', 'G7'],
  ['D', 'Em'],
  ['A', 'E7'],
  ['C', 'F'],
];

/** Chiave della coppia: l'ordine non conta (G→C e C→G sono lo stesso esercizio). */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export const pairOf = (key: string): [string, string] => {
  const [a, b] = key.split('|');
  return [a, b ?? a];
};

export interface TrainerEntry {
  pair: string;
  changes: number;
  /** millisecondi epoch */
  at: number;
}

export function parseHistory(raw: string | null): TrainerEntry[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    return v.filter(
      (e): e is TrainerEntry =>
        !!e && typeof e.pair === 'string' && e.pair.includes('|') && Number.isInteger(e.changes) && e.changes >= 0 && typeof e.at === 'number',
    );
  } catch {
    return [];
  }
}

export function bestFor(history: TrainerEntry[], key: string): number | null {
  const own = history.filter((e) => e.pair === key);
  return own.length ? Math.max(...own.map((e) => e.changes)) : null;
}

/** Prove di una coppia, dalla più vecchia, al massimo le ultime `limit`. */
export function sessionsFor(history: TrainerEntry[], key: string, limit = 20): TrainerEntry[] {
  return history
    .filter((e) => e.pair === key)
    .sort((x, y) => x.at - y.at)
    .slice(-limit);
}

/** Aggiunge una prova; dice se è un nuovo record (la prima prova non conta come record). */
export function addResult(history: TrainerEntry[], key: string, changes: number, at: number): { history: TrainerEntry[]; record: boolean; previousBest: number | null } {
  const previousBest = bestFor(history, key);
  const next = [...history, { pair: key, changes: Math.max(0, Math.round(changes)), at }].slice(-MAX_ENTRIES);
  return { history: next, record: previousBest !== null && changes > previousBest, previousBest };
}

/** Coppie già provate, dalla più recente, con il miglior risultato. */
export function triedPairs(history: TrainerEntry[]): { key: string; best: number; last: number }[] {
  const by = new Map<string, { best: number; last: number }>();
  for (const e of history) {
    const c = by.get(e.pair);
    by.set(e.pair, { best: Math.max(c?.best ?? 0, e.changes), last: Math.max(c?.last ?? 0, e.at) });
  }
  return [...by.entries()].map(([key, v]) => ({ key, ...v })).sort((x, y) => y.last - x.last);
}

/** Secondi rimasti, interi, mai sotto zero. */
export function secondsLeft(startedAt: number, now: number, total = ROUND_SECONDS): number {
  return Math.max(0, Math.ceil(total - (now - startedAt) / 1000));
}

/** Cambi al minuto, per confrontare prove di durata diversa (oggi sono tutte da 60 s). */
export const perMinute = (changes: number, seconds = ROUND_SECONDS) => Math.round((changes * 60) / seconds);

/** Una coppia è valida se i due nomi sono accordi riconosciuti e diversi. */
export function validPair(a: string, b: string): boolean {
  const x = parseChord(a);
  const y = parseChord(b);
  return !!x && !!y && a !== b;
}
