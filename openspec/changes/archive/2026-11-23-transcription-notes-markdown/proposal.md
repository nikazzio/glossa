# Proposal

Issue di origine: #503 (editor Markdown unico) e #502, solo la parte «commenti e note separati dal testo».

## Why

La trascrizione minuta chiede di annotare ogni intervento, dubbio, aggiunta e resa grafica. Oggi il modello li scrive dentro il testo con segni inventati nel prompt del documento (`==testo==`, `{COMMENT: ...}`, `{RED NOTE: ...}`). Il pannello del testo non può dipendere da una convenzione arbitraria scritta in un prompt personale, e le note mescolate al testo vanno poi tolte a mano. Serve un formato di uscita standard, posseduto da Glossa, e note separate dal testo ma legate al passaggio.

## What Changes

- **Blocco di formato Markdown per la lettura automatica.** È fisso e lo possiede Glossa, sul modello dell'interruttore «testo Markdown» della traduzione. Si attiva con un interruttore nella scheda OCR delle impostazioni del workspace. Quando è attivo, chiede al modello di rispondere in Markdown standard, con le note come note a piè di pagina. Riguarda solo il formato di uscita, mai le regole editoriali, che restano nel prompt del documento. Sta prima del prompt del documento, in cache, e compare nel log del prompt inviato.
- **Forma della nota chiesta al modello:** il segno `[^1]` sta subito dopo il passaggio annotato. La nota comincia con il tipo e cita il passaggio, poi il testo, per esempio `[^1]: Doubt «et dixit» — lettura incerta`. Resta Markdown standard.
- **Prompt del documento solo editoriale.** Le istruzioni sui segni `==...==` e `{COMMENT: ...}` escono dal prompt della minuta.
- **Note della trascrizione separate dal testo,** in una scheda Note nella colonna a schede dello Studio, sul modello della scheda Note della traduzione. Ogni nota ha un tipo, un testo e, se vuoi, il passaggio a cui si riferisce. La scheda filtra le note per tipo.
- **Evidenziazione del passaggio:** nel testo un solo colore per tutte le note, come nella traduzione. Il tipo si vede al passaggio del mouse e nella scheda della nota, con la sua icona e il suo colore.
- **Conversione e controllo dopo ogni lettura:** Glossa legge le note a piè di pagina della risposta e le trasforma in note della pagina; il testo resta pulito. Il passaggio citato si cerca subito prima del segno, e da lì si ricava quale occorrenza è. Il confronto tollera differenze di spazi, maiuscole e punteggiatura. Il log della lettura riporta quante note sono arrivate e quante non si sono agganciate. Nessuna seconda chiamata al modello per correggere.
- **Tipo non riconosciuto:** se la nota non comincia con un tipo noto, diventa del tipo generico «Nota» e il log lo segnala.
- **Pannello del prompt riusabile** al posto di quello attuale della lettura automatica (scheda OCR dello Studio e impostazioni OCR del workspace): modifica in bozza con salva e scarta distinti, provenienza del testo accanto al titolo, menu dei modelli con usa, aggiorna, elimina e salva come nuovo. Il salvataggio nel documento non crea un modello.
- **Scheda OCR più asciutta:** niente scritte fisse né cornici dentro cornici; la scelta del modello per documento ha un comando «personalizza per questo documento» al posto del lucchetto e una riga che dice da dove viene il valore; servizio e modello nel blocco di lettura aprono la scheda OCR.
- **Editor nuovo, semplice e standard** per la pagina di trascrizione e per la scheda Note, costruito solo con i componenti base del design system, con l'evidenziazione delle note. Il vecchio editor resta per ora nella traduzione e nella pagina della fonte.

## Decisioni prese

- **Tipi di nota della trascrizione:**
  1. Intervento: correzione di lapsus, ripetizione tolta, integrazione.
  2. Dubbio: lettura incerta.
  3. Aggiunta: a margine o fra le righe, con l'indicazione della mano.
  4. Correzione del testimone: «corretto su» o «corretto da», con l'indicazione della mano.
  5. Resa grafica: maiuscoletto, numeri romani, titoli.
  6. Abbreviazione non evidente.
  7. Nota: tipo generico, anche per le note del modello con un tipo non riconosciuto.
