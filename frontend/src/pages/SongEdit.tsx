// Correzione manuale nel player: scelta dell'accordo di una battuta e modifica della sezione.
import { useState } from 'react';
import { chordSymbol, mod12, pcName, QUALITY_BY_ID, type Notation, type Quality } from '../music/theory';
import { STRUM_PATTERNS } from '../music/rhythm';
import { loadPatterns } from '../music/patterns';
import { canMoveSectionStart, choiceSymbol, describeStrum, moveSectionStart, renameSection, setSectionStrum, suggestedChords, type ChordChoice } from '../song/edit';
import { StrumEditor, type PatternOption } from '../components/StrumEditor';
import type { Analysis } from './analysis-types';

/** Tipi d'accordo proposti nel selettore, dal più comune. */
const TYPES = ['major', 'minor', '7', 'm7', 'maj7', 'sus2', 'sus4', '5', 'add9', '6', 'm6', '9', 'dim', 'm7b5', 'aug', '7sus4'].map((id) => QUALITY_BY_ID[id]);
const typeLabel = (q: Quality) => (q.id === 'major' ? 'maggiore' : q.id === 'minor' ? 'minore' : q.symbol);

export const SECTION_PATTERNS: PatternOption[] = STRUM_PATTERNS.map((p) => ({ id: p.id, name: p.name, steps: p.steps }));

/**
 * Scelta dell'accordo per una battuta. I nomi mostrati sono quelli da suonare con il capotasto;
 * nell'analisi si salva il suono reale (forma + capotasto).
 */
export function ChordPicker({ a, capo, notation, bar, current, onPick, onCancel }: {
  a: Analysis; capo: number; notation: Notation; bar: number; current: string; onPick: (c: ChordChoice | null) => void; onCancel: () => void;
}) {
  const [root, setRoot] = useState<number | null>(null);
  const [quality, setQuality] = useState<Quality>(QUALITY_BY_ID.major);
  const shown = (c: ChordChoice) => chordSymbol(mod12(c.root - capo), c.quality, notation);
  const suggestions = suggestedChords(a);
  const custom = root === null ? null : { root: mod12(root + capo), quality };

  return (
    <div className="chord-pick" role="group" aria-label={`Accordo della battuta ${bar + 1}`}>
      <p className="cp-head">
        Battuta {bar + 1} · ora <strong>{current}</strong>
        {capo > 0 && <small> · nomi con capotasto al {capo}º</small>}
      </p>
      <p className="cp-label">Della tonalità e del brano</p>
      <div className="cp-chips">
        {suggestions.map((c) => (
          <button key={choiceSymbol(c)} className="chip" onClick={() => onPick(c)}>
            {shown(c)}
          </button>
        ))}
      </div>
      <p className="cp-label">Altro accordo</p>
      <div className="cp-chips cp-roots" role="tablist" aria-label="Tonica">
        {Array.from({ length: 12 }, (_, pc) => (
          <button key={pc} role="tab" className="chip" aria-selected={root === pc} onClick={() => setRoot(pc)}>
            {pcName(pc, notation)}
          </button>
        ))}
      </div>
      <div className="cp-chips" role="tablist" aria-label="Tipo">
        {TYPES.map((q) => (
          <button key={q.id} role="tab" className="chip chip-ghost" aria-selected={quality.id === q.id} onClick={() => setQuality(q)} title={q.name}>
            {typeLabel(q)}
          </button>
        ))}
      </div>
      <div className="cp-actions">
        <button className="btn-primary small" disabled={!custom} onClick={() => custom && onPick(custom)}>
          {custom ? `Metti ${chordSymbol(root!, quality, notation)}` : 'Scegli la tonica'}
        </button>
        <button className="btn-text" onClick={() => onPick(null)}>
          Nessun accordo
        </button>
        <button className="btn-text" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  );
}

/** Strumenti di modifica in testa a una sezione: nome, inizio, pennata. */
export function SectionEditor({ a, index, onApply }: { a: Analysis; index: number; onApply: (next: Analysis) => void }) {
  const s = a.sections[index];
  const [name, setName] = useState(s.label);
  const [strum, setStrum] = useState<string | null>(null);
  // i pattern salvati in Ritmo, letti quando si apre la sezione
  const [presets] = useState<PatternOption[]>(() => [...SECTION_PATTERNS, ...loadPatterns().map((p) => ({ id: p.id, name: p.name, steps: p.steps, mine: true }))]);
  const id = `se-${index}`;

  return (
    <div className="sec-edit">
      <form
        className="se-row"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(renameSection(a, index, name));
        }}
      >
        <label className="sr-only" htmlFor={`${id}-name`}>
          Nome della sezione
        </label>
        <input id={`${id}-name`} className="text-in" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== s.label && onApply(renameSection(a, index, name))} />
        <button className="btn-secondary small" type="submit" disabled={!name.trim() || name.trim() === s.label}>
          Rinomina
        </button>
      </form>
      {index > 0 && (
        <div className="se-row se-move" role="group" aria-label="Inizio della sezione">
          <span>Inizio</span>
          <button className="btn-secondary small" disabled={!canMoveSectionStart(a, index, -1)} onClick={() => onApply(moveSectionStart(a, index, -1))}>
            − 1 battuta
          </button>
          <button className="btn-secondary small" disabled={!canMoveSectionStart(a, index, 1)} onClick={() => onApply(moveSectionStart(a, index, 1))}>
            + 1 battuta
          </button>
        </div>
      )}
      {strum === null ? (
        <button className="btn-text se-strum-open" onClick={() => setStrum(s.strum.steps)}>
          Cambia la pennata
        </button>
      ) : (
        <div className="se-strum">
          <StrumEditor steps={strum} onChange={setStrum} presets={presets} idPrefix={id} />
          <p className="hint">{describeStrum(strum)}</p>
          <div className="cp-actions">
            <button
              className="btn-primary small"
              onClick={() => {
                onApply(setSectionStrum(a, index, strum));
                setStrum(null);
              }}
            >
              Usa questa pennata
            </button>
            <button className="btn-text" onClick={() => setStrum(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
