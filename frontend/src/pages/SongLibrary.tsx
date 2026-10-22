// "I miei brani": i brani analizzati salvati nel browser.
import { useEffect, useState } from 'react';
import { useSettings } from '../store';
import { pcName } from '../music/theory';
import { fmtBytes, fmtDate, library, type SongMeta } from '../song/library';
import { fmtTime } from './songTime';

export function SongLibrary({ onOpen }: { onOpen: (m: SongMeta) => Promise<void> }) {
  const { notation } = useSettings();
  const [songs, setSongs] = useState<SongMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const reload = () =>
    library()
      .list()
      .then(setSongs, (e: Error) => {
        setSongs([]);
        setError(e.message);
      });
  useEffect(() => {
    void reload();
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    await reload();
  };

  const open = async (m: SongMeta) => {
    setError(null);
    setOpening(m.id);
    try {
      await onOpen(m);
    } catch (e) {
      setError((e as Error).message);
      setOpening(null);
    }
  };

  const used = songs?.reduce((s, m) => s + m.size, 0) ?? 0;
  const keyName = (m: SongMeta) => `${pcName(m.keyTonic, notation)} ${m.keyMode === 'minor' ? 'minore' : 'maggiore'}`;

  return (
    <section className="lib" aria-labelledby="lib-title">
      <div className="lib-head">
        <h3 id="lib-title" className="h-sub">
          I miei brani
        </h3>
        {songs && songs.length > 0 && <span className="lib-usage">{fmtBytes(used)} usati</span>}
      </div>

      {songs === null ? (
        <p className="hint">Carico la libreria…</p>
      ) : songs.length === 0 ? (
        <p className="hint lib-empty">I brani che analizzi restano qui, su questo dispositivo. Toccane uno per suonarlo subito.</p>
      ) : (
        <ul className="lib-list">
          {songs.map((m) => (
            <li key={m.id} className="lib-item">
              {renaming?.id === m.id ? (
                <form
                  className="lib-row lib-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = renaming.draft;
                    setRenaming(null);
                    void act(() => library().rename(m.id, title));
                  }}
                >
                  <label className="sr-only" htmlFor={`rn-${m.id}`}>
                    Nuovo titolo
                  </label>
                  <input id={`rn-${m.id}`} className="text-in" value={renaming.draft} autoFocus maxLength={120} onChange={(e) => setRenaming({ id: m.id, draft: e.target.value })} />
                  <button className="btn-primary small" type="submit">
                    Salva
                  </button>
                  <button className="btn-text" type="button" onClick={() => setRenaming(null)}>
                    Annulla
                  </button>
                </form>
              ) : confirmDel === m.id ? (
                <div className="lib-row lib-confirm" role="group" aria-label="Conferma eliminazione">
                  <span>
                    Eliminare “{m.title}”? <small>Audio e correzioni spariscono da questo dispositivo.</small>
                  </span>
                  <button
                    className="btn-danger small"
                    autoFocus
                    onClick={() => {
                      setConfirmDel(null);
                      void act(() => library().remove(m.id));
                    }}
                  >
                    Elimina
                  </button>
                  <button className="btn-text" onClick={() => setConfirmDel(null)}>
                    Annulla
                  </button>
                </div>
              ) : (
                <div className="lib-row">
                  <button className="lib-open" onClick={() => void open(m)} disabled={opening !== null} aria-busy={opening === m.id}>
                    <span className="lib-title">
                      <span className="lib-name">{m.title}</span>
                      {m.edited && <em className="lib-tag">corretto</em>}
                    </span>
                    <span className="lib-meta">
                      {fmtTime(m.duration)} · {keyName(m)} · {Math.round(m.bpm)} bpm · {fmtDate(m.createdAt)}
                    </span>
                  </button>
                  <div className="lib-actions">
                    <button className="btn-text" onClick={() => setRenaming({ id: m.id, draft: m.title })} aria-label={`Rinomina ${m.title}`}>
                      Rinomina
                    </button>
                    <button className="btn-text danger" onClick={() => setConfirmDel(m.id)} aria-label={`Elimina ${m.title}`}>
                      Elimina
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
