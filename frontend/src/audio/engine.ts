// Audio: contesto condiviso, corda pizzicata sintetica (Karplus-Strong), click del metronomo.
import { midiToFreq } from '../music/theory';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audio(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const out = () => {
  audio();
  return master!;
};

const cache = new Map<string, { buf: AudioBuffer; rate: number }>();

/**
 * Corda pizzicata: rumore filtrato che ricircola in un anello di ritardo.
 * L'anello ha lunghezza intera; il playbackRate corregge l'intonazione esatta.
 */
function pluck(midi: number, a4: number, muted = false) {
  const c = audio();
  const key = `${midi}|${a4}|${muted}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sr = c.sampleRate;
  const freq = midiToFreq(midi, a4);
  const n = Math.max(2, Math.floor(sr / freq));
  const len = Math.floor(sr * (muted ? 0.22 : 2.6));
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const ring = new Float32Array(n);
  for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
  for (let i = 1; i < n; i++) ring[i] = 0.55 * ring[i] + 0.45 * ring[i - 1]; // attacco più morbido
  const decay = muted ? 0.92 : 0.9975 - Math.min(0.004, freq / 250000);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx];
    const next = (idx + 1) % n;
    ring[idx] = decay * 0.5 * (a + ring[next]);
    data[i] = a;
    idx = next;
  }
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) data[len - 1 - i] *= i / fade;
  const entry = { buf, rate: (freq * (n + 0.5)) / sr };
  cache.set(key, entry);
  return entry;
}

export function playNote(midi: number, opts: { when?: number; gain?: number; a4?: number; muted?: boolean } = {}) {
  const c = audio();
  const p = pluck(midi, opts.a4 ?? 440, opts.muted);
  const src = c.createBufferSource();
  src.buffer = p.buf;
  src.playbackRate.value = p.rate;
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.35;
  src.connect(g).connect(out());
  src.start(opts.when ?? c.currentTime);
  return src;
}

/** Pennata: note dalla più grave (giù) o dalla più acuta (su). */
export function strum(midis: (number | null)[], opts: { when?: number; up?: boolean; gain?: number; spread?: number; a4?: number; muted?: boolean } = {}) {
  const c = audio();
  const when = opts.when ?? c.currentTime + 0.02;
  const notes = midis.filter((m): m is number => m !== null);
  const ordered = opts.up ? [...notes].reverse() : notes;
  const spread = opts.spread ?? 0.012;
  ordered.forEach((m, i) =>
    playNote(m, { when: when + i * spread, gain: (opts.gain ?? 0.3) * (opts.up ? 0.75 : 1), a4: opts.a4, muted: opts.muted }),
  );
}

/** Arpeggio: una corda alla volta, dalla più grave. */
export function arpeggio(midis: (number | null)[], opts: { gap?: number; a4?: number } = {}) {
  const c = audio();
  const t = c.currentTime + 0.03;
  midis
    .filter((m): m is number => m !== null)
    .forEach((m, i) => playNote(m, { when: t + i * (opts.gap ?? 0.18), gain: 0.32, a4: opts.a4 }));
}

/** Nota di riferimento pulita (sinusoide con armoniche leggere) per accordare a orecchio. */
export function referenceTone(freq: number, seconds = 2.5) {
  const c = audio();
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.25, t + 0.03);
  g.gain.setValueAtTime(0.25, t + seconds - 0.4);
  g.gain.linearRampToValueAtTime(0, t + seconds);
  g.connect(out());
  [1, 2, 3].forEach((h, i) => {
    const o = c.createOscillator();
    o.frequency.value = freq * h;
    const hg = c.createGain();
    hg.gain.value = [1, 0.35, 0.15][i];
    o.connect(hg).connect(g);
    o.start(t);
    o.stop(t + seconds);
  });
}

/** Click del metronomo; `volume` da 0 a 1 scala il livello normale. */
export function click(when: number, accent: boolean, sub = false, volume = 1) {
  if (volume <= 0) return;
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = accent ? 1760 : sub ? 880 : 1320;
  g.gain.setValueAtTime((accent ? 0.5 : sub ? 0.12 : 0.3) * Math.min(1, volume), when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  o.connect(g).connect(out());
  o.start(when);
  o.stop(when + 0.06);
}
