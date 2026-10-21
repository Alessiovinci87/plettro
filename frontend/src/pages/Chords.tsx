import { useMemo, useState } from 'react';
import { useSettings } from '../store';
import { ChordDiagram, type DotLabel } from '../components/ChordDiagram';
import { chordPcs, chordSymbol, chordDegree, identifyChord, KEYS, mod12, pcName, QUALITIES, QUALITY_BY_ID, type Quality } from '../music/theory';
import { describe, getVoicings, sounding, workFret, type Voicing } from '../music/voicings';
import { arpeggio, strum } from '../audio/engine';

const GROUPS = ['Triadi', 'Settime', 'Seste e add', 'Sospesi', 'Estese', 'Alterate'] as const;

interface Props {
  onShowOnNeck: (rootPc: number, qualityId: string) => void;
}

export function Chords({ onShowOnNeck }: Props) {
  const [view, setView] = useState<'libro' | 'riconosci'>('libro');
  return (
    <section className="page">
      <div className="seg" role="tablist" aria-label="Sezione accordi">
        <button role="tab" aria-selected={view === 'libro'} onClick={() => setView('libro')}>
          Libro accordi
        </button>
        <button role="tab" aria-selected={view === 'riconosci'} onClick={() => setView('riconosci')}>
          Che accordo è?
        </button>
      </div>
      {view === 'libro' ? <ChordBook onShowOnNeck={onShowOnNeck} /> : <Recognizer />}
    </section>
  );
}

