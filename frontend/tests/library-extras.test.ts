import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diatonicChords, KEY_MODES } from '../src/music/diatonic';
import { favKey, isFavorite, parseFavorites, toggleFavorite } from '../src/music/favorites';
import { asStrumPattern, emptySteps, newPatternId, parsePatterns, removePattern, upsertPattern } from '../src/music/patterns';
import { chordSymbol, parseChord, SCALES } from '../src/music/theory';

const scale = (id: string) => SCALES.find((s) => s.id === id)!.intervals;
const names = (cs: ReturnType<typeof diatonicChords>) => cs.map((c) => chordSymbol(c.root, c.quality));

test('accordi della tonalità: Do maggiore e La minore in triadi', () => {
  const c = diatonicChords(0, scale('major'));
  assert.deepEqual(names(c), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  assert.deepEqual(c.map((x) => x.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(names(diatonicChords(9, scale('minor'))), ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
});

test('accordi della tonalità in settime, anche nei modi', () => {
  const g = diatonicChords(7, scale('major'), true);
  assert.deepEqual(names(g), ['Gmaj7', 'Am7', 'Bm7', 'Cmaj7', 'D7', 'Em7', 'F#m7b5']);
  assert.deepEqual(g.map((x) => x.roman), ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7']);
  // La minore armonica: il V diventa maggiore (E), il III aumentato
  const h = diatonicChords(9, scale('harm-minor'));
  assert.deepEqual(names(h), ['Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'Abdim']); // nomi con la grafia fissa dell'app
  // Re dorico
  assert.deepEqual(names(diatonicChords(2, scale('dorian'))), ['Dm', 'Em', 'F', 'G', 'Am', 'Bdim', 'C']);
  assert.ok(KEY_MODES.every((m) => m.intervals.length === 7));
  for (const m of KEY_MODES) for (const s of [false, true]) assert.ok(diatonicChords(0, m.intervals, s).every((c) => c.quality), m.id);
});

test('ricerca per nome: gli esempi della richiesta', () => {
  const p = (s: string) => {
    const r = parseChord(s);
    return r ? chordSymbol(r.root, r.quality, 'intl', r.bass) : null;
  };
  assert.equal(p('F#m7b5'), 'F#m7b5');
  assert.equal(p('Do maj7'), 'Cmaj7');
  assert.equal(p('Bb/D'), 'Bb/D');
  assert.equal(p('sol m'), 'Gm');
  assert.equal(p('re#7'), 'Eb7');
});

test('preferiti: aggiungi, riconosci, togli', () => {
  const f = { tuningId: 'standard', root: 5, quality: 'maj7', frets: [-1, -1, 3, 2, 1, 0] };
  let list = toggleFavorite([], f, 1);
  assert.equal(list.length, 1);
  assert.ok(isFavorite(list, f));
  assert.ok(!isFavorite(list, { ...f, frets: [1, 3, 3, 2, 1, 0] }));
  assert.ok(!isFavorite(list, { ...f, tuningId: 'dropd' }));
  const g = { tuningId: 'standard', root: 7, quality: 'major', frets: [3, 2, 0, 0, 0, 3] };
  list = toggleFavorite(list, g, 2);
  assert.equal(favKey(list[0]), favKey(g));
  list = toggleFavorite(list, f, 3);
  assert.deepEqual(list.map(favKey), [favKey(g)]);
  assert.deepEqual(parseFavorites(JSON.stringify([...list, { root: 'x' }, { ...g, frets: [99] }])), list);
  assert.deepEqual(parseFavorites('oops'), []);
});

test('pattern personali: salva, aggiorna, rifiuta, togli', () => {
  const id = newPatternId([]);
  let list = upsertPattern([], { id, name: '  Il mio   folk ', meter: '4/4', steps: 'D---D-U---U-D-U-' })!;
  assert.equal(list[0].name, 'Il mio folk');
  list = upsertPattern(list, { ...list[0], steps: 'D-U-D-U-D-U-D-U-' })!;
  assert.equal(list.length, 1);
  assert.equal(list[0].steps, 'D-U-D-U-D-U-D-U-');
  assert.equal(upsertPattern(list, { id: 'x', name: '', meter: '4/4', steps: emptySteps('4/4') }), null);
  assert.equal(upsertPattern(list, { id: 'x', name: 'Valzer', meter: '3/4', steps: emptySteps('4/4') }), null);
  list = upsertPattern(list, { id: newPatternId(list), name: 'Valzer mio', meter: '3/4', steps: 'D---D-U-D-U-' })!;
  assert.deepEqual(list.map((p) => p.id), ['mio-1', 'mio-2']);
  assert.equal(asStrumPattern(list[1]).meter, '3/4');
  assert.deepEqual(parsePatterns(JSON.stringify([...list, { id: 'z', name: 'rotto', meter: '4/4', steps: 'DDD' }])), list);
  assert.deepEqual(removePattern(list, 'mio-1').map((p) => p.id), ['mio-2']);
});
