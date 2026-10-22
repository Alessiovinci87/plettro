import { useMemo, useState, type FormEvent } from 'react';
import { useSettings } from '../store';
import { ChordDiagram, type DotLabel } from '../components/ChordDiagram';
import { chordPcs, chordSymbol, chordDegree, identifyChord, KEYS, mod12, parseChord, pcName, QUALITIES, QUALITY_BY_ID, type Quality } from '../music/theory';
import { describe, diagramBaseFret, getVoicings, sounding, workFret, type Voicing } from '../music/voicings';
import { diatonicChords, KEY_MODES } from '../music/diatonic';
import { FAVORITES_KEY, isFavorite, parseFavorites, toggleFavorite, type Favorite } from '../music/favorites';
import { arpeggio, strum } from '../audio/engine';

const GROUPS = ['Triadi', 'Settime', 'Seste e add', 'Sospesi', 'Estese', 'Alterate'] as const;
type Group = (typeof GROUPS)[number];

/** Forma della mano in una parola: il tasto è già scritto sopra il diagramma. */
function shape(v: Voicing): string {
  const fs = v.frets.filter((f) => f > 0);
  if (!fs.length) return 'A vuoto';
  if (v.frets.some((f) => f === 0) && Math.max(...fs) <= 4) return 'Aperto';
  return v.barres.length ? 'Barrè' : 'Chiuso';
}

/** Righe comuni a tutti i diagrammi di una griglia, così le card sono uguali. */
function rowsFor(vs: Voicing[]): number {
  return Math.max(
    4,
    ...vs.map((v) => {
      const fs = v.frets.filter((f) => f > 0);
      return fs.length ? Math.max(...fs) - diagramBaseFret(v) + 1 : 0;
    }),
  );
}

interface Props {
  onShowOnNeck: (rootPc: number, qualityId: string) => void;
}

/** L'accordo scelto nel libro: resta lo stesso passando da una vista all'altra. */
interface Pick {
  root: number;
  qid: string;
  bass?: number;
}

/** Una variante precisa di un accordo: quella di una card o del foglio di dettaglio. */
interface Opened {
  v: Voicing;
  root: number;
  q: Quality;
  bass?: number;
}

interface StarState {
  on: boolean;
  onToggle: () => void;
}
type StarFor = (o: Opened) => StarState;

type View = 'libro' | 'tonalita' | 'miei' | 'riconosci';
const VIEWS: { id: View; label: string }[] = [
  { id: 'libro', label: 'Varianti' },
  { id: 'tonalita', label: 'Tonalità' },
  { id: 'miei', label: 'I miei' },
  { id: 'riconosci', label: 'Riconosci' },
];

