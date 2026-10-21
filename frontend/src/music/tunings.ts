// Accordature: preset, differenze dallo standard, suggerimenti.
import { midiOf, midiName, mod12, pcOf, type Notation } from './theory';

export interface Tuning {
  id: string;
  name: string;
  /** Dalla 6ª corda (grave) alla 1ª (acuta). */
  notes: string[];
  category: 'Standard' | 'Drop' | 'Aperte' | 'Ribassate' | 'Modali';
  description: string;
  goodFor: string[];
  tips: string[];
  examples?: string[];
}

export const TUNINGS: Tuning[] = [
  {
    id: 'standard', name: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], category: 'Standard',
    description: "L'accordatura di riferimento: tutte le diteggiature classiche partono da qui.",
    goodFor: ['Tutti i generi', 'Studio e lettura di accordi'],
    tips: ['Accorda sempre salendo verso la nota: la meccanica tiene meglio.'],
  },
  {
    id: 'eb', name: 'Mezzo tono sotto (Eb)', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'], category: 'Ribassate',
    description: 'Tutte le corde un semitono sotto. Stesse forme dello standard, suono più caldo e corde più morbide.',
    goodFor: ['Blues', 'Hard rock', 'Grunge', 'Cantanti con voce più bassa'],
    tips: ['Le corde si allentano: valuta una muta di scalatura più alta (es. 10-46 → 10-52).', 'Bending più facili.'],
    examples: ['Jimi Hendrix', 'Stevie Ray Vaughan', "Guns N' Roses"],
  },
  {
    id: 'd-std', name: 'Un tono sotto (D standard)', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'], category: 'Ribassate',
    description: 'Tutto un tono sotto: più peso e cupezza mantenendo le diteggiature standard.',
    goodFor: ['Grunge', 'Stoner', 'Metal', 'Ballad acustiche scure'],
    tips: ['Consigliata una muta più spessa (11-52 o superiore).', "Ricontrolla l'intonazione al 12º tasto."],
  },
  {
    id: 'drop-d', name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], category: 'Drop',
    description: 'Solo la 6ª corda scende di un tono. Power chord con un dito solo e un Re grave pieno.',
    goodFor: ['Rock', 'Grunge', 'Metal', 'Brani in Re/Re minore', 'Fingerstyle'],
    tips: ['Power chord: barrè di un dito sulle tre corde gravi.', 'Si torna allo standard in un attimo: ideale dal vivo.'],
    examples: ['Foo Fighters – Everlong'],
  },
  {
    id: 'drop-db', name: 'Drop C#', notes: ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'], category: 'Drop',
    description: 'Drop D abbassata di un semitono: più scura e pesante.',
    goodFor: ['Grunge', 'Alternative metal'],
    tips: ['Serve una muta più spessa per non perdere tensione.'],
  },
  {
    id: 'drop-c', name: 'Drop C', notes: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'], category: 'Drop',
    description: 'D standard con la 6ª corda abbassata di un altro tono. Riff pesantissimi con un dito.',
    goodFor: ['Metal', 'Nu-metal', 'Post-hardcore'],
    tips: ['Muta 11-56 o superiore; controlla capotasto e truss rod.'],
    examples: ['System of a Down'],
  },
  {
    id: 'dadgad', name: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'], category: 'Modali',
    description: 'Accordatura modale (Dsus4): né maggiore né minore, corde a vuoto che risuonano a lungo.',
    goodFor: ['Folk celtico', 'Fingerstyle', 'Atmosfere orientali', 'Brani in Re'],
    tips: ['Lascia suonare le corde a vuoto sopra le forme: è il suo segreto.', 'Il capotasto la sposta in altre tonalità.'],
    examples: ['Led Zeppelin – Kashmir'],
  },
  {
    id: 'open-g', name: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'], category: 'Aperte',
    description: 'Le corde a vuoto formano un accordo di Sol maggiore. Barrè di un dito = accordo maggiore.',
    goodFor: ['Rock alla Rolling Stones', 'Slide', 'Blues', 'Brani in Sol'],
    tips: ['Molti suonano senza la 6ª corda (5 corde).', 'Ottima per la slide sul 12º tasto.'],
    examples: ['Keith Richards (Rolling Stones)'],
  },
  {
    id: 'open-d', name: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'], category: 'Aperte',
    description: 'Le corde a vuoto formano un Re maggiore. Sonorità ampia e risonante.',
    goodFor: ['Slide', 'Folk', 'Fingerstyle', 'Brani in Re'],
    tips: ['Con il capotasto al 2º tasto diventa Open E con meno tensione.'],
  },
  {
    id: 'open-e', name: 'Open E', notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'], category: 'Aperte',
    description: 'Open D un tono sopra: più brillante, ma aumenta la tensione sul manico.',
    goodFor: ['Slide blues', 'Southern rock'],
    tips: ['Aumenta la tensione: in alternativa usa Open D col capotasto al 2º tasto.'],
    examples: ['Duane Allman'],
  },
  {
    id: 'open-c', name: 'Open C', notes: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'], category: 'Aperte',
    description: 'Accordo di Do maggiore a vuoto, molto grave e orchestrale.',
    goodFor: ['Fingerstyle', 'Ambient', 'Ballate'],
    tips: ['Le corde gravi si allentano parecchio: muta pesante consigliata.'],
  },
  {
    id: 'c-std', name: 'Due toni sotto (C standard)', notes: ['C2', 'F2', 'Bb2', 'Eb3', 'G3', 'C4'], category: 'Ribassate',
    description: 'Tutto due toni sotto: muro di suono, per riff doom e stoner.',
    goodFor: ['Doom', 'Stoner', 'Sludge'],
    tips: ['Indispensabile una muta molto spessa (12-56 o baritona).'],
  },
  {
    id: 'csharp-std', name: 'C# standard', notes: ['C#2', 'F#2', 'B2', 'E3', 'G#3', 'C#4'], category: 'Ribassate',
    description: 'Un tono e mezzo sotto: il suono dei primi riff doom.',
    goodFor: ['Doom', 'Heavy metal classico'],
    tips: ['Muta 11-56 o superiore.'],
    examples: ['Black Sabbath – Master of Reality'],
  },
];

