// "Suona con il brano": segue la canzone mentre suoni e ti dice cosa fare adesso.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../store';
import { ChordDiagram } from '../components/ChordDiagram';
import { chordSymbol, midiName, mod12, parseChord, pcName, type Notation, type Quality } from '../music/theory';
import { getVoicings, sounding, workFret, type Voicing } from '../music/voicings';
import { STANDARD, tuningMidis } from '../music/tunings';
import { audio, click, strum } from '../audio/engine';
import type { Analysis, Section } from './analysis-types';
import { fmtTime, positionAt, sectionFirstBars, type Position } from './songTime';
import { library } from '../song/library';
import { setBarChord } from '../song/edit';
import { ChordPicker, SectionEditor } from './SongEdit';
import { easyVoicing, simplifyAnalysis } from '../music/simplify';
import {
  beatPeriodAt, clicksBetween, countIn, inRange, loopTimes, nextRate, parsePrefs, PREFS_KEY, RATES, sameRange, sectionRange, tapBar, TRAINER_STARTS,
  type LoopRange, type PracticePrefs, type Selection,
} from '../song/practice';

const STD = tuningMidis(STANDARD);
const DYN_WORD = ['', 'Sussurrato', 'Morbido', 'Medio', 'Spinto', 'Al massimo'];

/** Simbolo da suonare con il capotasto, nella notazione scelta. */
function playSymbol(sym: string, capo: number, notation: Notation): string {
  const p = parseChord(sym);
  return p ? chordSymbol(mod12(p.root - capo), p.quality, notation, p.bass === undefined ? undefined : mod12(p.bass - capo)) : sym;
}

const shapeCache = new Map<string, Voicing | null>();
/** Diteggiatura da mostrare; con `easy` preferisce la forma aperta facile degli accordi semplici. */
function shapeFor(sym: string, capo: number, easy = false): { v: Voicing; root: number; q: Quality } | null {
  const p = parseChord(sym);
  if (!p) return null;
  const root = mod12(p.root - capo);
  const key = `${root}|${p.quality.id}|${easy}`;
  if (!shapeCache.has(key)) shapeCache.set(key, (easy ? easyVoicing(root, p.quality) : null) ?? getVoicings(root, p.quality, STD, true)[0] ?? null);
  const v = shapeCache.get(key);
  return v ? { v, root, q: p.quality } : null;
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
  return { time, playing, rate, play, pause, seek, setRate, now, hasAudio: !!audioUrl && audioOk };
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navigazione privata: le preferenze valgono solo per questa visita */
  }
}

// ---------------------------------------------------------------------------

export interface PlayerProps {
  a: Analysis;
  /** Analisi del server, per "Ripristina analisi" (se manca è `a`). */
  original?: Analysis;
  /** true se `a` contiene già correzioni. */
  edited?: boolean;
  /** Brano della libreria in cui salvare le correzioni; null per il brano d'esempio. */
  songId: string | null;
  audioUrl: string | null;
  title: string;
  notice?: string;
  onClose: () => void;
}

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string };

