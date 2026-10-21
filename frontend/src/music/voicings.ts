// Diteggiature: libreria curata (chords-db, accordatura standard) + generatore
// algoritmico che funziona con qualsiasi accordatura.
import standardDb from '../data/chords-standard.json';
import { chordPcs, KEYS, mod12, pcName, type Quality } from './theory';

export interface Voicing {
  /** Un valore per corda, dalla 6ª alla 1ª: -1 muta, 0 a vuoto, n tasto. */
  frets: number[];
  /** Dito per corda (1 indice … 4 mignolo, 0 nessuno). */
  fingers: number[];
  /** Tasti su cui si fa il barrè. */
  barres: number[];
  source: 'libro' | 'generata';
}

type DbShape = { f: number[]; d: number[]; b: number[] };
const DB = standardDb as unknown as Record<string, Record<string, DbShape[]>>;

export const fretted = (v: Voicing) => v.frets.filter((f) => f > 0);

/** Il tasto su cui lavorare: il più basso premuto (1 per le posizioni aperte). */
export function workFret(v: Voicing): number {
  const fs = fretted(v);
  if (!fs.length) return 0;
  const max = Math.max(...fs);
  const hasOpen = v.frets.some((f) => f === 0);
  return hasOpen && max <= 4 ? 1 : Math.min(...fs);
}

/** Primo tasto disegnato nel diagramma (1 = si vede il capotasto). */
export function diagramBaseFret(v: Voicing): number {
  const fs = fretted(v);
  if (!fs.length) return 1;
  return Math.max(...fs) <= 4 ? 1 : Math.min(...fs);
}

export function describe(v: Voicing): string {
  const fs = fretted(v);
  const hasOpen = v.frets.some((f) => f === 0);
  if (!fs.length) return 'Tutte a vuoto';
  if (hasOpen && Math.max(...fs) <= 4) return 'Posizione aperta';
  if (v.barres.length) return `Barrè al ${v.barres[0]}º tasto`;
  return `Posizione al ${Math.min(...fs)}º tasto`;
}

export const sounding = (v: Voicing, tuning: number[]) =>
  v.frets.map((f, i) => (f < 0 ? null : tuning[i] + f));

// ---------------------------------------------------------------------------
// Assegnazione delle dita

export function assignFingers(frets: number[]): { fingers: number[]; barres: number[] } | null {
  const notes = frets.map((f, s) => ({ f, s })).filter((n) => n.f > 0);
  const fingers = frets.map(() => 0);
  if (!notes.length) return { fingers, barres: [] };
  const minF = Math.min(...notes.map((n) => n.f));

  // Gruppi da premere con un dito: singole note, oppure un mini-barrè su corde adiacenti allo stesso tasto.
  type Group = { f: number; strings: number[] };
  const single = (ns: { f: number; s: number }[]): Group[] => ns.map((n) => ({ f: n.f, strings: [n.s] }));

  /** Assegna le dita 1..4 in ordine di tasto, lasciando spazio per i gruppi successivi. */
  const place = (groups: Group[], firstFinger: number): boolean => {
    const sorted = [...groups].sort((a, b) => a.f - b.f || a.strings[0] - b.strings[0]);
    let prev = firstFinger - 1;
    for (let i = 0; i < sorted.length; i++) {
      const left = sorted.length - 1 - i;
      const fg = Math.max(prev + 1, Math.min(sorted[i].f - minF + 1, 4 - left));
      if (fg > 4) return false;
      for (const s of sorted[i].strings) fingers[s] = fg;
      prev = fg;
    }
    return true;
  };

  /** Fonde la nota più numerosa allo stesso tasto (corde adiacenti, nessuna corda più bassa in mezzo). */
  const mergeGroups = (ns: { f: number; s: number }[], target: number): Group[] => {
    const groups = single(ns);
    while (groups.length > target) {
      let best: { i: number; j: number } | null = null;
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++) {
          const a = groups[i];
          const b = groups[j];
          if (a.f !== b.f) continue;
          const lo = Math.min(...a.strings, ...b.strings);
          const hi = Math.max(...a.strings, ...b.strings);
          let ok = true;
          for (let s = lo; s <= hi; s++) if (frets[s] < a.f && frets[s] !== -1) ok = false;
          for (let s = lo; s <= hi; s++) if (frets[s] === -1) ok = false;
          if (ok && (!best || hi - lo < 3)) best = { i, j };
        }
      if (!best) break;
      groups[best.i].strings.push(...groups[best.j].strings);
      groups.splice(best.j, 1);
    }
    return groups;
  };

  if (notes.length <= 4) {
    return place(single(notes), 1) ? { fingers, barres: [] } : null;
  }

  // Più di 4 note: barrè dell'indice sul tasto più basso.
  const atMin = notes.filter((n) => n.f === minF).map((n) => n.s);
  if (atMin.length < 2) return null;
  const first = Math.min(...atMin);
  const last = Math.max(...atMin);
  for (let s = first; s <= last; s++) if (frets[s] < minF) return null;
  for (const s of atMin) fingers[s] = 1;
  const others = notes.filter((n) => n.f > minF);
  let groups = single(others);
  const barres = [minF];
  if (groups.length > 3) {
    groups = mergeGroups(others, 3);
    if (groups.length > 3) return null;
    for (const g of groups) if (g.strings.length > 1) barres.push(g.f);
  }
  if (!place(groups, 2)) return null;
  return { fingers, barres };
}

