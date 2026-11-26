# Spec Delta

## ADDED Requirements

### Requirement: Lettura automatica delle pagine estratte da un PDF

La lettura automatica SHALL funzionare sulle pagine estratte da un PDF
importato, con le stesse regole delle altre opere (prompt, cache, note, costi,
log). L'immagine inviata SHALL essere letta solo dal computer.

#### Scenario: Lettura di una pagina estratta

- **WHEN** lo studioso avvia «Leggi questa pagina» su una pagina estratta da un
  PDF importato
- **THEN** la lettura usa l'immagine sul computer e salva testo e note come per
  le altre opere

### Requirement: Lettura automatica senza pagine estratte

Se la pagina non è stata estratta, la lettura automatica SHALL fermarsi con un
messaggio che dice che la pagina non è sul computer e invita a estrarre le
pagine, senza richieste di rete né addebiti. Su un documento che usa ancora la
sola copia PDF, il comando «Leggi questa pagina» SHALL dire che servono le
pagine estratte.

#### Scenario: Pagina non estratta

- **WHEN** lo studioso avvia la lettura su una pagina che non è ancora stata
  estratta
- **THEN** compare il messaggio che la pagina non è sul computer e va estratta
- **AND** non parte nessuna richiesta di rete né alcun addebito

#### Scenario: Documento sul solo PDF

- **WHEN** il documento è aperto sulla copia PDF e le pagine non sono estratte
- **THEN** il comando «Leggi questa pagina» spiega che servono le pagine
  estratte
