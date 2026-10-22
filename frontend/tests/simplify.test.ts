import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easyVoicing, simplifyAnalysis, simplifySymbol } from '../src/music/simplify';
import { fixture } from './fixture';
import { chordPcs, QUALITY_BY_ID } from '../src/music/theory';
import { sounding } from '../src/music/voicings';
import { STANDARD, tuningMidis } from '../src/music/tunings';

const s = (sym: string, capo = 0, sus = false) => simplifySymbol(sym, { capo, sus }).symbol;

test('estensioni → triade', () => {
  assert.equal(s('Cmaj7'), 'C');
  assert.equal(s('Gadd9'), 'G');
  assert.equal(s('D6'), 'D');
  assert.equal(s('Am7'), 'Am');
  assert.equal(s('Em9'), 'Em');
  assert.equal(simplifySymbol('Cmaj7', { capo: 0, sus: false }).why, 'senza estensioni');
});

test('dominanti: il 7 resta se è facile, le estensioni scendono al 7', () => {
  assert.equal(s('G9'), 'G7');
  assert.equal(s('E7#9'), 'E7');
  assert.equal(s('A7'), 'A7');
  // F7 non ha una forma aperta facile: triade
  assert.equal(s('F7'), 'F');
});

test('barrè evitato con una forma aperta adatta', () => {
  assert.equal(s('F'), 'Fmaj7');
  assert.equal(simplifySymbol('F', { capo: 0, sus: false }).why, 'forma aperta, senza barrè');
  assert.equal(s('Bm'), 'Bm7');
  // nessuna forma aperta: resta com'è
  assert.equal(s('Bb'), 'Bb');
  assert.equal(simplifySymbol('Bb', { capo: 0, sus: false }).changed, false);
  assert.equal(s('F#m'), 'F#m');
});

test('sospesi: solo se scelto', () => {
  assert.equal(s('Dsus4'), 'Dsus4');
  assert.equal(s('Dsus4', 0, true), 'D');
  assert.equal(s('A7sus4', 0, true), 'A7');
  assert.equal(simplifySymbol('Dsus4', { capo: 0, sus: true }).why, 'senza sospensione');
});

test('il capotasto conta: si guarda la forma suonata', () => {
  // con capotasto al 1º, F# si suona come F (barrè) → F#maj7 (forma di Fmaj7)
  assert.equal(s('F#', 1), 'F#maj7');
  // con capotasto al 1º, F si suona come E: facile, resta F
  assert.equal(s('F', 1), 'F');
  // capotasto al 2º: Bm suona come Am, resta Bm
  assert.equal(s('Bm', 2), 'Bm');
});

test('basso tolto, accordi senza alternativa lasciati stare', () => {
  assert.equal(s('C/E'), 'C');
  assert.equal(s('G/B'), 'G');
  assert.equal(s('Bdim'), 'Bdim');
  assert.equal(s('E5'), 'E5');
  assert.equal(s('non accordo'), 'non accordo');
});

test('analisi semplificata: nomi sostituiti, accordi uguali uniti, originale intatto', () => {
  const a = fixture();
  // G G C C | D D G G con la seconda battuta in Gmaj7 e la terza in Cmaj7
  a.chords = [
    { symbol: 'G', root: 7, quality: 'major', start: 0, end: 2, beats: 4 },
    { symbol: 'Gmaj7', root: 7, quality: 'maj7', start: 2, end: 4, beats: 4 },
    { symbol: 'Cmaj7', root: 0, quality: 'maj7', start: 4, end: 8, beats: 8 },
    ...a.chords.slice(2),
  ];
  a.sections[0].chart = [['G'], ['Gmaj7'], ['Cmaj7'], ['C', 'Cmaj7']];
  const { analysis: v, swaps } = simplifyAnalysis(a, { capo: 0, sus: false });
  assert.deepEqual(v.chords.map((c) => `${c.symbol}@${c.start}-${c.end}/${c.beats}`), ['G@0-4/8', 'C@4-8/8', 'D@8-12/8', 'G@12-16/8']);
  assert.equal(v.chords[1].quality, 'major');
  assert.deepEqual(v.sections[0].chart, [['G'], ['G'], ['C'], ['C']]);
  assert.deepEqual(swaps.map((x) => `${x.from}→${x.to}`).sort(), ['Cmaj7→C', 'Gmaj7→G']);
  assert.equal(a.chords[1].symbol, 'Gmaj7');
});

test('le forme facili contengono solo note dell\'accordo', () => {
  const std = tuningMidis(STANDARD);
  for (const [q, roots] of [['major', [0, 2, 4, 7, 9]], ['minor', [2, 4, 9]], ['7', [0, 2, 4, 7, 9, 11]], ['m7', [2, 4, 9, 11]], ['maj7', [0, 2, 4, 5, 7, 9]], ['sus2', [2, 9]], ['sus4', [2, 4, 9]], ['5', [2, 4, 9]]] as const) {
    for (const r of roots) {
      const v = easyVoicing(r, QUALITY_BY_ID[q])!;
      assert.ok(v, `${q} ${r}`);
      const pcs = new Set(chordPcs(r, QUALITY_BY_ID[q]));
      for (const m of sounding(v, std)) if (m !== null) assert.ok(pcs.has(m % 12), `${q} su ${r}: nota estranea ${m}`);
      assert.ok(Math.max(...v.frets) <= 3, `${q} ${r} oltre il 3º tasto`);
    }
  }
});
