// "Accordi semplici": estensioni e accordi difficili sostituiti con versioni facili da suonare.
// Funzioni pure, testate in tests/simplify.test.ts.
import { assignFingers, type Voicing } from './voicings';
import { chordSymbol, mod12, parseChord, QUALITY_BY_ID, type Quality } from './theory';
import type { Analysis, ChordSeg } from '../pages/analysis-types';

/**
 * Forme aperte facili (accordatura standard): nessun barrè, entro il 3º tasto.
 * Tonica → tasti dalla 6ª alla 1ª corda (-1 muta).
 */
const EASY: Record<string, Record<number, number[]>> = {
  major: { 0: [-1, 3, 2, 0, 1, 0], 2: [-1, -1, 0, 2, 3, 2], 4: [0, 2, 2, 1, 0, 0], 7: [3, 2, 0, 0, 0, 3], 9: [-1, 0, 2, 2, 2, 0] },
  minor: { 2: [-1, -1, 0, 2, 3, 1], 4: [0, 2, 2, 0, 0, 0], 9: [-1, 0, 2, 2, 1, 0] },
  '7': { 0: [-1, 3, 2, 3, 1, 0], 2: [-1, -1, 0, 2, 1, 2], 4: [0, 2, 0, 1, 0, 0], 7: [3, 2, 0, 0, 0, 1], 9: [-1, 0, 2, 0, 2, 0], 11: [-1, 2, 1, 2, 0, 2] },
  m7: { 2: [-1, -1, 0, 2, 1, 1], 4: [0, 2, 0, 0, 0, 0], 9: [-1, 0, 2, 0, 1, 0], 11: [-1, 2, 0, 2, 0, 2] },
  maj7: { 0: [-1, 3, 2, 0, 0, 0], 2: [-1, -1, 0, 2, 2, 2], 4: [0, 2, 1, 1, 0, 0], 5: [-1, -1, 3, 2, 1, 0], 7: [3, 2, 0, 0, 0, 2], 9: [-1, 0, 2, 1, 2, 0] },
  sus2: { 2: [-1, -1, 0, 2, 3, 0], 9: [-1, 0, 2, 2, 0, 0] },
  sus4: { 2: [-1, -1, 0, 2, 3, 3], 4: [0, 2, 2, 2, 0, 0], 9: [-1, 0, 2, 2, 3, 0] },
  '5': { 4: [0, 2, 2, -1, -1, -1], 9: [-1, 0, 2, 2, -1, -1], 2: [-1, -1, 0, 2, 3, -1] },
};

/** Forma facile per la tonica suonata (già tolto il capotasto), se c'è. */
export function easyVoicing(playedRoot: number, q: Quality): Voicing | null {
  const frets = EASY[q.id]?.[mod12(playedRoot)];
  if (!frets) return null;
  const f = assignFingers(frets);
  return { frets, fingers: f?.fingers ?? frets.map(() => 0), barres: f?.barres ?? [], source: 'libro' };
}

export const isEasy = (playedRoot: number, q: Quality) => !!EASY[q.id]?.[mod12(playedRoot)];

type Family = 'major' | 'minor' | 'dom' | 'sus' | 'other';

const FAMILY: Record<string, Family> = {
  major: 'major', '6': 'major', '69': 'major', add9: 'major', add11: 'major', maj7: 'major', maj9: 'major', maj11: 'major', maj13: 'major', maj7b5: 'major',
  minor: 'minor', m6: 'minor', m69: 'minor', madd9: 'minor', m7: 'minor', m9: 'minor', m11: 'minor', mmaj7: 'minor', mmaj9: 'minor', mmaj11: 'minor',
  '7': 'dom', '9': 'dom', '11': 'dom', '13': 'dom', '9#11': 'dom', '7b9': 'dom', '7#9': 'dom', '9b5': 'dom', aug9: 'dom', '7b5': 'dom', aug7: 'dom',
  sus2: 'sus', sus4: 'sus', sus2sus4: 'sus', '7sus4': 'sus', maj7sus2: 'sus',
};

/**
 * In ordine di preferenza: la prima forma facile vince, altrimenti si usa la prima.
 * Il barrè di una triade maggiore si evita con la settima maggiore aperta (F → Fmaj7),
 * quello di una minore con la minore settima (Bm → Bm7). Il 7 di dominante resta se è facile.
 */