function ChordBook({ onShowOnNeck }: Props) {
  const { tuningMidi, isStandard, notation, tuning, a4, leftHanded } = useSettings();
  const [root, setRoot] = useState(0);
  const [qid, setQid] = useState('major');
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('Triadi');
  const [bass, setBass] = useState<number | undefined>(undefined);
  const [label, setLabel] = useState<DotLabel>('finger');
  const [open, setOpen] = useState<Voicing | null>(null);
  const q = QUALITY_BY_ID[qid];

  const voicings = useMemo(() => getVoicings(root, q, tuningMidi, isStandard, bass), [root, q, tuningMidi, isStandard, bass]);
  const symbol = chordSymbol(root, q, notation, bass);
  const tones = chordPcs(root, q).map((pc) => `${pcName(pc, notation)} (${chordDegree(pc, root, q)})`);

  return (
    <>
      <div className="picker">
        <div className="chips keys" role="listbox" aria-label="Fondamentale">
          {KEYS.map((k, pc) => (
            <button key={k} role="option" aria-selected={pc === root} className="chip" onClick={() => setRoot(pc)}>
              {pcName(pc, notation)}
            </button>
          ))}
        </div>
        <div className="chips groups" role="tablist" aria-label="Famiglia">
          {GROUPS.map((g) => (
            <button key={g} role="tab" aria-selected={g === group} className="chip chip-ghost" onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
        <div className="chips" role="listbox" aria-label="Tipo di accordo">
          {QUALITIES.filter((x) => x.group === group).map((x) => (
            <button key={x.id} role="option" aria-selected={x.id === qid} className="chip" onClick={() => setQid(x.id)} title={x.name}>
              {pcName(root, notation)}
              {x.symbol || ' maj'}
            </button>
          ))}
        </div>
      </div>

      <header className="chord-head">
        <div>
          <h2 className="chord-title">{symbol}</h2>
          <p className="chord-sub">
            {pcName(root, notation)} {q.name}: {tones.join(', ')}
          </p>
        </div>
        <label className="bass-sel">
          Basso
          <select value={bass ?? ''} onChange={(e) => setBass(e.target.value === '' ? undefined : Number(e.target.value))}>
            <option value="">fondamentale</option>
            {KEYS.map((_, pc) =>
              pc === root ? null : (
                <option key={pc} value={pc}>
                  /{pcName(pc, notation)}
                </option>
              ),
            )}
          </select>
        </label>
      </header>

      <div className="toolbar">
        <span className="tb-count">
          {voicings.length} varianti {isStandard ? '' : `in ${tuning.name}`}
        </span>
        <div className="seg seg-small" role="tablist" aria-label="Cosa mostrare nei pallini">
          {(['finger', 'note', 'degree'] as DotLabel[]).map((l) => (
            <button key={l} role="tab" aria-selected={label === l} onClick={() => setLabel(l)}>
              {l === 'finger' ? 'Dita' : l === 'note' ? 'Note' : 'Gradi'}
            </button>
          ))}
        </div>
      </div>

      {voicings.length === 0 ? (
        <p className="empty">Nessuna diteggiatura comoda in questa accordatura. Prova un altro basso o una forma più semplice.</p>
      ) : (
        <ul className="voicing-grid">
          {voicings.map((v) => {
            const wf = workFret(v);
            return (
              <li key={v.frets.join(',')}>
                <button
                  className="vcard"
                  onClick={() => {
                    strum(sounding(v, tuningMidi), { a4 });
                    setOpen(v);
                  }}
                  aria-label={`${symbol}, ${describe(v)}`}
                >
                  <span className="vc-name">{symbol}</span>
                  <ChordDiagram voicing={v} tuning={tuningMidi} rootPc={root} quality={q} label={label} notation={notation} width={146} leftHanded={leftHanded} />
                  <span className="vc-fret">Tasto {Math.max(1, wf)}</span>
                  <span className="vc-desc">{describe(v)}</span>
                  {v.source === 'generata' && <span className="vc-gen">variante calcolata</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && <VoicingSheet v={open} root={root} q={q} symbol={symbol} onClose={() => setOpen(null)} onNeck={() => onShowOnNeck(root, qid)} />}
    </>
  );
}

function VoicingSheet({ v, root, q, symbol, onClose, onNeck }: { v: Voicing; root: number; q: Quality; symbol: string; onClose: () => void; onNeck: () => void }) {
  const { tuningMidi, notation, a4, leftHanded } = useSettings();
  const notes = sounding(v, tuningMidi);
  const wf = workFret(v);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={symbol} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="chord-title">{symbol}</h2>
          <button className="btn-text" onClick={onClose}>
            Chiudi
          </button>
        </div>
        <div className="sheet-body">
          <ChordDiagram voicing={v} tuning={tuningMidi} rootPc={root} quality={q} width={220} notation={notation} leftHanded={leftHanded} />
          <div className="sheet-info">
            <p className="si-fret">{wf <= 1 ? 'Mano al 1º tasto, corde a vuoto' : `Mano al ${wf}º tasto`}</p>
            <p>{describe(v)}</p>
            <ol className="string-list">
              {notes.map((m, i) => (
                <li key={i}>
                  <span>{6 - i}ª corda</span>
                  {m === null ? (
                    <em>non suonare</em>
                  ) : (
                    <strong>
                      {v.frets[i] === 0 ? 'a vuoto' : `tasto ${v.frets[i]}${v.fingers[i] ? `, dito ${v.fingers[i]}` : ''}`} · {pcName(m, notation)} ({chordDegree(mod12(m), root, q)})
                    </strong>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="sheet-actions">
          <button className="btn-primary" onClick={() => strum(notes, { a4 })}>
            Suona giù
          </button>
          <button className="btn-secondary" onClick={() => arpeggio(notes, { a4 })}>
            Arpeggia
          </button>
          <button className="btn-secondary" onClick={onNeck}>
            Vedi sul manico
          </button>
        </div>
      </div>
    </div>
  );
}

function Recognizer() {
  const { tuningMidi, notation, a4, leftHanded } = useSettings();
  const [frets, setFrets] = useState<number[]>(() => tuningMidi.map(() => -1));
  const voicing: Voicing = { frets, fingers: frets.map(() => 0), barres: [], source: 'generata' };
  const notes = sounding(voicing, tuningMidi).filter((m): m is number => m !== null);
  const matches = identifyChord(notes).slice(0, 4);

  const toggle = (s: number, row: number) => {
    setFrets((prev) => {
      const next = [...prev];
      if (row === 0) next[s] = prev[s] === 0 ? -1 : 0;
      else next[s] = prev[s] === row ? -1 : row;
      return next;
    });
  };

  return (
    <div className="recognizer">
      <p className="hint">Tocca la griglia dove premi le dita. Tocca sopra una corda per alternare a vuoto e muta.</p>
      <div className="rec-board">
        <ChordDiagram voicing={voicing} tuning={tuningMidi} label="note" notation={notation} width={240} onToggle={toggle} frets={7} leftHanded={leftHanded} />
      </div>
      <div className="rec-result" aria-live="polite">
        {notes.length < 2 ? (
          <p className="empty">Segna almeno due note.</p>
        ) : matches.length ? (
          <>
            <h2 className="chord-title">{chordSymbol(matches[0].root, matches[0].quality, notation, matches[0].bass)}</h2>
            <p className="chord-sub">{matches[0].quality.name}</p>
            {matches.length > 1 && (
              <p className="hint">
                Si può leggere anche come: {matches.slice(1).map((m) => chordSymbol(m.root, m.quality, notation, m.bass)).join(', ')}
              </p>
            )}
          </>
        ) : (
          <p className="empty">Queste note non formano un accordo noto: {notes.map((m) => pcName(m, notation)).join(' ')}</p>
        )}
      </div>
      <div className="sheet-actions">
        <button className="btn-primary" disabled={notes.length === 0} onClick={() => strum(sounding(voicing, tuningMidi), { a4 })}>
          Ascolta
        </button>
        <button className="btn-secondary" onClick={() => setFrets(tuningMidi.map(() => -1))}>
          Azzera
        </button>
      </div>
    </div>
  );
}
