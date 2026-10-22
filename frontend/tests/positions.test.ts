import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainPosition, playOrder, positionSystem, scalePositions, stringLabel, tablature, usageTip, type ScalePosition } from '../src/music/positions';
import { SCALES } from '../src/music/theory';

const STD = [40, 45, 50, 55, 59, 64];
const scale = (id: string) => SCALES.find((s) => s.id === id)!.intervals;
/** Tasti per corda, dalla 6ª alla 1ª. */
const byString = (p: ScalePosition, key: 'fret' | 'finger' = 'fret') => STD.map((_, s) => p.notes.filter((x) => x.string === s).map((x) => x[key]));

test('La pentatonica minore, posizione 1: 5-8 / 5-7 / 5-7 / 5-7 / 5-8 / 5-8', () => {
  const ps = scalePositions(STD, 9, scale('penta-min'));
  assert.equal(ps.length, 5);
  const p = ps[0];
  assert.deepEqual(byString(p), [[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
  assert.deepEqual(byString(p, 'finger'), [[1, 4], [1, 3], [1, 3], [1, 3], [1, 4], [1, 4]]);
  assert.equal(p.hand, 5);
  assert.deepEqual([p.from, p.to], [5, 8]);
  assert.deepEqual(p.notes.filter((x) => x.root).map((x) => [x.string, x.fret]), [[0, 5], [2, 7], [5, 5]]);
});

test('le cinque posizioni si incastrano lungo il manico', () => {
  const ps = scalePositions(STD, 9, scale('penta-min'));
  assert.deepEqual(ps.map((p) => p.notes[0].fret), [5, 8, 10, 12, 3]);
  assert.deepEqual(byString(ps[1]), [[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]]);
  assert.deepEqual(byString(ps[4]), [[3, 5], [3, 5], [2, 5], [2, 5], [3, 5], [3, 5]]);
  assert.equal(ps[4].hand, 2);
  // ogni posizione condivide una "colonna" con la successiva: l'ultima nota della 6ª è la prima della seguente
  for (let i = 0; i < 4; i++) assert.equal(ps[i].notes[1].midi % 12, ps[i + 1].notes[0].midi % 12);
  // ogni nota sta in una sola posizione per corda e i diti vanno da 1 a 4
  for (const p of ps) assert.ok(p.notes.every((x) => x.finger >= 1 && x.finger <= 4));
});

test('Mi minore pentatonica: corde a vuoto e mano al primo tasto', () => {
  const p = scalePositions(STD, 4, scale('penta-min'))[0];
  assert.deepEqual(byString(p), [[0, 3], [0, 2], [0, 2], [0, 2], [0, 3], [0, 3]]);
  assert.equal(p.hand, 1);
  assert.deepEqual(byString(p, 'finger')[0], [0, 3]);
  assert.match(explainPosition(p, 6, 'Mi').hand, /prima posizione/);
});

test('blues in La: la blue note entra nel box', () => {
  const p = scalePositions(STD, 9, scale('blues'))[0];
  assert.deepEqual(byString(p), [[5, 8], [5, 6, 7], [5, 7], [5, 7, 8], [5, 8], [5, 8]]);
  assert.equal(positionSystem(scale('blues')), 'box');
});

test('Sol maggiore a tre note per corda: 7 posizioni, dita 1-2-4 e 1-3-4', () => {
  const ps = scalePositions(STD, 7, scale('major'));
  assert.equal(ps.length, 7);
  assert.equal(positionSystem(scale('major')), '3nps');
  const p = ps[0];
  assert.deepEqual(byString(p), [[3, 5, 7], [3, 5, 7], [4, 5, 7], [4, 5, 7], [5, 7, 8], [5, 7, 8]]);
  assert.deepEqual(byString(p, 'finger'), [[1, 2, 4], [1, 2, 4], [1, 2, 4], [1, 2, 4], [1, 3, 4], [1, 3, 4]]);
  assert.equal(p.hand, 3);
  assert.match(explainPosition(p, 6, 'Sol').hand, /Tre note per corda/);
  // salita continua: ogni nota più acuta della precedente
  for (const q of ps) assert.ok(q.notes.every((x, i) => i === 0 || x.midi > q.notes[i - 1].midi));
});

test('ordine di esecuzione, tablatura e spiegazione', () => {
  const p = scalePositions(STD, 9, scale('penta-min'))[0];
  const order = playOrder(p);
  assert.equal(order.length, 23);
  assert.deepEqual([order[0].fret, order[11].fret, order[22].fret], [5, 8, 5]);
  assert.equal(order[11].string, 5);
  const names = ['Mi', 'La', 'Re', 'Sol', 'Si', 'Mi'];
  const labels = names.map((nm, s) => stringLabel(s, 6, nm));
  assert.deepEqual([labels[5], labels[0]], ['1ª Mi', '6ª Mi']);
  assert.deepEqual(tablature(p.notes, labels), [
    '1ª Mi  |---------------------5-8-|',
    '2ª Si  |-----------------5-8-----|',
    '3ª Sol |-------------5-7---------|',
    '4ª Re  |---------5-7-------------|',
    '5ª La  |-----5-7-----------------|',
    '6ª Mi  |-5-8---------------------|',
  ]);
  const e = explainPosition(p, 6, 'La');
  assert.equal(e.hand, "Mano al 5º tasto: indice sul 5, poi un dito per tasto fino al mignolo sull'8.");
  assert.match(explainPosition(scalePositions(STD, 0, scale('penta-min'))[0], 6, 'Do').hand, /^Mano all'8º tasto: indice sull'8, .* sull'11\./);
  assert.match(e.start, /^Parti dalla tonica \(La\) sulla 6ª corda al 5º tasto/);
  const p2 = scalePositions(STD, 9, scale('penta-min'))[1];
  assert.match(explainPosition(p2, 6, 'La').start, /La tonica \(La\) è sulla 4ª corda al 7º tasto: tienila come riferimento/);
  assert.equal(usageTip('penta-min', 'La'), 'Si usa sopra accordi di La minore e nei blues e rock in La.');
});

test('scale senza posizioni e altre accordature', () => {
  assert.deepEqual(scalePositions(STD, 0, [0, 4, 7]), []);
  // Drop D: la 6ª è un Re, le posizioni restano su tasti validi
  const dropD = [38, 45, 50, 55, 59, 64];
  for (const p of scalePositions(dropD, 9, scale('penta-min'))) assert.ok(p.notes.every((x) => x.fret >= 0 && x.midi === dropD[x.string] + x.fret));
});
