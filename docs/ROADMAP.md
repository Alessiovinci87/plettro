# Roadmap Plettro

Ciclo di sviluppo in 7 fasi (la 7ª aggiunta strada facendo). Ogni fase si chiude con: logica testata, `npm run build` e
`npm test` verdi, screenshot a 1920 e 390 px (chiaro e scuro) controllati, commit e push.
Regole comuni: testi in italiano, stile e token di `styles.css`, niente `confirm()`/`alert()`
(le conferme stanno dentro la pagina).

## Fase 1 – Libreria dei brani

- [x] Salvataggio in IndexedDB dopo un'analisi riuscita: analisi (JSON), audio (Blob),
      titolo, durata, data
- [x] Errori gestiti, compresa la quota piena (messaggio chiaro, il player si apre lo stesso)
- [x] "I miei brani" in alto in Analizza: titolo, durata, tonalità, bpm, data
- [x] Tocco sul brano: apre subito il player
- [x] Rinomina, elimina con conferma nella pagina, spazio usato
- [x] Brano d'esempio separato dalla libreria
- [x] Test della libreria (fake-indexeddb)

## Fase 2 – Correzione manuale nel player

- [ ] Pulsante "Modifica"
- [ ] Tocco su una battuta: scelta dell'accordo (tonica + tipo) con suggerimenti dalla tonalità
- [ ] Rinomina sezione
- [ ] Inizio della sezione spostato di ± una battuta
- [ ] Pattern di pennata della sezione: editor a 16 sedicesimi (giù, su, leggera, vuoto)
- [ ] Correzioni salvate nel brano della libreria, "Ripristina analisi" torna all'originale
- [ ] Gli accordi corretti aggiornano anche `chords[]`
- [ ] Test delle modifiche (funzioni pure)

## Fase 3 – Strumenti di studio nel player

- [ ] Conteggio 1-2-3-4 prima di partire e a ogni ripartenza del loop (attivabile)
- [ ] Loop A–B su battute: tocco lungo o modalità "Seleziona"
- [ ] Allenamento progressivo: velocità iniziale, +5% a ogni giro fino al 100%
- [ ] Click del metronomo sopra il brano, sui battiti analizzati, volume regolabile
- [ ] Test della logica (conteggio, loop, velocità, pianificazione dei click)

## Fase 4 – Accordi semplificati

- [ ] Interruttore "Accordi semplici" nel player
- [ ] Estensioni → triade; barrè → forma aperta adatta se esiste (es. F → Fmaj7);
      sus → triade solo se scelto
- [ ] Rispetta il capotasto
- [ ] Logica pura in `src/music/simplify.ts` con test

## Fase 5 – Allenatore dei cambi

- [ ] Nuova voce "Allenati" nella navigazione
- [ ] Due accordi a scelta o coppia suggerita
- [ ] Timer di 60 s, cambi contati con un grande pulsante o la barra spaziatrice
- [ ] Storico in localStorage, miglior risultato per coppia, grafico dei progressi
- [ ] Test della logica (coppie, storico, record)

## Fase 6 – Libro accordi e Ritmo

- [ ] Ricerca per nome ("F#m7b5", "Do maj7", "Bb/D")
- [ ] Preferiti (stellina sulla variante) ed elenco "I miei accordi"
- [ ] Accordi della tonalità: tonalità e modo, 7 accordi con diteggiatura
- [ ] Ritmo: editor di pattern personali (16 sedicesimi) salvati in localStorage
- [ ] Pattern personali usabili nel player come pattern della sezione
- [ ] Test (lettura dei nomi, accordi della tonalità, preferiti, pattern)

## Fase 7 – Guida alle scale nel Manico

- [ ] Modalità "Impara la scala" con selettore "Tutto il manico / Posizione 1..5"
- [ ] Pentatoniche e blues: 5 box; maggiore, minore e modi: 3 note per corda
- [ ] In una posizione: solo quelle note, numero del dito nel pallino, tonica evidenziata,
      banda "mano al 5º tasto"
- [ ] Ordine di esecuzione numerato (salita 6ª → 1ª, poi discesa)
- [ ] "Suona la scala": nota corrente evidenziata, bpm regolabili, ripetizione continua
- [ ] Spiegazione breve sopra il manico e consiglio d'uso; vista tablatura testuale
- [ ] Frecce posizione precedente/successiva; in "Tutto il manico" posizioni colorate
- [ ] Corde etichettate a sinistra ("1ª Mi" in alto … "6ª Mi" in basso); intarsi mai sotto i pallini
- [ ] Logica pura in `src/music/positions.ts` con test (La pentatonica minore pos. 1 = 5-8 / 5-7 …)

## Scelte fatte strada facendo

Le scelte prese dove la richiesta lasciava margine sono annotate qui, fase per fase.

### Fase 1

- Il player si apre subito dopo l'analisi; il salvataggio va in parallelo e l'esito compare
  sotto il titolo ("Salvato in I miei brani." o il motivo dell'errore).
- Due archivi in IndexedDB: `meta` (elenco leggero) e `data` (analisi, originale, audio),
  così l'elenco non carica mai l'audio.
- Il titolo viene dal nome del file; viene chiesto al browser lo spazio persistente.
- Il brano d'esempio non entra nella libreria.
- Su telefono le azioni scendono sotto il titolo; il segno "corretto" resta visibile anche con titoli lunghi.
