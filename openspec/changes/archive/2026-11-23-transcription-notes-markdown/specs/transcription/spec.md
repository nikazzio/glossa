# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Il prompt del documento è l'unica istruzione della lettura automatica`
- TO: `### Requirement: Il prompt del documento è l'unica istruzione editoriale della lettura automatica`

## MODIFIED Requirements

### Requirement: Il prompt del documento è l'unica istruzione editoriale della lettura automatica

La lettura automatica di una pagina SHALL inviare al modello il prompt in vigore per il documento, l'immagine della pagina e una frase fissa e neutra che accompagna l'immagine. L'unica altra istruzione di Glossa SHALL essere il blocco di formato delle note, quando è attivo. Glossa MUST NOT aggiungere istruzioni proprie su ruolo, regole editoriali, a capo, commenti o intestazioni. Il prompt in vigore SHALL essere, in ordine di precedenza: il prompt del documento, altrimenti il prompt OCR predefinito del workspace, altrimenti il prompt di partenza di Glossa.

#### Scenario: Un prompt personale non è contraddetto
- **WHEN** il documento ha un prompt che chiede testo continuo, commenti fra parentesi graffe e un segno di pagina iniziale, le note separate sono spente, e si avvia la lettura di una pagina
- **THEN** il prompt inviato, visibile nel log della trascrizione, contiene quel prompt e nessun'altra istruzione su a capo, commenti o intestazioni

#### Scenario: Documento senza prompt proprio
- **WHEN** il documento non ha un prompt proprio e il workspace ha un prompt OCR predefinito
- **THEN** la lettura usa il prompt del workspace

#### Scenario: Nessun prompt configurato
- **WHEN** né il documento né il workspace hanno un prompt OCR
- **THEN** la lettura usa il prompt di partenza di Glossa

## ADDED Requirements

### Requirement: Blocco di formato per le note separate

La scheda OCR delle impostazioni del workspace SHALL avere l'interruttore «Note separate dal testo», acceso all'inizio. Quando è acceso, la lettura automatica SHALL inviare un blocco fisso di Glossa che chiede Markdown standard e le note come note a piè di pagina, nella forma «tipo, passaggio citato fra «», testo». Il blocco SHALL stare prima del prompt del documento, in cache, e comparire nel prompt mostrato dal log.

#### Scenario: Interruttore acceso
- **WHEN** le note separate sono accese e si legge una pagina
- **THEN** il prompt mostrato nel log contiene prima il blocco di formato e poi il prompt del documento

#### Scenario: Interruttore spento
- **WHEN** le note separate sono spente e si legge una pagina
- **THEN** il prompt contiene solo il prompt del documento, il testo della risposta è salvato com'è e non nasce nessuna nota

#### Scenario: Impostazione cambiata durante una lettura
- **WHEN** si spegne l'interruttore mentre è in coda la lettura di più pagine
- **THEN** le pagine già in coda seguono l'impostazione in vigore quando la lettura è stata avviata

### Requirement: Le note della risposta diventano note della pagina

Con le note separate accese, dopo ogni lettura riuscita Glossa SHALL togliere dal testo i segni e le definizioni delle note a piè di pagina e salvare ogni nota come nota della pagina, con tipo, passaggio citato, occorrenza e testo. Il testo salvato come nuova versione MUST NOT contenere segni di nota. Una nota senza segno nel testo e senza passaggio SHALL diventare una nota della pagina senza passaggio.

#### Scenario: Risposta con due note
- **WHEN** il modello risponde «Et dixit[^1] dominus» con la nota «[^1]: Doubt «et dixit» — lettura incerta»
- **THEN** la nuova versione contiene «Et dixit dominus», e la scheda Note mostra una nota Dubbio agganciata a «Et dixit» con testo «lettura incerta»

#### Scenario: Nota sulla pagina intera
- **WHEN** la risposta contiene «[^p1]: Note — inchiostro sbiadito» senza segno nel testo
- **THEN** la scheda Note mostra nel gruppo «Pagina» una nota di tipo Nota con testo «inchiostro sbiadito»

### Requirement: Tipi di nota della trascrizione

Ogni nota SHALL avere uno di questi tipi: Intervento (Emendation), Dubbio (Doubt), Aggiunta (Addition), Correzione (Correction), Resa grafica (Typography), Abbreviazione (Abbreviation), Nota (Note). Glossa SHALL riconoscere il tipo scritto dal modello sia in inglese sia in italiano, senza badare alle maiuscole. Una nota con tipo assente o sconosciuto SHALL diventare di tipo Nota, e il log SHALL segnalarlo.

#### Scenario: Tipo in italiano
- **WHEN** il modello scrive «[^1]: dubbio «et» — incerto»
- **THEN** la nota è di tipo Dubbio

#### Scenario: Tipo sconosciuto
- **WHEN** il modello scrive «[^1]: Glossa «et» — mano tarda»
- **THEN** la nota è di tipo Nota e il log della lettura dice che una nota aveva un tipo non riconosciuto

