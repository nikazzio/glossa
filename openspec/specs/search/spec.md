# search Specification

## Purpose
Definisce la ricerca nelle biblioteche: dove si trova, quali biblioteche si possono scegliere e come si raggiunge il sito di una biblioteca quando la ricerca dentro Glossa non basta.

## Requirements

### Requirement: Ricerca come sezione autonoma
La pagina Ricerca SHALL aprirsi dalla voce Ricerca della barra di sinistra e conservare tutti i suoi strumenti attuali: casella, menu «dove cercare», criteri avanzati, risultati ordinabili e filtrabili per biblioteca, pannello Esecuzione e linguetta Storico.

#### Scenario: Apertura dalla barra
- **WHEN** l'utente clicca Ricerca nella barra di sinistra
- **THEN** si apre la pagina Ricerca pronta per una nuova ricerca, con lo Storico consultabile, e la voce Ricerca è attiva

### Requirement: Collegamento al sito in ogni riga del pannello Esecuzione
Nel pannello Esecuzione ogni riga di biblioteca SHALL offrire il comando «Cerca sul sito della biblioteca», qualunque sia il suo stato (in corso, completata, senza risultati, errore). Il comando MUST aprire il sito con le parole cercate quando la biblioteca le accetta nell'indirizzo, altrimenti la sua pagina di ricerca.

#### Scenario: Biblioteca che non ha risposto
- **WHEN** una biblioteca della ricerca è in errore
- **THEN** la sua riga mostra, oltre a «riprova», il comando per cercare sul suo sito

#### Scenario: Biblioteca con risultati
- **WHEN** una biblioteca ha restituito risultati
- **THEN** la sua riga mostra comunque il comando per cercare sul suo sito

#### Scenario: Parole portate sul sito
- **WHEN** l'utente usa il comando su una biblioteca che accetta le parole nell'indirizzo
- **THEN** il sito si apre con le stesse parole già cercate

#### Scenario: Biblioteca senza indirizzo di ricerca
- **WHEN** una biblioteca non ha un indirizzo di ricerca noto
- **THEN** la sua riga non mostra il comando, senza errori

### Requirement: Avviso sulle biblioteche che non hanno risposto
L'avviso «N fonti non hanno risposto» SHALL portare al pannello Esecuzione, dove si trovano le righe di quelle biblioteche con il loro comando verso il sito.

#### Scenario: Clic sull'avviso
- **WHEN** l'utente clicca l'avviso sulle fonti che non hanno risposto
- **THEN** si apre il pannello Esecuzione con le righe di quelle biblioteche visibili

### Requirement: Collegamenti al sito fuori dal pannello Esecuzione
Il comando verso il sito SHALL restare sopra i risultati quando sono filtrati su una sola biblioteca. Sotto il messaggio di nessun risultato MUST NOT comparire una fila di comandi verso i siti: una riga SHALL rimandare al pannello Esecuzione, con il comando per aprirlo quando è aperta un'altra linguetta.

#### Scenario: Nessun risultato
- **WHEN** una ricerca non trova nulla
- **THEN** sotto il messaggio compare la riga che rimanda al pannello Esecuzione e nessuna fila di comandi verso i siti

#### Scenario: Nessun risultato con un'altra linguetta aperta
- **WHEN** una ricerca non trova nulla e a destra è aperta la linguetta Storico
- **THEN** accanto alla riga c'è il comando che apre il pannello Esecuzione

### Requirement: Biblioteche consultabili solo sul loro sito
Il menu «dove cercare» SHALL elencare, in un gruppo separato dalle biblioteche interrogabili, le biblioteche che Glossa non sa interrogare ma di cui conosce il sito. Scegliere una di queste MUST aprire il suo sito con le parole scritte nella casella, se le accetta, senza avviare una ricerca in Glossa.

#### Scenario: Scelta di una biblioteca solo sul sito
- **WHEN** l'utente sceglie nel menu una biblioteca del gruppo separato, con delle parole nella casella
- **THEN** si apre il sito di quella biblioteca con quelle parole e in Glossa non parte nessuna ricerca

#### Scenario: Scelta senza parole
- **WHEN** l'utente sceglie una biblioteca del gruppo separato con la casella vuota
- **THEN** si apre la pagina di ricerca del sito di quella biblioteca

#### Scenario: Ricerca in tutte le biblioteche
- **WHEN** l'utente cerca in «tutte»
- **THEN** le biblioteche del gruppo separato non vengono interrogate

#### Scenario: Ritorno in Glossa con un'opera trovata sul sito
- **WHEN** l'utente incolla nella casella l'indirizzo di un'opera trovata sul sito della biblioteca
- **THEN** Glossa propone di aprire direttamente quell'opera, come per le altre biblioteche
