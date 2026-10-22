import { useState } from 'react';
import { useSettings } from '../store';
import { changesFromStandard, STYLES, suggestTunings, TUNINGS, tuningMidis, type Style } from '../music/tunings';
import { KEYS, midiName, pcName } from '../music/theory';
import { arpeggio } from '../audio/engine';

export function Tunings({ onDone }: { onDone: () => void }) {
  const { tuningId, notation, set, a4, leftHanded } = useSettings();
  const [key, setKey] = useState('E');
  const [minor, setMinor] = useState(false);
  const [style, setStyle] = useState<Style>('pop');
  const suggestions = suggestTunings(key + (minor ? 'm' : ''), style);
  const cats = [...new Set(TUNINGS.map((t) => t.category))];

  const choose = (id: string) => {
    set({ tuningId: id });
    onDone();
  };

  return (
    <section className="page">

      <div className="panel">
        <h3 className="h-sub">Quale accordatura per il mio brano?</h3>
        <div className="opts">
          <label className="select-row">
            Tonalità
            <select value={key} onChange={(e) => setKey(e.target.value)}>
              {KEYS.map((k, pc) => (
                <option key={k} value={k}>
                  {pcName(pc, notation)}
                </option>
              ))}
            </select>
            <select value={minor ? 'm' : ''} onChange={(e) => setMinor(e.target.value === 'm')} aria-label="Modo">
              <option value="">maggiore</option>
              <option value="m">minore</option>
            </select>
          </label>
          <label className="select-row">
            Stile
            <select value={style} onChange={(e) => setStyle(e.target.value as Style)}>
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ol className="suggest-list">
          {suggestions.map((s) => (
            <li key={s.tuning.id}>
              <div>
                <strong>{s.tuning.name}</strong>
                {s.capo ? <span className="tag">capotasto {s.capo}º</span> : null}
                <p>{s.reasons.join('. ') || s.tuning.description}.</p>
              </div>
              <button className="btn-secondary" onClick={() => choose(s.tuning.id)}>
                Usa
              </button>
            </li>
          ))}
        </ol>
      </div>

      {cats.map((cat) => (
        <div key={cat}>
          <h3 className="h-sub">{cat}</h3>
          <ul className="tuning-list">
            {TUNINGS.filter((t) => t.category === cat).map((t) => {
              const changes = changesFromStandard(t, notation);
              return (
                <li key={t.id} className={t.id === tuningId ? 'is-active' : ''}>
                  <div className="tl-head">
                    <div>
                      <strong>{t.name}</strong>
                      <span className="tl-notes">{tuningMidis(t).map((m) => pcName(m, notation)).join(' ')}</span>
                    </div>
                    <div className="tl-actions">
                      <button className="btn-text" onClick={() => arpeggio(tuningMidis(t), { a4, gap: 0.3 })}>
                        Ascolta
                      </button>
                      {t.id === tuningId ? (
                        <span className="tag tag-on">In uso</span>
                      ) : (
                        <button className="btn-secondary" onClick={() => choose(t.id)}>
                          Usa
                        </button>
                      )}
                    </div>
                  </div>
                  <p>{t.description}</p>
                  {changes.length > 0 && (
                    <p className="tl-changes">
                      Dallo standard:{' '}
                      {changes.map((c) => `${c.string}ª ${c.from}→${c.to} (${c.semitones > 0 ? '+' : ''}${c.semitones})`).join(', ')}
                    </p>
                  )}
                  <details>
                    <summary>Consigli</summary>
                    <ul>
                      {t.tips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                      <li>Adatta a: {t.goodFor.join(', ')}.</li>
                      {t.examples && <li>Usata da: {t.examples.join(', ')}.</li>}
                      <li>Corde: {tuningMidis(t).map((m) => midiName(m, notation)).join(' ')}</li>
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="panel">
        <h3 className="h-sub">Preferenze</h3>
        <label className="select-row">
          Nomi delle note
          <select value={notation} onChange={(e) => set({ notation: e.target.value as 'intl' | 'it' })}>
            <option value="intl">C D E (internazionale)</option>
            <option value="it">Do Re Mi (italiana)</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={leftHanded} onChange={(e) => set({ leftHanded: e.target.checked })} /> Chitarra mancina (diagrammi e manico a specchio)
        </label>
      </div>
    </section>
  );
}
