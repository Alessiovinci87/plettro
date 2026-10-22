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

- [x] Pulsante "Modifica"
- [x] Tocco su una battuta: scelta dell'accordo (tonica + tipo) con suggerimenti dalla tonalità
- [x] Rinomina sezione
- [x] Inizio della sezione spostato di ± una battuta
- [x] Pattern di pennata della sezione: editor a 16 sedicesimi (giù, su, leggera, vuoto)
- [x] Correzioni salvate nel brano della libreria, "Ripristina analisi" torna all'originale
- [x] Gli accordi corretti aggiornano anche `chords[]`
- [x] Test delle modifiche (funzioni pure)

## Fase 3 – Strumenti di studio nel player

- [x] Conteggio 1-2-3-4 prima di partire e a ogni ripartenza del loop (attivabile)
- [x] Loop A–B su battute: tocco lungo o modalità "Seleziona"
- [x] Allenamento progressivo: velocità iniziale, +5% a ogni giro fino al 100%
- [x] Click del metronomo sopra il brano, sui battiti analizzati, volume regolabile
- [x] Test della logica (conteggio, loop, velocità, pianificazione dei click)

## Fase 4 – Accordi semplificati

- [x] Interruttore "Accordi semplici" nel player
- [x] Estensioni → triade; barrè → forma aperta adatta se esiste (es. F → Fmaj7);
      sus → triade solo se scelto
- [x] Rispetta il capotasto
- [x] Logica pura in `src/music/simplify.ts` con test

## Fase 5 – Allenatore dei cambi

- [x] Nuova voce "Allenati" nella navigazione
- [x] Due accordi a scelta o coppia suggerita
- [x] Timer di 60 s, cambi contati con un grande pulsante o la barra spaziatrice
- [x] Storico in localStorage, miglior risultato per coppia, grafico dei progressi
- [x] Test della logica (coppie, storico, record)

## Fase 6 – Libro accordi e Ritmo

- [x] Ricerca per nome ("F#m7b5", "Do maj7", "Bb/D")
- [x] Preferiti (stellina sulla variante) ed elenco "I miei accordi"
- [x] Accordi della tonalità: tonalità e modo, 7 accordi con diteggiatura
- [x] Ritmo: editor di pattern personali (16 sedicesimi) salvati in localStorage
- [x] Pattern personali usabili nel player come pattern della sezione
- [x] Test (lettura dei nomi, accordi della tonalità, preferiti, pattern)

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

### Fase 2

- I nomi nel selettore sono quelli da suonare con il capotasto; nell'analisi si salva il suono
  reale, così il capotasto si può cambiare dopo senza rovinare le correzioni.
- Suggerimenti: i 7 accordi della tonalità (in minore anche il V maggiore), poi quelli già nel brano.
- Un accordo scelto occupa tutta la battuta; in `chords[]` taglia gli accordi sovrapposti e si unisce
  ai vicini con lo stesso nome. Gli accordi delle sezioni si ricalcolano come fa il server.
- Lo spostamento dell'inizio vale dalla seconda sezione in poi; ogni sezione tiene almeno una battuta.
- Pennata: si sceglie il colpo (giù, su, leggera, vuoto) e si toccano le caselle; "leggera" va giù
  sui battiti e sugli ottavi, su sui sedicesimi in levare. Si può partire da un pattern della pagina Ritmo.
  Il consiglio sotto la pennata viene riscritto dal pattern.
- Nuovo lettore di nomi d'accordo in `theory.ts` (`parseChord`), usato dal player per tutti i tipi
  d'accordo (prima ne riconosceva nove) e pronto per la ricerca della Fase 6.
- Brano d'esempio: le correzioni restano in memoria, con un avviso.
- Su telefono, in modifica, la scheda dell'accordo non resta fissa in alto per lasciare spazio al selettore.

### Fase 3

- Gli strumenti stanno in "Strumenti di studio" sotto il titolo del brano; le scelte restano nel browser
  (`plettro.practice.v1`).
- Il loop è un intervallo di battute: "Ripeti" su una sezione, "Seleziona battute" (due tocchi, in
  qualunque ordine) oppure tocco lungo su una battuta e poi tocco sull'ultima.
