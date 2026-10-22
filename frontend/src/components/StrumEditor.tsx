// Editor di un pattern di pennata a sedicesimi: si sceglie il colpo e si toccano le caselle.
import { useState } from 'react';
import { paintStep, type StrumBrush } from '../song/edit';

const BRUSHES: { id: StrumBrush; label: string }[] = [
  { id: 'D', label: 'Giù ↓' },
  { id: 'U', label: 'Su ↑' },
  { id: 'soft', label: 'Leggera' },
  { id: '-', label: 'Vuoto' },
];

const COUNT = ['', 'e', '&', 'a'];

export interface PatternOption {
  id: string;
  name: string;
  steps: string;
  /** pattern salvato dall'utente in Ritmo */
  mine?: boolean;
}

export function StrumEditor({ steps, onChange, presets = [], idPrefix }: { steps: string; onChange: (s: string) => void; presets?: PatternOption[]; idPrefix: string }) {
  const [brush, setBrush] = useState<StrumBrush>('D');
  const usable = presets.filter((p) => p.steps.length === steps.length);

  return (
    <div className="strum-ed">
      <div className="seg seg-small strum-brush" role="tablist" aria-label="Colpo da mettere">
        {BRUSHES.map((b) => (
          <button key={b.id} role="tab" aria-selected={brush === b.id} onClick={() => setBrush(b.id)}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="strum-grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {[...steps].map((c, i) => (
          <button
            key={i}
            className={`strum-cell ${c === '-' ? 'rest' : c === c.toLowerCase() ? 'soft' : 'hit'} ${i % 4 === 0 ? 'beat' : ''}`}
            onClick={() => onChange(paintStep(steps, i, brush))}
            aria-label={`Sedicesimo ${i + 1}: ${c === '-' ? 'vuoto' : c === 'D' ? 'giù' : c === 'U' ? 'su' : c === 'x' || c === 'X' ? 'stoppata' : 'leggera'}`}
          >
            <span className="strum-count">{i % 4 === 0 ? i / 4 + 1 : COUNT[i % 4]}</span>
            <span className="strum-mark">{c === 'D' || c === 'd' ? '↓' : c === 'U' || c === 'u' ? '↑' : c === 'x' || c === 'X' ? '×' : ''}</span>
          </button>
        ))}
      </div>
      {usable.length > 0 && (
        <label className="select-row" htmlFor={`${idPrefix}-preset`}>
          Parti da
          <select
            id={`${idPrefix}-preset`}
            value=""
            onChange={(e) => {
              const p = usable.find((x) => x.id === e.target.value);
              if (p) onChange(p.steps);
            }}
          >
            <option value="">un pattern…</option>
            {usable.filter((p) => !p.mine).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {usable.some((p) => p.mine) && (
              <optgroup label="I miei">
                {usable.filter((p) => p.mine).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
    </div>
  );
}
