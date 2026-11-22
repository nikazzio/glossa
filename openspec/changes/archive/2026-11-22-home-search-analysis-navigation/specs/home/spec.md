# Spec Delta

## Purpose

Definisce cosa mostra la Home, la schermata di partenza di Glossa, e come da lì si avvia una ricerca nelle biblioteche.

## ADDED Requirements

### Requirement: Casella di ricerca in cima alla Home
La Home SHALL mostrare in cima una casella di ricerca nelle biblioteche, visibile senza scorrere la pagina.

#### Scenario: Casella visibile all'apertura
- **WHEN** l'utente apre la Home
- **THEN** vede la casella di ricerca in cima, prima di ogni altro contenuto

### Requirement: Ricerca avviata dalla Home
Avviare una ricerca dalla casella della Home SHALL aprire la pagina Ricerca con la ricerca avviata e i suoi risultati. I risultati MUST comparire solo nella pagina Ricerca, mai nella Home.

#### Scenario: Ricerca di parole
- **WHEN** l'utente scrive delle parole nella casella della Home e conferma
- **THEN** si apre la pagina Ricerca, la ricerca parte con quelle parole e la voce Ricerca è attiva

#### Scenario: Casella vuota
- **WHEN** l'utente conferma la casella della Home senza aver scritto nulla
- **THEN** non parte nessuna ricerca

#### Scenario: Indirizzo o identificativo di un'opera
- **WHEN** l'utente incolla nella casella della Home l'indirizzo o l'identificativo di un'opera e conferma
- **THEN** si apre la pagina Ricerca con la proposta di aprire direttamente quell'opera

### Requirement: Contenuto conservato della Home
La Home SHALL conservare: filtro per workspace, comando aggiorna, riga dei numeri del materiale con l'accesso alle aree, riga «Questo mese», riquadri A che punto sei, Riprendi, Richiede attenzione e In corso, colonna dei job.

#### Scenario: Elementi presenti
- **WHEN** l'utente apre la Home
- **THEN** trova tutti gli elementi elencati, con lo stesso comportamento di prima

### Requirement: Titolo della riga dei numeri
La riga con i numeri del materiale SHALL chiamarsi «Il tuo materiale» in italiano, con un equivalente inglese. Il termine «Patrimonio» MUST non comparire.

#### Scenario: Interfaccia in italiano
- **WHEN** l'interfaccia è in italiano
- **THEN** la riga dei numeri porta il nome «Il tuo materiale»

### Requirement: Riquadro Ricerche fuori dalla Home
La Home MUST non mostrare il riquadro «Ricerche». Le ricerche fatte SHALL restare consultabili nella pagina Ricerca, linguetta Storico.

#### Scenario: Ordine dei riquadri salvato in precedenza
- **WHEN** l'ordine dei riquadri salvato da una versione precedente contiene ancora «Ricerche»
- **THEN** la Home si apre senza quel riquadro, gli altri riquadri restano nell'ordine salvato e non compare nessun errore

### Requirement: Accesso alle Statistiche da «Questo mese»
Il comando accanto a «Questo mese» SHALL aprire Analisi → Statistiche.

#### Scenario: Apertura delle Statistiche
- **WHEN** l'utente clicca il comando accanto a «Questo mese»
- **THEN** si aprono le Statistiche e nella barra risultano attive Analisi e Statistiche