### Requirement: Aggancio della nota al passaggio

Glossa SHALL cercare il passaggio citato subito prima del segno della nota e registrare quale occorrenza è. Il confronto SHALL tollerare differenze di spazi, maiuscole e punteggiatura. Una nota il cui passaggio non si trova SHALL essere conservata come «da riagganciare». Il log della lettura SHALL dire quante note sono arrivate e quante non si sono agganciate.

#### Scenario: Parola ripetuta
- **WHEN** il testo contiene due volte «dominus» e il segno della nota sta dopo la seconda
- **THEN** la nota è agganciata alla seconda occorrenza

#### Scenario: Citazione con maiuscole diverse
- **WHEN** il testo dice «Et dixit,» e la nota cita «et dixit»
- **THEN** la nota è agganciata a «Et dixit»

#### Scenario: Citazione non trovata
- **WHEN** la nota cita un passaggio che non compare prima del segno
- **THEN** la nota è salvata nel gruppo «Da riagganciare» e il log riporta «5 note, 1 non agganciata» se le note erano cinque

### Requirement: Le note appartengono alla pagina e non si perdono

Le note SHALL appartenere alla pagina, non a una sua versione. Quando il testo della pagina cambia, una nota agganciata SHALL seguire il suo passaggio finché esiste l'occorrenza registrata. Se il passaggio sparisce, la nota SHALL passare in «Da riagganciare», in grigio, e MUST NOT essere cancellata.

#### Scenario: Testo modificato a mano
- **WHEN** si aggiunge una frase prima di un passaggio annotato
- **THEN** l'evidenziazione resta sul passaggio annotato

#### Scenario: Passaggio cancellato
- **WHEN** si cancella dal testo il passaggio di una nota
- **THEN** la nota resta nella scheda, nel gruppo «Da riagganciare»

#### Scenario: Ripristino di una versione precedente
- **WHEN** si ripristina dallo Storico una versione precedente
- **THEN** le note restano quelle della pagina e si riagganciano al testo ripristinato dove il passaggio c'è

### Requirement: Rilettura di una pagina già letta

Prima di leggere automaticamente una pagina che ha già una lettura automatica, Glossa SHALL chiedere conferma, dicendo quante note del modello verranno sostituite. Dopo la nuova lettura, le note del modello della lettura precedente SHALL essere sostituite da quelle nuove; le note scritte o modificate a mano SHALL restare e riagganciarsi al testo nuovo.

#### Scenario: Seconda lettura con note corrette
- **WHEN** la pagina ha 5 note del modello, una delle quali modificata a mano, più una nota scritta a mano, e si conferma una nuova lettura che produce 6 note
- **THEN** la scheda mostra le 6 note nuove, la nota modificata e la nota scritta a mano

#### Scenario: Rilettura annullata
- **WHEN** si annulla la conferma
- **THEN** non parte nessuna lettura e le note non cambiano

#### Scenario: Prima lettura
- **WHEN** la pagina non ha mai avuto una lettura automatica
- **THEN** la lettura parte senza conferma

### Requirement: Scheda Note dello Studio di trascrizione

Lo Studio di trascrizione SHALL avere una scheda Note con tre gruppi, mostrati solo se non vuoti: «Pagina» (note senza passaggio), «Nel testo» (in ordine di lettura), «Da riagganciare» (in grigio). Ogni nota SHALL mostrare icona e nome del tipo, passaggio citato e testo. In cima, un filtro per tipo SHALL mostrare il numero di note di ciascun tipo.

#### Scenario: Filtro sui dubbi
- **WHEN** la pagina ha 3 dubbi e 6 note di altri tipi e si sceglie il filtro Dubbio
- **THEN** la scheda mostra solo i 3 dubbi

#### Scenario: Pagina senza note
- **WHEN** la pagina non ha note
- **THEN** la scheda mostra lo stato vuoto e il comando per aggiungerne una

### Requirement: Comandi sulle note

Ogni nota SHALL offrire, al passaggio del mouse, i comandi trova nel testo, modifica ed elimina; una nota «da riagganciare» SHALL offrire anche l'aggancio al testo selezionato. Si SHALL poter creare una nota dalla scheda, senza passaggio, oppure dal testo selezionato, con passaggio e occorrenza registrati da soli. Il testo della nota si scrive con lo stesso editor della pagina, in versione compatta.

#### Scenario: Nota dal testo selezionato
- **WHEN** si seleziona «dominus» nella seconda occorrenza e si usa il comando o la scorciatoia per creare una nota
- **THEN** nasce una nota agganciata alla seconda occorrenza di «dominus»

#### Scenario: Riaggancio
- **WHEN** si seleziona un passaggio nel testo e si clicca l'aggancio su una nota «da riagganciare»
- **THEN** la nota passa nel gruppo «Nel testo», agganciata al passaggio selezionato

#### Scenario: Trova nel testo
- **WHEN** si clicca «trova nel testo» su una nota agganciata
- **THEN** il testo scorre fino al passaggio e lo seleziona

