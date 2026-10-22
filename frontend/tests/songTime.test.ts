import { test } from 'node:test';
import assert from 'node:assert/strict';
import sample from '../src/data/sample-analysis.json';
import type { Analysis } from '../src/pages/analysis-types';
import { lastAtOrBefore, positionAt } from '../src/pages/songTime';

const a = sample as unknown as Analysis;

test('ricerca binaria', () => {
  assert.equal(lastAtOrBefore([1, 2, 3], 0.5), -1);
  assert.equal(lastAtOrBefore([1, 2, 3], 2), 1);
  assert.equal(lastAtOrBefore([1, 2, 3], 9), 2);
});

test('prima di partire: nessun accordo, il prossimo è il primo', () => {
  const p = positionAt(a, 0);
  assert.equal(p.chordIndex, -1);
  assert.equal(p.nextChordIndex, 0);
  assert.equal(p.sectionIndex, -1);
});

test('sul primo "uno": battito 0, sedicesimo 0, primo accordo', () => {
  const t = a.downbeats[0] + 0.01;
  const p = positionAt(a, t);
  assert.equal(p.beatInBar, 0);
  assert.equal(p.step, 0);
  assert.equal(p.chordIndex, 0);
  assert.equal(p.sectionIndex, 0);
  assert.equal(p.barInSection, 0);
});

test('a metà del secondo battito il sedicesimo è 6', () => {
  const t = (a.beats[1] + a.beats[2]) / 2 + 0.01;
  const p = positionAt(a, t);
  assert.equal(p.beatInBar, 1);
  assert.equal(p.step, 6);
});

test('il conto alla rovescia arriva a 1 prima del cambio', () => {
  const next = a.chords[1];
  const b = a.beats.findIndex((x) => x >= next.start - 0.03);
  const p = positionAt(a, a.beats[b - 1] + 0.01);
  assert.equal(p.nextChordIndex, 1);
  assert.equal(p.beatsToNext, 1);
});

test('battuta nella sezione', () => {
  const s = a.sections[1];
  const p = positionAt(a, s.start + 0.02);
  assert.equal(p.sectionIndex, 1);
  assert.equal(p.barInSection, 0);
});
