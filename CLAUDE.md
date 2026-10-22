# Plettro — contesto per Claude Code

App per chitarristi in italiano. Monorepo:

- `frontend/` React 19 + TypeScript + Vite, PWA mobile-first. Nessuna libreria UI.
  - `src/music/` motore musicale puro (testato con `npm test`, node:test via tsx):
    `theory.ts` (note, qualità accordi = suffissi chords-db, scale, riconoscimento),
    `voicings.ts` (libreria curata + generatore per qualsiasi accordatura, dita, barrè, `workFret`),
    `tunings.ts` (preset, differenze, suggeritore), `pitch.ts` (YIN), `rhythm.ts` (pattern pennata).
  - `src/audio/engine.ts` Web Audio: Karplus-Strong intonato via playbackRate, click, note di riferimento.
  - `src/pages/` una pagina per sezione; `src/store.tsx` impostazioni in localStorage.
  - `src/pages/Player.tsx` "Suona con il brano": segue l'audio caricato (resta nel browser, blob URL)
    e mostra accordo attuale/prossimo, battito, sedicesimo della pennata, dinamica; foglio con tutte le
    sezioni a battute, ripetizione sezione, velocità. Calcoli di posizione in `songTime.ts` (testati).
    Tipi del JSON del backend in `analysis-types.ts`. Audio d'esempio in `public/sample.mp3`.
  - `src/data/chords-standard.json` generato da `scripts/convert_chords_db.py` (chords-db, MIT).
  - `src/data/sample-analysis.json` esempio di risposta del backend (brano sintetico).
- `backend/` FastAPI. `app/analysis/` solo numpy/scipy; Demucs opzionale (`separation.py`).
  - `pipeline.py` orchestra tutto e definisce la forma del JSON letto da `frontend/src/pages/Analyze.tsx`.
    Se cambi il JSON, aggiorna i tipi in `Analyze.tsx`.
  - Test: `python -m unittest -v` su brani sintetici con risposta nota (`tests/synth.py`).
  - `presets.py`: contratto per PresetDock (`PRESETDOCK_URL`, `POST /api/match`).

Convenzioni: testi dell'interfaccia in italiano, frasi brevi, niente maiuscolo per le etichette.
Corde indicizzate dalla 6ª (grave, indice 0) alla 1ª. Tasti: -1 muta, 0 a vuoto.
Palette "palissandro e osso" con token CSS in `styles.css` (tema chiaro = acero).
