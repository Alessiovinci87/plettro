// Posizioni delle scale sul manico: box per pentatoniche e blues, tre note per corda per le scale a 7 note.
// Funzioni pure, testate in tests/positions.test.ts.
import { mod12 } from './theory';

export type PositionSystem = 'box' | '3nps';

export interface PosNote {
  /** 0 = 6ª corda (grave) */
  string: number;
  fret: number;
  midi: number;
  /** 1 indice … 4 mignolo, 0 corda a vuoto */
  finger: number;
  root: boolean;
}

export interface ScalePosition {
  /** 0 = posizione 1, che parte dalla tonica sulla corda più grave */
  index: number;
  system: PositionSystem;
  /** In ordine di salita: dalla 6ª corda alla 1ª, tasto crescente. */
  notes: PosNote[];
  /** Tasto dell'indice (1 se si usano corde a vuoto). */
  hand: number;
  /** Tasti occupati, senza le corde a vuoto. */
  from: number;
  to: number;
}

/** Box a 2 note per corda per scale a 5 note (più la blue note), 3 note per corda per le scale a 7. */
export function positionSystem(intervals: number[]): PositionSystem | null {
  if (intervals.length === 7) return '3nps';
  if (baseOf(intervals)) return 'box';
  return null;
}

/** Pentatonica di partenza ed eventuali note aggiunte (la blue note della scala blues). */
function baseOf(intervals: number[]): { base: number[]; extra: number[] } | null {
  if (intervals.length === 5) return { base: intervals, extra: [] };
  if (intervals.length === 6 && intervals.includes(6)) return { base: intervals.filter((i) => i !== 6), extra: [6] };
  return null;
}

/** Dita per le note di una corda in tre note per corda: 1-2-4 o 1-3-4 a seconda delle distanze. */
function fingers3(frets: number[]): number[] {
  if (frets[0] === 0) return frets.map((f) => (f === 0 ? 0 : Math.min(4, f)));
  const off = frets.map((f) => f - frets[0]);
  const last = off[off.length - 1];
  return off.map((o, i) => (i === 0 ? 1 : i === off.length - 1 ? (last >= 3 ? 4 : last + 1) : o <= last / 2 ? 2 : 3));
}

/**
 * Tutte le posizioni della scala nell'accordatura data, dalla tonica in su.
 * Ogni posizione prende note consecutive della scala, 2 (o 3) per corda, salendo di corda in corda:
 * così il salto tra 3ª e 2ª corda si sistema da solo.
 */
export function scalePositions(tuning: number[], root: number, intervals: number[], maxFret = 15): ScalePosition[] {
  const system = positionSystem(intervals);
  if (!system) return [];
  const { base, extra } = system === 'box' ? baseOf(intervals)! : { base: intervals, extra: [] };
  const per = system === 'box' ? 2 : 3;
  const n = tuning.length;
  const inScale = (m: number) => base.includes(mod12(m - root));
  const isRoot = (m: number) => mod12(m - root) === 0;

  /** La posizione che parte da `start` sulla corda più grave; null se chiede tasti negativi. */
  const build = (index: number, start: number): ScalePosition | null => {
    const seq: number[] = [];
    for (let m = start; seq.length < per * n; m++) if (inScale(m)) seq.push(m);
    const raw = seq.map((m, k) => ({ string: Math.floor(k / per), midi: m, fret: m - tuning[Math.floor(k / per)] }));
    if (raw.some((x) => x.fret < 0)) return null;
    const fretted = raw.filter((x) => x.fret > 0).map((x) => x.fret);
    const from = fretted.length ? Math.min(...fretted) : 0;
    const top = fretted.length ? Math.max(...fretted) : 0;
    let notes: PosNote[];
    let hand: number;
    if (system === 'box') {
      const withExtra = [...raw];
      for (let s = 0; s < n; s++)
        for (let f = Math.max(1, from); f <= top; f++) {
          const m = tuning[s] + f;
          if (extra.includes(mod12(m - root)) && !withExtra.some((x) => x.midi === m)) withExtra.push({ string: s, midi: m, fret: f });
        }
      withExtra.sort((a, b) => a.string - b.string || a.fret - b.fret);
      hand = raw.some((x) => x.fret === 0) ? 1 : from;
      notes = withExtra.map((x) => ({ ...x, root: isRoot(x.midi), finger: x.fret === 0 ? 0 : Math.max(1, Math.min(4, x.fret - hand + 1)) }));
    } else {
      notes = [];
      for (let s = 0; s < n; s++) {
        const row = raw.filter((x) => x.string === s);
        const fs = fingers3(row.map((x) => x.fret));
        row.forEach((x, k) => notes.push({ ...x, root: isRoot(x.midi), finger: fs[k] }));
      }
      hand = Math.max(1, raw[0].fret);
    }
    return { index, system, notes, hand, from: from || hand, to: Math.max(top, ...notes.map((x) => x.fret)) };
  };

  /** All'ottava più bassa possibile. */
  const lowest = (index: number) => {
    for (let start = tuning[0] + mod12(root + base[index] - tuning[0]); ; start += 12) {
      const p = build(index, start);
      if (p) return p;
    }
  };

  const first = lowest(0);
  return base.map((_, index) => {
    if (index === 0) return first;
    // le posizioni salgono lungo il manico dalla prima, finché stanno nei tasti disegnati
    const low = lowest(index);
    if (low.notes[0].fret >= first.notes[0].fret) return low;
    const up = build(index, low.notes[0].midi + 12);
    return up && up.to <= maxFret ? up : low;
  });
}