export const TUNING_BY_ID = Object.fromEntries(TUNINGS.map((t) => [t.id, t])) as Record<string, Tuning>;
export const STANDARD = TUNING_BY_ID['standard'];

export const tuningMidis = (t: Tuning) => t.notes.map(midiOf);

export interface StringChange {
  string: number; // 6 = grave … 1 = acuta
  from: string;
  to: string;
  semitones: number;
}

/** Come arrivarci dallo standard, corda per corda. */
export function changesFromStandard(t: Tuning, notation: Notation = 'intl'): StringChange[] {
  const std = tuningMidis(STANDARD);
  return tuningMidis(t)
    .map((m, i) => ({
      string: 6 - i,
      from: midiName(std[i], notation),
      to: midiName(m, notation),
      semitones: m - std[i],
    }))
    .filter((c) => c.semitones !== 0);
}

// ---------------------------------------------------------------------------
// Suggeritore di accordature

export type Style = 'riff' | 'folk' | 'slide' | 'blues' | 'heavy' | 'pop';

export const STYLES: { id: Style; label: string }[] = [
  { id: 'pop', label: 'Pop / cantautorato' },
  { id: 'folk', label: 'Folk / fingerstyle' },
  { id: 'riff', label: 'Rock con riff' },
  { id: 'heavy', label: 'Metal / pesante' },
  { id: 'blues', label: 'Blues' },
  { id: 'slide', label: 'Slide' },
];

const STYLE_FIT: Record<Style, string[]> = {
  pop: ['standard', 'eb', 'drop-d'],
  folk: ['dadgad', 'open-d', 'open-g', 'drop-d', 'open-c', 'standard'],
  riff: ['drop-d', 'eb', 'standard', 'd-std'],
  heavy: ['drop-c', 'drop-db', 'd-std', 'c-std', 'csharp-std', 'drop-d'],
  blues: ['standard', 'eb', 'open-g', 'open-e'],
  slide: ['open-g', 'open-d', 'open-e', 'open-c'],
};

export interface TuningSuggestion {
  tuning: Tuning;
  score: number;
  reasons: string[];
  capo?: number;
}

/**
 * Suggerisce accordature per una tonalità (es. "D", "Em") e uno stile.
 * Premia le accordature la cui corda più grave è la tonica (o la quinta)
 * e quelle tipiche dello stile; segnala quando serve il capotasto.
 */
export function suggestTunings(key: string, style: Style): TuningSuggestion[] {
  const minor = /m$/.test(key);
  const tonic = pcOf(key);
  const fit = STYLE_FIT[style];
  const res: TuningSuggestion[] = [];
  for (const t of TUNINGS) {
    const midis = tuningMidis(t);
    const low = mod12(midis[0]);
    const reasons: string[] = [];
    let score = 0;
    const fi = fit.indexOf(t.id);
    if (fi >= 0) {
      score += 6 - fi;
      reasons.push('Tipica per lo stile scelto');
    } else if (t.id !== 'standard') continue;

    const opens = new Set(midis.map(mod12));
    let capo: number | undefined;
    if (low === tonic) {
      score += 4;
      reasons.push('Il basso a vuoto è la tonica: puoi farlo risuonare sotto gli accordi');
    } else if (mod12(low + 7) === tonic || low === mod12(tonic + 7)) {
      score += 2;
      reasons.push('Il basso a vuoto è la quinta della tonalità');
    } else if (t.category === 'Aperte' || t.category === 'Modali') {
      // Tonalità diversa: capotasto per portare la tonica dell'accordatura sulla tonalità.
      const c = mod12(tonic - low);
      if (c > 0 && c <= 7) {
        capo = c;
        score += 1;
        reasons.push(`Con il capotasto al ${c}º tasto suona nella tonalità giusta`);
      } else score -= 2;
    }
    if (t.category === 'Aperte' && minor) {
      score -= 2;
      reasons.push('Attenzione: è un accordo maggiore a vuoto, su brani minori serve qualche accorgimento');
    }
    const third = mod12(tonic + (minor ? 3 : 4));
    if (opens.has(tonic) && opens.has(third)) score += 1;
    res.push({ tuning: t, score, reasons, capo });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, 4);
}
