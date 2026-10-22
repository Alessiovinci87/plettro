import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addResult, bestFor, pairKey, pairOf, parseHistory, secondsLeft, sessionsFor, SUGGESTED_PAIRS, triedPairs, validPair } from '../src/song/trainer';

test('la coppia non dipende dall\'ordine', () => {
  assert.equal(pairKey('G', 'C'), pairKey('C', 'G'));
  assert.deepEqual(pairOf(pairKey('G', 'C')), ['C', 'G']);
});

test('coppie suggerite: accordi validi e diversi', () => {
  for (const [a, b] of SUGGESTED_PAIRS) assert.ok(validPair(a, b), `${a}–${b}`);
  assert.equal(validPair('G', 'G'), false);
  assert.equal(validPair('G', 'boh'), false);
});

test('record: la prima prova non lo è, poi solo se si supera il migliore', () => {
  const k = pairKey('G', 'C');
  let r = addResult([], k, 20, 1);
  assert.equal(r.record, false);
  r = addResult(r.history, k, 18, 2);
  assert.equal(r.record, false);
  assert.equal(r.previousBest, 20);
  r = addResult(r.history, k, 24, 3);
  assert.equal(r.record, true);
  assert.equal(bestFor(r.history, k), 24);
  // un'altra coppia non influisce
  r = addResult(r.history, pairKey('Em', 'Am'), 40, 4);
  assert.equal(bestFor(r.history, k), 24);
  assert.equal(bestFor(r.history, 'x|y'), null);
});

test('storico per coppia in ordine di tempo, limitato', () => {
  const k = pairKey('D', 'A');
  let h: ReturnType<typeof parseHistory> = [];
  for (let i = 0; i < 30; i++) h = addResult(h, k, i, 1000 - i).history;
  const s = sessionsFor(h, k, 20);
  assert.equal(s.length, 20);
  assert.ok(s.every((e, i) => i === 0 || e.at > s[i - 1].at));
  assert.deepEqual(triedPairs(h), [{ key: k, best: 29, last: 1000 }]);
});

test('storico letto dal browser: voci rotte scartate', () => {
  assert.deepEqual(parseHistory(null), []);
  assert.deepEqual(parseHistory('{'), []);
  assert.deepEqual(parseHistory('{"a":1}'), []);
  const ok = { pair: 'C|G', changes: 12, at: 5 };
  assert.deepEqual(parseHistory(JSON.stringify([ok, { pair: 'C', changes: 1, at: 1 }, { pair: 'C|G', changes: -2, at: 1 }, null])), [ok]);
});

test('timer da 60 secondi', () => {
  assert.equal(secondsLeft(0, 0), 60);
  assert.equal(secondsLeft(0, 59_100), 1);
  assert.equal(secondsLeft(0, 60_000), 0);
  assert.equal(secondsLeft(0, 99_000), 0);
});
