# Plettro

App per chitarristi: accordatore cromatico, libro accordi con tutte le varianti sul manico,
scale, accordature con suggerimenti, metronomo con pattern di pennata e analisi dei brani
(tempo, tonalità, accordi, sezioni, pennata, dinamica, suono ed effetti da impostare).

```
plettro/
├── frontend/   PWA React + TypeScript (Vite): gira nel browser, si installa sul telefono
├── backend/    API Python/FastAPI per l'analisi dei brani (numpy/scipy, Demucs opzionale)
└── scripts/    utilità (conversione della libreria accordi)
```

## Avvio rapido (Windows, PowerShell)

Servono Node.js 20+ e Python 3.11+. Per leggere gli MP3 serve anche ffmpeg
(`winget install Gyan.FFmpeg`, poi riapri PowerShell).

### 1. Frontend

```powershell
cd C:\percorso\plettro\frontend
npm install
npm run dev
```

Apri l'indirizzo mostrato (http://localhost:5173). Dal telefono sulla stessa rete Wi-Fi usa
l'indirizzo "Network" che Vite stampa (es. http://192.168.1.20:5173).

> Il microfono del telefono funziona solo su **https** o su localhost. Per provarlo dal telefono
> pubblica la build (`npm run build`, cartella `dist/`) su Vercel, oppure usa un tunnel https.

### 2. Backend di analisi

```powershell
cd C:\percorso\plettro\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Per la separazione della chitarra (molto più precisa su pennata ed effetti):

```powershell
pip install -r requirements-full.txt
```

Nell'app, sezione **Analizza → Server di analisi**, imposta l'indirizzo del backend
(dal telefono: http://IP-DEL-PC:8000).

### Test

```powershell
cd C:\percorso\plettro\frontend
npm test

cd C:\percorso\plettro\backend
python -m unittest -v
```

## Cosa c'è

**Accordatore**: rilevamento YIN (precisione ~1 cent), modalità per corda o cromatica,
La di riferimento regolabile (425–455 Hz), note di riferimento da ascoltare.

**Libro accordi**: 44 tipi di accordo per 12 tonalità, con basso alternativo (slash).
In accordatura standard parte dalle 2.000+ diteggiature curate di
[chords-db](https://github.com/tombatossals/chords-db) (MIT) e aggiunge varianti calcolate;
in qualsiasi altra accordatura le genera tutte l'algoritmo (dita, barrè, tasto di partenza).
Ogni variante mostra il tasto su cui lavorare. C'è anche "Che accordo è?": segni le dita,
l'app riconosce l'accordo.

**Manico**: scale (12) e note dell'accordo su tutta la tastiera, con note o gradi.

**Accordature**: 13 preset con differenze dallo standard, consigli (mute, tensione) e un
suggeritore per tonalità e stile.

**Ritmo**: metronomo (tap tempo, suddivisioni, metro) e 10 pattern di pennata suonati con
l'accordo scelto.

**Analizza**: carica un brano e ottieni per ogni sezione accordi a battute, pattern di pennata
(giù/su), dinamica ("quando spingere"), profilo del suono e catena di effetti con modelli
Helix, capotasto consigliato, accordatura, melodia indicativa con posizioni.

## Analisi: come funziona e quanto è affidabile

| Cosa | Metodo | Affidabilità |
|---|---|---|
| Tempo, battiti, primo tempo | autocorrelazione + programmazione dinamica + cambi d'accordo | alta (possibile metà/doppio, si corregge con ½ ×2) |
| Tonalità | profili Krumhansl-Kessler | alta su brani tonali |
| Accordi | salienza armonica + template + HMM/Viterbi | buona su suoni puliti, cala con distorsione forte |
| Sezioni | novità della matrice di auto-somiglianza | buona |
| Pennata | griglia di sedicesimi sui battiti + regola del pendolo | buona **con Demucs**, approssimativa sul mix (basso e batteria disturbano) |
| Suono ed effetti | piattezza spettrale, baricentro, decadimento delle alte, eco a frazioni di battito | indicativa |
| Melodia | salienza armonica, monofonica | indicativa |

Il brano caricato viene cancellato a fine analisi; i risultati restano in memoria un'ora.

## Integrazione con PresetDock

Il backend ha già il punto di aggancio (`backend/app/analysis/presets.py`). Basta impostare
`PRESETDOCK_URL` e implementare in PresetDock l'endpoint `POST /api/match` descritto nel file.
Senza PresetDock l'app mostra la query da cercare nell'archivio.

## Licenze di terze parti

- Libreria accordi chords-db © David Rubert, licenza MIT (`frontend/src/data/LICENSE-chords-db.txt`).
