import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../store';
import { Fretboard, type Mark } from '../components/Fretboard';
import { chordDegree, chordPcs, chordSymbol, KEYS, mod12, pcName, QUALITIES, QUALITY_BY_ID, scaleDegree, SCALES, type Notation } from '../music/theory';
import { explainPosition, handLabel, playOrder, scalePositions, stringLabel, tablature, usageTip, type PosNote, type ScalePosition } from '../music/positions';
import { audio, playNote } from '../audio/engine';

export interface NeckFocus {
  mode: 'scala' | 'impara' | 'accordo';
  root: number;
  id: string;
}

/**
 * Colori delle posizioni in "Tutto il manico". Il legno del manico è scuro in entrambi i temi:
 * palette categoriale verificata su #3b2a22 (separazione anche per daltonici, contrasto ≥ 3:1
 * tranne il verde, che arriva solo con 7 posizioni e ha sempre il numero accanto in legenda).
 */
const POS_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];

const MODES: { id: NeckFocus['mode']; label: string }[] = [
  { id: 'scala', label: 'Scale' },
  { id: 'impara', label: 'Impara la scala' },
  { id: 'accordo', label: 'Accordo' },
];

export function Neck({ focus, onFocus }: { focus: NeckFocus; onFocus: (f: NeckFocus) => void }) {
  const { tuningMidi, notation, a4, leftHanded } = useSettings();
  const [labels, setLabels] = useState<'note' | 'gradi'>('note');
  const { mode, root, id } = focus;
  const scale = SCALES.find((s) => s.id === id) ?? SCALES[0];
  const quality = QUALITY_BY_ID[id] ?? QUALITY_BY_ID['major'];
  const pcs = new Set(mode === 'accordo' ? chordPcs(root, quality) : scale.intervals.map((i) => mod12(root + i)));
  const strings = tuningMidi.map((m, s) => stringLabel(s, tuningMidi.length, pcName(m, notation)));

  const mark = (s: number, f: number) => {
    const pc = mod12(tuningMidi[s] + f);
    if (!pcs.has(pc)) return null;
    const label = labels === 'note' ? pcName(pc, notation) : mode === 'scala' ? scaleDegree(pc, root) : chordDegree(pc, root, quality);
    return { label, kind: pc === mod12(root) ? ('root' as const) : ('tone' as const) };
  };

  return (
    <section className="page">
      <div className="seg" role="tablist" aria-label="Cosa mostrare">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => mode !== m.id && onFocus({ mode: m.id, root, id: m.id === 'accordo' ? 'major' : mode === 'accordo' ? 'penta-min' : id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="chips keys" role="listbox" aria-label="Tonica">
        {KEYS.map((k, pc) => (
          <button key={k} role="option" aria-selected={pc === root} className="chip" onClick={() => onFocus({ ...focus, root: pc })}>
            {pcName(pc, notation)}
          </button>
        ))}
      </div>

      <label className="select-row">
        {mode === 'accordo' ? 'Accordo' : 'Scala'}
        <select value={id} onChange={(e) => onFocus({ ...focus, id: e.target.value })}>
          {mode === 'accordo'
            ? QUALITIES.map((q) => (
                <option key={q.id} value={q.id}>
                  {chordSymbol(root, q, notation)} ({q.name})
                </option>
              ))
            : SCALES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
        </select>
      </label>

      {mode === 'impara' ? (
        <LearnScale key={`${root}-${scale.id}-${tuningMidi.join(',')}`} root={root} scaleId={scale.id} strings={strings} />
      ) : (
        <>
          <header className="chord-head">
            <div>
              <h2 className="chord-title">{mode === 'scala' ? `${pcName(root, notation)} ${scale.name.toLowerCase()}` : chordSymbol(root, quality, notation)}</h2>
              <p className="chord-sub">{mode === 'scala' ? scale.hint : `Tutte le note di ${chordSymbol(root, quality, notation)} lungo il manico.`}</p>
            </div>
            <div className="seg seg-small" role="tablist" aria-label="Etichette">
              <button role="tab" aria-selected={labels === 'note'} onClick={() => setLabels('note')}>
                Note
              </button>
              <button role="tab" aria-selected={labels === 'gradi'} onClick={() => setLabels('gradi')}>
                Gradi
              </button>
            </div>
          </header>

          <Fretboard tuning={tuningMidi} mark={mark} leftHanded={leftHanded} stringLabels={strings} onPick={(s, f) => playNote(tuningMidi[s] + f, { a4 })} />
          <p className="hint">Scorri il manico di lato. Tocca una nota per sentirla. In evidenza la tonica.</p>
        </>
      )}
    </section>
  );
}

type LearnLabel = 'dita' | 'ordine' | 'note' | 'gradi';
const LEARN_LABELS: { id: LearnLabel; label: string }[] = [
  { id: 'dita', label: 'Dita' },
  { id: 'ordine', label: 'Ordine' },
  { id: 'note', label: 'Note' },
  { id: 'gradi', label: 'Gradi' },
];

const noteKey = (s: number, f: number) => `${s}:${f}`;

/** "Impara la scala": una posizione alla volta, con dita, ordine, suono e tablatura. */
function LearnScale({ root, scaleId, strings }: { root: number; scaleId: string; strings: string[] }) {
  const { tuningMidi, notation, a4, leftHanded } = useSettings();
  const scale = SCALES.find((s) => s.id === scaleId) ?? SCALES[0];
  const positions = useMemo(() => scalePositions(tuningMidi, root, scale.intervals), [tuningMidi, root, scale]);
  const [sel, setSel] = useState(0); // -1 = tutto il manico
  const [labels, setLabels] = useState<LearnLabel>('dita');
  const [view, setView] = useState<'manico' | 'tab'>('manico');
  const [bpm, setBpm] = useState(80);
  const [repeat, setRepeat] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(-1);

  const pos: ScalePosition | null = sel >= 0 ? (positions[sel] ?? null) : null;
  const order = useMemo(() => (pos ? playOrder(pos) : []), [pos]);
  const rootName = pcName(root, notation);
  const count = positions.length;
  const frets = Math.max(15, ...positions.map((p) => p.to));

  // la scala suonata nota per nota: tempo e ripetizione letti dal vivo
  const live = useRef({ bpm, repeat });
  live.current = { bpm, repeat };
  useEffect(() => {
    if (!playing || !order.length) return;
    const c = audio();
    let next = c.currentTime + 0.1;
    let i = 0;
    const pending = new Set<number>();
    const later = (fn: () => void, at: number) => {
      const t = window.setTimeout(() => {
        pending.delete(t);
        fn();
      }, Math.max(0, (at - c.currentTime) * 1000));
      pending.add(t);
    };
    const timer = window.setInterval(() => {
      while (next < c.currentTime + 0.12) {
        if (i >= order.length) {
          if (!live.current.repeat) {
            later(() => {
              setPlaying(false);
              setNow(-1);
            }, next);
            window.clearInterval(timer);
            return;
          }
          i = 0;
          next += 60 / live.current.bpm; // un battito di respiro prima di ripartire
          continue;
        }
        const k = i;
        playNote(order[k].midi, { when: next, a4 });
        later(() => setNow(k), next);
        next += 60 / live.current.bpm;
        i++;
      }
    }, 25);
    return () => {
      window.clearInterval(timer);
      pending.forEach((t) => window.clearTimeout(t));
      setNow(-1);
    };
  }, [playing, order, a4]);

  const go = (i: number) => {
    setPlaying(false);
    setSel(i);
  };

  // numero d'ordine di ogni nota nella salita
  const ascIndex = useMemo(() => new Map(pos?.notes.map((x, i) => [noteKey(x.string, x.fret), i + 1])), [pos]);
  const current: PosNote | undefined = now >= 0 ? order[now] : undefined;

  const mark = (s: number, f: number): Mark | null => {
    const pc = mod12(tuningMidi[s] + f);
    const kind = pc === mod12(root) ? ('root' as const) : ('tone' as const);
    const name = labels === 'gradi' ? scaleDegree(pc, root) : pcName(pc, notation);
    if (pos) {
      const x = pos.notes.find((n) => n.string === s && n.fret === f);
      if (!x) return null;
      const text = labels === 'dita' ? (x.finger ? String(x.finger) : '0') : labels === 'ordine' ? String(ascIndex.get(noteKey(s, f))) : name;
      return { label: text, kind, now: current?.string === s && current.fret === f };
    }
    const owners = positions.filter((p) => p.notes.some((n) => n.string === s && n.fret === f)).map((p) => POS_COLORS[p.index % POS_COLORS.length]);
    if (!owners.length) return null;
    return { label: name, kind, fills: owners.slice(0, 2) };
  };

  if (!count) return <p className="empty">Per questa scala non ci sono posizioni da studiare.</p>;

  const explain = pos ? explainPosition(pos, tuningMidi.length, rootName) : null;
  const tip = usageTip(scale.id, rootName);
  const system = positions[0].system;
  const fullName = `${rootName} ${scale.name.replace(/\s*\(.*\)$/, '').toLowerCase()}`;

  return (
    <>
      <div className="learn-nav">
        <button className="btn-round" aria-label="Posizione precedente" disabled={sel <= 0} onClick={() => go(sel - 1)}>
          ‹
        </button>
        <div className="chips learn-pos" role="tablist" aria-label="Posizione">
          <button role="tab" className="chip chip-ghost" aria-selected={sel === -1} onClick={() => go(-1)}>
            Tutto il manico
          </button>
          {positions.map((p) => (
            <button key={p.index} role="tab" className="chip" aria-selected={sel === p.index} onClick={() => go(p.index)} aria-label={`Posizione ${p.index + 1}`}>
              {sel === -1 && <i className="pos-swatch" style={{ background: POS_COLORS[p.index % POS_COLORS.length] }} aria-hidden="true" />}
              {p.index + 1}
            </button>
          ))}
        </div>
        <button className="btn-round" aria-label="Posizione successiva" disabled={sel >= count - 1} onClick={() => go(sel + 1)}>
          ›
        </button>
      </div>

      <header className="chord-head">
        <div>
          <h2 className="chord-title">{fullName}</h2>
          <p className="chord-sub">
            {pos ? `Posizione ${pos.index + 1} di ${count} · ${handLabel(pos)}` : `Le ${count} posizioni insieme`}
            {system === '3nps' ? ' · tre note per corda' : ''}
          </p>
        </div>
        {pos && (
          <div className="seg seg-small" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={view === 'manico'} onClick={() => setView('manico')}>
              Manico
            </button>
            <button role="tab" aria-selected={view === 'tab'} onClick={() => setView('tab')}>
              Tablatura
            </button>
          </div>
        )}
      </header>

      <div className="learn-tips">
        {explain ? (
          <>
            <p>{explain.hand}</p>
            <p>{explain.start}</p>
          </>
        ) : (
          <p>
            Ogni colore è una posizione: dove due si toccano, le note sono in comune (pallino a due colori). Imparane una, poi passa alla
            successiva e collegale.
          </p>
        )}
        {tip && <p className="learn-use">{tip}</p>}
      </div>

      {pos && view === 'tab' ? (
        <div className="learn-tab">
          <p className="tab-head">Salita</p>
          <pre aria-label="Tablatura della salita">{tablature(pos.notes, strings).join('\n')}</pre>
          <p className="tab-head">Discesa</p>
          <pre aria-label="Tablatura della discesa">{tablature([...pos.notes].reverse(), strings).join('\n')}</pre>
          <p className="hint">I numeri sono i tasti; la riga in alto è la 1ª corda, quella sottile.</p>
        </div>
      ) : (
        <>
          <div className="learn-labels">
            <div className="seg seg-small" role="tablist" aria-label="Cosa scrivere nei pallini">
              {LEARN_LABELS.filter((l) => pos || l.id === 'note' || l.id === 'gradi').map((l) => (
                <button key={l.id} role="tab" aria-selected={labels === l.id || (!pos && (labels === 'dita' || labels === 'ordine') && l.id === 'note')} onClick={() => setLabels(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
            {pos && labels === 'ordine' && <span className="hint">Sali da 1 a {pos.notes.length}, poi torna indietro.</span>}
          </div>
          <Fretboard
            tuning={tuningMidi}
            frets={frets}
            mark={mark}
            leftHanded={leftHanded}
            stringLabels={strings}
            band={pos ? { from: pos.hand, to: Math.max(pos.to, pos.hand + 3), label: handLabel(pos) } : null}
            onPick={(s, f) => playNote(tuningMidi[s] + f, { a4 })}
          />
        </>
      )}

      {pos ? (
        <div className="learn-play">
          <button className={`btn-primary ${playing ? 'is-on' : ''}`} onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Ferma' : 'Suona la scala'}
          </button>
          <div className="learn-bpm">
            <button className="btn-round" aria-label="Più lento" onClick={() => setBpm((b) => Math.max(40, b - 5))}>
              −
            </button>
            <label>
              <strong>{bpm}</strong> bpm
              <input type="range" min={40} max={200} step={5} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} aria-label="Velocità" />
            </label>
            <button className="btn-round" aria-label="Più veloce" onClick={() => setBpm((b) => Math.min(200, b + 5))}>
              +
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Ripeti di continuo
          </label>
          <p className="hint" aria-live="polite">
            {current ? `Nota ${now + 1} di ${order.length}: ${noteText(current, tuningMidi.length, notation)}` : `${order.length} note: salita e discesa, una per battito.`}
          </p>
        </div>
      ) : (
        <p className="hint">Scegli una posizione per vedere le dita e sentirla suonare.</p>
      )}
    </>
  );
}

function noteText(x: PosNote, strings: number, notation: Notation): string {
  return `${pcName(x.midi, notation)}, ${strings - x.string}ª corda, ${x.fret === 0 ? 'a vuoto' : `tasto ${x.fret}${x.finger ? `, dito ${x.finger}` : ''}`}`;
}
