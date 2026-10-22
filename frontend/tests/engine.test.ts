import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordPcs, identifyChord, KEYS, midiOf, mod12, QUALITIES, QUALITY_BY_ID, freqToMidi } from '../src/music/theory';
import { assignFingers, generateVoicings, getVoicings, libraryRejected, libraryVoicings, workFret } from '../src/music/voicings';
import { STANDARD, TUNING_BY_ID, tuningMidis, suggestTunings, changesFromStandard } from '../src/music/tunings';
import { detectPitch } from '../src/music/pitch';

const STD = tuningMidis(STANDARD);
const Q = QUALITY_BY_ID;
const key = (v: { frets: number[] }) => v.frets.map((f) => (f < 0 ? 'x' : f.toString(36))).join('');

test('ogni diteggiatura della libreria contiene solo note dell’accordo', () => {
  let checked = 0;
  for (let pc = 0; pc < 12; pc++) {
    for (const q of QUALITIES) {
      const pcs = new Set(chordPcs(pc, q));
      for (const v of libraryVoicings(pc, q)) {
        const notes = v.frets.map((f, i) => (f < 0 ? null : mod12(STD[i] + f))).filter((n): n is number => n !== null);
        for (const n of notes) assert.ok(pcs.has(n), `${KEYS[pc]}${q.symbol} ${key(v)} ha una nota estranea`);
        checked++;
      }
    }
  }
  let rejected = 0;
  for (let pc = 0; pc < 12; pc++) for (const q of QUALITIES) rejected += libraryRejected(pc, q);
  assert.ok(checked > 1800, `controllate ${checked}`);
  assert.ok(rejected / (checked + rejected) < 0.02, `scartate ${rejected}`);
  console.log(`libreria: ${checked} diteggiature valide, ${rejected} scartate`);
});

test('il generatore trova le forme classiche', () => {
  const has = (pc: number, q: string, shape: string) => {
    const vs = generateVoicings(pc, Q[q], STD, { limit: 40 }).map(key);
    assert.ok(vs.includes(shape), `${KEYS[pc]} ${q}: manca ${shape} in ${vs.join(' ')}`);
  };
  has(0, 'major', 'x32010');
  has(7, 'major', '320003');
  has(5, 'major', '133211');
  has(9, 'minor', 'x02210');
  has(4, 'major', '022100');
  has(2, 'major', 'xx0232');
  has(10, 'major', 'x13331');
});

test('dita e barrè', () => {
  const f = assignFingers([1, 3, 3, 2, 1, 1])!;
  assert.deepEqual(f.barres, [1]);
  assert.deepEqual(f.fingers, [1, 3, 4, 2, 1, 1]);
  assert.equal(assignFingers([1, 5, 3, 7, 2, 6]), null);
});

test('tasto di lavoro', () => {
  assert.equal(workFret({ frets: [-1, 3, 2, 0, 1, 0], fingers: [], barres: [], source: 'libro' }), 1);
  assert.equal(workFret({ frets: [-1, 3, 5, 5, 5, 3], fingers: [], barres: [3], source: 'libro' }), 3);
});

test('varianti anche in accordature alternative', () => {
  const dadgad = tuningMidis(TUNING_BY_ID['dadgad']);
  const vs = getVoicings(2, Q['major'], dadgad, false);
  assert.ok(vs.length >= 6);
  for (const v of vs) assert.equal(v.source, 'generata');
  const openG = tuningMidis(TUNING_BY_ID['open-g']);
  assert.ok(getVoicings(7, Q['major'], openG, false).some((v) => key(v) === 'x00000'));
  assert.ok(getVoicings(7, Q['major'], openG, false, 2).some((v) => key(v) === '000000')); // G/D
});

test('accordi con basso (slash)', () => {
  const vs = getVoicings(0, Q['major'], STD, true, 7); // C/G
  assert.ok(vs.length > 0);
  for (const v of vs) {
    const low = v.frets.findIndex((f) => f >= 0);
    assert.equal(mod12(STD[low] + v.frets[low]), 7);
  }
});

test('riconoscimento accordi', () => {
  assert.equal(identifyChord([48, 52, 55])[0].quality.id, 'major');
  const am = identifyChord([45, 52, 57, 60, 64]);
  assert.equal(am[0].root, 9);
  assert.equal(am[0].quality.id, 'minor');
  const g7 = identifyChord([43, 47, 50, 53]);
  assert.equal(g7[0].quality.id, '7');
});

test('YIN: precisione su corde reali simulate', () => {
  const sr = 48000;
  for (const note of ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']) {
    const f0 = 440 * Math.pow(2, (midiOf(note) - 69) / 12) * Math.pow(2, 7 / 1200); // +7 cent
    const buf = new Float32Array(4096);
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      buf[i] = 0.3 * Math.sin(2 * Math.PI * f0 * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f0 * t) + 0.15 * Math.sin(2 * Math.PI * 3 * f0 * t);
    }
    const r = detectPitch(buf, sr)!;
    const cents = (freqToMidi(r.freq) - midiOf(note)) * 100;
    assert.ok(Math.abs(cents - 7) < 1.5, `${note}: ${cents.toFixed(2)} cent`);
  }
  assert.equal(detectPitch(new Float32Array(4096), sr), null);
});

test('suggerimenti accordature', () => {
  const s = suggestTunings('D', 'folk').map((x) => x.tuning.id);
  assert.ok(s.includes('dadgad'));
  assert.ok(suggestTunings('E', 'slide').length > 0);
  const ch = changesFromStandard(TUNING_BY_ID['drop-d']);
  assert.deepEqual(ch.map((c) => [c.string, c.semitones]), [[6, -2]]);
});

test('prestazioni: un accordo complesso in meno di 300 ms', () => {
  // calcolo a vuoto: la prima esecuzione paga compilazione JIT e carico del PC
  generateVoicings(0, Q['13'], STD);
  const t0 = performance.now();
  generateVoicings(0, Q['13'], STD);
  assert.ok(performance.now() - t0 < 300);
});

test('barrè secondario (forma di La al 5º tasto)', () => {
  const r = assignFingers([5, 7, 7, 6, 5, 5]); // A forma E: 6 note, 3 altre → ok
  assert.ok(r);
  const d = assignFingers([-1, 5, 7, 7, 7, 5]);
  assert.ok(d);
  const big = assignFingers([3, 5, 5, 5, 5, 3]); // 4 note al 5º: mini-barrè
  assert.ok(big && big.barres.length === 2, JSON.stringify(big));
});
