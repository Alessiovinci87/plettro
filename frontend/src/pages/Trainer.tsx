// "Allenati": quanti cambi tra due accordi riesci a fare in 60 secondi.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSettings } from '../store';
import { ChordDiagram } from '../components/ChordDiagram';
import { chordSymbol, parseChord, pcName, QUALITY_BY_ID, type Notation } from '../music/theory';
import { getVoicings } from '../music/voicings';
import { click, audio } from '../audio/engine';
import {
  addResult, bestFor, HISTORY_KEY, pairKey, pairOf, parseHistory, ROUND_SECONDS, secondsLeft, sessionsFor, SUGGESTED_PAIRS, triedPairs, validPair,
  type TrainerEntry,
} from '../song/trainer';

const TYPES = ['major', 'minor', '7', 'm7', 'maj7', 'sus2', 'sus4', '5', 'add9', '6', 'dim'];
const typeLabel = (id: string) => (id === 'major' ? 'maggiore' : id === 'minor' ? 'minore' : QUALITY_BY_ID[id].symbol);

/** Nome da mostrare, nella notazione scelta. */
const shown = (sym: string, notation: Notation) => {
  const p = parseChord(sym);
  return p ? chordSymbol(p.root, p.quality, notation) : sym;
};

function load(): TrainerEntry[] {
  try {
    return parseHistory(localStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}
function store(h: TrainerEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* navigazione privata: lo storico vale solo per questa visita */
  }
}

type Run = { kind: 'idle' } | { kind: 'running'; startedAt: number; count: number } | { kind: 'done'; count: number; record: boolean; previousBest: number | null };

export function Trainer() {
  const { notation } = useSettings();
  const [pair, setPair] = useState<[string, string]>(['G', 'C']);
  const [history, setHistory] = useState<TrainerEntry[]>(load);
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const key = pairKey(pair[0], pair[1]);
  const valid = validPair(pair[0], pair[1]);
  const best = bestFor(history, key);
  const left = run.kind === 'running' ? secondsLeft(run.startedAt, now) : ROUND_SECONDS;

  const start = () => {
    if (!valid) return;
    audio();
    setNow(Date.now());
    setRun({ kind: 'running', startedAt: Date.now(), count: 0 });
  };
  const count = () => setRun((r) => (r.kind === 'running' ? { ...r, count: r.count + 1 } : r));

  // timer: fine prova a 0 secondi, con salvataggio nello storico
  useEffect(() => {
    if (run.kind !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [run.kind]);
  useEffect(() => {
    if (run.kind !== 'running' || left > 0) return;
    const r = addResult(history, key, run.count, Date.now());
    setHistory(r.history);
    store(r.history);
    setRun({ kind: 'done', count: run.count, record: r.record, previousBest: r.previousBest });
    const t = audio().currentTime + 0.02;
    click(t, true);
    click(t + 0.18, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, run.kind]);

  // barra spaziatrice: avvia, poi conta i cambi
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (runRef.current.kind === 'running') count();
      else start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choose = (p: [string, string]) => {
    if (run.kind === 'running') return;
    setPair(p);
    setRun({ kind: 'idle' });
  };
  const running = run.kind === 'running';
  const target = running ? pair[run.count % 2] : null;

  return (
    <section className="page trainer">
      <p className="hint">Scegli due accordi e cambia dall'uno all'altro per 60 secondi. Tocca il pulsante grande (o la barra spaziatrice) a ogni cambio.</p>

      <div className="tr-pick" aria-disabled={running}>
        {[0, 1].map((i) => (
          <ChordSlot key={i} index={i} sym={pair[i]} disabled={running} notation={notation} on={target === pair[i]} onChange={(s) => choose(i === 0 ? [s, pair[1]] : [pair[0], s])} />
        ))}
      </div>
      {!valid && <p className="error">Scegli due accordi diversi.</p>}

      <div className="tr-round">
        <div className="tr-clock" aria-live="polite">
          <span className="tr-left">{left}</span>
          <span className="tr-left-label">secondi</span>
        </div>
        {running ? (
          <button className="tr-tap" onClick={(e) => e.detail !== 0 && count()} aria-label={`Cambio fatto. Finora ${run.count}`}>
            <span className="tr-tap-count">{run.count}</span>
            <span className="tr-tap-label">cambi · ora {target && shown(target, notation)}</span>
          </button>
        ) : (
          <button className="tr-tap is-idle" onClick={start} disabled={!valid}>
            <span className="tr-tap-label">{run.kind === 'done' ? 'Riprova' : 'Via'}</span>
            <span className="tr-tap-sub">60 secondi · barra spaziatrice</span>
          </button>
        )}
        <p className="tr-result" role="status">
          {run.kind === 'done'
            ? run.record
              ? `Nuovo record: ${run.count} cambi (prima ${run.previousBest}).`
              : run.previousBest === null
                ? `${run.count} cambi. È il tuo primo risultato con questa coppia.`
                : `${run.count} cambi. Il tuo record è ${Math.max(run.previousBest, run.count)}.`
            : best !== null
              ? `Record con questa coppia: ${best} cambi.`
              : 'Nessuna prova ancora con questa coppia.'}
        </p>
      </div>

      <div className="tr-suggest">
        <span className="cp-label">Coppie suggerite</span>
        <div className="cp-chips">
          {SUGGESTED_PAIRS.map(([x, y]) => {
            const k = pairKey(x, y);
            const b = bestFor(history, k);
            return (
              <button key={k} className="chip chip-ghost" aria-selected={k === key} disabled={running} onClick={() => choose([x, y])}>
                {shown(x, notation)} – {shown(y, notation)}
                {b !== null && <small className="tr-best-chip">{b}</small>}
              </button>
            );
          })}
        </div>
      </div>

      <Progress entries={sessionsFor(history, key)} best={best} title={`${shown(pair[0], notation)} – ${shown(pair[1], notation)}`} />

      {triedPairs(history).length > 0 && (
        <div className="tr-tried">
          <h3 className="h-sub">Le tue coppie</h3>
          <ul>
            {triedPairs(history).map((p) => {
              const [x, y] = pairOf(p.key);
              return (
                <li key={p.key}>
                  <button className="btn-text" onClick={() => choose([x, y])} disabled={running}>
                    {shown(x, notation)} – {shown(y, notation)}
                  </button>
                  <span>record {p.best}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function ChordSlot({ index, sym, disabled, notation, on, onChange }: { index: number; sym: string; disabled: boolean; notation: Notation; on: boolean; onChange: (s: string) => void }) {
  const { tuningMidi, isStandard } = useSettings();
  const p = parseChord(sym);
  const root = p?.root ?? 0;
  const q = p?.quality ?? QUALITY_BY_ID.major;
  const v = getVoicings(root, q, tuningMidi, isStandard)[0];
  const set = (r: number, id: string) => onChange(chordSymbol(r, QUALITY_BY_ID[id], 'intl'));
  const id = `tr-chord-${index}`;
  return (
    <div className={`tr-slot ${on ? 'is-on' : ''}`}>
      <div className="tr-slot-name">{chordSymbol(root, q, notation)}</div>
      <div className="tr-slot-sel">
        <label className="sr-only" htmlFor={`${id}-root`}>
          Tonica dell'accordo {index + 1}
        </label>
        <select id={`${id}-root`} value={root} disabled={disabled} onChange={(e) => set(Number(e.target.value), q.id)}>
          {Array.from({ length: 12 }, (_, r) => (
            <option key={r} value={r}>
              {pcName(r, notation)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${id}-type`}>
          Tipo dell'accordo {index + 1}
        </label>
        <select id={`${id}-type`} value={TYPES.includes(q.id) ? q.id : 'major'} disabled={disabled} onChange={(e) => set(root, e.target.value)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
      </div>
      <div className="tr-slot-diagram">{v && <ChordDiagram voicing={v} tuning={tuningMidi} rootPc={root} quality={q} width={120} notation={notation} />}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grafico dei progressi: una barra per prova, record etichettato.

const DATE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Larghezza di un elemento che può comparire dopo (ref a funzione). */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w] as const;
}

function niceMax(v: number) {
  // massimi pari: la tacca a metà resta un numero intero
  const steps = [10, 20, 30, 40, 50, 60, 80, 100, 120, 160, 200];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 100) * 100;
}

function Progress({ entries, best, title }: { entries: TrainerEntry[]; best: number | null; title: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  const pad = { l: 30, r: 8, t: 22, b: 24 };
  const n = entries.length;
  const max = niceMax(Math.max(5, ...entries.map((e) => e.changes)));
  const innerW = Math.max(0, width - pad.l - pad.r);
  const innerH = H - pad.t - pad.b;
  const slot = n ? innerW / Math.max(n, 6) : 0;
  const barW = Math.max(6, Math.min(28, slot - 6));
  const x = (i: number) => pad.l + slot * i + (slot - barW) / 2;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const bestIdx = best === null ? -1 : entries.map((e) => e.changes).lastIndexOf(best);

  return (
    <div className="tr-progress">
      <h3 className="h-sub">Progressi · {title}</h3>
      {n === 0 ? (
        <p className="hint">Dopo la prima prova qui vedi come migliori, prova dopo prova.</p>
      ) : (
        <>
          <div className="tr-chart" ref={ref}>
            {width > 0 && (
              <svg width={width} height={H} role="img" aria-label={`Cambi per prova, ultime ${n}: ${entries.map((e) => e.changes).join(', ')}`}>
                {ticks.map((t) => (
                  <g key={t} className="tr-grid">
                    <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
                    <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end">
                      {t}
                    </text>
                  </g>
                ))}
                {entries.map((e, i) => {
                  const h = Math.max(0, y(0) - y(e.changes));
                  const r = Math.min(4, barW / 2, h);
                  const x0 = x(i);
                  const top = y(e.changes);
                  // angoli arrotondati solo in alto, base appoggiata sull'asse
                  const d = h <= 0 ? '' : `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${y(0)}Z`;
                  return (
                    <g key={e.at}>
                      <path d={d} className={`tr-bar ${hover === i ? 'is-hover' : ''}`} />
                      {(i === bestIdx || i === n - 1) && (
                        <text
                          className="tr-bar-label"
                          x={x0 + barW / 2 > width - 40 ? x0 + barW : x0 + barW / 2}
                          y={top - 6}
                          textAnchor={x0 + barW / 2 > width - 40 ? 'end' : 'middle'}
                        >
                          {i === bestIdx ? `record ${e.changes}` : e.changes}
                        </text>
                      )}
                      {/* area di tocco più grande della barra */}
                      <rect
                        x={pad.l + slot * i}
                        y={pad.t}
                        width={slot}
                        height={innerH}
                        fill="transparent"
                        onPointerEnter={() => setHover(i)}
                        onPointerLeave={() => setHover(null)}
                        onClick={() => setHover(hover === i ? null : i)}
                      />
                    </g>
                  );
                })}
                <text className="tr-axis" x={pad.l} y={H - 6}>
                  prima
                </text>
                <text className="tr-axis" x={width - pad.r} y={H - 6} textAnchor="end">
                  ultima prova
                </text>
              </svg>
            )}
            {hover !== null && entries[hover] && (
              <div className="tr-tip" style={{ left: Math.min(Math.max(x(hover) + barW / 2, 70), width - 70), top: Math.max(0, y(entries[hover].changes) - 52) }}>
                <strong>{entries[hover].changes} cambi</strong>
                <span>{DATE.format(entries[hover].at)}</span>
              </div>
            )}
          </div>
          <details className="tr-table">
            <summary>Tabella</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Prova</th>
                  <th scope="col">Quando</th>
                  <th scope="col">Cambi</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.at}>
                    <td>{i + 1}</td>
                    <td>{DATE.format(e.at)}</td>
                    <td>{e.changes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
