import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../store';
import { audio, click, strum } from '../audio/engine';
import { beatsPerBar, stepsPerBeat, STRUM_PATTERNS, type StrumPattern } from '../music/rhythm';
import { asStrumPattern, emptySteps, loadPatterns, newPatternId, PATTERN_METERS, removePattern, stepsFor, storePatterns, upsertPattern, type CustomPattern, type PatternMeter } from '../music/patterns';
import { describeStrum } from '../song/edit';
import { StrumEditor } from '../components/StrumEditor';
import { chordSymbol, KEYS, pcName, QUALITY_BY_ID } from '../music/theory';
import { getVoicings, sounding } from '../music/voicings';

const METERS = [
  { id: '4/4', beats: 4 },
  { id: '3/4', beats: 3 },
  { id: '2/4', beats: 2 },
  { id: '6/8', beats: 6 },
];

export function Rhythm() {
  const { tuningMidi, isStandard, notation, a4 } = useSettings();
  const [bpm, setBpm] = useState(90);
  const [meter, setMeter] = useState('4/4');
  const [sub, setSub] = useState(1);
  const [pattern, setPattern] = useState<StrumPattern | null>(null);
  const [withClick, setWithClick] = useState(true);
  const [root, setRoot] = useState(7);
  const [qid, setQid] = useState('major');
  const [running, setRunning] = useState(false);
  const [pos, setPos] = useState(-1);
  const taps = useRef<number[]>([]);
  const [mine, setMine] = useState<CustomPattern[]>(loadPatterns);
  const [draft, setDraft] = useState<CustomPattern | null>(null);
  const [draftError, setDraftError] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  // mentre scrivi un pattern lo senti: suona la bozza
  const active = draft ? asStrumPattern(draft) : pattern;
  const custom = active ? mine.find((p) => p.id === active.id) : undefined;
  const editorRef = useRef<HTMLDivElement>(null);
  const editing = draft !== null;
  useEffect(() => {
    if (editing) editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [editing]);

  const chord = useMemo(() => {
    const v = getVoicings(root, QUALITY_BY_ID[qid], tuningMidi, isStandard)[0];
    return v ? sounding(v, tuningMidi) : [];
  }, [root, qid, tuningMidi, isStandard]);

  // Parametri letti dallo scheduler senza riavviarlo.
  const live = useRef({ bpm, meter, sub, pattern: active, withClick, chord, a4 });
  live.current = { bpm, meter, sub, pattern: active, withClick, chord, a4 };

  useEffect(() => {
    if (!running) return;
    const c = audio();
    let next = c.currentTime + 0.08;
    let step = 0;
    const pending = new Set<number>();
    const timer = window.setInterval(() => {
      while (next < c.currentTime + 0.12) {
        const L = live.current;
        const p = L.pattern;
        const beatsInBar = p ? beatsPerBar(p) : METERS.find((m) => m.id === L.meter)!.beats;
        const spb = p ? stepsPerBeat(p) : L.sub;
        const stepsInBar = p ? p.steps.length : beatsInBar * spb;
        const s = step % stepsInBar;
        // Il bpm si riferisce al battito: in 6/8 è la semiminima puntata (3 ottavi).
        const stepDur = 60 / L.bpm / spb;
        const onBeat = s % spb === 0;
        if (L.withClick && onBeat) click(next, s === 0);
        else if (!p && L.withClick) click(next, false, true);
        if (p) {
          const ch = p.steps[s];
          if (ch !== '-') {
            const up = ch === 'U' || ch === 'u';
            const soft = ch === 'd' || ch === 'u';
            const accent = p.id === 'rock' && (s === 4 || s === 12);
            strum(L.chord, { when: next, up, gain: soft ? 0.16 : accent ? 0.42 : 0.3, muted: ch === 'x', a4: L.a4, spread: up ? 0.008 : 0.011 });
          }
        }
        const at = next;
        const t = window.setTimeout(() => {
          pending.delete(t);
          setPos(s);
        }, Math.max(0, (at - c.currentTime) * 1000));
        pending.add(t);
        next += stepDur;
        step++;
      }
    }, 25);
    return () => {
      window.clearInterval(timer);
      // niente casella accesa dopo lo stop
      pending.forEach((t) => window.clearTimeout(t));
      setPos(-1);
    };
  }, [running]);

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now].slice(-5);
    if (taps.current.length >= 3) {
      const d = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      setBpm(Math.round(60000 / (d.reduce((a, b) => a + b, 0) / d.length)));
    }
  };

  const beats = METERS.find((m) => m.id === meter)!.beats;
  const grid = active ? active.steps.split('') : Array.from({ length: beats * sub }, (_, i) => (i % sub === 0 ? '●' : '·'));

  const startDraft = (p: CustomPattern) => {
    setDraft(p);
    setDraftError('');
    setConfirmDel(false);
  };
  const newDraft = () => {
    // si parte dal pattern che stai ascoltando, se ha una battuta di 4/4 o 3/4
    const from = pattern && (pattern.meter === '4/4' || pattern.meter === '3/4') ? pattern : null;
    startDraft({
      id: newPatternId(mine),
      name: `Il mio ritmo ${mine.length + 1}`,
      meter: from?.meter === '3/4' ? '3/4' : '4/4',
      steps: from ? from.steps : 'D---D---D---D---',
    });
  };
  const setDraftMeter = (m: PatternMeter) => {
    if (!draft || draft.meter === m) return;
    setDraft({ ...draft, meter: m, steps: (draft.steps + emptySteps(m)).slice(0, stepsFor(m)) });
  };
  const saveDraft = () => {
    if (!draft) return;
    if (!draft.name.trim()) return setDraftError('Dagli un nome.');
    if (!/[^-]/.test(draft.steps)) return setDraftError('Metti almeno una pennata.');
    const next = upsertPattern(mine, draft);
    if (!next) return setDraftError('Pattern non valido.');
    if (!storePatterns(next)) return setDraftError('Non riesco a salvarlo in questo browser.');
    const saved = next.find((p) => p.id === draft.id);
    setMine(next);
    setPattern(saved ? asStrumPattern(saved) : null);
    setDraft(null);
  };
  const deleteCustom = () => {
    if (!custom) return;
    const next = removePattern(mine, custom.id);
    if (!storePatterns(next)) return setDraftError('Non riesco a salvare in questo browser.');
    setMine(next);
    setPattern(null);
    setConfirmDel(false);
  };

  return (
    <section className="page">
      <div className="bpm-box">
        <button className="bpm-step" onClick={() => setBpm((b) => Math.max(30, b - 1))} aria-label="Rallenta">
          −
        </button>
        <div className="bpm-read">
          <strong>{bpm}</strong>
          <span>bpm</span>
        </div>
        <button className="bpm-step" onClick={() => setBpm((b) => Math.min(260, b + 1))} aria-label="Accelera">
          +
        </button>
      </div>
      <input type="range" min={30} max={260} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label="Tempo" className="bpm-range" />

      <div className="row-actions">
        <button className={`btn-primary big ${running ? 'is-on' : ''}`} onClick={() => setRunning((r) => !r)}>
          {running ? 'Ferma' : 'Avvia'}
        </button>
        <button className="btn-secondary big" onClick={tap}>
          Tap tempo
        </button>
      </div>

      <div className={`beat-grid ${active ? 'is-pattern' : ''}`} style={{ gridTemplateColumns: `repeat(${grid.length}, 1fr)` }} aria-hidden="true">
        {grid.map((g, i) => (
          <span key={i} className={`bg-cell ${i === pos ? 'is-now' : ''} ${g === '-' ? 'is-rest' : ''}`}>
            {active ? (g === 'D' || g === 'd' ? '↓' : g === 'U' || g === 'u' ? '↑' : g === 'x' ? '×' : '') : g}
          </span>
        ))}
      </div>

      {!active && (
        <div className="opts">
          <label className="select-row">
            Tempo in chiave
            <select value={meter} onChange={(e) => setMeter(e.target.value)}>
              {METERS.map((m) => (
                <option key={m.id}>{m.id}</option>
              ))}
            </select>
          </label>
          <label className="select-row">
            Suddivisione
            <select value={sub} onChange={(e) => setSub(Number(e.target.value))}>
              <option value={1}>Quarti</option>
              <option value={2}>Ottavi</option>
              <option value={3}>Terzine</option>
              <option value={4}>Sedicesimi</option>
            </select>
          </label>
        </div>
      )}

      <h3 className="h-sub">Pattern di pennata</h3>
      <p className="hint">Scegli un ritmo: lo suono con l'accordo che preferisci, tu segui la griglia.</p>
      <div className="chips">
        <button className="chip" aria-selected={active === null} disabled={!!draft} onClick={() => setPattern(null)}>
          Solo metronomo
        </button>
        {STRUM_PATTERNS.map((p) => (
          <button key={p.id} className="chip" aria-selected={active?.id === p.id} disabled={!!draft} onClick={() => setPattern(p)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="chips mine-chips" role="group" aria-label="I miei pattern">
        {mine.map((p) => (
          <button key={p.id} className="chip chip-mine" aria-selected={active?.id === p.id} disabled={!!draft} onClick={() => setPattern(asStrumPattern(p))}>
            {p.name}
          </button>
        ))}
        {!draft && (
          <button className="chip chip-ghost" onClick={newDraft}>
            + Nuovo pattern
          </button>
        )}
      </div>

      {draft && (
        <div className="pat-ed" role="group" aria-label="Editor del pattern" ref={editorRef}>
          <h4 className="pat-title">{mine.some((p) => p.id === draft.id) ? 'Modifica il pattern' : 'Nuovo pattern'}</h4>
          <div className="pat-row">
            <label htmlFor="pat-name">Nome</label>
            <input
              id="pat-name"
              className="text-in"
              value={draft.name}
              maxLength={40}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
                setDraftError('');
              }}
            />
            <div className="seg seg-small" role="tablist" aria-label="Tempo in chiave">
              {PATTERN_METERS.map((m) => (
                <button key={m} role="tab" aria-selected={draft.meter === m} onClick={() => setDraftMeter(m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <StrumEditor
            steps={draft.steps}
            onChange={(steps) => {
              setDraft({ ...draft, steps });
              setDraftError('');
            }}
            presets={STRUM_PATTERNS.map((p) => ({ id: p.id, name: p.name, steps: p.steps }))}
            idPrefix="pat"
          />
          <p className="hint">
            {describeStrum(draft.steps)} {running ? 'Lo senti mentre lo scrivi.' : 'Premi Avvia per sentirlo mentre lo scrivi.'}
          </p>
          {draftError && (
            <p className="error" role="status">
              {draftError}
            </p>
          )}
          <div className="row-actions">
            <button className="btn-primary" onClick={saveDraft}>
              Salva
            </button>
            <button className="btn-secondary" onClick={() => setDraft(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}
      {active && (
        <div className="pattern-info">
          {!draft && (
            <p>
              <strong>{active.feel}</strong>, {active.meter}. {custom ? `${describeStrum(active.steps)} Lo trovi anche nel player, nella pennata di ogni sezione.` : active.tip}
            </p>
          )}
          {custom && !draft && (
            <div className="row-actions pat-actions">
              {confirmDel ? (
                <>
                  <span className="pat-confirm">Eliminare «{custom.name}»?</span>
                  <button className="btn-danger small" onClick={deleteCustom}>
                    Elimina
                  </button>
                  <button className="btn-secondary small" onClick={() => setConfirmDel(false)}>
                    Annulla
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary small" onClick={() => startDraft(custom)}>
                    Modifica
                  </button>
                  <button className="btn-secondary small" onClick={() => setConfirmDel(true)}>
                    Elimina
                  </button>
                </>
              )}
            </div>
          )}
          <div className="opts">
            <label className="select-row">
              Accordo
              <select value={root} onChange={(e) => setRoot(Number(e.target.value))}>
                {KEYS.map((k, pc) => (
                  <option key={k} value={pc}>
                    {pcName(pc, notation)}
                  </option>
                ))}
              </select>
              <select value={qid} onChange={(e) => setQid(e.target.value)} aria-label="Tipo di accordo">
                {['major', 'minor', '7', 'm7', 'maj7', 'sus4', '5'].map((id) => (
                  <option key={id} value={id}>
                    {chordSymbol(root, QUALITY_BY_ID[id], notation)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={withClick} onChange={(e) => setWithClick(e.target.checked)} /> Click sul battito
            </label>
          </div>
          <p className="legend">↓ pennata giù · ↑ pennata su · × stoppata col palmo · vuoto: la mano si muove ma non tocca le corde</p>
        </div>
      )}
    </section>
  );
}
