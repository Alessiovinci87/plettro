import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatPeriodAt, clicksBetween, countIn, inRange, loopTimes, nextRate, parsePrefs, RATES, sameRange, sectionRange, tapBar, DEFAULT_PREFS } from '../src/song/practice';
import { fixture } from './fixture';

test('loop di una sezione: battute globali e istanti', () => {
  const a = fixture();
  const r = sectionRange(a, 1);
  assert.deepEqual(r, { startBar: 4, endBar: 7 });
  assert.deepEqual(loopTimes(a, r), { start: 8, end: 16 });
  assert.deepEqual(loopTimes(a, { startBar: 2, endBar: 3 }), { start: 4, end: 8 });
  assert.ok(sameRange(r, { startBar: 4, endBar: 7 }));
  assert.ok(!sameRange(r, null));
  assert.ok(inRange(r, 5) && !inRange(r, 3));
});

test('selezione A–B in due tocchi, in qualunque ordine', () => {
  let s = tapBar({ anchor: null, range: null }, 6);
  assert.deepEqual(s, { anchor: 6, range: { startBar: 6, endBar: 6 } });
  s = tapBar(s, 2);
  assert.deepEqual(s, { anchor: null, range: { startBar: 2, endBar: 6 } });
  // un nuovo tocco ricomincia
  assert.equal(tapBar(s, 3).anchor, 3);
});

test('conteggio: un click per battito, più lento se la velocità è ridotta', () => {
  assert.deepEqual(countIn(0.5, 4, 1), { clicks: [0, 0.5, 1, 1.5], total: 2 });
  const slow = countIn(0.5, 3, 0.5);
  assert.deepEqual(slow.clicks, [0, 1, 2]);
  assert.equal(slow.total, 3);
});

test('durata del battito dai battiti analizzati, con ripiego sul bpm', () => {
  const a = fixture();
  assert.equal(beatPeriodAt(a, 4), 0.5);
  assert.equal(beatPeriodAt(a, 99), 0.5);
  a.beats = [0, 0.01];
  assert.equal(beatPeriodAt(a, 0), 0.5);
});

test('allenamento progressivo: +5% a giro fino al 100%', () => {
  let r = 0.7;
  const seen = [r];
  for (let i = 0; i < 8; i++) seen.push((r = nextRate(r)));
  assert.deepEqual(seen, [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1, 1]);
  assert.deepEqual(RATES, [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1]);
});

test('click del metronomo sui battiti, accento sull\'uno', () => {
  const a = fixture();
  const c = clicksBetween(a, 1.9, 3.1);
  assert.deepEqual(c, [
    { t: 2, accent: true },
    { t: 2.5, accent: false },
    { t: 3, accent: false },
  ]);
  assert.deepEqual(clicksBetween(a, 3.1, 3.2), []);
  // finestre consecutive: nessun click doppio né perso
  const all = [...clicksBetween(a, 0, 1.2), ...clicksBetween(a, 1.2, 2.4)].map((x) => x.t);
  assert.deepEqual(all, [0, 0.5, 1, 1.5, 2]);
});

test('preferenze: valori validi tenuti, il resto torna ai predefiniti', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('non json'), DEFAULT_PREFS);
  const p = parsePrefs(JSON.stringify({ countIn: true, volume: 3, trainerStart: 0.1, metronome: 'si' }));
  assert.equal(p.countIn, true);
  assert.equal(p.volume, 1);
  assert.equal(p.trainerStart, 0.5);
  assert.equal(p.metronome, false);
});
