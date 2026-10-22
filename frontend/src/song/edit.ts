// Correzioni manuali dell'analisi: funzioni pure, ognuna restituisce una nuova analisi.
// Testate in tests/edit.test.ts.
import type { Analysis, ChordSeg, Section } from '../pages/analysis-types';
import { sectionFirstBars } from '../pages/songTime';
import { chordSymbol, mod12, QUALITY_BY_ID, type Quality } from '../music/theory';

const NO_CHORD = '–';
const EPS = 0.05;

const clone = (a: Analysis): Analysis => structuredClone(a);

/** Inizio e fine (secondi) di una battuta, con indice globale nei "downbeats". */
export function barTimes(a: Analysis, globalBar: number): { start: number; end: number } {
  const start = a.downbeats[globalBar] ?? a.duration;
  const end = a.downbeats[globalBar + 1] ?? a.duration;
  return { start, end: Math.max(start, end) };
}

const beatsIn = (a: Analysis, start: number, end: number) => a.beats.filter((b) => b >= start - 0.03 && b < end - 0.03).length;

/** Gli accordi di ogni sezione, ricavati da `chords[]` come fa il server. */
function syncSectionChords(a: Analysis) {
  for (const s of a.sections) s.chords = a.chords.filter((c) => c.end > s.start + EPS && c.start < s.end - EPS).map((c) => ({ ...c }));
}

/** Accordi contigui con lo stesso nome diventano uno solo. */
function mergeChords(a: Analysis, list: ChordSeg[]): ChordSeg[] {
  const out: ChordSeg[] = [];
  for (const c of [...list].sort((x, y) => x.start - y.start)) {
    const prev = out[out.length - 1];
    if (prev && prev.symbol === c.symbol && Math.abs(prev.end - c.start) < EPS) {
      prev.end = c.end;
      prev.beats = beatsIn(a, prev.start, prev.end);
    } else out.push({ ...c });
  }
  return out;
}

export interface ChordChoice {
  root: number;
  quality: Quality;
}

/** Nome dell'accordo come lo scrive il server (grafia internazionale). */
export const choiceSymbol = (c: ChordChoice) => chordSymbol(mod12(c.root), c.quality, 'intl');

/**
 * Mette un accordo (o nessun accordo) su una battuta della sezione.
 * Aggiorna la griglia della sezione e anche `chords[]`: l'accordo occupa tutta la battuta.
 */
export function setBarChord(a: Analysis, sectionIndex: number, barInSection: number, choice: ChordChoice | null): Analysis {
  const out = clone(a);
  const s = out.sections[sectionIndex];
  if (!s || barInSection < 0 || barInSection >= s.chart.length) return a;
  const g = sectionFirstBars(out)[sectionIndex] + barInSection;
  // la prima battuta della sezione può partire prima del primo "uno" (attacco del brano)
  const { start: bs, end: be } = barTimes(out, g);
  const start = barInSection === 0 ? Math.min(bs, s.start) : bs;
  const end = barInSection === s.chart.length - 1 ? Math.max(be, s.end) : be;

  const symbol = choice ? choiceSymbol(choice) : NO_CHORD;
  s.chart[barInSection] = [symbol];

  const kept: ChordSeg[] = [];
  for (const c of out.chords) {
    if (c.end <= start + 1e-6 || c.start >= end - 1e-6) kept.push(c);
    else {
      // l'accordo si sovrappone alla battuta: resta la parte fuori
      if (c.start < start - EPS) kept.push({ ...c, end: start, beats: beatsIn(out, c.start, start) });
      if (c.end > end + EPS) kept.push({ ...c, start: end, beats: beatsIn(out, end, c.end) });
    }
  }
  if (choice) {
    kept.push({ symbol, root: mod12(choice.root), quality: choice.quality.id, start, end, beats: beatsIn(out, start, end) });
  }
  out.chords = mergeChords(out, kept);
  syncSectionChords(out);
  return out;
}

export function renameSection(a: Analysis, sectionIndex: number, label: string): Analysis {
  const name = label.trim().replace(/\s+/g, ' ');
  if (!name || !a.sections[sectionIndex]) return a;
  const out = clone(a);
  out.sections[sectionIndex].label = name;
  return out;
}

/** Si può spostare l'inizio della sezione di `delta` battute? Ogni sezione deve tenere almeno una battuta. */
export function canMoveSectionStart(a: Analysis, sectionIndex: number, delta: 1 | -1): boolean {
  const s = a.sections[sectionIndex];
  const prev = a.sections[sectionIndex - 1];
  if (!s || !prev) return false;
  return delta === 1 ? s.chart.length > 1 : prev.chart.length > 1;
}

