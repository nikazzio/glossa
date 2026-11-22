# Spec Delta

## Purpose

Definisce l'area Analisi, dove si osserva il lavoro svolto, e la sua vista Statistiche su avanzamento, costi, qualità e tempi.

## ADDED Requirements

### Requirement: Statistiche dentro Analisi
Le Statistiche SHALL essere una vista dell'area Analisi. L'area Analisi MUST non mostrare più la pagina vuota «non ha ancora contenuto».

#### Scenario: Apertura di Analisi
- **WHEN** l'utente apre Analisi
- **THEN** vede le Statistiche e non la pagina vuota

### Requirement: Statistiche invariate
Le Statistiche SHALL conservare contenuto, riquadri riordinabili e filtri attuali: workspace e periodo (30 giorni, 6 mesi, tutto). L'ordine dei riquadri e il periodo scelti in precedenza MUST restare validi.

#### Scenario: Filtri conservati
- **WHEN** l'utente apre le Statistiche dopo l'aggiornamento
- **THEN** trova lo stesso periodo scelto in precedenza e i riquadri nello stesso ordine

#### Scenario: Filtro per workspace
- **WHEN** l'utente sceglie un workspace nel filtro delle Statistiche
- **THEN** i riquadri che dipendono dal workspace si aggiornano come prima