const CANDIDATES: Record<Exclude<Family, 'sus' | 'other'>, string[]> = {
  major: ['major', 'maj7'],
  minor: ['minor', 'm7'],
  dom: ['7', 'major'],
};

export interface SimplifyOptions {
  capo: number;
  /** true per trasformare anche i sospesi nella triade. */
  sus: boolean;
}

export interface Simplified {
  root: number;
  quality: Quality;
  changed: boolean;
  /** Perché è cambiato, in breve. */
  why: string;
}

export function simplifyChord(root: number, q: Quality, opts: SimplifyOptions, hasBass = false): Simplified {
  const played = mod12(root - opts.capo);
  let family = FAMILY[q.id] ?? 'other';
  if (family === 'sus') {
    if (!opts.sus) return { root, quality: q, changed: hasBass, why: hasBass ? 'senza il basso' : '' };
    family = q.id === '7sus4' ? 'dom' : 'major';
  }
  if (family === 'other') return { root, quality: q, changed: hasBass, why: hasBass ? 'senza il basso' : '' };

  const list = CANDIDATES[family];
  const pick = list.find((id) => isEasy(played, QUALITY_BY_ID[id])) ?? (family === 'dom' ? 'major' : list[0]);
  const quality = QUALITY_BY_ID[pick];
  const changed = quality.id !== q.id || hasBass;
  let why = '';
  if (quality.id !== q.id) {
    if (FAMILY[q.id] === 'sus') why = 'senza sospensione';
    else if (pick !== list[0] && !isEasy(played, QUALITY_BY_ID[list[0]])) why = 'forma aperta, senza barrè';
    else why = 'senza estensioni';
  } else if (hasBass) why = 'senza il basso';
  return { root, quality, changed, why };
}

/**
 * Analisi da mostrare con gli accordi semplici: nomi sostituiti in `chords[]` e nelle griglie,
 * accordi vicini diventati uguali uniti in uno. Restituisce anche l'elenco delle sostituzioni.
 */
export function simplifyAnalysis(a: Analysis, opts: SimplifyOptions): { analysis: Analysis; swaps: { from: string; to: string; why: string }[] } {
  const memo = new Map<string, ReturnType<typeof simplifySymbol>>();
  const conv = (sym: string) => {
    if (!memo.has(sym)) memo.set(sym, simplifySymbol(sym, opts));
    return memo.get(sym)!;
  };
  const seg = (c: ChordSeg): ChordSeg => {
    const r = conv(c.symbol);
    if (!r.changed) return c;
    const p = parseChord(r.symbol)!;
    return { ...c, symbol: r.symbol, root: p.root, quality: p.quality.id };
  };
  const merge = (list: ChordSeg[]) =>
    list.map(seg).reduce<ChordSeg[]>((out, c) => {
      const prev = out[out.length - 1];
      if (prev && prev.symbol === c.symbol && Math.abs(prev.end - c.start) < 0.05) out[out.length - 1] = { ...prev, end: c.end, beats: prev.beats + c.beats };
      else out.push(c);
      return out;
    }, []);
  const analysis: Analysis = {
    ...a,
    chords: merge(a.chords),
    sections: a.sections.map((s) => ({
      ...s,
      chords: merge(s.chords),
      // nella battuta, due nomi diventati uguali si scrivono una volta sola
      chart: s.chart.map((bar) => [...new Set(bar.map((c) => (c === '–' ? c : conv(c).symbol)))]),
    })),
  };
  const swaps = [...memo.entries()].filter(([, r]) => r.changed).map(([from, r]) => ({ from, to: r.symbol, why: r.why }));
  return { analysis, swaps };
}

/** Versione semplice di un simbolo dell'analisi (grafia internazionale, suono reale). */
export function simplifySymbol(sym: string, opts: SimplifyOptions): { symbol: string; changed: boolean; why: string } {
  const p = parseChord(sym);
  if (!p) return { symbol: sym, changed: false, why: '' };
  const s = simplifyChord(p.root, p.quality, opts, p.bass !== undefined);
  return { symbol: s.changed ? chordSymbol(s.root, s.quality, 'intl') : sym, changed: s.changed, why: s.why };
}