export function Player({ a: initial, original = initial, edited: editedAtOpen = false, songId, audioUrl, title, notice, onClose }: PlayerProps) {
  const { notation, a4 } = useSettings();
  const [a, setA] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(editedAtOpen);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [confirmReset, setConfirmReset] = useState(false);

  const persist = (next: Analysis | 'reset', id = songId) => {
    if (!id) return;
    setSave({ kind: 'saving' });
    library()
      .updateAnalysis(id, next)
      .then(
        () => setSave({ kind: 'saved' }),
        (e: Error) => setSave({ kind: 'error', message: e.message }),
      );
  };
  const apply = (next: Analysis) => {
    if (next === a) return;
    setA(next);
    setEdited(true);
    persist(next);
  };
  const reset = () => {
    setA(original);
    setEdited(false);
    setConfirmReset(false);
    persist('reset');
  };
  // il salvataggio del brano nuovo può finire dopo le prime correzioni: le scrive appena c'è il brano
  const savedId = useRef(songId);
  useEffect(() => {
    if (songId && songId !== savedId.current && edited) persist(a, songId);
    savedId.current = songId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  const [capo, setCapo] = useState(a.capo.fret);
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [follow, setFollow] = useState(true);
  const [prefs, setPrefsState] = useState<PracticePrefs>(() => parsePrefs(readStorage(PREFS_KEY)));
  const setPrefs = (p: Partial<PracticePrefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      writeStorage(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  const [round, setRound] = useState(0);
  const [selecting, setSelecting] = useState<Selection | null>(null);
  const clock = useSongClock(audioUrl, a.duration);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const firstBars = useMemo(() => sectionFirstBars(a), [a]);
  // accordi semplici: si mostra un'analisi con i nomi sostituiti (in modifica si lavora sull'originale)
  const simple = useMemo(() => (prefs.simple ? simplifyAnalysis(a, { capo, sus: prefs.simpleSus }) : null), [a, capo, prefs.simple, prefs.simpleSus]);
  const view = simple && !editing ? simple.analysis : a;
  const pos = positionAt(view, clock.time, firstBars);

  // conteggio 1-2-3-4: click pianificati sull'orologio audio, poi parte il brano
  const [counting, setCounting] = useState<number | null>(null);
  const countTimers = useRef<number[]>([]);
  const stopCount = () => {
    countTimers.current.forEach((t) => window.clearTimeout(t));
    countTimers.current = [];
    setCounting(null);
  };
  useEffect(() => stopCount, []);
  const startAfterCount = (from: number) => {
    stopCount();
    const c = clockRef.current;
    const { clicks, total } = countIn(beatPeriodAt(a, from), a.meter, c.rate);
    setCounting(0);
    const t0 = audio().currentTime + 0.08;
    clicks.forEach((dt, i) => {
      click(t0 + dt, i === 0, false, Math.max(prefs.volume, 0.5));
      countTimers.current.push(window.setTimeout(() => setCounting(i + 1), (0.08 + dt) * 1000));
    });
    countTimers.current.push(
      window.setTimeout(() => {
        setCounting(null);
        countTimers.current = [];
        clockRef.current.play();
      }, (0.08 + total) * 1000),
    );
  };
  const start = () => {
    const c = clockRef.current;
    let from = c.time >= a.duration - 0.05 ? 0 : c.time;
    if (loop) {
      const lt = loopTimes(a, loop);
      if (from < lt.start - 0.5 || from >= lt.end - 0.02) from = lt.start;
    }
    if (from !== c.time) c.seek(from);
    if (prefs.countIn) startAfterCount(from);
    else c.play();
  };
  const togglePlay = () => {
    if (counting !== null) stopCount();
    else if (clock.playing) clock.pause();
    else start();
  };

  // loop A–B: a fine giro torna all'inizio, con conteggio e velocità progressiva se attivi
  useEffect(() => {
    if (!loop || counting !== null) return;
    const { start: ls, end: le } = loopTimes(a, loop);
    if (clock.playing && clock.time >= le - 0.02) {
      if (prefs.trainer && clock.rate < 1) clock.setRate(nextRate(clock.rate));
      setRound((r) => r + 1);
      if (prefs.countIn) {
        clock.pause();
        clock.seek(ls);
        startAfterCount(ls);
      } else clock.seek(ls);
    } else if (clock.time < ls - 0.5 && clock.playing) clock.seek(ls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.time, loop]);

  const chooseLoop = (r: LoopRange | null) => {
    setLoop(r);
    setRound(r ? 1 : 0);
    if (r && prefs.trainer) clock.setRate(prefs.trainerStart);
  };
  const setTrainer = (on: boolean) => {
    setPrefs({ trainer: on });
    if (on && loop) {
      clock.setRate(prefs.trainerStart);
      setRound(1);
    }
  };

  // metronomo sopra il brano, sui battiti analizzati; senza audio è sempre acceso
  const clickOn = prefs.metronome || !clock.hasAudio;
  const volumeRef = useRef(prefs.volume);
  volumeRef.current = clock.hasAudio ? prefs.volume : Math.max(prefs.volume, 0.6);
  // il battito che chiude il loop è l'"uno" del giro dopo: non va pianificato prima del salto
  const loopEndRef = useRef(Infinity);
  loopEndRef.current = loop ? loopTimes(a, loop).end - 0.03 : Infinity;
  useEffect(() => {
    if (!clock.playing || !clickOn) return;
    const LOOKAHEAD = 0.12;
    // un po' indietro: il primo battito può essere appena passato quando l'audio riparte
    const SLACK = 0.04;
    let until = clockRef.current.now() - SLACK;
    const tick = () => {
      const c = clockRef.current;
      const now = c.now();
      // dopo un salto indietro (loop, ricerca) si ripianifica da qui
      if (now < until - 0.3 || now > until + 1) until = now - SLACK;
      const to = Math.min(now + LOOKAHEAD * c.rate, loopEndRef.current);
      const ctxNow = audio().currentTime;
      for (const k of clicksBetween(a, until, to)) click(ctxNow + Math.max(0, (k.t - now) / c.rate), k.accent, false, volumeRef.current);
      until = Math.max(until, to);
    };
    tick();
    const id = window.setInterval(tick, 25);
    return () => window.clearInterval(id);
  }, [clock.playing, clock.rate, clickOn, a]);

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
  const keyName = a.key.name.replace(/^[A-G][#b]?/, pcName(a.key.tonic, notation));

  return (
    <div className={`player ${editing ? 'is-editing' : ''}`}>
      <header className="pl-head">
        <div className="pl-title">
          <h2>{title}</h2>
          <div className="pl-title-actions">
            <button className={`btn-text ${editing ? 'is-on' : ''}`} onClick={() => setEditing(!editing)} aria-pressed={editing}>
              {editing ? 'Fine modifiche' : 'Modifica'}
            </button>
            <button className="btn-text" onClick={onClose}>
              Cambia brano
            </button>
          </div>
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
          <li className={`pl-simple ${prefs.simple ? 'on' : ''}`}>
            <label className="check small" htmlFor="pl-simple">
              <input id="pl-simple" type="checkbox" checked={prefs.simple} onChange={(e) => setPrefs({ simple: e.target.checked })} /> Accordi semplici
            </label>
            {prefs.simple && (
              <label className="check small" htmlFor="pl-simple-sus">
                <input id="pl-simple-sus" type="checkbox" checked={prefs.simpleSus} onChange={(e) => setPrefs({ simpleSus: e.target.checked })} /> anche i sus
              </label>
            )}
          </li>
        </ul>
        {simple && (
          <p className="pl-swaps" role="status">
            {simple.swaps.length === 0
              ? 'Gli accordi di questo brano sono già semplici.'
              : simple.swaps.map((s, k) => (
                  <span key={s.from} title={s.why}>
                    {k > 0 && ' · '}
                    <s>{playSymbol(s.from, capo, notation)}</s> → <strong>{playSymbol(s.to, capo, notation)}</strong>
                  </span>
                ))}
            {editing && simple.swaps.length > 0 && <em> In modifica vedi gli accordi originali.</em>}
          </p>
        )}
        {notice && (
          <p className={`pl-notice ${notice.startsWith('Non salvato') ? 'is-error' : ''}`} role="status">
            {notice}
          </p>
        )}
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
        {editing && (
          <div className="edit-bar" role="region" aria-label="Modifica">
            <p>
              Tocca una battuta per cambiare l'accordo. Nome, inizio e pennata sono in testa a ogni sezione.
              {!songId && <span className="edit-note"> Brano d'esempio: le correzioni restano finché non cambi brano.</span>}
            </p>
            <div className="edit-status">
              <span className={`edit-save ${save.kind === 'error' ? 'is-error' : ''}`} role="status">
                {save.kind === 'saving' ? 'Salvo…' : save.kind === 'saved' ? 'Correzioni salvate.' : save.kind === 'error' ? `Non salvato: ${save.message}` : edited ? 'Brano corretto a mano.' : ''}
              </span>
              {confirmReset ? (
                <span className="edit-confirm" role="group" aria-label="Conferma ripristino">
                  Tornare all'analisi originale? Le correzioni spariscono.
                  <button className="btn-danger small" onClick={reset} autoFocus>
                    Ripristina
                  </button>
                  <button className="btn-text" onClick={() => setConfirmReset(false)}>
                    Annulla
                  </button>
                </span>
              ) : (
                <button className="btn-text danger" disabled={!edited} onClick={() => setConfirmReset(true)}>
                  Ripristina analisi
                </button>
              )}
            </div>
          </div>
        )}
        <details className="pl-study">
          <summary>
            Strumenti di studio
            {(prefs.countIn || prefs.metronome || prefs.trainer) && (
              <span className="study-on">{[prefs.countIn && 'conteggio', prefs.metronome && 'click', prefs.trainer && 'progressivo'].filter(Boolean).join(' · ')}</span>
            )}
          </summary>
          <div className="study">
            <label className="check">
              <input type="checkbox" checked={prefs.countIn} onChange={(e) => setPrefs({ countIn: e.target.checked })} />
              <span>
                Conteggio 1-2-3-4 <small>prima di partire e a ogni giro del loop</small>
              </span>
            </label>
            <div className="study-row">
              <label className="check">
                <input type="checkbox" checked={clickOn} disabled={!clock.hasAudio} onChange={(e) => setPrefs({ metronome: e.target.checked })} />
                <span>
                  Click sui battiti <small>{clock.hasAudio ? 'sopra il brano' : 'sempre acceso senza audio'}</small>
                </span>
              </label>
              <label className="study-vol" htmlFor="pl-click-vol">
                Volume
                <input id="pl-click-vol" type="range" min={0} max={100} step={5} value={Math.round(prefs.volume * 100)} onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100 })} />
              </label>
            </div>
            <div className="study-row">
              <label className="check">
                <input type="checkbox" checked={prefs.trainer} onChange={(e) => setTrainer(e.target.checked)} />
                <span>
                  Allenamento progressivo <small>+5% a ogni giro del loop, fino al 100%</small>
                </span>
              </label>
              <label className="study-vol" htmlFor="pl-trainer-start">
                Parti dal
                <select id="pl-trainer-start" value={prefs.trainerStart} onChange={(e) => setPrefs({ trainerStart: Number(e.target.value) })}>
                  {TRAINER_STARTS.map((r) => (
                    <option key={r} value={r}>
                      {Math.round(r * 100)}%
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">
              {loop
                ? `Loop attivo: ${loopName(a, loop, firstBars)}.`
                : 'Per il loop: "Ripeti" su una sezione, "Seleziona battute", oppure tieni premuta una battuta e poi tocca l’ultima.'}
            </p>
          </div>
        </details>
      </header>

      <Stage a={view} pos={pos} section={section} capo={capo} easy={!!simple} sym={sym} notation={notation} started={clock.time > 0.01} onHear={(s) => {
        const sh = shapeFor(s, capo, !!simple);
        if (sh) strum(sounding(sh.v, STD).map((m) => (m === null ? null : m + capo)), { a4 });
      }} />

      <div className="sheet-head-row">
        <h3>La canzone</h3>
        <div className="sheet-tools">
          {!editing && (
            <button className={`ss-loop ${selecting ? 'on' : ''}`} onClick={() => setSelecting(selecting ? null : { anchor: null, range: null })} aria-pressed={!!selecting}>
              {selecting ? 'Annulla selezione' : 'Seleziona battute'}
            </button>
          )}
          <label className="check small">
            <input id="pl-follow" type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Segui il brano
          </label>
        </div>
      </div>
      {selecting && (
        <p className="select-hint" role="status">
          {selecting.anchor === null ? 'Tocca la prima battuta da ripetere.' : 'Ora tocca l’ultima battuta (o la stessa, per ripeterne una sola).'}
        </p>
      )}
      <SongSheet
        a={view}
        current={pos.sectionIndex}
        bar={pos.barInSection}
        sym={sym}
        follow={follow && clock.playing && !editing && !selecting}
        firstBars={firstBars}
        onSeek={(t) => clock.seek(t)}
        loop={loop}
        onLoop={chooseLoop}
        selection={selecting}
        onSelectBar={(g) => {
          const next = tapBar(selecting ?? { anchor: null, range: null }, g);
          if (next.anchor === null && next.range) {
            chooseLoop(next.range);
            setSelecting(null);
          } else setSelecting(next);
        }}
        edit={editing ? { capo, notation, apply } : null}
      />

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

      <Transport
        a={view}
        clock={clock}
        pos={pos}
        loop={loop}
        loopLabel={loop ? loopName(a, loop, firstBars) : ''}
        round={round}
        trainer={prefs.trainer}
        counting={counting}
        onLoop={chooseLoop}
        onToggle={togglePlay}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** I nomi lunghi (Fmaj7, Do#m7b5) si rimpiccioliscono invece di andare a capo. */
const nameSize = (name: string) => (name.length >= 6 ? 'is-long' : name.length >= 4 ? 'is-mid' : '');

function Stage({ a, pos, section, capo, easy, sym, notation, started, onHear }: {
  a: Analysis; pos: Position; section: Section; capo: number; easy: boolean; sym: (s: string) => string; notation: Notation; started: boolean; onHear: (s: string) => void;
}) {
  const cur = pos.chordIndex >= 0 ? a.chords[pos.chordIndex] : null;
  const next = pos.nextChordIndex >= 0 ? a.chords[pos.nextChordIndex] : null;
  const shown = cur ?? next;
  const shape = shown ? shapeFor(shown.symbol, capo, easy) : null;
  // prima di partire il riquadro mostra l'accordo che viene dopo il primo
  const after = !cur && next ? a.chords.slice(pos.nextChordIndex + 1).find((c) => c.symbol !== next.symbol) ?? null : next;
  const nextShape = after ? shapeFor(after.symbol, capo, easy) : null;
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
          <span className={`st-name ${nameSize(shown ? sym(shown.symbol) : '')}`}>{shown ? sym(shown.symbol) : '–'}</span>
          {shape && <span className="st-fret">{workFret(shape.v) <= 1 ? 'tasti 1–4' : `${workFret(shape.v)}º tasto`}</span>}
        </button>
        <div className="st-diagram">
          {shape ? <ChordDiagram voicing={shape.v} tuning={STD} rootPc={shape.root} quality={shape.q} width={100} notation={notation} /> : null}
        </div>
        <div className={`st-next ${soon ? 'is-soon' : ''}`}>
          <span className="st-label">
            {!after ? 'Fine' : cur && pos.beatsToNext > 0 ? `Tra ${pos.beatsToNext} ${pos.beatsToNext === 1 ? 'battito' : 'battiti'}` : 'Poi'}
          </span>
          <span className={`st-next-name ${nameSize(after ? sym(after.symbol) : '')}`}>{after ? sym(after.symbol) : ''}</span>
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

interface SheetEdit {
  capo: number;
  notation: Notation;
  apply: (next: Analysis) => void;
}

const LONG_PRESS_MS = 500;

const SongSheet = memo(function SongSheet({ a, current, bar, sym, follow, firstBars, onSeek, loop, onLoop, selection, onSelectBar, edit }: {
  a: Analysis; current: number; bar: number; sym: (s: string) => string; follow: boolean; firstBars: number[]; onSeek: (t: number) => void;
  loop: LoopRange | null; onLoop: (r: LoopRange | null) => void; selection: Selection | null; onSelectBar: (globalBar: number) => void; edit: SheetEdit | null;
}) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  // tocco lungo su una battuta: inizia la selezione del loop da lì
  const press = useRef<{ timer: number; fired: boolean } | null>(null);
  const pressStart = (g: number) => {
    // ogni nuova pressione dimentica quella prima (il rilascio può cadere fuori dalla battuta)
    press.current = null;
    if (edit || selection) return;
    const p = { timer: 0, fired: false };
    p.timer = window.setTimeout(() => {
      p.fired = true;
      navigator.vibrate?.(15);
      onSelectBar(g);
    }, LONG_PRESS_MS);
    press.current = p;
  };
  const pressEnd = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const [picking, setPicking] = useState<{ section: number; bar: number } | null>(null);
  const editing = edit !== null;
  useEffect(() => {
    if (!editing) setPicking(null);
  }, [editing]);
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
            className={`song-sec ${i === current ? 'is-current' : ''} ${edit ? 'is-editing' : ''}`}>
            <header>
              <button className="ss-title" onClick={() => onSeek(s.start)}>
                <span className="ss-name">{s.label}</span>
                <span className="ss-time">
                  {fmtTime(s.start)} · {s.bars} {s.bars === 1 ? 'battuta' : 'battute'}
                </span>
              </button>
              {(() => {
                const r = sectionRange(a, i, firstBars);
                const on = sameRange(loop, r);
                return (
                  <button className={`ss-loop ${on ? 'on' : ''}`} onClick={() => onLoop(on ? null : r)} aria-pressed={on}>
                    {on ? 'In ripetizione' : 'Ripeti'}
                  </button>
                );
              })()}
            </header>
            {edit && <SectionEditor key={`${s.label}|${s.strum.steps}`} a={a} index={i} onApply={edit.apply} />}
            {changes && !edit && <p className="ss-change">{changes}</p>}
            <div className="ss-bars">
              {s.chart.map((b, k) => {
                const t = a.downbeats[base + k] ?? s.start;
                const picked = picking?.section === i && picking.bar === k;
                const g = base + k;
                const anchor = selection?.anchor === g;
                return (
                  <button
                    key={k}
                    className={`ss-bar ${i === current && k === bar ? 'now' : ''} ${picked ? 'picked' : ''} ${inRange(loop, g) ? 'in-loop' : ''} ${anchor ? 'anchor' : ''}`}
                    onClick={() => {
                      if (press.current?.fired) {
                        press.current = null;
                        return;
                      }
                      if (edit) setPicking(picked ? null : { section: i, bar: k });
                      else if (selection) onSelectBar(g);
                      else onSeek(t);
                    }}
                    onPointerDown={() => pressStart(g)}
                    onPointerUp={pressEnd}
                    onPointerLeave={pressEnd}
                    onPointerCancel={pressEnd}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label={`Battuta ${k + 1}: ${b.map((c) => (c === '–' ? 'nessun accordo' : sym(c))).join(', ')}${edit ? '. Tocca per cambiare' : selection ? '. Tocca per il loop' : ''}`}
                    aria-expanded={edit ? picked : undefined}
                  >
                    {b.map((c, j) => (
                      <span key={j} className={c === '–' ? 'nc' : ''}>
                        {c === '–' ? '–' : sym(c)}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
            {edit && picking?.section === i && picking.bar < s.chart.length && (
              <ChordPicker
                a={a}
                capo={edit.capo}
                notation={edit.notation}
                bar={picking.bar}
                current={s.chart[picking.bar].map((c) => (c === '–' ? 'nessuno' : sym(c))).join(', ')}
                onPick={(c) => {
                  edit.apply(setBarChord(a, i, picking.bar, c));
                  setPicking(null);
                }}
                onCancel={() => setPicking(null)}
              />
            )}
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

/** Nome del loop: la sezione se coincide, altrimenti le battute (numerate da 1). */
function loopName(a: Analysis, r: LoopRange, firstBars: number[]): string {
  const i = a.sections.findIndex((_, k) => sameRange(r, sectionRange(a, k, firstBars)));
  if (i >= 0) return a.sections[i].label;
  return r.startBar === r.endBar ? `battuta ${r.startBar + 1}` : `battute ${r.startBar + 1}–${r.endBar + 1}`;
}

function Transport({ a, clock, pos, loop, loopLabel, round, trainer, counting, onLoop, onToggle }: {
  a: Analysis; clock: ReturnType<typeof useSongClock>; pos: Position; loop: LoopRange | null; loopLabel: string; round: number; trainer: boolean; counting: number | null;
  onLoop: (r: LoopRange | null) => void; onToggle: () => void;
}) {
  const lt = loop ? loopTimes(a, loop) : null;
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
            className={`tr-sec g${groups.indexOf(s.label.replace(/ \d+$/, '')) % 5} ${i === pos.sectionIndex ? 'cur' : ''}`}
            style={{ left: `${(s.start / a.duration) * 100}%`, width: `${((s.end - s.start) / a.duration) * 100}%` }}
          >
            <em>{s.label}</em>
          </span>
        ))}
        {lt && <span className="tr-loop" style={{ left: `${(lt.start / a.duration) * 100}%`, width: `${((lt.end - lt.start) / a.duration) * 100}%` }} />}
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
          <button className={`tr-play ${counting !== null ? 'is-counting' : ''}`} onClick={onToggle} aria-label={counting !== null ? `Conteggio ${counting}: tocca per fermare` : clock.playing ? 'Pausa' : 'Suona'}>
            {counting !== null ? (
              <span className="tr-count">{counting || ''}</span>
            ) : clock.playing ? (
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
            {RATES.map((s) => (
              <option key={s} value={s}>
                {Math.round(s * 100)}%
              </option>
            ))}
          </select>
        </label>
      </div>
      {loop && (
        <button className="tr-loopbar" onClick={() => onLoop(null)}>
          Ripeti {loopLabel}
          {trainer && round > 0 ? ` · giro ${round} al ${Math.round(clock.rate * 100)}%` : ''} · tocca per smettere
        </button>
      )}
      {!clock.hasAudio && <p className="tr-note">Senza audio: segui il click del metronomo.</p>}
    </div>
  );
}
