// Libreria dei brani analizzati, salvata nel browser (IndexedDB).
// Due archivi: "meta" (leggero, per l'elenco) e "data" (analisi e audio, letto solo all'apertura).
import type { Analysis } from '../pages/analysis-types';

export interface SongMeta {
  id: string;
  title: string;
  duration: number;
  bpm: number;
  keyTonic: number;
  keyMode: string;
  createdAt: number;
  updatedAt: number;
  /** Byte occupati: audio più analisi. */
  size: number;
  /** true se l'analisi è stata corretta a mano. */
  edited: boolean;
}

export interface SongData {
  id: string;
  /** Analisi in uso, con le eventuali correzioni. */
  analysis: Analysis;
  /** Analisi come l'ha restituita il server, per "Ripristina analisi". */
  original: Analysis;
  audio: Blob | null;
}

export type LibraryErrorKind = 'quota' | 'unavailable' | 'missing' | 'other';

export class LibraryError extends Error {
  constructor(
    readonly kind: LibraryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}

const MESSAGES: Record<LibraryErrorKind, string> = {
  quota: 'Spazio pieno: elimina qualche brano da "I miei brani" e riprova.',
  unavailable: 'Questo browser non permette di salvare i brani (succede spesso in navigazione privata).',
  missing: 'Questo brano non c’è più nella libreria.',
  other: 'Salvataggio non riuscito.',
};

function toLibraryError(e: unknown): LibraryError {
  if (e instanceof LibraryError) return e;
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return new LibraryError('quota', MESSAGES.quota);
  if (name === 'InvalidStateError' || name === 'SecurityError') return new LibraryError('unavailable', MESSAGES.unavailable);
  return new LibraryError('other', MESSAGES.other);
}

const DB_NAME = 'plettro';
const DB_VERSION = 1;

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Si risolve quando la transazione è scritta davvero: la quota piena arriva qui. */
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException('Transazione annullata', 'AbortError'));
    tx.onerror = () => reject(tx.error);
  });

const byteSize = (a: Analysis) => new TextEncoder().encode(JSON.stringify(a)).length;

function newId(): string {
  // crypto.randomUUID esiste solo in https e su localhost
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface Library {
  save(input: { title: string; analysis: Analysis; audio: Blob | null }): Promise<SongMeta>;
  list(): Promise<SongMeta[]>;
  load(id: string): Promise<{ meta: SongMeta; data: SongData }>;
  rename(id: string, title: string): Promise<SongMeta>;
  /** Salva le correzioni; con `reset` torna all'analisi originale. */
  updateAnalysis(id: string, analysis: Analysis | 'reset'): Promise<{ meta: SongMeta; analysis: Analysis }>;
  remove(id: string): Promise<void>;
  /** Byte occupati da tutti i brani. */
  usage(): Promise<number>;
}

export function openLibrary(factory: IDBFactory | undefined = globalThis.indexedDB): Library {
  let dbp: Promise<IDBDatabase> | null = null;

  const db = () => {
    if (!factory) return Promise.reject(new LibraryError('unavailable', MESSAGES.unavailable));
    dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      let r: IDBOpenDBRequest;
      try {
        r = factory.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(toLibraryError(e));
        return;
      }
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(new LibraryError('unavailable', MESSAGES.unavailable));
      r.onblocked = () => reject(new LibraryError('unavailable', MESSAGES.unavailable));
    });
    // un'apertura fallita non resta in memoria: al prossimo tentativo si riprova
    dbp.catch(() => {
      dbp = null;
    });
    return dbp;
  };

  const getMeta = async (tx: IDBTransaction, id: string) => {
    const m = await req<SongMeta | undefined>(tx.objectStore('meta').get(id));
    if (!m) throw new LibraryError('missing', MESSAGES.missing);
    return m;
  };

  const lib: Library = {
    async save({ title, analysis, audio }) {
      try {
        const d = await db();
        const now = Date.now();
        const meta: SongMeta = {
          id: newId(),
          title: title.trim() || 'Brano senza titolo',
          duration: analysis.duration,
          bpm: analysis.bpm,
          keyTonic: analysis.key.tonic,
          keyMode: analysis.key.mode,
          createdAt: now,
          updatedAt: now,
          size: (audio?.size ?? 0) + 2 * byteSize(analysis),
          edited: false,
        };
        const tx = d.transaction(['meta', 'data'], 'readwrite');
        tx.objectStore('data').put({ id: meta.id, analysis, original: analysis, audio } satisfies SongData);
        tx.objectStore('meta').put(meta);
        await done(tx);
        return meta;
      } catch (e) {
        throw toLibraryError(e);
      }
    },

    async list() {
      try {
        const d = await db();
        const all = await req<SongMeta[]>(d.transaction('meta').objectStore('meta').getAll());
        return all.sort((a, b) => b.createdAt - a.createdAt);
      } catch (e) {
        throw toLibraryError(e);
      }
    },

    async load(id) {
      try {
        const d = await db();
        const tx = d.transaction(['meta', 'data']);
        const meta = await getMeta(tx, id);
        const data = await req<SongData | undefined>(tx.objectStore('data').get(id));
        if (!data) throw new LibraryError('missing', MESSAGES.missing);
        return { meta, data };
      } catch (e) {
        throw toLibraryError(e);
      }
    },

    async rename(id, title) {
      try {
        const d = await db();
        const tx = d.transaction('meta', 'readwrite');
        const meta = await getMeta(tx, id);
        const next = { ...meta, title: title.trim() || meta.title, updatedAt: Date.now() };
        tx.objectStore('meta').put(next);
        await done(tx);
        return next;
      } catch (e) {
        throw toLibraryError(e);
      }
    },

    async updateAnalysis(id, analysis) {
      try {
        const d = await db();
        const tx = d.transaction(['meta', 'data'], 'readwrite');
        const meta = await getMeta(tx, id);
        const data = await req<SongData | undefined>(tx.objectStore('data').get(id));
        if (!data) throw new LibraryError('missing', MESSAGES.missing);
        const next = analysis === 'reset' ? data.original : analysis;
        const nextMeta: SongMeta = {
          ...meta,
          bpm: next.bpm,
          keyTonic: next.key.tonic,
          keyMode: next.key.mode,
          size: (data.audio?.size ?? 0) + byteSize(next) + byteSize(data.original),
          edited: analysis !== 'reset',
          updatedAt: Date.now(),
        };
        tx.objectStore('data').put({ ...data, analysis: next });
        tx.objectStore('meta').put(nextMeta);
        await done(tx);
        return { meta: nextMeta, analysis: next };
      } catch (e) {
        throw toLibraryError(e);
      }
    },

    async remove(id) {
      try {
        const d = await db();
        const tx = d.transaction(['meta', 'data'], 'readwrite');
        tx.objectStore('meta').delete(id);
        tx.objectStore('data').delete(id);
        await done(tx);
      } catch (e) {
        throw toLibraryError(e);
      }
    },

    async usage() {
      const all = await lib.list();
      return all.reduce((s, m) => s + m.size, 0);
    },
  };
  return lib;
}

let shared: Library | null = null;
/** Libreria dell'app (una sola connessione per pagina). */
export const library = () => (shared ??= openLibrary());

// ---------------------------------------------------------------------------
// Formati per l'elenco

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`;
}

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDate = (ms: number) => DATE_FMT.format(new Date(ms));

/** Titolo proposto dal nome del file: senza estensione, trattini bassi come spazi. */
export function titleFromFile(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
