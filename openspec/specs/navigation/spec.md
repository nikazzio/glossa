# navigation Specification

## Purpose
Definisce la struttura della barra di sinistra, la schermata su cui si apre l'app e dove portano i collegamenti fra le sezioni.

## Requirements

### Requirement: Ordine delle voci principali
La barra di sinistra SHALL mostrare, in quest'ordine: Home, Ricerca, poi il gruppo delle aree (Biblioteca, Trascrizioni, Traduzioni, Analisi), poi i workspace. Ricerca MUST stare fuori dal gruppo delle aree.

#### Scenario: Barra aperta
- **WHEN** l'utente guarda la barra di sinistra aperta
- **THEN** vede Home in cima, subito sotto Ricerca, poi il titolo delle aree con Biblioteca, Trascrizioni, Traduzioni e Analisi

#### Scenario: Barra chiusa
- **WHEN** la barra di sinistra è chiusa
- **THEN** Home e Ricerca restano raggiungibili come icone con il loro suggerimento

### Requirement: Home senza sotto-voci
La voce Home SHALL essere una voce singola, senza sotto-voci. Le voci Panoramica, Statistiche e Ricerca sotto la Home MUST non esistere più.

#### Scenario: Clic su Home
- **WHEN** l'utente clicca Home
- **THEN** si apre la Home e sotto la voce non compaiono altre voci

### Requirement: Analisi con la voce Statistiche
La voce Analisi SHALL avere sotto la voce Statistiche. Cliccare Analisi MUST aprire le Statistiche.

#### Scenario: Clic su Analisi
- **WHEN** l'utente clicca Analisi
- **THEN** si aprono le Statistiche e risultano attive sia Analisi sia Statistiche

#### Scenario: Clic su Statistiche
- **WHEN** l'utente clicca la voce Statistiche sotto Analisi
- **THEN** si aprono le Statistiche

### Requirement: Apertura dell'app sulla Home
All'avvio l'app SHALL aprirsi sulla Home.

#### Scenario: Avvio
- **WHEN** l'utente apre Glossa
- **THEN** vede la Home e la voce Home è attiva nella barra

### Requirement: Collegamenti verso le nuove posizioni
Ogni comando che oggi apre la vecchia Dashboard, le sue Statistiche o la sua Ricerca SHALL aprire rispettivamente Home, Analisi → Statistiche o Ricerca. Nessun comando MUST portare a una vista che non esiste più.

#### Scenario: Apertura di una ricerca da un job
- **WHEN** l'utente, nella colonna dei job, apre il job di una ricerca
- **THEN** si apre la pagina Ricerca con quella ricerca e la voce Ricerca è attiva

#### Scenario: Titolo in alto nella finestra
- **WHEN** l'utente clicca il titolo in alto nella finestra mentre è nella Home
- **THEN** resta o torna sulla Home

#### Scenario: Riapertura di una ricerca dallo Storico
- **WHEN** l'utente riapre una ricerca dalla linguetta Storico della pagina Ricerca
- **THEN** la ricerca si apre nella pagina Ricerca e la voce Ricerca resta attiva
