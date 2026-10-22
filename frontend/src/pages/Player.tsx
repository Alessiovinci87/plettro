// "Suona con il brano": segue la canzone mentre suoni e ti dice cosa fare adesso.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../store';
import { ChordDiagram } from '../components/ChordDiagram';
import { chordSymbol, midiName, mod12, pcName, QUALITY_BY_ID, type Notation } from '../music/theory';
import { getVoicings, sounding, workFret, type Voicing } from '../music/voicings';
import { STANDARD, tuningMidis } from '../music/tunings';
import { audio, click, strum } from '../audio/engine';
import type { Analysis, Section } from './analysis-types';
import { fmtTime, positionAt, sectionFirstBars, type Position } from './songTime';

const STD = tuningMidis(STANDARD);
const ROOT_OF: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SUFFIX_TO_Q: [string, string][] = [['maj7', 'maj7'], ['m7', 'm7'], ['sus4', 'sus4'], ['sus2', 'sus2'], ['dim', 'dim'], ['7', '7'], ['m', 'minor'], ['5', '5'], ['', 'major']];
const SPEEDS = [0.5, 0.75, 0.9, 1];
const DYN_WORD = ['', 'Sussurrato', 'Morbido', 'Medio', 'Spinto', 'Al massimo'];

function parseSymbol(sym: string): { root: number; q: string } | null {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(sym);
  if (!m || ROOT_OF[m[1]] === undefined) return null;
  const q = SUFFIX_TO_Q.find(([s]) => s === m[2])?.[1];
  return q ? { root: ROOT_OF[m[1]], q } : null;
}

/** Simbolo da suonare con il capotasto, nella notazione scelta. */
function playSymbol(sym: string, capo: number, notation: Notation): string {
  const p = parseSymbol(sym);
  return p ? chordSymbol(mod12(p.root - capo), QUALITY_BY_ID[p.q], notation) : sym;
}

const shapeCache = new Map<string, Voicing | null>();
function shapeFor(sym: string, capo: number): { v: Voicing; root: number; q: string } | null {
  const p = parseSymbol(sym);
  if (!p) return null;
  const root = mod12(p.root - capo);
  const key = `${root}|${p.q}`;
  if (!shapeCache.has(key)) shapeCache.set(key, getVoicings(root, QUALITY_BY_ID[p.q], STD, true)[0] ?? null);
  const v = shapeCache.get(key);
  return v ? { v, root, q: p.q } : null;
}

// ---------------------------------------------------------------------------
// Orologio: segue l'audio se c'è, altrimenti un tempo virtuale con il click.

function useSongClock(audioUrl: string | null, duration: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [audioOk, setAudioOk] = useState(!!audioUrl);
  const virt = useRef({ base: 0, startedAt: 0 });
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    const a = new Audio(audioUrl);
    a.preload = 'auto';
    (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    a.onerror = () => setAudioOk(false);
    // una posizione chiesta prima che l'audio sia pronto viene applicata appena si può
    a.onloadedmetadata = () => {
      if (pending.current !== null) {
        a.currentTime = pending.current;
        pending.current = null;
      }
    };
    a.onended = () => setPlaying(false);
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  const now = () => {
    const a = audioRef.current;
    if (a && audioOk) return pending.current ?? a.currentTime;
    const v = virt.current;
    return playing ? v.base + ((performance.now() - v.startedAt) / 1000) * rate : v.base;
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < 30) return; // ~30 fps bastano
      last = ts;
      const t = now();
      if (t >= duration) {
        pause();
        setTime(duration);
        return;
      }
      setTime(t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, audioOk]);

  function play() {
    const a = audioRef.current;
    if (a && audioOk) {
      a.playbackRate = rate;
      a.play().then(
        () => setPlaying(true),
        () => setAudioOk(false),
      );
    } else {
      virt.current = { base: time >= duration ? 0 : time, startedAt: performance.now() };
      setPlaying(true);
    }
  }
  function pause() {
    const t = now();
    audioRef.current?.pause();
    virt.current = { base: t, startedAt: performance.now() };
    setTime(t);
    setPlaying(false);
  }
  function seek(t: number) {
    const x = Math.max(0, Math.min(duration - 0.05, t));
    const a = audioRef.current;
    if (a && audioOk) {
      if (a.readyState >= 1) a.currentTime = x;
      else pending.current = x;
    }
    virt.current = { base: x, startedAt: performance.now() };
    setTime(x);
  }
  function setRate(r: number) {
    const t = now();
    virt.current = { base: t, startedAt: performance.now() };
    if (audioRef.current) audioRef.current.playbackRate = r;
    setRateState(r);
  }
  return { time, playing, rate, play, pause, seek, setRate, hasAudio: !!audioUrl && audioOk };
}