// ---------------------------------------------------------------------------
// Generatore

export interface GenOptions {
  bassPc?: number;
  maxFret?: number;
  span?: number; // tasti coperti dalla mano (default 4: es. 5-8)
  limit?: number;
}

export function generateVoicings(rootPc: number, q: Quality, tuning: number[], opts: GenOptions = {}): Voicing[] {
  const maxFret = opts.maxFret ?? 15;
  const span = opts.span ?? 4;
  const limit = opts.limit ?? 18;
  const bass = mod12(opts.bassPc ?? rootPc);
  const pcs = new Set(chordPcs(rootPc, q));
  pcs.add(bass);
  const optional = new Set((q.optional ?? []).map((i) => mod12(rootPc + i)));
  const required = [...pcs].filter((p) => !optional.has(p));
  const n = tuning.length;
  const minStrings = q.intervals.length <= 2 ? 2 : Math.min(4, n);
  const fifth = mod12(rootPc + 7);
  const seen = new Map<string, { v: Voicing; score: number; start: number }>();

  for (let start = 1; start <= maxFret - span + 1; start++) {
    const choices: number[][] = tuning.map((open) => {
      const c = [-1];
      if (pcs.has(mod12(open))) c.push(0);
      for (let f = start; f < start + span; f++) if (pcs.has(mod12(open + f))) c.push(f);
      return c;
    });
    const cur: number[] = new Array(n).fill(-1);
    const walk = (s: number) => {
      if (s === n) {
        evaluate(cur.slice());
        return;
      }
      for (const f of choices[s]) {
        cur[s] = f;
        walk(s + 1);
      }
    };
    walk(0);
  }

  function evaluate(frets: number[]) {
    const played = frets.map((f, i) => (f >= 0 ? i : -1)).filter((i) => i >= 0);
    if (played.length < minStrings) return;
    const firstP = played[0];
    const lastP = played[played.length - 1];
    let interior = 0;
    for (let s = firstP; s <= lastP; s++) if (frets[s] < 0) interior++;
    if (interior > 1) return;
    const trailing = n - 1 - lastP;
    if (trailing > (q.id === '5' ? 3 : 1)) return;
    const notes = played.map((s) => tuning[s] + frets[s]);
    if (mod12(notes[0]) !== bass) return;
    const have = new Set(notes.map(mod12));
    if (!required.every((p) => have.has(p))) return;
    const fs = frets.filter((f) => f > 0);
    if (fs.length && Math.max(...fs) - Math.min(...fs) > span - 1) return;
    const fg = assignFingers(frets);
    if (!fg) return;
    const key = frets.join(',');
    if (seen.has(key)) return;
    const hasOpen = frets.some((f) => f === 0);
    const minF = fs.length ? Math.min(...fs) : 0;
    let score = played.length * 2;
    score -= interior * 3 + trailing * 1.5;
    score -= minF * 0.25;
    if (hasOpen && (fs.length === 0 || Math.max(...fs) <= 4)) score += 1.5;
    if (!hasOpen && played.length >= 5 && fg.barres.length) score += 1; // forma mobile completa
    if (hasOpen && minF > 5) score -= 2;
    if (pcs.has(fifth) && have.has(fifth)) score += 0.5;
    score -= fg.barres.length ? 0.5 : 0;
    score -= Math.max(0, ...fg.fingers) * 0.2;
    const v: Voicing = { frets, fingers: fg.fingers, barres: fg.barres, source: 'generata' };
    seen.set(key, { v, score, start: workFret(v) });
  }

  // Le tre migliori per ogni tasto di partenza, poi ordine lungo il manico.
  const byStart = new Map<number, { v: Voicing; score: number }[]>();
  for (const e of seen.values()) {
    const arr = byStart.get(e.start) ?? [];
    arr.push(e);
    byStart.set(e.start, arr);
  }
  const picked: { v: Voicing; score: number; start: number }[] = [];
  for (const [start, arr] of byStart) {
    arr.sort((a, b) => b.score - a.score);
    // Varietà: la migliore con corde a vuoto, la migliore senza, poi la successiva.
    const withOpen = arr.find((e) => e.v.frets.includes(0));
    const closed = arr.find((e) => !e.v.frets.includes(0));
    const chosen = [withOpen, closed].filter((e): e is (typeof arr)[number] => !!e);
    const next = arr.find((e) => !chosen.includes(e));
    if (next) chosen.push(next);
    for (const e of chosen) picked.push({ ...e, start });
  }
  const best = picked.sort((a, b) => b.score - a.score).slice(0, limit);
  return best.sort((a, b) => a.start - b.start || b.score - a.score).map((e) => e.v);
}