/** Ordine in cui si suonano: salita dalla 6ª alla 1ª corda, poi discesa (la nota in cima una volta sola). */
export function playOrder(p: ScalePosition): PosNote[] {
  return [...p.notes, ...p.notes.slice(0, -1).reverse()];
}

/** Etichetta della corda come nelle tablature: "1ª Mi" in alto … "6ª Mi" in basso. */
export const stringLabel = (s: number, count: number, noteName: string) => `${count - s}ª ${noteName}`;

/** Tablatura testuale delle note date, una colonna per nota; righe dalla 1ª corda (in alto) alla 6ª. */
export function tablature(notes: PosNote[], labels: string[]): string[] {
  const n = labels.length;
  const w = Math.max(...labels.map((l) => l.length));
  return Array.from({ length: n }, (_, k) => {
    const s = n - 1 - k;
    const cells = notes.map((x) => {
      const t = String(x.fret);
      return (x.string === s ? t : '-'.repeat(t.length)) + '-';
    });
    return `${labels[s].padEnd(w)} |-${cells.join('')}|`;
  });
}

/** "al 5º", "all'8º", "sul 5", "sull'8": l'articolo davanti ai numeri che iniziano per vocale. */
const vowel = (n: number) => n === 8 || n === 11 || (n >= 80 && n < 90);
const al = (n: number) => (vowel(n) ? `all'${n}º` : `al ${n}º`);
const sul = (n: number) => (vowel(n) ? `sull'${n}` : `sul ${n}`);

/** "mano al 5º tasto", "mano all'8º tasto", "mano in prima posizione". */
export const handLabel = (p: ScalePosition) => (p.notes.some((x) => x.fret === 0) ? 'mano in prima posizione' : `mano ${al(p.hand)} tasto`);

/** Due frasi semplici: dove mettere la mano e da dove partire. */
export function explainPosition(p: ScalePosition, strings: number, rootName: string): { hand: string; start: string } {
  const open = p.notes.some((x) => x.fret === 0);
  const stretch = p.system === 'box' && p.to > p.hand + 3;
  const hand =
    p.system === '3nps'
      ? `Tre note per corda: indice ${al(p.hand)} tasto sulla ${strings}ª corda. Salendo la mano scivola di un tasto quando serve; usa indice, medio o anulare e mignolo.`
      : open
        ? `Mano in prima posizione: le corde a vuoto suonano da sole, poi un dito per tasto, dal 1º (indice) al 4º (mignolo).`
        : `Mano ${al(p.hand)} tasto: indice ${sul(p.hand)}, poi un dito per tasto fino al mignolo ${sul(p.hand + 3)}.${stretch ? ` Per arrivare ${al(p.to)} tasto allunga il mignolo.` : ''}`;
  const r = p.notes.find((x) => x.root);
  const where = r ? `sulla ${strings - r.string}ª corda ${r.fret === 0 ? 'a vuoto' : `${al(r.fret)} tasto`}` : '';
  const first = p.notes[0];
  const start = !r
    ? 'Parti dalla nota più grave e sali corda per corda.'
    : r === first
      ? `Parti dalla tonica (${rootName}) ${where}, sali fino alla 1ª corda e torna indietro.`
      : `La tonica (${rootName}) è ${where}: tienila come riferimento. Parti dalla nota più grave sulla ${strings - first.string}ª corda, sali fino alla 1ª e torna indietro.`;
  return { hand, start };
}

/** Un consiglio d'uso per scala, in italiano semplice. */
export function usageTip(scaleId: string, rootName: string): string {
  const tips: Record<string, string> = {
    'penta-min': `Si usa sopra accordi di ${rootName} minore e nei blues e rock in ${rootName}.`,
    'penta-maj': `Si usa sopra accordi di ${rootName} maggiore: country, pop, rock solare.`,
    blues: `Si usa nei blues in ${rootName} (sopra ${rootName}7) e nel rock: la blue note va toccata di passaggio.`,
    major: `Si usa per melodie sopra gli accordi di ${rootName} maggiore.`,
    minor: `Si usa sopra ${rootName} minore e sulle progressioni in ${rootName} minore.`,
    dorian: `Si usa sopra un ${rootName} minore (o ${rootName}m7) che resta a lungo: funk, jam, Santana.`,
    phrygian: `Si usa sopra ${rootName} minore per un colore spagnolo o metal.`,
    lydian: `Si usa sopra ${rootName} maggiore (o ${rootName}maj7) per un suono sognante.`,
    mixolydian: `Si usa sopra ${rootName}7 e nel rock classico in ${rootName}.`,
    locrian: `Si usa sopra un ${rootName}m7b5 (semidiminuito).`,
    'harm-minor': `Si usa sopra ${rootName} minore quando c'è il V maggiore: neoclassico e flamenco.`,
    'mel-minor': `Si usa sopra ${rootName} minore con la 6ª e la 7ª maggiori: jazz e fusion.`,
  };
  return tips[scaleId] ?? '';
}