- **Aggancio:** la nota ricorda il passaggio e **quale occorrenza** è (le parole si ripetono spesso). Se il testo cambia e il passaggio c'è ancora, la nota lo segue. Se sparisce, la nota resta nella scheda come «non più agganciata», in grigio: non si perde mai. La nota appartiene alla pagina, non a una sua versione.
- **Rilettura di una pagina:** le note del modello della lettura precedente sono sostituite da quelle nuove; le note scritte o corrette a mano restano e si riagganciano al testo nuovo. Da una seconda lettura in poi Glossa chiede conferma, dicendo quante note del modello verranno sostituite.
- **Formato di uscita:** Markdown standard, niente output strutturato. Si riconsidera solo se, nella prova dal vivo, le note escono male spesso.
- **Memorizzazione:** una tabella nuova, legata alle pagine di trascrizione (nuova migrazione). Siamo in beta: nessuna compatibilità con formati precedenti da conservare.
- **Design system:** scheda nella colonna a schede comune, comandi solo a icona con suggerimento, interruttore come riga delle impostazioni, solo colori ufficiali (il rosso resta per errori e azioni distruttive, il giallo per il lavoro in corso).
- **Esportazione:** resta l'ultima cosa (#500). Il formato delle note in uscita si decide dopo questa modifica.

- **Nomi, icone e colori dei tipi** (il modello scrive il nome inglese; Glossa riconosce anche quello italiano, senza badare alle maiuscole; il significato completo sta nel suggerimento):

  | Nome | Inglese | Icona | Colore |
  |---|---|---|---|
  | Intervento | Emendation | matita | neutro |
  | Dubbio | Doubt | punto interrogativo | ocra (cautela) |
  | Aggiunta | Addition | più | neutro |
  | Correzione | Correction | testo barrato | neutro |
  | Resa grafica | Typography | «Aa» | neutro |
  | Abbreviazione | Abbreviation | puntini | neutro |
  | Nota | Note | fumetto | neutro |

- **Scheda Note:** tre gruppi, mostrati solo se non vuoti: «Pagina» (note senza passaggio), «Nel testo» (in ordine di lettura), «Da riagganciare» (in grigio). In cima il filtro per tipo, a pallini, con il numero di note per tipo. Comandi della nota al passaggio del mouse: trova nel testo, modifica, elimina. Per riagganciare: si seleziona il passaggio nel testo e si clicca l'icona di aggancio sulla nota. Un clic su un passaggio evidenziato porta alla sua nota nella scheda.

  ```
  +--------------------------------------+
  | [schede]  Note                  [+]  |
  +--------------------------------------+
  | (*) Tutte 9  ( ) ? 3  ( ) ...   [v]  |
  +--------------------------------------+
  | PAGINA                               |
  |  [fumetto] Nota                      |
  |  Inchiostro sbiadito nel margine.    |
  +--------------------------------------+
  | NEL TESTO                            |
  |  [?] DUBBIO                 [o][/][x]|
  |  <<et dixit>>                        |
  |  Lettura incerta, forse "dixerit".   |
  +--------------------------------------+
  | DA RIAGGANCIARE              (grigio)|
  |  [matita] INTERVENTO           [<>]  |
  |  <<sanctis>> non trovato nel testo   |
  +--------------------------------------+
  ```

- **Editor nuovo:** due modalità, Scrivi e Leggi (niente vista affiancata: accanto c'è già l'immagine). Evidenziazioni attive in entrambe; al passaggio del mouse il tipo e l'inizio della nota. Comandi in colonna nel margine destro della pagina: nota sul testo selezionato, formattazione e dimensione del testo, copia. Una scorciatoia da tastiera crea una nota sulla selezione, con passaggio e occorrenza registrati da soli. Nel testo non ci sono segni di nota. La scheda Note usa lo stesso editor in versione compatta.

  ```
  +--------------------------------------------+-----+
  | Pagina 12r                       [Scrivi|Leggi] |
  +--------------------------------------------+-----+
  |                                            | [+] |
  | Et dixit dominus ad eum [evidenziato] ...  | [Aa]|
  |                                            | [c] |
  +--------------------------------------------+-----+
  ```