/** Sposta l'inizio di una sezione (non la prima) di una battuta avanti o indietro. */
export function moveSectionStart(a: Analysis, sectionIndex: number, delta: 1 | -1): Analysis {
  if (!canMoveSectionStart(a, sectionIndex, delta)) return a;
  const out = clone(a);
  const s = out.sections[sectionIndex];
  const prev = out.sections[sectionIndex - 1];
  const g = sectionFirstBars(out)[sectionIndex] + (delta === 1 ? 1 : -1);
  if (delta === 1) prev.chart.push(s.chart.shift()!);
  else s.chart.unshift(prev.chart.pop()!);
  prev.bars = prev.chart.length;
  s.bars = s.chart.length;
  const t = a.downbeats[g] ?? s.start;
  prev.end = t;
  s.start = t;
  syncSectionChords(out);
  return out;
}

// ---------------------------------------------------------------------------
// Pennata della sezione

export type StrumBrush = 'D' | 'U' | 'soft' | '-';

/** Applica un "pennello" a un sedicesimo. "Leggera" va giù sui battiti e sugli ottavi, su sui sedicesimi in levare. */
export function paintStep(steps: string, index: number, brush: StrumBrush): string {
  if (index < 0 || index >= steps.length) return steps;
  const c = brush === 'soft' ? (index % 2 === 0 ? 'd' : 'u') : brush;
  // toccare di nuovo lo stesso colpo lo toglie
  const next = steps[index] === c ? '-' : c;
  return steps.slice(0, index) + next + steps.slice(index + 1);
}

const ORDINAL = ['1', '2', '3', '4', '5', '6'];

/** Descrizione breve di un pattern, per il riquadro della pennata. */
export function describeStrum(steps: string): string {
  const hits = [...steps].map((c, i) => ({ c, i })).filter((x) => x.c !== '-');
  if (hits.length === 0) return 'Nessuna pennata: lascia suonare.';
  const down = hits.filter((x) => x.i % 4 === 0 && x.c.toLowerCase() === 'd').map((x) => ORDINAL[x.i / 4]);
  const ups = hits.filter((x) => x.i % 4 === 2 && x.c.toLowerCase() === 'u').map((x) => ORDINAL[(x.i - 2) / 4]);
  const sixteenths = hits.some((x) => x.i % 2 === 1);
  const out: string[] = [];
  const beats = steps.length / 4;
  if (down.length === beats) out.push('Giù su ogni battito');
  else if (down.length) out.push(`Giù su ${down.join(', ')}`);
  if (ups.length) out.push(`su in levare dopo ${ups.join(', ')}`);
  if (sixteenths) out.push('qualche colpo in sedicesimi');
  if (hits.some((x) => x.c === 'x')) out.push('stoppate col palmo');
  if (!out.length) out.push('Solo in levare');
  const s = out.join('; ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}

export function setSectionStrum(a: Analysis, sectionIndex: number, steps: string): Analysis {
  const s = a.sections[sectionIndex];
  if (!s || steps.length !== s.strum.steps.length || !/^[DUduxX-]+$/.test(steps)) return a;
  const out = clone(a);
  const t: Section['strum'] = out.sections[sectionIndex].strum;
  t.steps = steps;
  t.advice = describeStrum(steps);
  t.confidence = 1;
  return out;
}

// ---------------------------------------------------------------------------
// Suggerimenti per la scelta dell'accordo

const DIATONIC: Record<string, { iv: number; q: string }[]> = {
  major: [
    { iv: 0, q: 'major' }, { iv: 2, q: 'minor' }, { iv: 4, q: 'minor' }, { iv: 5, q: 'major' },
    { iv: 7, q: 'major' }, { iv: 9, q: 'minor' }, { iv: 11, q: 'dim' },
  ],
  minor: [
    { iv: 0, q: 'minor' }, { iv: 2, q: 'dim' }, { iv: 3, q: 'major' }, { iv: 5, q: 'minor' },
    { iv: 7, q: 'minor' }, { iv: 8, q: 'major' }, { iv: 10, q: 'major' },
  ],
};

/**
 * Accordi proposti per una battuta: prima quelli della tonalità, poi il V maggiore in minore
 * (molto usato), poi quelli già presenti nel brano che non sono nella tonalità.
 */
export function suggestedChords(a: Analysis): ChordChoice[] {
  const mode = a.key.mode === 'minor' ? 'minor' : 'major';
  const out: ChordChoice[] = DIATONIC[mode].map((d) => ({ root: mod12(a.key.tonic + d.iv), quality: QUALITY_BY_ID[d.q] }));
  if (mode === 'minor') out.push({ root: mod12(a.key.tonic + 7), quality: QUALITY_BY_ID.major });
  const seen = new Set(out.map(choiceSymbol));
  for (const c of a.chords) {
    const q = QUALITY_BY_ID[c.quality];
    if (!q) continue;
    const ch = { root: mod12(c.root), quality: q };
    const k = choiceSymbol(ch);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ch);
    }
  }
  return out;
}
