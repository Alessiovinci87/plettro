// Pattern di pennata su griglia di sedicesimi (4/4 = 16 passi, 3/4 = 12, 6/8 = 12).
// Simboli: 'D' giù, 'U' su, 'd'/'u' leggera, 'x' stoppata (palm mute/chuck), '-' pausa.

export interface StrumPattern {
  id: string;
  name: string;
  meter: '4/4' | '3/4' | '6/8';
  steps: string; // un carattere per sedicesimo (per 6/8: per ottavo)
  feel: string;
  tip: string;
}

export const STRUM_PATTERNS: StrumPattern[] = [
  { id: 'quarters', name: 'Quarti', meter: '4/4', steps: 'D---D---D---D---', feel: 'Base, ballad lente', tip: 'Tutto giù, uno per battito: perfetto per imparare i cambi.' },
  { id: 'eighths', name: 'Ottavi giù-su', meter: '4/4', steps: 'D-U-D-U-D-U-D-U-', feel: 'Pop, rock leggero', tip: 'La mano va su e giù come un pendolo, sempre a tempo.' },
  { id: 'folk', name: 'Folk classico', meter: '4/4', steps: 'D---D-U---U-D-U-', feel: 'Cantautorato, acustico', tip: "Il più usato in assoluto: giù, giù-su, su-giù-su. Il braccio non si ferma mai, salta solo le corde." },
  { id: 'rock', name: 'Rock con accento', meter: '4/4', steps: 'D-U-D-U-D-U-D-U-', feel: 'Rock', tip: 'Accentua il 2 e il 4 (la pennata giù su rullante).' },
  { id: 'reggae', name: 'Levare (reggae/ska)', meter: '4/4', steps: '--U---U---U---U-', feel: 'Reggae, ska', tip: 'Solo sui levare, pennata corta e stoppata subito dopo.' },
  { id: 'chuck', name: 'Pop con chuck', meter: '4/4', steps: 'D-U-x-U-D-U-x-U-', feel: 'Pop acustico moderno', tip: "Sul 2 e sul 4 appoggia il palmo sulle corde mentre scendi: fa da rullante." },
  { id: 'funk', name: 'Sedicesimi funk', meter: '4/4', steps: 'D-uUd-U-DudU-u-U', feel: 'Funk', tip: 'Mano sempre a sedicesimi, colpisci solo dove serve. Polso morbido.' },
  { id: 'gallop', name: 'Galoppo', meter: '4/4', steps: 'D-DDD-DDD-DDD-DD', feel: 'Metal, hard rock', tip: 'Palm mute sulle corde gravi, tutto in pennata alternata stretta.' },
  { id: 'waltz', name: 'Valzer', meter: '3/4', steps: 'D---D-U-D-U-', feel: 'Valzer, ballad in 3', tip: 'Il primo battito è il più forte: basso, poi accordo.' },
  { id: 'six-eight', name: '6/8 ballad', meter: '6/8', steps: 'DDUDDU', feel: 'Ballad in 6/8', tip: 'Due gruppi da tre: accenta 1 e 4.' },
];

/** Passi per battito: 4 sedicesimi in 4/4 e 3/4, 3 ottavi per gruppo in 6/8. */
export const stepsPerBeat = (p: StrumPattern) => (p.meter === '6/8' ? 3 : 4);
export const beatsPerBar = (p: StrumPattern) => (p.meter === '6/8' ? 2 : p.meter === '3/4' ? 3 : 4);