// ---------------------------------------------------------------------------
// Libreria curata

function dbSuffix(q: Quality, rootPc: number, bassPc?: number): string[] {
  if (bassPc === undefined || mod12(bassPc) === mod12(rootPc)) return [q.id];
  const names = [pcName(bassPc), pcName(bassPc, 'intl', true), pcName(bassPc, 'intl', false)];
  const prefix = q.id === 'major' ? '' : q.id === 'minor' ? 'm' : q.id === 'm9' ? 'm9' : null;
  if (prefix === null) return [];
  return [...new Set(names)].map((b) => `${prefix}/${b}`);
}

const STANDARD_MIDI = [40, 45, 50, 55, 59, 64];

/** Diteggiature della libreria, scartando le (poche) che contengono note estranee. */
export function libraryVoicings(rootPc: number, q: Quality, bassPc?: number): Voicing[] {
  const byKey = DB[KEYS[mod12(rootPc)]];
  if (!byKey) return [];
  const allowed = new Set(chordPcs(rootPc, q));
  if (bassPc !== undefined) allowed.add(mod12(bassPc));
  for (const suf of dbSuffix(q, rootPc, bassPc)) {
    const shapes = byKey[suf];
    if (!shapes) continue;
    const seen = new Set<string>();
    return shapes
      .filter((s) => s.f.every((f, i) => f < 0 || allowed.has(mod12(STANDARD_MIDI[i] + f))))
      .filter((s) => {
        const k = s.f.join(',');
        if (seen.has(k)) return false; // la libreria ha qualche doppione con diteggiatura diversa
        seen.add(k);
        return true;
      })
      .map((s) => ({ frets: s.f, fingers: s.d, barres: s.b, source: 'libro' as const }));
  }
  return [];
}

/** Quante diteggiature della libreria vengono scartate perché errate (per i test). */
export function libraryRejected(rootPc: number, q: Quality): number {
  const byKey = DB[KEYS[mod12(rootPc)]];
  const shapes = byKey?.[q.id] ?? [];
  return shapes.length - libraryVoicings(rootPc, q).length;
}

/**
 * Tutte le varianti di un accordo: prima quelle della libreria (se l'accordatura
 * è standard), poi quelle generate, senza doppioni, ordinate lungo il manico.
 */
export function getVoicings(rootPc: number, q: Quality, tuning: number[], isStandard: boolean, bassPc?: number): Voicing[] {
  const lib = isStandard && tuning.length === 6 ? libraryVoicings(rootPc, q, bassPc) : [];
  const keys = new Set(lib.map((v) => v.frets.join(',')));
  const gen = generateVoicings(rootPc, q, tuning, { bassPc, limit: lib.length ? 10 : 18 }).filter(
    (v) => !keys.has(v.frets.join(',')),
  );
  const all = [...lib, ...gen];
  return all.sort((a, b) => workFret(a) - workFret(b) || (a.source === 'libro' ? -1 : 1));
}
