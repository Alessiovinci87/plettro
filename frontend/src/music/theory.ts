// Teoria musicale di base: note, frequenze, qualità degli accordi, scale.

export type Notation = 'intl' | 'it';

/** Le 12 tonalità con la stessa grafia della libreria accordi. */
export const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type Key = (typeof KEYS)[number];

const IT: Record<string, string> = {
  C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si',
};

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function pcOf(name: string): number {
  const m = /^([A-G])([#b]?)/.exec(name);
  if (!m) throw new Error(`Nota non valida: ${name}`);
  const base = SHARPS.indexOf(m[1]);
  return mod12(base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
}

/** "E2" → 40 (MIDI). */
export function midiOf(name: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota non valida: ${name}`);
  return pcOf(m[1]) + (parseInt(m[2], 10) + 1) * 12;
}

export const midiToFreq = (midi: number, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12);
export const freqToMidi = (f: number, a4 = 440) => 69 + 12 * Math.log2(f / a4);

/** Converte una grafia internazionale nella notazione scelta. */
export function localize(letterName: string, notation: Notation): string {
  if (notation === 'intl') return letterName;
  const m = /^([A-G])(.*)$/.exec(letterName);
  if (!m) return letterName;
  return IT[m[1]] + m[2];
}

/** Nome di una pitch class. Di default usa la grafia delle tonalità (C#, Eb, F#, Ab, Bb). */
export function pcName(pc: number, notation: Notation = 'intl', flats?: boolean): string {
  const p = mod12(pc);
  const n = flats === undefined ? KEYS[p] : flats ? FLATS[p] : SHARPS[p];
  return localize(n, notation);
}

export function midiName(midi: number, notation: Notation = 'intl'): string {
  return pcName(midi, notation) + (Math.floor(midi / 12) - 1);
}

// ---------------------------------------------------------------------------
// Qualità degli accordi (stessi suffissi di chords-db, più nomi italiani)

export interface Quality {
  id: string; // suffisso chords-db
  symbol: string; // come si scrive dopo la fondamentale
  name: string; // nome esteso in italiano
  intervals: number[]; // semitoni dalla fondamentale (estensioni oltre 12)
  optional?: number[]; // intervalli omissibili nelle diteggiature
  group: 'Triadi' | 'Settime' | 'Seste e add' | 'Sospesi' | 'Estese' | 'Alterate';
}

export const QUALITIES: Quality[] = [
  { id: 'major', symbol: '', name: 'maggiore', intervals: [0, 4, 7], group: 'Triadi' },
  { id: 'minor', symbol: 'm', name: 'minore', intervals: [0, 3, 7], group: 'Triadi' },
  { id: '5', symbol: '5', name: 'power chord', intervals: [0, 7], group: 'Triadi' },
  { id: 'dim', symbol: 'dim', name: 'diminuito', intervals: [0, 3, 6], group: 'Triadi' },
  { id: 'aug', symbol: 'aug', name: 'aumentato', intervals: [0, 4, 8], group: 'Triadi' },
  { id: '7', symbol: '7', name: 'settima di dominante', intervals: [0, 4, 7, 10], optional: [7], group: 'Settime' },
  { id: 'maj7', symbol: 'maj7', name: 'settima maggiore', intervals: [0, 4, 7, 11], optional: [7], group: 'Settime' },
  { id: 'm7', symbol: 'm7', name: 'minore settima', intervals: [0, 3, 7, 10], optional: [7], group: 'Settime' },
  { id: 'm7b5', symbol: 'm7b5', name: 'semidiminuito', intervals: [0, 3, 6, 10], group: 'Settime' },
  { id: 'dim7', symbol: 'dim7', name: 'diminuito settima', intervals: [0, 3, 6, 9], group: 'Settime' },
  { id: 'mmaj7', symbol: 'm(maj7)', name: 'minore settima maggiore', intervals: [0, 3, 7, 11], optional: [7], group: 'Settime' },
  { id: 'aug7', symbol: '7#5', name: 'settima aumentata', intervals: [0, 4, 8, 10], group: 'Settime' },
  { id: '7b5', symbol: '7b5', name: 'settima quinta bemolle', intervals: [0, 4, 6, 10], group: 'Settime' },
  { id: 'maj7b5', symbol: 'maj7b5', name: 'settima maggiore quinta bemolle', intervals: [0, 4, 6, 11], group: 'Settime' },
  { id: 'maj7#5', symbol: 'maj7#5', name: 'settima maggiore quinta aumentata', intervals: [0, 4, 8, 11], group: 'Settime' },
  { id: 'mmaj7b5', symbol: 'm(maj7b5)', name: 'minore settima maggiore quinta bemolle', intervals: [0, 3, 6, 11], group: 'Settime' },
  { id: '6', symbol: '6', name: 'sesta', intervals: [0, 4, 7, 9], optional: [7], group: 'Seste e add' },
  { id: 'm6', symbol: 'm6', name: 'minore sesta', intervals: [0, 3, 7, 9], optional: [7], group: 'Seste e add' },
  { id: '69', symbol: '6/9', name: 'sesta e nona', intervals: [0, 4, 7, 9, 14], optional: [7], group: 'Seste e add' },
  { id: 'm69', symbol: 'm6/9', name: 'minore sesta e nona', intervals: [0, 3, 7, 9, 14], optional: [7], group: 'Seste e add' },
  { id: 'add9', symbol: 'add9', name: 'nona aggiunta', intervals: [0, 4, 7, 14], group: 'Seste e add' },
  { id: 'madd9', symbol: 'm(add9)', name: 'minore nona aggiunta', intervals: [0, 3, 7, 14], group: 'Seste e add' },
  { id: 'add11', symbol: 'add11', name: 'undicesima aggiunta', intervals: [0, 4, 7, 17], group: 'Seste e add' },
  { id: 'sus2', symbol: 'sus2', name: 'sospeso di seconda', intervals: [0, 2, 7], group: 'Sospesi' },
  { id: 'sus4', symbol: 'sus4', name: 'sospeso di quarta', intervals: [0, 5, 7], group: 'Sospesi' },
  { id: 'sus2sus4', symbol: 'sus2sus4', name: 'sospeso di seconda e quarta', intervals: [0, 2, 5, 7], group: 'Sospesi' },
  { id: '7sus4', symbol: '7sus4', name: 'settima sospesa', intervals: [0, 5, 7, 10], optional: [7], group: 'Sospesi' },
  { id: 'maj7sus2', symbol: 'maj7sus2', name: 'settima maggiore sospesa di seconda', intervals: [0, 2, 7, 11], optional: [7], group: 'Sospesi' },
  { id: '9', symbol: '9', name: 'nona di dominante', intervals: [0, 4, 7, 10, 14], optional: [7], group: 'Estese' },
  { id: 'maj9', symbol: 'maj9', name: 'nona maggiore', intervals: [0, 4, 7, 11, 14], optional: [7], group: 'Estese' },
  { id: 'm9', symbol: 'm9', name: 'minore nona', intervals: [0, 3, 7, 10, 14], optional: [7], group: 'Estese' },
  { id: 'mmaj9', symbol: 'm(maj9)', name: 'minore nona maggiore', intervals: [0, 3, 7, 11, 14], optional: [7], group: 'Estese' },
  { id: '11', symbol: '11', name: 'undicesima', intervals: [0, 4, 7, 10, 14, 17], optional: [4, 7, 14], group: 'Estese' },
  { id: 'maj11', symbol: 'maj11', name: 'undicesima maggiore', intervals: [0, 4, 7, 11, 14, 17], optional: [4, 7, 14], group: 'Estese' },
  { id: 'm11', symbol: 'm11', name: 'minore undicesima', intervals: [0, 3, 7, 10, 14, 17], optional: [7, 14], group: 'Estese' },
  { id: 'mmaj11', symbol: 'm(maj11)', name: 'minore undicesima maggiore', intervals: [0, 3, 7, 11, 14, 17], optional: [7, 14], group: 'Estese' },
  { id: '13', symbol: '13', name: 'tredicesima', intervals: [0, 4, 7, 10, 14, 17, 21], optional: [7, 14, 17], group: 'Estese' },
  { id: 'maj13', symbol: 'maj13', name: 'tredicesima maggiore', intervals: [0, 4, 7, 11, 14, 17, 21], optional: [7, 14, 17], group: 'Estese' },
  { id: '9#11', symbol: '9#11', name: 'nona e undicesima aumentata', intervals: [0, 4, 7, 10, 14, 18], optional: [7, 14], group: 'Estese' },
  { id: '7b9', symbol: '7b9', name: 'settima nona bemolle', intervals: [0, 4, 7, 10, 13], optional: [7], group: 'Alterate' },
  { id: '7#9', symbol: '7#9', name: 'settima nona aumentata (Hendrix)', intervals: [0, 4, 7, 10, 15], optional: [7], group: 'Alterate' },
  { id: '9b5', symbol: '9b5', name: 'nona quinta bemolle', intervals: [0, 4, 6, 10, 14], group: 'Alterate' },
  { id: 'aug9', symbol: '9#5', name: 'nona aumentata', intervals: [0, 4, 8, 10, 14], group: 'Alterate' },
];

export const QUALITY_BY_ID = Object.fromEntries(QUALITIES.map((q) => [q.id, q])) as Record<string, Quality>;

/** Pitch class presenti nell'accordo. */
export function chordPcs(root: number, q: Quality): number[] {
  return [...new Set(q.intervals.map((i) => mod12(root + i)))];
}

export function chordSymbol(rootPc: number, q: Quality, notation: Notation = 'intl', bassPc?: number): string {
  const s = pcName(rootPc, notation) + q.symbol;
  return bassPc === undefined || bassPc === mod12(rootPc) ? s : `${s}/${pcName(bassPc, notation)}`;
}

// ---------------------------------------------------------------------------
// Lettura dei nomi d'accordo scritti a mano ("F#m7b5", "Do maj7", "Bb/D")

const IT_ROOT: [RegExp, string][] = [
  [/^sol/i, 'G'],
  [/^do/i, 'C'],
  [/^re/i, 'D'],
  [/^mi(?![n])/i, 'E'],
  [/^fa/i, 'F'],
  [/^la/i, 'A'],
  [/^si/i, 'B'],
];

/** Suffisso normalizzato (senza spazi e parentesi) → id della qualità. */
const SUFFIX: Record<string, string> = Object.fromEntries(QUALITIES.map((q) => [q.symbol.replace(/[()]/g, ''), q.id]));
Object.assign(SUFFIX, {
  maj: 'major', M: 'major', min: 'minor', mi: 'minor', '-': 'minor',
  M7: 'maj7', Δ: 'maj7', Δ7: 'maj7', '7+': 'maj7', ma7: 'maj7', '7M': 'maj7',
  min7: 'm7', mi7: 'm7', '-7': 'm7',
  ø: 'm7b5', ø7: 'm7b5', min7b5: 'm7b5', '-7b5': 'm7b5',
  '°': 'dim', o: 'dim', '°7': 'dim7', o7: 'dim7',
  '+': 'aug', '#5': 'aug', '+7': 'aug7', aug7: 'aug7',
  sus: 'sus4', add2: 'add9', '2': 'sus2', '4': 'sus4', '69': '69', m69: 'm69',
  mM7: 'mmaj7', minmaj7: 'mmaj7', 'm/maj7': 'mmaj7', mmaj9: 'mmaj9',
  M9: 'maj9', M11: 'maj11', M13: 'maj13', min9: 'm9', min11: 'm11', min6: 'm6',
});

/** `flat`: false per leggere "Bb5" anche come B con quinta bemolle. */
function parseRoot(s: string, flat = true): { pc: number; rest: string; acc: boolean } | null {
  let t = s.replace(/♯/g, '#').replace(/♭/g, 'b');
  let letter: string | null = null;
  for (const [re, l] of IT_ROOT) {
    const m = re.exec(t);
    if (m) {
      letter = l;
      t = t.slice(m[0].length);
      break;
    }
  }
  if (!letter) {
    const m = /^[A-Ga-g]/.exec(t);
    if (!m) return null;
    letter = m[0].toUpperCase();
    t = t.slice(1);
  }
  let pc = SHARPS.indexOf(letter);
  const acc = (flat ? /^[#b]/ : /^#/).exec(t);
  if (acc) {
    pc += acc[0] === '#' ? 1 : -1;
    t = t.slice(1);
  }
  return { pc: mod12(pc), rest: t, acc: !!acc };
}

function qualityOf(raw: string): Quality | null {
  const s = raw.replace(/[\s()]/g, '');
  const id = SUFFIX[s] ?? SUFFIX[s.toLowerCase()];
  return id ? QUALITY_BY_ID[id] : null;
}

export interface ParsedChord {
  root: number;
  quality: Quality;
  bass?: number;
}

/**
 * Legge un accordo scritto in notazione internazionale o italiana:
 * "F#m7b5", "Do maj7", "Bb/D", "Lam", "Sol7", "C°", "AΔ7". Null se non è un accordo noto.
 */
export function parseChord(text: string): ParsedChord | null {
  const t = text.trim();
  if (!t) return null;
  const slash = t.lastIndexOf('/');
  let body = t;
  let bass: number | undefined;
  // "6/9" non è un basso
  if (slash > 0 && !/6\/9$/.test(t)) {
    const b = parseRoot(t.slice(slash + 1).trim());
    if (!b || b.rest.trim()) return null;
    bass = b.pc;
    body = t.slice(0, slash);
  }
  let r = parseRoot(body);
  if (!r) return null;
  let q = qualityOf(r.rest);
  if (!q && r.acc) {
    r = parseRoot(body, false)!;
    q = qualityOf(r.rest);
  }
  if (!q) return null;
  return bass === undefined || bass === r.pc ? { root: r.pc, quality: q } : { root: r.pc, quality: q, bass };
}

const DEGREE: Record<number, string> = {
  0: '1', 1: 'b9', 2: '9', 3: 'b3', 4: '3', 5: '11', 6: 'b5', 7: '5', 8: '#5', 9: '6', 10: 'b7', 11: '7',
};
const SCALE_DEGREE: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

/** Etichetta d'intervallo di una nota rispetto alla fondamentale dell'accordo. */
export function chordDegree(pc: number, rootPc: number, q?: Quality): string {
  const iv = mod12(pc - rootPc);
  if (q) {
    const hit = q.intervals.find((i) => mod12(i) === iv);
    if (hit !== undefined) {
      const map: Record<number, string> = { 13: 'b9', 14: '9', 15: '#9', 17: '11', 18: '#11', 21: '13' };
      if (map[hit]) return map[hit];
      if (hit === 9 && q.intervals.includes(10)) return '13';
      if (hit === 6 && !q.intervals.includes(7)) return 'b5';
      if (hit === 8 && !q.intervals.includes(7)) return '#5';
      if (hit === 9 && q.id.includes('dim7')) return 'bb7';
    }
  }
  return DEGREE[iv];
}

export const scaleDegree = (pc: number, rootPc: number) => SCALE_DEGREE[mod12(pc - rootPc)];

// ---------------------------------------------------------------------------
// Scale

export interface Scale {
  id: string;
  name: string;
  intervals: number[];
  hint: string;
}

export const SCALES: Scale[] = [
  { id: 'major', name: 'Maggiore (ionica)', intervals: [0, 2, 4, 5, 7, 9, 11], hint: 'La base di tutto: melodie pop, rock, folk.' },
  { id: 'minor', name: 'Minore naturale (eolia)', intervals: [0, 2, 3, 5, 7, 8, 10], hint: 'Malinconica, rock e ballad.' },
  { id: 'penta-min', name: 'Pentatonica minore', intervals: [0, 3, 5, 7, 10], hint: 'La scala degli assoli rock e blues.' },
  { id: 'penta-maj', name: 'Pentatonica maggiore', intervals: [0, 2, 4, 7, 9], hint: 'Country, southern rock, assoli "solari".' },
  { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10], hint: 'Pentatonica minore più la blue note (b5).' },
  { id: 'dorian', name: 'Dorica', intervals: [0, 2, 3, 5, 7, 9, 10], hint: 'Minore con la 6ª maggiore: funk, Santana, jam.' },
  { id: 'phrygian', name: 'Frigia', intervals: [0, 1, 3, 5, 7, 8, 10], hint: 'Colore spagnolo e metal.' },
  { id: 'lydian', name: 'Lidia', intervals: [0, 2, 4, 6, 7, 9, 11], hint: 'Maggiore sognante con la #4.' },
  { id: 'mixolydian', name: 'Misolidia', intervals: [0, 2, 4, 5, 7, 9, 10], hint: 'Maggiore con la b7: rock classico, blues-rock.' },
  { id: 'locrian', name: 'Locria', intervals: [0, 1, 3, 5, 6, 8, 10], hint: 'Instabile, sui semidiminuiti.' },
  { id: 'harm-minor', name: 'Minore armonica', intervals: [0, 2, 3, 5, 7, 8, 11], hint: 'Neoclassico e flamenco.' },
  { id: 'mel-minor', name: 'Minore melodica', intervals: [0, 2, 3, 5, 7, 9, 11], hint: 'Jazz e fusion.' },
];

// ---------------------------------------------------------------------------
// Riconoscimento accordo da un insieme di note

export interface ChordMatch {
  root: number;
  quality: Quality;
  bass: number;
  score: number;
}

export function identifyChord(midis: number[]): ChordMatch[] {
  if (midis.length < 2) return [];
  const pcs = [...new Set(midis.map(mod12))];
  const bass = mod12(Math.min(...midis));
  const out: ChordMatch[] = [];
  for (const root of pcs) {
    for (const q of QUALITIES) {
      const req = new Set(q.intervals.filter((i) => !(q.optional ?? []).includes(i)).map((i) => mod12(root + i)));
      const all = new Set(chordPcs(root, q));
      if (![...req].every((p) => pcs.includes(p))) continue;
      if (!pcs.every((p) => all.has(p))) continue;
      let score = 10 - q.intervals.length;
      if (root === bass) score += 5;
      if (q.group === 'Triadi' || q.group === 'Settime') score += 2;
      out.push({ root, quality: q, bass, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