### Requirement: Evidenziazione dei passaggi annotati

Nel testo della pagina ogni passaggio annotato SHALL essere evidenziato con un solo colore, uguale per tutti i tipi, in scrittura e in lettura. Al passaggio del mouse SHALL comparire il tipo e l'inizio della nota. Un clic sul passaggio SHALL aprire la scheda Note e portare in vista la sua nota.

#### Scenario: Clic su un passaggio evidenziato
- **WHEN** si clicca un passaggio evidenziato mentre è aperta la scheda Storico
- **THEN** si apre la scheda Note con la nota di quel passaggio in vista e in risalto

### Requirement: Editor della pagina di trascrizione

La pagina di trascrizione SHALL avere due modalità, Scrivi e Leggi. I comandi del testo (nota sul testo selezionato, formattazione e dimensione del testo, copia) SHALL stare in colonna nel margine destro della pagina, come icone con suggerimento. Il testo della pagina MUST NOT contenere segni di nota.

#### Scenario: Passaggio a Leggi
- **WHEN** si sceglie Leggi
- **THEN** il testo appare formattato, con i passaggi annotati evidenziati

#### Scenario: Barra sopra il testo
- **WHEN** si apre una pagina
- **THEN** la barra sopra il testo mostra titolo, verifica, salvataggio e l'eventuale lettura in corso, e nessun comando di formattazione

### Requirement: Comando di lettura sempre visibile nello Studio

Il comando «Leggi questa pagina» SHALL stare sopra le schede della colonna Strumenti, visibile da ogni scheda, con accanto servizio e modello in uso e il costo dell'ultima lettura della pagina. Durante la lettura SHALL mostrare lo stato in corso; quando non si può usare, il motivo SHALL stare nel suggerimento. Le schede SHALL essere, in ordine, Note, Storico, OCR, Riepilogo; lo Studio SHALL aprirsi su Note.

#### Scenario: Lettura dalla scheda Riepilogo
- **WHEN** è aperta la scheda Riepilogo
- **THEN** il comando di lettura è visibile e si può usare senza cambiare scheda

#### Scenario: Pagina senza immagine
- **WHEN** la pagina non ha un'immagine disponibile
- **THEN** il comando è spento e il suggerimento ne spiega il motivo

### Requirement: Pannello del prompt della lettura automatica

Il prompt del documento nella scheda OCR e il prompt di partenza nelle impostazioni OCR del workspace SHALL usare lo stesso pannello. Le modifiche SHALL restare in bozza finché non si salvano, con comandi distinti per salvare e per scartare. Salvare MUST NOT creare un modello. Accanto al titolo SHALL comparire la provenienza: predefinito, personalizzato, modello, modello modificato; in modifica anche «non salvato».

#### Scenario: Modifica scartata
- **WHEN** si modifica il prompt del documento e si sceglie scarta
- **THEN** il prompt del documento resta quello di prima

#### Scenario: Modifica salvata senza modello
- **WHEN** si modifica il prompt e si sceglie salva
- **THEN** il documento usa il testo nuovo, la provenienza dice «Personalizzato» e l'elenco dei modelli non cambia

#### Scenario: Bozza conservata cambiando scheda
- **WHEN** si modifica il prompt, si apre la scheda Note e si torna alla scheda OCR
- **THEN** la bozza è ancora lì, non salvata

### Requirement: Modelli di prompt dal pannello

Il menu dei modelli del pannello SHALL elencare i modelli della lettura automatica con ricerca e, per ognuno, i comandi usa, aggiorna con il testo attuale ed elimina, quest'ultimo con conferma nella riga. In fondo SHALL esserci il comando per salvare il testo attuale come nuovo modello, con un nome.

#### Scenario: Modello applicato e poi modificato
- **WHEN** si usa il modello «Minuta» e se ne cambia una riga
- **THEN** la provenienza dice «Modello «Minuta», modificato»

#### Scenario: Eliminare un modello vecchio
- **WHEN** si elimina un modello dal menu e si conferma nella riga
- **THEN** il modello sparisce dall'elenco e il prompt del documento non cambia

### Requirement: Scelta del modello per documento

La scheda OCR SHALL mostrare servizio e modello in uso; finché il documento segue il workspace le scelte SHALL essere spente con la riga «dal workspace». Il comando «personalizza per questo documento» SHALL renderle modificabili per il solo documento, con la riga «solo questo documento»; usato di nuovo, il documento torna a seguire il workspace. Servizio e modello nel blocco di lettura SHALL aprire la scheda OCR.

#### Scenario: Personalizzare il modello di un documento
- **WHEN** si usa «personalizza per questo documento» e si sceglie un altro modello
- **THEN** le letture di quel documento usano il nuovo modello e la riga dice «solo questo documento»

#### Scenario: Dal blocco di lettura alla scheda OCR
- **WHEN** è aperta la scheda Note e si clicca il nome del modello sopra le schede
- **THEN** si apre la scheda OCR