// ---------------------------------------------------------------------------

export function Player({ a, audioUrl, title, onClose }: { a: Analysis; audioUrl: string | null; title: string; onClose: () => void }) {
  const { notation, a4 } = useSettings();
  const [capo, setCapo] = useState(a.capo.fret);
  const [loop, setLoop] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const clock = useSongClock(audioUrl, a.duration);
  const firstBars = useMemo(() => sectionFirstBars(a), [a]);
  const pos = positionAt(a, clock.time, firstBars);

  // ripetizione della sezione
  useEffect(() => {
    if (loop === null) return;
    const s = a.sections[loop];
    if (clock.time >= s.end - 0.02 || clock.time < s.start - 0.5) clock.seek(s.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.time, loop]);

  // senza audio: click su ogni battito
  const lastBeat = useRef(-1);
  useEffect(() => {
    if (clock.hasAudio || !clock.playing) return;
    const b = pos.barIndex * 100 + pos.beatInBar;
    if (pos.beatInBar >= 0 && b !== lastBeat.current) {
      lastBeat.current = b;
      click(audio().currentTime + 0.01, pos.beatInBar === 0);
    }
  }, [clock.hasAudio, clock.playing, pos.barIndex, pos.beatInBar]);

  const togglePlay = () => (clock.playing ? clock.pause() : clock.play());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const section = a.sections[Math.max(0, pos.sectionIndex)];
  const sym = (s: string) => playSymbol(s, capo, notation);
  const keyName = a.key.name.replace(/^([A-G][#b]?)/, (n) => pcName(ROOT_OF[n] ?? 0, notation));

  return (
    <div className="player">
      <header className="pl-head">
        <div className="pl-title">
          <h2>{title}</h2>
          <button className="btn-text" onClick={onClose}>
            Cambia brano
          </button>
        </div>
        <ul className="pl-facts" aria-label="Dati del brano">
          <li>
            <strong>{Math.round(a.bpm)}</strong> bpm
          </li>
          <li>
            <strong>{keyName}</strong> {a.time_signature}
          </li>
          <li className="pl-capo">
            Capotasto
            <button onClick={() => setCapo(Math.max(0, capo - 1))} aria-label="Capotasto più in basso">
              −
            </button>
            <strong>{capo ? `${capo}º` : 'no'}</strong>
            <button onClick={() => setCapo(Math.min(9, capo + 1))} aria-label="Capotasto più in alto">
              +
            </button>
          </li>
          <li>{a.tuning.name}</li>
        </ul>
        {(a.warnings.length > 0 || a.example) && (
          <details className="pl-notes">
            <summary>{a.example ? 'Brano di prova generato al computer' : 'Note sull’analisi'}</summary>
            <ul>
              {a.capo.fret > 0 && <li>{a.capo.reason}</li>}
              <li>{a.tuning.reason}</li>
              {a.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </header>

      <Stage a={a} pos={pos} section={section} capo={capo} sym={sym} notation={notation} started={clock.time > 0.01} onHear={(s) => {
        const sh = shapeFor(s, capo);
        if (sh) strum(sounding(sh.v, STD).map((m) => (m === null ? null : m + capo)), { a4 });
      }} />

      <div className="sheet-head-row">
        <h3>La canzone</h3>
        <label className="check small">
          <input id="pl-follow" type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Segui il brano
        </label>
      </div>
      <SongSheet a={a} current={pos.sectionIndex} bar={pos.barInSection} sym={sym} follow={follow && clock.playing} firstBars={firstBars} onSeek={(t) => clock.seek(t)} loop={loop} onLoop={setLoop} />

      {a.melody.notes.length > 0 && (
        <details className="pl-extra">
          <summary>Melodia (indicativa)</summary>
          <ol className="mel">
            {a.melody.notes.slice(0, 32).map((n, k) => (
              <li key={k}>
                <strong>{midiName(n.midi, notation)}</strong>
                <span>
                  {n.string}ª corda, {n.fret === 0 ? 'a vuoto' : `${n.fret}º tasto`}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <Transport a={a} clock={clock} pos={pos} loop={loop} onLoop={setLoop} onToggle={togglePlay} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stage({ a, pos, section, capo, sym, notation, started, onHear }: {
  a: Analysis; pos: Position; section: Section; capo: number; sym: (s: string) => string; notation: Notation; started: boolean; onHear: (s: string) => void;
}) {
  const cur = pos.chordIndex >= 0 ? a.chords[pos.chordIndex] : null;
  const next = pos.nextChordIndex >= 0 ? a.chords[pos.nextChordIndex] : null;
  const shown = cur ?? next;
  const shape = shown ? shapeFor(shown.symbol, capo) : null;
  // prima di partire il riquadro mostra l'accordo che viene dopo il primo
  const after = !cur && next ? a.chords.slice(pos.nextChordIndex + 1).find((c) => c.symbol !== next.symbol) ?? null : next;
  const nextShape = after ? shapeFor(after.symbol, capo) : null;
  const steps = section.strum.steps;
  const soon = !!cur && !!next && pos.beatsToNext > 0 && pos.beatsToNext <= 2;
  const lvl = section.dynamics.level;

  return (
    <section className="stage" aria-live="off">
      <div className="st-top">
        <span className="st-section">{pos.sectionIndex < 0 ? 'Prima di partire' : section.label}</span>
        <span className="st-dyn" aria-label={`Intensità ${lvl} su 5`}>
          <span className="st-dyn-bars">
            {[1, 2, 3, 4, 5].map((l) => (
              <i key={l} className={l <= lvl ? 'on' : ''} />
            ))}
          </span>
          {DYN_WORD[lvl]}
        </span>
      </div>

      <div className="st-chords">
        <button className="st-now" onClick={() => shown && onHear(shown.symbol)} aria-label={shown ? `Ascolta ${sym(shown.symbol)}` : 'Nessun accordo'}>
          <span className="st-label">{cur ? 'Adesso' : started ? 'Pausa' : 'Si parte con'}</span>
          <span className="st-name">{shown ? sym(shown.symbol) : '–'}</span>
          {shape && <span className="st-fret">{workFret(shape.v) <= 1 ? 'tasti 1–4' : `${workFret(shape.v)}º tasto`}</span>}
        </button>
        <div className="st-diagram">
          {shape ? <ChordDiagram voicing={shape.v} tuning={STD} rootPc={shape.root} quality={QUALITY_BY_ID[shape.q]} width={100} notation={notation} /> : null}
        </div>
        <div className={`st-next ${soon ? 'is-soon' : ''}`}>
          <span className="st-label">
            {!after ? 'Fine' : cur && pos.beatsToNext > 0 ? `Tra ${pos.beatsToNext} ${pos.beatsToNext === 1 ? 'battito' : 'battiti'}` : 'Poi'}
          </span>
          <span className="st-next-name">{after ? sym(after.symbol) : ''}</span>
          {nextShape && <span className="st-fret">{workFret(nextShape.v) <= 1 ? 'tasti 1–4' : `${workFret(nextShape.v)}º tasto`}</span>}
        </div>
      </div>

      <div className="st-rhythm">
        <div className="st-beats" aria-hidden="true">
          {Array.from({ length: a.meter }, (_, i) => (
            <span key={i} className={i === pos.beatInBar ? 'on' : ''}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className="st-strum" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }} aria-label={`Pennata: ${section.strum.advice}`}>
          {steps.split('').map((c, k) => (
            <span key={k} className={`${c === '-' ? 'rest' : c === c.toLowerCase() ? 'soft' : 'hit'} ${k === pos.step ? 'now' : ''} ${k % 4 === 0 ? 'beat' : ''}`}>
              {c === 'D' || c === 'd' ? '↓' : c === 'U' || c === 'u' ? '↑' : ''}
            </span>
          ))}
        </div>
        <p className="st-advice">{section.strum.advice}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const SongSheet = memo(function SongSheet({ a, current, bar, sym, follow, firstBars, onSeek, loop, onLoop }: {
  a: Analysis; current: number; bar: number; sym: (s: string) => string; follow: boolean; firstBars: number[]; onSeek: (t: number) => void; loop: number | null; onLoop: (i: number | null) => void;
}) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (!follow || current < 0) return;
    refs.current[current]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [current, follow]);

  return (
    <ol className="song">
      {a.sections.map((s, i) => {
        const base = firstBars[i];
        const prev = a.sections[i - 1];
        const changes = describeChange(prev, s);
        return (
          <li
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`song-sec ${i === current ? 'is-current' : ''}`}>
            <header>
              <button className="ss-title" onClick={() => onSeek(s.start)}>
                <span className="ss-name">{s.label}</span>
                <span className="ss-time">
                  {fmtTime(s.start)} · {s.bars} battute
                </span>
              </button>
              <button className={`ss-loop ${loop === i ? 'on' : ''}`} onClick={() => onLoop(loop === i ? null : i)} aria-pressed={loop === i}>
                {loop === i ? 'In ripetizione' : 'Ripeti'}
              </button>
            </header>
            {changes && <p className="ss-change">{changes}</p>}
            <div className="ss-bars">
              {s.chart.map((b, k) => {
                const t = a.downbeats[base + k] ?? s.start;
                return (
                  <button key={k} className={`ss-bar ${i === current && k === bar ? 'now' : ''}`} onClick={() => onSeek(t)} aria-label={`Battuta ${k + 1}: ${b.join(', ')}`}>
                    {b.map((c, j) => (
                      <span key={j} className={c === '–' ? 'nc' : ''}>
                        {c === '–' ? '–' : sym(c)}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
            <details className="ss-sound">
              <summary>
                Suono: {s.tone.gain}, {s.tone.brightness}, ambiente {s.tone.ambience}
                {s.tone.delay ? `, delay ${s.tone.delay}` : ''}
              </summary>
              <ol className="chain">
                {s.effects.map((e, k) => (
                  <li key={k}>
                    <strong>{e.block}</strong> <span className="model">{e.model}</span>
                    <span className="settings">
                      {Object.entries(e.settings)
                        .map(([x, y]) => `${x} ${y}`)
                        .join(' · ')}
                    </span>
                    <span className="why">{e.why}</span>
                  </li>
                ))}
              </ol>
              {s.presets[0]?.query && <p className="hint">Da cercare in PresetDock: “{s.presets[0].query}”.</p>}
            </details>
          </li>
        );
      })}
    </ol>
  );
});

/** Cosa cambia per la mano entrando in una sezione. */
function describeChange(prev: Section | undefined, s: Section): string {
  const out: string[] = [];
  if (!prev) {
    out.push(s.dynamics.advice.split('.')[0] + '.');
    return out.join(' ');
  }
  const d = s.dynamics.level - prev.dynamics.level;
  if (d >= 2) out.push('Qui si apre: entra deciso.');
  else if (d === 1) out.push('Un po’ più spinto.');
  else if (d <= -2) out.push('Qui cala: alleggerisci subito la mano.');
  else if (d === -1) out.push('Un po’ più leggero.');
  if (s.strum.steps.toUpperCase() !== prev.strum.steps.toUpperCase()) out.push('Cambia la pennata.');
  if (s.tone.gain !== prev.tone.gain) out.push(`Suono ${s.tone.gain}.`);
  return out.join(' ');
}

// ---------------------------------------------------------------------------

function Transport({ a, clock, pos, loop, onLoop, onToggle }: {
  a: Analysis; clock: ReturnType<typeof useSongClock>; pos: Position; loop: number | null; onLoop: (i: number | null) => void; onToggle: () => void;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  const seekFromEvent = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    clock.seek(((clientX - r.left) / r.width) * a.duration);
  };
  const prevSection = () => {
    const i = pos.sectionIndex;
    const s = a.sections[Math.max(0, i)];
    // a inizio sezione torna alla precedente, altrimenti all'inizio di questa
    clock.seek(clock.time - s.start < 1.5 && i > 0 ? a.sections[i - 1].start : s.start);
  };
  const nextSection = () => {
    const n = a.sections[pos.sectionIndex + 1];
    if (n) clock.seek(n.start);
  };
  const groups = [...new Set(a.sections.map((s) => s.label.replace(/ \d+$/, '')))];

  return (
    <div className="transport">
      <div
        className="tr-timeline"
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Posizione nel brano"
        aria-valuemin={0}
        aria-valuemax={Math.round(a.duration)}
        aria-valuenow={Math.round(clock.time)}
        aria-valuetext={fmtTime(clock.time)}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          seekFromEvent(e.clientX);
        }}
        onPointerMove={(e) => e.buttons && seekFromEvent(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') clock.seek(clock.time + 5);
          if (e.key === 'ArrowLeft') clock.seek(clock.time - 5);
        }}
      >
        {a.sections.map((s, i) => (
          <span
            key={i}
            className={`tr-sec g${groups.indexOf(s.label.replace(/ \d+$/, '')) % 5} ${i === pos.sectionIndex ? 'cur' : ''} ${loop === i ? 'loop' : ''}`}
            style={{ left: `${(s.start / a.duration) * 100}%`, width: `${((s.end - s.start) / a.duration) * 100}%` }}
          >
            <em>{s.label}</em>
          </span>
        ))}
        <span className="tr-head" style={{ left: `${(clock.time / a.duration) * 100}%` }} />
      </div>
      <div className="tr-controls">
        <span className="tr-time">
          {fmtTime(clock.time)} <small>/ {fmtTime(a.duration)}</small>
        </span>
        <div className="tr-main">
          <button className="tr-btn" onClick={prevSection} aria-label="Sezione precedente">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 6l-9 6 9 6z" /></svg>
          </button>
          <button className="tr-play" onClick={onToggle} aria-label={clock.playing ? 'Pausa' : 'Suona'}>
            {clock.playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>
            )}
          </button>
          <button className="tr-btn" onClick={nextSection} aria-label="Sezione successiva">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 6l9 6-9 6z" /></svg>
          </button>
        </div>
        <label className="tr-speed">
          <span className="sr-only">Velocità</span>
          <select id="pl-speed" value={clock.rate} onChange={(e) => clock.setRate(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {Math.round(s * 100)}%
              </option>
            ))}
          </select>
        </label>
      </div>
      {loop !== null && (
        <button className="tr-loopbar" onClick={() => onLoop(null)}>
          Ripeti {a.sections[loop].label} · tocca per smettere
        </button>
      )}
      {!clock.hasAudio && <p className="tr-note">Senza audio: segui il click del metronomo.</p>}
    </div>
  );
}
