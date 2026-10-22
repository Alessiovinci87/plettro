import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store';
import sample from '../data/sample-analysis.json';
import { Player } from './Player';
import type { Analysis } from './analysis-types';
import { needsHttps } from './serverUrl';
import { SongLibrary } from './SongLibrary';
import { library, titleFromFile, type SongMeta } from '../song/library';

export type { Analysis } from './analysis-types';

interface JobState {
  status: string;
  progress: number;
  step: string;
  error: string | null;
  result: Analysis | null;
}

/** Audio del brano di prova: file accanto all'app, o incorporato nella demo. */
const SAMPLE_AUDIO = (globalThis as { PLETTRO_SAMPLE_AUDIO?: string }).PLETTRO_SAMPLE_AUDIO ?? './sample.mp3';

/** Brano aperto nel player. `songId` è null per il brano d'esempio o se il salvataggio non è riuscito. */
interface OpenSong {
  a: Analysis;
  audio: string | null;
  title: string;
  songId: string | null;
  notice?: string;
  /** Per i brani della libreria: analisi del server e stato delle correzioni. */
  original?: Analysis;
  edited?: boolean;
}

export function Analyze() {
  const { backendUrl, set } = useSettings();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [song, setSong] = useState<OpenSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<{ ok: boolean; demucs?: boolean } | null>(null);
  const poll = useRef<number | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (poll.current) window.clearInterval(poll.current);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  async function check() {
    try {
      const j = await (await fetch(`${backendUrl}/health`)).json();
      setServer({ ok: true, demucs: j.demucs });
    } catch {
      setServer({ ok: false });
    }
  }
  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  function open(s: OpenSong) {
    setSong(s);
    window.scrollTo({ top: 0 });
  }

  /** Audio in un URL temporaneo: uno solo alla volta, liberato al cambio di brano. */
  function audioUrlFor(blob: Blob | null): string | null {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = blob ? URL.createObjectURL(blob) : null;
    return objectUrl.current;
  }

  async function openSaved(m: SongMeta) {
    const { meta, data } = await library().load(m.id);
    open({ a: data.analysis, original: data.original, edited: meta.edited, audio: audioUrlFor(data.audio), title: meta.title, songId: m.id });
  }

  /** Dopo un'analisi riuscita: il player si apre subito, il salvataggio va in parallelo. */
  function openAndSave(result: Analysis, f: File) {
    const title = titleFromFile(f.name) || 'Brano senza titolo';
    open({ a: result, audio: audioUrlFor(f), title, songId: null, notice: 'Salvataggio in I miei brani…' });
    void navigator.storage?.persist?.().catch(() => false);
    library()
      .save({ title, analysis: result, audio: f })
      .then(
        (m) => ({ songId: m.id, notice: 'Salvato in I miei brani.' }),
        (e: Error) => ({ songId: null, notice: `Non salvato: ${e.message}` }),
      )
      .then((patch) => setSong((cur) => (cur && cur.a === result ? { ...cur, ...patch } : cur)));
  }

  async function send() {
    if (!file) return;
    setError(null);
    setJob({ status: 'in coda', progress: 0, step: 'Caricamento del file', error: null, result: null });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${backendUrl}/analyze`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? 'Il caricamento non è riuscito.');
      poll.current = window.setInterval(async () => {
        try {
          const s: JobState = await (await fetch(`${backendUrl}/jobs/${j.job_id}`)).json();
          setJob(s);
          if (s.status === 'completato' || s.status === 'errore') {
            window.clearInterval(poll.current!);
            poll.current = null;
            if (s.error) setError(s.error);
            if (s.result) {
              // l'audio resta nel browser: serve per suonarci sopra
              openAndSave(s.result, file);
              setJob(null);
            }
          }
        } catch {
          /* riprova al giro dopo */
        }
      }, 1000);
    } catch (e) {
      setJob(null);
      setError(
        e instanceof TypeError
          ? `Il server di analisi non risponde su ${backendUrl}. Avvia il backend sul PC e controlla l'indirizzo qui sotto.`
          : (e as Error).message,
      );
    }
  }

  if (song)
    return (
      <Player
        a={song.a}
        original={song.original}
        edited={song.edited}
        songId={song.songId}
        audioUrl={song.audio}
        title={song.title}
        notice={song.notice}
        onClose={() => setSong(null)}
      />
    );

  const busy = !!job;
  const mixed = needsHttps(location.protocol, backendUrl);
  return (
    <section className="page analyze">
      <SongLibrary onOpen={openSaved} />

      <h3 className="h-sub">Analizza un brano</h3>
      <p className="hint">
        Carica una canzone: la analizzo e poi la suoni insieme a me. Ti mostro l'accordo di adesso, il prossimo, la pennata e quando spingere, battuta per battuta.
      </p>

      <label className={`drop ${file ? 'has-file' : ''}`}>
        <input id="song-file" type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
        <span className="drop-main">{file ? file.name : 'Scegli un brano'}</span>
        <span className="drop-sub">{file ? `${(file.size / 1048576).toFixed(1)} MB · tocca per cambiarlo` : 'MP3, WAV, M4A o FLAC, fino a 40 MB'}</span>
      </label>

      {busy ? (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(job!.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${Math.max(4, job!.progress * 100)}%` }} />
          <span>{job!.step}</span>
        </div>
      ) : (
        <button className="btn-primary big" disabled={!file || server?.ok === false} onClick={send}>
          Analizza e suona
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {mixed && (
        <p className="error" role="alert">
          Da qui serve un indirizzo https: avvia il tunnel sul PC (vedi README).
        </p>
      )}

      <div className="or">oppure</div>
      <button className="btn-secondary" onClick={() => open({ a: sample as unknown as Analysis, audio: SAMPLE_AUDIO, title: 'Brano di prova', songId: null })}>
        Prova con un brano di esempio
      </button>

      <details className="server">
        <summary>
          <span className={`dot ${server?.ok ? 'ok' : server ? 'ko' : ''}`} />
          Server di analisi:{' '}
          {server === null ? 'controllo…' : server.ok ? (server.demucs ? 'collegato, con chitarra isolata' : 'collegato, senza separazione') : 'non raggiungibile'}
        </summary>
        <label className="select-row" htmlFor="backend-url">
          Indirizzo
          <input id="backend-url" className="text-in" value={backendUrl} onChange={(e) => set({ backendUrl: e.target.value.replace(/\/$/, '') })} inputMode="url" />
        </label>
        <p className="hint">
          {location.protocol === 'https:'
            ? "Dal telefono usa l'indirizzo https del tunnel, per esempio https://nome-a-caso.trycloudflare.com."
            : "Dal telefono usa l'indirizzo del PC sulla stessa rete Wi-Fi, per esempio http://192.168.1.20:8000."}
        </p>
        <button className="btn-text" onClick={check}>
          Riprova la connessione
        </button>
      </details>
    </section>
  );
}
