import { useState } from 'react';
import { useSettings } from '../store';
import { Fretboard } from '../components/Fretboard';
import { chordDegree, chordPcs, chordSymbol, KEYS, mod12, pcName, QUALITIES, QUALITY_BY_ID, scaleDegree, SCALES } from '../music/theory';
import { playNote } from '../audio/engine';

export interface NeckFocus {
  mode: 'scala' | 'accordo';
  root: number;
  id: string;
}

export function Neck({ focus, onFocus }: { focus: NeckFocus; onFocus: (f: NeckFocus) => void }) {
  const { tuningMidi, notation, a4, leftHanded } = useSettings();
  const [labels, setLabels] = useState<'note' | 'gradi'>('note');
  const { mode, root, id } = focus;
  const scale = SCALES.find((s) => s.id === id) ?? SCALES[0];
  const quality = QUALITY_BY_ID[id] ?? QUALITY_BY_ID['major'];
  const pcs = new Set(mode === 'scala' ? scale.intervals.map((i) => mod12(root + i)) : chordPcs(root, quality));

  const mark = (s: number, f: number) => {
    const pc = mod12(tuningMidi[s] + f);
    if (!pcs.has(pc)) return null;
    const label = labels === 'note' ? pcName(pc, notation) : mode === 'scala' ? scaleDegree(pc, root) : chordDegree(pc, root, quality);
    return { label, kind: pc === mod12(root) ? ('root' as const) : ('tone' as const) };
  };

  return (
    <section className="page">
      <div className="seg" role="tablist" aria-label="Cosa mostrare">
        <button role="tab" aria-selected={mode === 'scala'} onClick={() => onFocus({ mode: 'scala', root, id: 'penta-min' })}>
          Scale
        </button>
        <button role="tab" aria-selected={mode === 'accordo'} onClick={() => onFocus({ mode: 'accordo', root, id: 'major' })}>
          Note dell'accordo
        </button>
      </div>

      <div className="chips keys" role="listbox" aria-label="Tonica">
        {KEYS.map((k, pc) => (
          <button key={k} role="option" aria-selected={pc === root} className="chip" onClick={() => onFocus({ ...focus, root: pc })}>
            {pcName(pc, notation)}
          </button>
        ))}
      </div>

      <label className="select-row">
        {mode === 'scala' ? 'Scala' : 'Accordo'}
        <select value={id} onChange={(e) => onFocus({ ...focus, id: e.target.value })}>
          {mode === 'scala'
            ? SCALES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            : QUALITIES.map((q) => (
                <option key={q.id} value={q.id}>
                  {chordSymbol(root, q, notation)} ({q.name})
                </option>
              ))}
        </select>
      </label>

      <header className="chord-head">
        <div>
          <h2 className="chord-title">
            {mode === 'scala' ? `${pcName(root, notation)} ${scale.name.toLowerCase()}` : chordSymbol(root, quality, notation)}
          </h2>
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

      <Fretboard tuning={tuningMidi} mark={mark} leftHanded={leftHanded} onPick={(s, f) => playNote(tuningMidi[s] + f, { a4 })} />
      <p className="hint">Scorri il manico di lato. Tocca una nota per sentirla. In evidenza la tonica.</p>
    </section>
  );
}