- Conteggio: un click per battito con il periodo dei battiti analizzati, rallentato con la velocità;
  durante il conteggio il pulsante mostra il numero e lo si può toccare per fermarsi.
- Allenamento progressivo: parte dalla velocità scelta (50–90%) appena c'è un loop, +5% a ogni giro;
  il selettore della velocità ora va dal 50% al 100% a passi del 5%.
- Metronomo pianificato sull'orologio audio con 120 ms di anticipo, accento sugli "uno"; l'"uno" che
  chiude il loop non viene pianificato prima del salto (niente click doppio). Senza audio resta sempre acceso.
- Tocco lungo: ogni nuova pressione azzera la precedente, perché il rilascio può cadere fuori dalla
  battuta quando compare il suggerimento.

### Fase 4

- "Facile" vuol dire una forma aperta di un elenco curato (nessun barrè, entro il 3º tasto): la libreria
  chords-db segna come "senza barrè" anche forme scomode (Cm x31013, Gm 310033), quindi non basta.
- Regole: maggiori e minori con estensioni → triade; se la triade non ha forma facile si prova la
  settima aperta (F → Fmaj7, Bm → Bm7), altrimenti resta com'è (Bb, F#m). Il 7 di dominante resta
  se è facile (A7, E7, B7), le estensioni scendono al 7 (G9 → G7), altrimenti triade (F7 → F).
  Sus → triade solo con "anche i sus". Il basso degli accordi con barra si toglie. Dim, aug, power chord restano.
- Si guarda la forma suonata (tonica meno capotasto): con il capotasto al 1º, F si suona come E e resta F.
- Nel player si mostra un'analisi semplificata intera: accordi vicini diventati uguali si uniscono, così
  "Adesso" e "Poi" non mostrano lo stesso nome. Sotto i dati del brano c'è l'elenco delle sostituzioni.
  La diteggiatura mostrata è la forma facile. In "Modifica" si vedono gli accordi originali.
- I nomi lunghi nella scheda si rimpiccioliscono invece di andare a capo ("Fma / j7").

### Fase 5

- "Allenati" sta tra Ritmo e Analizza; la barra in basso del telefono passa da 5 a 6 voci.
- La prova parte con "Via" o con la barra spaziatrice; durante la prova lo spazio conta un cambio.
  Il pulsante grande mostra i cambi e l'accordo su cui devi essere adesso (evidenziato anche sopra).
- La coppia non dipende dall'ordine (G–C e C–G sono lo stesso esercizio). La prima prova di una
  coppia non è un "record": il record arriva quando superi il migliore.
- Storico in `plettro.trainer.v1` (ultime 500 prove). Il grafico mostra le ultime 20 prove della coppia:
  barre su un solo asse con tacche intere, record e ultima prova etichettati, dettaglio al passaggio
  o al tocco, e una tabella come alternativa al grafico.
- Due click alla fine dei 60 secondi.

### Fase 6

- Libro accordi con quattro viste: Varianti, Tonalità, I miei, Riconosci. L'accordo scelto resta lo stesso
  passando da una vista all'altra; da Tonalità e I miei il foglio dell'accordo ha "Altre varianti".
- La ricerca usa la stessa lettura dei nomi della correzione nel player (Fase 2): notazione internazionale
  e italiana, alterazioni, basso. Se non riconosce il nome lo dice sotto il campo, con tre esempi.
- Il preferito è una variante precisa (diteggiatura) in un'accordatura, salvato in `plettro.favorites.v1`.
  "I miei" mostra quelli dell'accordatura attuale e conta gli altri. Stellina sulla card e pulsante nel foglio.
- Accordi della tonalità per le scale a 7 note (maggiore, minore, modi, armonica, melodica), in triadi o
  in settime, con il grado in numeri romani e la prima diteggiatura del libro. I nomi usano la grafia fissa
  dell'app (Ab, non G#).
- Pattern personali in `plettro.patterns.v1`, in 4/4 (16 sedicesimi) o 3/4 (12). Mentre li scrivi suona la
  bozza. Eliminazione con conferma nella pagina. Nel player compaiono in "Parti da" sotto "I miei"
  (solo quelli con la stessa lunghezza della battuta della sezione).
- Corretto anche un difetto di Ritmo: dopo "Ferma" una casella della griglia poteva restare accesa.
