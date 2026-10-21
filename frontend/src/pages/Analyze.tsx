import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store';
import sample from '../data/sample-analysis.json';
import { ChordDiagram } from '../components/ChordDiagram';
import { mod12, pcName, QUALITY_BY_ID, chordSymbol, midiName } from '../music/theory';
import { getVoicings, sounding } from '../music/voicings';
import { tuningMidis, STANDARD } from '../music/tunings';
import { audio, click, strum } from '../audio/engine';

// ---- tipi del risultato (vedi backend/app/analysis/pipeline.py) ----
interface ChordSeg { symbol: string; root: number; quality: string; start: number; end: number; beats: number }
interface Effect { block: string; model: string; settings: Record<string, string | number>; why: string }
interface Section {
  label: string; start: number; end: number; bars: number; energy: number;
  dynamics: { level: number; advice: string };
  chords: ChordSeg[]; chart: string[][];
  strum: { steps: string; subdivision: string; swing: boolean; palm_mute: boolean; confidence: number; advice: string };
  tone: { gain: string; brightness: string; ambience: string; delay: string | null; compression: string };
  effects: Effect[];
  presets: { id: string | null; name: string; author?: string | null; query?: string }[];
}
export interface Analysis {
  duration: number; bpm: number; bpm_alternatives: number[]; meter: number; time_signature: string;
  key: { name: string; label: string; confidence: number; tonic: number; mode: string };
  separation: { method: string; note: string };
  chords: ChordSeg[]; sections: Section[];
  melody: { notes: { midi: number; start: number; dur: number; string: number; fret: number }[]; suggested_position: number; method: string };
  capo: { fret: number; reason: string; shapes: { sounds: string; play: string }[] };
  tuning: { id: string; name: string; reason: string };
  warnings: string[];
  example?: boolean;
}
interface JobState { status: string; progress: number; step: string; error: string | null; result: Analysis | null }

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function Analyze() {
  const { backendUrl, set } = useSettings();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<{ ok: boolean; demucs?: boolean; ffmpeg?: boolean } | null>(null);
  const poll = useRef<number | null>(null);

  useEffect(() => () => {
    if (poll.current) window.clearInterval(poll.current);
  }, []);

  async function check() {
    try {
      const r = await fetch(`${backendUrl}/health`);
      const j = await r.json();
      setServer({ ok: true, demucs: j.demucs, ffmpeg: j.ffmpeg });
    } catch {
      setServer({ ok: false });
    }
  }
  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  async function send() {
    if (!file) return;
    setError(null);
    setResult(null);
    setJob({ status: 'in coda', progress: 0, step: 'Caricamento', error: null, result: null });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${backendUrl}/analyze`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? 'Caricamento non riuscito');
      poll.current = window.setInterval(async () => {
        try {
          const s: JobState = await (await fetch(`${backendUrl}/jobs/${j.job_id}`)).json();
          setJob(s);
          if (s.status === 'completato' || s.status === 'errore') {
            window.clearInterval(poll.current!);
            poll.current = null;
            if (s.result) setResult(s.result);
            if (s.error) setError(s.error);
          }
        } catch {
          /* riprova al giro dopo */
        }
      }, 1000);
    } catch (e) {
      setJob(null);
      setError(
        e instanceof TypeError
          ? `Il server di analisi non risponde su ${backendUrl}. Avvialo dal PC (vedi README, cartella backend) e controlla l'indirizzo qui sotto.`
          : (e as Error).message,
      );
    }
  }

  const busy = job && (job.status === 'in coda' || job.status === 'in corso');

  return (
    <section className="page">
      <h2 className="page-title">Analizza un brano</h2>
      {!result && (
        <>
          <p className="hint">
            Carica un brano: ricavo tempo, tonalità, accordi, sezioni, pennata, dinamica e il suono da impostare. Il file viene cancellato appena finita l'analisi.
          </p>
          <label className="upload">
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <span>{file ? file.name : 'Scegli un file audio (MP3, WAV, M4A, FLAC)'}</span>
          </label>
          <button className="btn-primary big" disabled={!file || !!busy || server?.ok === false} onClick={send}>
            {busy ? 'Analisi in corso…' : 'Analizza brano'}
          </button>
          {busy && (
            <div className="progress" role="progressbar" aria-valuenow={Math.round(job!.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.max(4, job!.progress * 100)}%` }} />
              <span>{job!.step}</span>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn-secondary" onClick={() => setResult(sample as unknown as Analysis)}>
            Vedi un esempio di analisi
          </button>
          <details className="server">
            <summary>
              Server di analisi:{' '}
              {server === null ? 'controllo…' : server.ok ? `collegato${server.demucs ? ', con separazione chitarra' : ', senza separazione'}` : 'non raggiungibile'}
            </summary>
            <label className="select-row">
              Indirizzo
              <input className="text-in" value={backendUrl} onChange={(e) => set({ backendUrl: e.target.value.replace(/\/$/, '') })} inputMode="url" />
            </label>
            <p className="hint">Dal telefono usa l'indirizzo del PC sulla stessa rete Wi-Fi, per esempio http://192.168.1.20:8000.</p>
            <button className="btn-text" onClick={check}>
              Riprova la connessione
            </button>
          </details>
        </>
      )}
      {result && <Report r={result} onReset={() => { setResult(null); setJob(null); }} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

const ROOT_OF: Record<string, number> = { C: 0, 'C#': 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const SUFFIX_TO_Q: [string, string][] = [['maj7', 'maj7'], ['m7', 'm7'], ['sus4', 'sus4'], ['sus2', 'sus2'], ['dim', 'dim'], ['7', '7'], ['m', 'minor'], ['5', '5'], ['', 'major']];

function parseSymbol(sym: string): { root: number; q: string } | null {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(sym);
  if (!m || ROOT_OF[m[1]] === undefined) return null;
  const q = SUFFIX_TO_Q.find(([s]) => s === m[2])?.[1];
  return q ? { root: ROOT_OF[m[1]], q } : null;
}

function Report({ r, onReset }: { r: Analysis; onReset: () => void }) {
  const { notation, a4 } = useSettings();
  const [bpm, setBpm] = useState(r.bpm);
  const [capo, setCapo] = useState(r.capo.fret);
  const [chord, setChord] = useState<string | null>(null);
  const sym = (s: string) => {
    const p = parseSymbol(s);
    if (!p) return s;
    return chordSymbol(mod12(p.root - capo), QUALITY_BY_ID[p.q], notation);
  };
  const std = tuningMidis(STANDARD);

  const playPattern = (steps: string, chords: ChordSeg[]) => {
    const c = audio();
    const p = parseSymbol(chords[0]?.symbol ?? 'G');
    const v = p ? getVoicings(mod12(p.root - capo), QUALITY_BY_ID[p.q], std, true)[0] : null;
    if (!v) return;
    const notes = sounding(v, std).map((m) => (m === null ? null : m + capo));
    const stepDur = 60 / bpm / 4;
    const t0 = c.currentTime + 0.1;
    for (let rep = 0; rep < 2; rep++)
      steps.split('').forEach((ch, i) => {
        const t = t0 + (rep * steps.length + i) * stepDur;
        if (i % 4 === 0) click(t, i === 0);
        if (ch === '-') return;
        strum(notes, { when: t, up: ch === 'U' || ch === 'u', gain: ch === ch.toLowerCase() ? 0.17 : 0.3, a4 });
      });
  };

  return (
    <div className="report">
      <div className="report-head">
        <button className="btn-text" onClick={onReset}>
          Analizza un altro brano
        </button>
        {r.example && <span className="tag">esempio su un brano di prova</span>}
      </div>

      <dl className="facts">
        <div>
          <dt>Tempo</dt>
          <dd>
            {Math.round(bpm)} <small>bpm</small>
          </dd>
          <div className="mini-seg">
            <button onClick={() => setBpm(r.bpm_alternatives[0])} aria-pressed={bpm === r.bpm_alternatives[0]}>½</button>
            <button onClick={() => setBpm(r.bpm)} aria-pressed={bpm === r.bpm}>=</button>
            <button onClick={() => setBpm(r.bpm_alternatives[1])} aria-pressed={bpm === r.bpm_alternatives[1]}>×2</button>
          </div>
        </div>
        <div>
          <dt>Tonalità</dt>
          <dd>{r.key.name.replace(/^([A-G][#b]?)/, (n) => pcName(ROOT_OF[n], notation))}</dd>
          <small>{r.time_signature}</small>
        </div>
        <div>
          <dt>Capotasto</dt>
          <dd>{capo ? `${capo}º` : 'no'}</dd>
          <div className="mini-seg">
            <button onClick={() => setCapo(Math.max(0, capo - 1))} aria-label="Capotasto giù">−</button>
            <button onClick={() => setCapo(Math.min(9, capo + 1))} aria-label="Capotasto su">+</button>
          </div>
        </div>
        <div>
          <dt>Accordatura</dt>
          <dd className="dd-small">{r.tuning.name}</dd>
        </div>
      </dl>
      <p className="hint">{r.tuning.reason} {r.capo.fret ? r.capo.reason : ''}</p>
      {capo > 0 && <p className="hint">Con il capotasto al {capo}º tasto gli accordi qui sotto sono già trasposti nelle forme da suonare.</p>}
      {r.warnings.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}

      {r.sections.map((s, i) => (
        <article key={i} className="sec">
          <header className="sec-head">
            <h3>{s.label}</h3>
            <span>
              {fmt(s.start)}–{fmt(s.end)} · {s.bars} battute
            </span>
          </header>

          <div className="sec-block">
            <h4>Accordi</h4>
            <div className="chart">
              {s.chart.map((bar, b) => (
                <div key={b} className="bar">
                  {bar.map((c, k) =>
                    c === '–' ? (
                      <span key={k} className="nc">–</span>
                    ) : (
                      <button key={k} className="chord-chip" onClick={() => setChord(c)}>
                        {sym(c)}
                      </button>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="sec-block">
            <h4>
              Pennata <small>{s.strum.subdivision}{s.strum.swing ? ', swing' : ''}{s.strum.palm_mute ? ', palm mute' : ''}</small>
            </h4>
            <div className="beat-grid is-pattern" style={{ gridTemplateColumns: `repeat(${s.strum.steps.length}, 1fr)` }}>
              {s.strum.steps.split('').map((c, k) => (
                <span key={k} className={`bg-cell ${c === '-' ? 'is-rest' : ''} ${c !== '-' && c === c.toLowerCase() ? 'is-soft' : ''}`}>
                  {c === 'D' || c === 'd' ? '↓' : c === 'U' || c === 'u' ? '↑' : ''}
                </span>
              ))}
            </div>
            <p>{s.strum.advice}</p>
            <button className="btn-secondary" onClick={() => playPattern(s.strum.steps, s.chords)}>
              Ascolta il ritmo
            </button>
          </div>

          <div className="sec-block">
            <h4>Dinamica</h4>
            <div className="meter" aria-label={`Intensità ${s.dynamics.level} su 5`}>
              {[1, 2, 3, 4, 5].map((l) => (
                <span key={l} className={l <= s.dynamics.level ? 'on' : ''} />
              ))}
            </div>
            <p>{s.dynamics.advice}</p>
          </div>

          <div className="sec-block">
            <h4>
              Suono <small>{s.tone.gain}, {s.tone.brightness}, ambiente {s.tone.ambience}{s.tone.delay ? `, delay ${s.tone.delay}` : ''}</small>
            </h4>
            <ol className="chain">
              {s.effects.map((e, k) => (
                <li key={k}>
                  <strong>{e.block}</strong> <span className="model">{e.model}</span>
                  <span className="settings">
                    {Object.entries(e.settings)
                      .map(([a, b]) => `${a} ${b}`)
                      .join(' · ')}
                  </span>
                  <span className="why">{e.why}</span>
                </li>
              ))}
            </ol>
            {s.presets[0]?.id === null && s.presets[0]?.query && <p className="hint">Da cercare in PresetDock: “{s.presets[0].query}”.</p>}
            {s.presets.filter((p) => p.id).map((p) => (
              <p key={p.id!} className="hint">
                Preset PresetDock: {p.name} {p.author ? `di ${p.author}` : ''}
              </p>
            ))}
          </div>
        </article>
      ))}

      {r.melody.notes.length > 0 && (
        <article className="sec">
          <header className="sec-head">
            <h3>Melodia</h3>
            <span>indicativa</span>
          </header>
          <p className="hint">
            Le prime note, con la posizione consigliata{r.melody.suggested_position ? ` (mano intorno al ${r.melody.suggested_position}º tasto)` : ''}.
          </p>
          <ol className="mel">
            {r.melody.notes.slice(0, 24).map((n, k) => (
              <li key={k}>
                <strong>{midiName(n.midi, notation)}</strong>
                <span>
                  {n.string}ª corda, {n.fret === 0 ? 'a vuoto' : `${n.fret}º tasto`}
                </span>
              </li>
            ))}
          </ol>
        </article>
      )}

      <p className="hint">Separazione: {r.separation.note}</p>

      {chord && <ChordPopup symbol={chord} capo={capo} onClose={() => setChord(null)} />}
    </div>
  );
}

function ChordPopup({ symbol, capo, onClose }: { symbol: string; capo: number; onClose: () => void }) {
  const { notation, a4 } = useSettings();
  const p = parseSymbol(symbol);
  const std = tuningMidis(STANDARD);
  const root = p ? mod12(p.root - capo) : 0;
  const q = QUALITY_BY_ID[p?.q ?? 'major'];
  const vs = p ? getVoicings(root, q, std, true).slice(0, 4) : [];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 className="chord-title">{chordSymbol(root, q, notation)}</h2>
          <button className="btn-text" onClick={onClose}>
            Chiudi
          </button>
        </div>
        {capo > 0 && <p className="hint">Forma da suonare con il capotasto al {capo}º tasto (suona come {symbol}).</p>}
        <ul className="voicing-grid">
          {vs.map((v) => (
            <li key={v.frets.join(',')}>
              <button className="vcard" onClick={() => strum(sounding(v, std).map((m) => (m === null ? null : m + capo)), { a4 })}>
                <ChordDiagram voicing={v} tuning={std} rootPc={root} quality={q} width={146} notation={notation} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