function useFavorites() {
  const [list, setList] = useState<Favorite[]>(() => {
    try {
      return parseFavorites(localStorage.getItem(FAVORITES_KEY));
    } catch {
      return [];
    }
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const toggle = (f: Omit<Favorite, 'at'>) => {
    const next = toggleFavorite(list, f, Date.now());
    setList(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  };
  return { list, toggle, saveFailed };
}

export function Chords({ onShowOnNeck }: Props) {
  const [view, setView] = useState<View>('libro');
  const [pick, setPick] = useState<Pick>({ root: 0, qid: 'major' });
  const [opened, setOpened] = useState<Opened | null>(null);
  const favs = useFavorites();
  const { tuning } = useSettings();

  const favOf = (o: Opened) => ({ tuningId: tuning.id, root: o.root, quality: o.q.id, bass: o.bass, frets: o.v.frets });
  const star: StarFor = (o) => ({ on: isFavorite(favs.list, favOf(o)), onToggle: () => favs.toggle(favOf(o)) });

  return (
    <section className="page">
      <div className="seg" role="tablist" aria-label="Sezione accordi">
        {VIEWS.map((x) => (
          <button key={x.id} role="tab" aria-selected={view === x.id} onClick={() => setView(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {favs.saveFailed && <p className="error">Non riesco a salvare i preferiti in questo browser.</p>}
      {view === 'libro' && <ChordBook pick={pick} onPick={setPick} onOpen={setOpened} star={star} />}
      {view === 'tonalita' && <KeyChords onOpen={setOpened} star={star} />}
      {view === 'miei' && <MyChords list={favs.list} onOpen={setOpened} star={star} onBrowse={() => setView('libro')} />}
      {view === 'riconosci' && <Recognizer />}

      {opened && (
        <VoicingSheet
          v={opened.v}
          root={opened.root}
          q={opened.q}
          bass={opened.bass}
          star={star(opened)}
          onClose={() => setOpened(null)}
          onNeck={() => onShowOnNeck(opened.root, opened.q.id)}
          onVariants={
            view === 'libro'
              ? undefined
              : () => {
                  setPick({ root: opened.root, qid: opened.q.id, bass: opened.bass });
                  setOpened(null);
                  setView('libro');
                }
          }
        />
      )}
    </section>
  );
}

function Star({ on, onToggle, name }: StarState & { name: string }) {
  return (
    <button
      className="vstar"
      aria-pressed={on}
      aria-label={on ? `Togli ${name} dai miei accordi` : `Aggiungi ${name} ai miei accordi`}
      title={on ? 'Togli dai miei' : 'Aggiungi ai miei'}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" />
      </svg>
    </button>
  );
}

/** Una card della griglia: diagramma da toccare e stellina accanto. */
function VoicingCard({
  o, top, bottom, label, rows, star, onOpen, gen,
}: { o: Opened; top: string; bottom: string; label: DotLabel; rows: number; star: StarFor; onOpen: (o: Opened) => void; gen?: boolean }) {
  const { tuningMidi, notation, a4, leftHanded } = useSettings();
  const name = chordSymbol(o.root, o.q, notation, o.bass);
  return (
    <li>
      <button
        className="vcard"
        onClick={() => {
          strum(sounding(o.v, tuningMidi), { a4 });
          onOpen(o);
        }}
        aria-label={`${name}, ${describe(o.v)}${gen ? ', variante calcolata' : ''}`}
      >
        <span className="vc-fret">{top}</span>
        <ChordDiagram voicing={o.v} tuning={tuningMidi} rootPc={o.root} quality={o.q} label={label} notation={notation} width={150} frets={rows} leftHanded={leftHanded} />
        <span className="vc-desc">{bottom}</span>
        {gen && <i className="gen-dot vc-gen" title="Variante calcolata" aria-hidden="true" />}
      </button>
      <Star {...star(o)} name={name} />
    </li>
  );
}

function ChordBook({ pick, onPick, onOpen, star }: { pick: Pick; onPick: (p: Pick) => void; onOpen: (o: Opened) => void; star: StarFor }) {
  const { tuningMidi, isStandard, notation, tuning } = useSettings();
  const { root, qid, bass } = pick;
  const q = QUALITY_BY_ID[qid] ?? QUALITIES[0];
  const [group, setGroup] = useState<Group>(q.group);
  const [label, setLabel] = useState<DotLabel>('finger');
  const [query, setQuery] = useState('');
  const [notFound, setNotFound] = useState(false);

  const voicings = useMemo(() => getVoicings(root, q, tuningMidi, isStandard, bass), [root, q, tuningMidi, isStandard, bass]);
  const rows = rowsFor(voicings);
  const anyGen = voicings.some((v) => v.source === 'generata');
  const symbol = chordSymbol(root, q, notation, bass);
  const tones = chordPcs(root, q).map((pc) => `${pcName(pc, notation)} (${chordDegree(pc, root, q)})`);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const r = parseChord(query);
    if (!r) {
      setNotFound(query.trim().length > 0);
      return;
    }
    setNotFound(false);
    setGroup(r.quality.group);
    onPick({ root: r.root, qid: r.quality.id, bass: r.bass === r.root ? undefined : r.bass });
  };

  return (
    <>
      <form className="chord-search" role="search" onSubmit={search}>
        <input
          className="text-in"
          type="search"
          aria-label="Cerca un accordo per nome"
          value={query}
          placeholder="Cerca: F#m7b5, Do maj7, Bb/D"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotFound(false);
          }}
        />
        <button className="btn-secondary" type="submit">
          Cerca
        </button>
      </form>
      {notFound && (
        <p className="error" role="status">
          Non conosco «{query.trim()}». Prova F#m7b5, Do maj7 o Bb/D.
        </p>
      )}

      <div className="picker">
        <div className="chips keys" role="listbox" aria-label="Fondamentale">
          {KEYS.map((k, pc) => (
            <button key={k} role="option" aria-selected={pc === root} className="chip" onClick={() => onPick({ root: pc, qid, bass: bass === pc ? undefined : bass })}>
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
            <button key={x.id} role="option" aria-selected={x.id === qid} className="chip" onClick={() => onPick({ root, qid: x.id, bass })} title={x.name}>
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
          <select value={bass ?? ''} onChange={(e) => onPick({ root, qid, bass: e.target.value === '' ? undefined : Number(e.target.value) })}>
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
          {anyGen && (
            <span className="tb-legend">
              <i className="gen-dot" aria-hidden="true" /> calcolata
            </span>
          )}
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
          {voicings.map((v) => (
            <VoicingCard
              key={v.frets.join(',')}
              o={{ v, root, q, bass }}
              top={`Tasto ${Math.max(1, workFret(v))}`}
              bottom={shape(v)}
              label={label}
              rows={rows}
              star={star}
              onOpen={onOpen}
              gen={v.source === 'generata'}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/** I 7 accordi di una tonalità, ciascuno con la sua prima diteggiatura. */
function KeyChords({ onOpen, star }: { onOpen: (o: Opened) => void; star: StarFor }) {
  const { tuningMidi, isStandard, notation } = useSettings();
  const [tonic, setTonic] = useState(0);
  const [modeId, setModeId] = useState('major');
  const [sevenths, setSevenths] = useState(false);
  const mode = KEY_MODES.find((m) => m.id === modeId) ?? KEY_MODES[0];

  const cards = useMemo(
    () => diatonicChords(tonic, mode.intervals, sevenths).map((c) => ({ c, v: getVoicings(c.root, c.quality, tuningMidi, isStandard).at(0) })),
    [tonic, mode, sevenths, tuningMidi, isStandard],
  );
  const rows = rowsFor(cards.flatMap((x) => (x.v ? [x.v] : [])));
  const modeName = mode.name.replace(/\s*\(.*\)$/, '').toLowerCase();

  return (
    <>
      <div className="picker">
        <div className="chips keys" role="listbox" aria-label="Tonalità">
          {KEYS.map((k, pc) => (
            <button key={k} role="option" aria-selected={pc === tonic} className="chip" onClick={() => setTonic(pc)}>
              {pcName(pc, notation)}
            </button>
          ))}
        </div>
        <div className="key-opts">
          <label className="bass-sel">
            Modo
            <select value={mode.id} onChange={(e) => setModeId(e.target.value)}>
              {KEY_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <div className="seg seg-small" role="tablist" aria-label="Accordi a tre o quattro note">
            <button role="tab" aria-selected={!sevenths} onClick={() => setSevenths(false)}>
              Triadi
            </button>
            <button role="tab" aria-selected={sevenths} onClick={() => setSevenths(true)}>
              Settime
            </button>
          </div>
        </div>
      </div>

      <header className="chord-head">
        <div>
          <h2 className="chord-title">
            {pcName(tonic, notation)} {modeName}
          </h2>
          <p className="chord-sub">{mode.hint} Tocca un accordo per sentirlo.</p>
        </div>
      </header>

      <ul className="voicing-grid">
        {cards.map(({ c, v }) =>
          v ? (
            <VoicingCard
              key={c.degree}
              o={{ v, root: c.root, q: c.quality }}
              top={c.roman}
              bottom={chordSymbol(c.root, c.quality, notation)}
              label="finger"
              rows={rows}
              star={star}
              onOpen={onOpen}
              gen={v.source === 'generata'}
            />
          ) : (
            <li key={c.degree}>
              <div className="vcard vcard-empty">
                <span className="vc-fret">{c.roman}</span>
                <span className="vc-desc">Nessuna forma comoda</span>
                <span className="vc-desc">{chordSymbol(c.root, c.quality, notation)}</span>
              </div>
            </li>
          ),
        )}
      </ul>
    </>
  );
}

/** Le varianti con la stellina nell'accordatura attuale; quelle delle altre sono solo contate. */
function MyChords({ list, onOpen, star, onBrowse }: { list: Favorite[]; onOpen: (o: Opened) => void; star: StarFor; onBrowse: () => void }) {
  const { tuningMidi, isStandard, tuning, notation } = useSettings();
  const here = list.filter((f) => f.tuningId === tuning.id && f.frets.length === tuningMidi.length && QUALITY_BY_ID[f.quality]);
  const elsewhere = list.length - here.length;
  const items: Opened[] = here.map((f) => {
    const q = QUALITY_BY_ID[f.quality];
    // dita e barrè dalla libreria, se la forma c'è ancora
    const known = getVoicings(f.root, q, tuningMidi, isStandard, f.bass).find((v) => v.frets.join(',') === f.frets.join(','));
    return { root: f.root, q, bass: f.bass, v: known ?? { frets: f.frets, fingers: f.frets.map(() => 0), barres: [], source: 'generata' } };
  });
  const rows = rowsFor(items.map((o) => o.v));

  if (!items.length)
    return (
      <div className="my-empty">
        <p className="empty">
          {elsewhere ? `Hai ${elsewhere} ${elsewhere === 1 ? 'accordo salvato' : 'accordi salvati'} in altre accordature. ` : ''}
          Tocca la stellina su una variante per ritrovarla qui.
        </p>
        <button className="btn-secondary" onClick={onBrowse}>
          Sfoglia le varianti
        </button>
      </div>
    );

  return (
    <>
      <div className="toolbar">
        <span className="tb-count">
          {items.length} {items.length === 1 ? 'accordo' : 'accordi'}
          {isStandard ? '' : ` in ${tuning.name}`}
          {elsewhere > 0 && ` · altri ${elsewhere} in altre accordature`}
        </span>
      </div>
      <ul className="voicing-grid">
        {items.map((o) => (
          <VoicingCard
            key={`${o.root}|${o.q.id}|${o.bass ?? ''}|${o.v.frets.join(',')}`}
            o={o}
            top={chordSymbol(o.root, o.q, notation, o.bass)}
            bottom={shape(o.v) === 'Aperto' ? 'Aperto' : `${shape(o.v)}, tasto ${Math.max(1, workFret(o.v))}`}
            label="finger"
            rows={rows}
            star={star}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </>
  );
}

function VoicingSheet({
  v, root, q, bass, star, onClose, onNeck, onVariants,
}: { v: Voicing; root: number; q: Quality; bass?: number; star: StarState; onClose: () => void; onNeck: () => void; onVariants?: () => void }) {
  const { tuningMidi, notation, a4, leftHanded } = useSettings();
  const symbol = chordSymbol(root, q, notation, bass);
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
          <button className="btn-secondary" aria-pressed={star.on} onClick={star.onToggle}>
            {star.on ? '★ Nei miei' : '☆ Aggiungi ai miei'}
          </button>
          {onVariants && (
            <button className="btn-secondary" onClick={onVariants}>
              Altre varianti
            </button>
          )}
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
