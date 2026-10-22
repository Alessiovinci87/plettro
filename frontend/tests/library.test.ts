import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import sample from '../src/data/sample-analysis.json';
import type { Analysis } from '../src/pages/analysis-types';
import { fmtBytes, LibraryError, openLibrary, titleFromFile } from '../src/song/library';

const a = sample as unknown as Analysis;
const audio = () => new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' });

test('salva, elenca e riapre un brano con il suo audio', async () => {
  const lib = openLibrary(new IDBFactory());
  const meta = await lib.save({ title: '  La mia canzone ', analysis: a, audio: audio() });
  assert.equal(meta.title, 'La mia canzone');
  assert.equal(meta.bpm, a.bpm);
  assert.equal(meta.keyTonic, a.key.tonic);
  assert.ok(meta.size > 2048);

  const list = await lib.list();
  assert.deepEqual(list.map((m) => m.id), [meta.id]);

  const { data } = await lib.load(meta.id);
  assert.equal(data.analysis.duration, a.duration);
  assert.ok(data.audio instanceof Blob);
  assert.equal(data.audio!.size, 2048);
});

test('elenco dal più recente', async () => {
  const lib = openLibrary(new IDBFactory());
  const first = await lib.save({ title: 'Primo', analysis: a, audio: null });
  await new Promise((r) => setTimeout(r, 5));
  const second = await lib.save({ title: 'Secondo', analysis: a, audio: null });
  assert.deepEqual((await lib.list()).map((m) => m.id), [second.id, first.id]);
});

test('rinomina: un titolo vuoto lascia quello vecchio', async () => {
  const lib = openLibrary(new IDBFactory());
  const m = await lib.save({ title: 'Vecchio', analysis: a, audio: null });
  assert.equal((await lib.rename(m.id, 'Nuovo')).title, 'Nuovo');
  assert.equal((await lib.rename(m.id, '   ')).title, 'Nuovo');
});

test('correzioni salvate e ripristino dell’originale', async () => {
  const lib = openLibrary(new IDBFactory());
  const m = await lib.save({ title: 'x', analysis: a, audio: null });
  const edited = { ...a, bpm: 120 };
  const up = await lib.updateAnalysis(m.id, edited);
  assert.equal(up.meta.edited, true);
  assert.equal((await lib.load(m.id)).data.analysis.bpm, 120);
  assert.equal((await lib.load(m.id)).data.original.bpm, a.bpm);
  const back = await lib.updateAnalysis(m.id, 'reset');
  assert.equal(back.meta.edited, false);
  assert.equal(back.analysis.bpm, a.bpm);
});

test('elimina e spazio usato', async () => {
  const lib = openLibrary(new IDBFactory());
  const m1 = await lib.save({ title: 'a', analysis: a, audio: audio() });
  const m2 = await lib.save({ title: 'b', analysis: a, audio: audio() });
  assert.equal(await lib.usage(), m1.size + m2.size);
  await lib.remove(m1.id);
  assert.deepEqual((await lib.list()).map((m) => m.id), [m2.id]);
  await assert.rejects(lib.load(m1.id), (e: unknown) => e instanceof LibraryError && e.kind === 'missing');
});

test('quota piena: errore con messaggio chiaro', async () => {
  // una factory che apre il database e poi fa fallire ogni scrittura come farebbe il browser
  const real = new IDBFactory();
  const full = {
    open: (name: string, v?: number) => {
      const r = real.open(name, v);
      r.addEventListener('success', () => {
        const d = r.result;
        const tx = d.transaction.bind(d);
        d.transaction = ((stores: string | string[], mode?: IDBTransactionMode) => {
          const t = tx(stores, mode);
          if (mode === 'readwrite') {
            queueMicrotask(() => {
              Object.defineProperty(t, 'error', { value: new DOMException('pieno', 'QuotaExceededError') });
              t.abort();
            });
          }
          return t;
        }) as typeof d.transaction;
      });
      return r;
    },
  } as unknown as IDBFactory;
  const lib = openLibrary(full);
  await assert.rejects(
    lib.save({ title: 'x', analysis: a, audio: audio() }),
    (e: unknown) => e instanceof LibraryError && e.kind === 'quota' && /Spazio pieno/.test(e.message),
  );
});

test('senza IndexedDB: libreria non disponibile', async () => {
  const lib = openLibrary(undefined);
  await assert.rejects(lib.list(), (e: unknown) => e instanceof LibraryError && e.kind === 'unavailable');
});

test('formati', () => {
  assert.equal(fmtBytes(500), '1 kB');
  assert.equal(fmtBytes(3.5 * 1024 * 1024), '3,5 MB');
  assert.equal(fmtBytes(42 * 1024 * 1024), '42 MB');
  assert.equal(titleFromFile('Il_mio_brano preferito.mp3'), 'Il mio brano preferito');
});