- **Note senza passaggio:** il modello le scrive come nota a piè di pagina senza segno nel testo e senza citazione (`[^p1]: Note — inchiostro sbiadito`); vanno nel gruppo «Pagina».
- **Interruttore:** sta nella scheda OCR delle impostazioni del workspace, accanto a modello e prompt predefiniti. Riga «Note separate dal testo»; suggerimento: «Il modello risponde in Markdown e mette ogni nota a piè di pagina. Glossa le sposta nella scheda Note e lascia il testo pulito.» Acceso all'inizio.
- **Blocco di formato** (in inglese, come gli altri blocchi fissi), bozza:

  ```
  Output format:
  - Reply with the transcription only, in standard Markdown.
  - Write every note as a footnote. Put the marker [^n] right after the
    passage it refers to.
  - Start each footnote with one type word, then the exact passage in «»,
    then the note: [^1]: Doubt «et dixit» — uncertain reading.
  - Types: Emendation, Doubt, Addition, Correction, Typography,
    Abbreviation, Note.
  - A note about the whole page has no marker and no passage:
    [^p1]: Note — faded ink in the lower margin.
  ```

- **Coerenza dello Studio di trascrizione** (stesse regole dello Studio di traduzione):
  1. **Comando «Leggi questa pagina» sopra le schede,** sempre visibile da ogni scheda: icona rotonda grande, accanto servizio e modello in uso e il costo dell'ultima lettura della pagina. Durante la lettura gira ed è gialla; il motivo per cui è spenta sta nel suggerimento. Esce dall'intestazione del riquadro «Modello» nella scheda OCR.

     ```
     +--------------------------------------+
     | Strumenti                       [<]  |
     +--------------------------------------+
     |  ( O )   OpenAI - gpt-5.6-terra      |
     |          ultima lettura ~ $0.05      |
     +--------------------------------------+
     | [note] [storico] [ocr] [riep.]  Note |
     +--------------------------------------+
     ```

  2. **Ordine delle schede:** Note, Storico, OCR, Riepilogo; lo Studio si apre su Note.
  3. **Barra sopra il testo:** titolo, verifica, salva e avviso di lettura in corso. L'icona del menu dell'editor sparisce: i comandi del testo stanno nel margine destro della pagina.
  4. **Icona della scheda OCR:** la stessa del comando di lettura (scansione del testo) al posto delle scintille.

## Fuori perimetro

- Il resto di #502: trascrizione pulita, dubbi raccolti per tutto il documento, cartulazione, stati di revisione, pagine vicine come contesto, lettura dei PDF.
- Esportazione (#500) e lettura di più pagine (#499).
- Passaggio dell'editor del prompt della traduzione al pannello riusabile: modifica separata, nel riordino della traduzione.
- Passaggio della traduzione e della pagina della fonte all'editor nuovo, con eliminazione del vecchio, ed eventuale unione delle note di traduzione e trascrizione in una sola tabella: modifica separata. L'interfaccia si rifà un'area alla volta: prima la specifica dell'area, poi lo schema approvato, poi la riscrittura completa di quell'area con i componenti base, senza compatibilità con la versione precedente.

## Capabilities

### New Capabilities
<!-- Da definire dopo l'esplorazione. -->

### Modified Capabilities
- `transcription`: lettura automatica con blocco di formato facoltativo; note della pagina separate dal testo; editor nuovo della pagina.

## Impact

- Backend: composizione del prompt della lettura automatica (blocco di formato in cache prima del prompt del documento); nuova tabella per le note della trascrizione (migrazione).
- Frontend: interruttore nelle impostazioni, editor nuovo, scheda Note nello Studio di trascrizione, conversione e controllo delle note a piè di pagina dopo la lettura.
- Documentazione: guida in-app, `docs/` e `docs/en/`, `docs-dev/`.
