# Spec Delta

## Purpose

La trascrizione dei documenti in Glossa, compresa la lettura automatica delle pagine con un modello linguistico: quali istruzioni riceve il modello, da dove vengono e come se ne contiene il costo.

## ADDED Requirements

### Requirement: Il prompt del documento è l'unica istruzione della lettura automatica

La lettura automatica di una pagina SHALL inviare al modello soltanto il prompt in vigore per il documento, l'immagine della pagina e una frase fissa e neutra che accompagna l'immagine. Glossa MUST NOT aggiungere altre istruzioni proprie su ruolo, formato di uscita, a capo, commenti o intestazioni. Il prompt in vigore SHALL essere, in ordine di precedenza: il prompt del documento, altrimenti il prompt OCR predefinito del workspace, altrimenti il prompt di partenza di Glossa.

#### Scenario: Un prompt personale non è contraddetto
- **WHEN** il documento ha un prompt che chiede testo continuo, commenti fra parentesi graffe e un segno di pagina iniziale, e si avvia la lettura di una pagina
- **THEN** il prompt inviato, visibile nel log della trascrizione, contiene quel prompt e nessun'altra istruzione su a capo, commenti o intestazioni

#### Scenario: Documento senza prompt proprio
- **WHEN** il documento non ha un prompt proprio e il workspace ha un prompt OCR predefinito
- **THEN** la lettura usa il prompt del workspace

#### Scenario: Nessun prompt configurato
- **WHEN** né il documento né il workspace hanno un prompt OCR
- **THEN** la lettura usa il prompt di partenza di Glossa

### Requirement: Il prompt del documento è riusato dalla cache del servizio

Quando il servizio scelto supporta la cache delle istruzioni, la lettura automatica SHALL chiedere di tenere in cache il prompt del documento, così che le letture successive dello stesso documento con lo stesso prompt possano riusarlo. L'immagine della pagina MUST restare nel messaggio utente e MUST NOT far parte della porzione in cache. Il log della trascrizione SHALL riportare, per ogni lettura, i token letti dalla cache quando il servizio li dichiara.

#### Scenario: Due pagine lette di seguito
- **WHEN** si leggono due pagine dello stesso documento, con lo stesso prompt, entro la durata della cache del servizio, e il prompt raggiunge la lunghezza minima che il servizio mette in cache
- **THEN** il log della seconda lettura mostra token letti dalla cache

#### Scenario: Il prompt cambia
- **WHEN** si modifica il prompt del documento fra una lettura e l'altra
- **THEN** la lettura successiva non riusa la cache del prompt precedente e usa il prompt nuovo per intero

#### Scenario: Documenti diversi
- **WHEN** due documenti hanno prompt diversi
- **THEN** la lettura di un documento non riusa la cache dell'altro

### Requirement: Il costo stimato tiene conto della cache

Il costo stimato di una chiamata SHALL addebitare i token letti dalla cache al prezzo ridotto del modello, quando quel prezzo è noto, e gli altri token di input al prezzo normale. Per un modello senza prezzo ridotto noto, il costo SHALL restare calcolato come se la cache non ci fosse. La regola vale per ogni superficie che mostra costi: log della trascrizione, Riepilogo, log e statistiche della traduzione.

#### Scenario: Lettura con token in cache
- **WHEN** una lettura con un modello OpenAI GPT-5.6 invia 4.441 token di input, di cui 1.930 letti dalla cache, e ne riceve 2.738
- **THEN** il costo stimato addebita 2.511 token al prezzo di input, 1.930 a un decimo di quel prezzo e 2.738 al prezzo di output

#### Scenario: Modello senza prezzo ridotto noto
- **WHEN** una chiamata usa un modello per cui il prezzo dei token in cache non è noto
- **THEN** il costo stimato è quello calcolato senza sconto

### Requirement: Righe del log della trascrizione leggibili

Ogni riga del log della trascrizione SHALL restare su una sola riga di intestazione e dire in parole: ora, servizio e modello, durata, token inviati con quanti letti dalla cache, token ricevuti, costo stimato. Una voce assente non SHALL comparire.

#### Scenario: Esito di una lettura con cache
- **WHEN** una lettura è conclusa con token in cache
- **THEN** la riga mostra ad esempio «12:53:58 OpenAI gpt-5.6-terra · 32,8 s · inviati 4.441 token (1.930 dalla cache) · ricevuti 2.738 · ≈ $0.05», con il costo nel formato usato nel resto dell'app

### Requirement: Riepilogo della trascrizione

La scheda Riepilogo dello Studio di trascrizione SHALL mostrare tre sezioni.
- **Pagina aperta:** numero ed etichetta, stato, versioni divise fra lettura automatica e mano, letture automatiche con l'ora dell'ultima, costo della pagina.
- **Documento:** pagine con testo, pagine verificate con la barra di avanzamento, parole e caratteri.
- **Lettura automatica del documento:** letture riuscite ed errori, pagine lette e quante rilette, token inviati con la percentuale dalla cache, token ricevuti, costo stimato totale e per pagina letta, tempo medio per lettura, modelli usati.

Le voci senza dati SHALL essere omesse oppure mostrare zero, mai valori inventati.

#### Scenario: Documento con letture ripetute
- **WHEN** un documento ha 14 letture riuscite su 11 pagine e un errore
- **THEN** il Riepilogo mostra 14 letture riuscite, 1 errore, 11 pagine lette di cui 3 rilette

#### Scenario: Lettura che non crea una nuova versione
- **WHEN** con il Riepilogo aperto una lettura finisce con un errore o con un testo identico al precedente
- **THEN** i totali della lettura automatica si aggiornano senza riaprire la scheda

#### Scenario: Token inviati con Anthropic
- **WHEN** una lettura con Anthropic registra 500 token di input e 2.000 letti dalla cache
- **THEN** log e Riepilogo mostrano 2.500 token inviati, di cui 2.000 dalla cache

#### Scenario: Pagina mai letta automaticamente
- **WHEN** la pagina aperta ha solo versioni scritte a mano
- **THEN** la sezione della pagina mostra le versioni a mano e nessuna lettura automatica, senza costo
