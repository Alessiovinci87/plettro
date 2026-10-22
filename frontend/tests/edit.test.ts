import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_BY_ID, parseChord } from '../src/music/theory';
import { canMoveSectionStart, describeStrum, moveSectionStart, paintStep, renameSection, setBarChord, setSectionStrum, suggestedChords } from '../src/song/edit';
import { positionAt } from '../src/pages/songTime';
import { fixture } from './fixture';

const syms = (a: ReturnType<typeof fixture>) => a.chords.map((c) => `${c.symbol}@${c.start}-${c.end}`);

test('accordo su una battuta: griglia e chords[] aggiornati, l\'originale non cambia', () => {
  const a = fixture();
  const b = setBarChord(a, 0, 1, { root: 4, quality: QUALITY_BY_ID.minor });
  assert.deepEqual(b.sections[0].chart, [['G'], ['Em'], ['C'], ['C']]);
  assert.deepEqual(syms(b), ['G@0-2', 'Em@2-4', 'C@4-8', 'D@8-12', 'G@12-16']);
  assert.equal(b.chords[1].beats, 4);
  assert.equal(b.chords[1].quality, 'minor');
  assert.deepEqual(b.sections[0].chords.map((c) => c.symbol), ['G', 'Em', 'C']);
  assert.deepEqual(a.sections[0].chart[1], ['G']);
  // il player trova il nuovo accordo
  assert.equal(b.chords[positionAt(b, 3).chordIndex].symbol, 'Em');
});

test('stesso accordo del vicino: i segmenti si uniscono', () => {
  const b = setBarChord(fixture(), 0, 2, { root: 7, quality: QUALITY_BY_ID.major });
  assert.deepEqual(syms(b), ['G@0-6', 'C@6-8', 'D@8-12', 'G@12-16']);
  assert.equal(b.chords[0].beats, 12);
});

test('battuta senza accordo', () => {
  const b = setBarChord(fixture(), 1, 0, null);
  assert.deepEqual(b.sections[1].chart[0], ['–']);
  assert.deepEqual(syms(b), ['G@0-4', 'C@4-8', 'D@10-12', 'G@12-16']);
});

test('battuta fuori dalla sezione: nessun cambiamento', () => {
  const a = fixture();
  assert.equal(setBarChord(a, 0, 9, null), a);
});

test('rinomina sezione, senza accettare un nome vuoto', () => {
  const a = fixture();
  assert.equal(renameSection(a, 1, '  Coro   finale ').sections[1].label, 'Coro finale');
  assert.equal(renameSection(a, 1, '   '), a);
});

test('inizio sezione avanti e indietro di una battuta', () => {
  const a = fixture();
  assert.equal(canMoveSectionStart(a, 0, 1), false);
  const fw = moveSectionStart(a, 1, 1);
  assert.equal(fw.sections[1].start, 10);
  assert.equal(fw.sections[0].end, 10);
  assert.equal(fw.sections[0].bars, 5);
  assert.equal(fw.sections[1].bars, 3);
  assert.deepEqual(fw.sections[0].chart.at(-1), ['D']);
  assert.deepEqual(fw.sections[0].chords.map((c) => c.symbol), ['G', 'C', 'D']);
  const back = moveSectionStart(a, 1, -1);
  assert.equal(back.sections[1].start, 6);
  assert.deepEqual(back.sections[1].chart[0], ['C']);
  assert.equal(positionAt(back, 6.5).sectionIndex, 1);
  assert.equal(positionAt(back, 6.5).barInSection, 0);
});

test('una sezione tiene sempre almeno una battuta', () => {
  let a = fixture();
  for (let i = 0; i < 3; i++) a = moveSectionStart(a, 1, 1);
  assert.equal(a.sections[1].bars, 1);
  assert.equal(canMoveSectionStart(a, 1, 1), false);
  assert.equal(moveSectionStart(a, 1, 1), a);
});

test('pennello della pennata: giù, su, leggera, di nuovo uguale = vuoto', () => {
  let s = '----------------';
  s = paintStep(s, 0, 'D');
  s = paintStep(s, 2, 'U');
  s = paintStep(s, 4, 'soft');
  s = paintStep(s, 5, 'soft');
  assert.equal(s, 'D-U-du----------');
  assert.equal(paintStep(s, 0, 'D'), '--U-du----------');
  assert.equal(paintStep(s, 2, '-'), 'D---du----------');
});

test('pattern della sezione e descrizione', () => {
  const b = setSectionStrum(fixture(), 0, 'D---D---D---D---');
  assert.equal(b.sections[0].strum.steps, 'D---D---D---D---');
  assert.equal(b.sections[0].strum.advice, 'Giù su ogni battito.');
  assert.equal(describeStrum('D---D-U---U-D-U-'), 'Giù su 1, 2, 4; su in levare dopo 2, 3, 4.');
  assert.equal(describeStrum('----------------'), 'Nessuna pennata: lascia suonare.');
  // lunghezza sbagliata o simboli strani: rifiutati
  const a = fixture();
  assert.equal(setSectionStrum(a, 0, 'D---'), a);
  assert.equal(setSectionStrum(a, 0, 'Z---------------'), a);
});

test('suggerimenti: accordi della tonalità per primi, poi quelli del brano', () => {
  const a = fixture();
  a.chords.push({ symbol: 'Bb', root: 10, quality: 'major', start: 16, end: 16, beats: 0 });
  const s = suggestedChords(a).map((c) => `${c.root}${c.quality.symbol}`);
  assert.deepEqual(s.slice(0, 7), ['7', '9m', '11m', '0', '2', '4m', '6dim']);
  assert.equal(s.at(-1), '10');
  a.key = { ...a.key, tonic: 9, mode: 'minor' };
  assert.deepEqual(suggestedChords(a).slice(0, 8).map((c) => `${c.root}${c.quality.symbol}`), ['9m', '11dim', '0', '2m', '4m', '5', '7', '4']);
});

test('lettura dei nomi d\'accordo', () => {
  const p = (s: string) => {
    const r = parseChord(s);
    return r ? `${r.root}:${r.quality.id}${r.bass !== undefined ? `/${r.bass}` : ''}` : null;
  };
  assert.equal(p('F#m7b5'), '6:m7b5');
  assert.equal(p('Do maj7'), '0:maj7');
  assert.equal(p('Bb/D'), '10:major/2');
  assert.equal(p('Lam'), '9:minor');
  assert.equal(p('Sol7'), '7:7');
  assert.equal(p('Mi'), '4:major');
  assert.equal(p('Mim7'), '4:m7');
  assert.equal(p('Sib'), '10:major');
  assert.equal(p('C6/9'), '0:69');
  assert.equal(p('Cm(maj7)'), '0:mmaj7');
  assert.equal(p('AΔ7'), '9:maj7');
  assert.equal(p('C°'), '0:dim');
  assert.equal(p('Bb5'), '10:5');
  assert.equal(p('Ebm'), '3:minor');
  assert.equal(p('em'), '4:minor');
  assert.equal(p('G/G'), '7:major');
  assert.equal(p('Csus'), '0:sus4');
  assert.equal(p('H7'), null);
  assert.equal(p('C/X'), null);
  assert.equal(p('Cxyz'), null);
  assert.equal(p(''), null);
});
