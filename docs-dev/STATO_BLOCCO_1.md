# Stato del blocco 1

Ultimo aggiornamento: 2026-08-24.

Branch di integrazione: `blocco-1`. PR finale: #429, ancora in bozza. Le PR del
blocco confluiscono qui; `main` riceverà un solo merge per la 1.5.

## Completato

| Area | Stato |
|---|---|
| Deposito e disponibilità | completata (#414) |
| Orchestratore dei lavori | completato (#415, #416) |
| Pannello e comandi dei lavori | completati (#417) |
| Impostazioni deposito e limiti | completate (#418) |
| Scaricamento IIIF | completato (#419, #443) |
| Catalogo Biblioteca | completato (#420) |
| Miniature locali | completate (#423) |
| Profili di rete | completati (#428) |
| Cache delle risorse remote | completata (#442) |
| Workspace come contesto operativo | completato (#439) |
| Registrazione di revisioni, chiamate e costi | completata |
| Backup completo del database | completato |
| Backup riservato | completato (#445) |

## PR #444 — ottimizzazione locale

La funzione riduce le pagine già scaricate come lavoro della coda. La conferma
indica pagine e spazio liberabile; il lavoro sostituisce i file atomicamente,
aggiorna impronte e miniature e non modifica altre cartelle di misura.

Rifiniture del 22 agosto:

- “Libera spazio” e “Togli opera” vengono rifiutati mentre uno scaricamento o
  un'ottimizzazione può scrivere la stessa digitalizzazione;
- ottimizzazioni successive conservano le dimensioni ricevute dalla biblioteca;
- preventivo e lavoro usano la stessa ricodifica e ignorano i file che non
  libererebbero spazio;
- pagine non leggibili o non riscrivibili vengono contate nel pannello e
  producono un esito di errore parziale;
- corretti gli errori `clippy` introdotti dai commenti documentali.

Suite automatica completa superata il 22 agosto: 913 test frontend e 436 test
Rust, con typecheck, lint frontend, formattazione e `clippy` puliti. Restano
prova manuale e CI prima del merge.

## Obbligatorio prima della 1.5

Nessun lavoro residuo nel blocco. La baseline è stata verificata su un
database di sviluppo ricreato e il backup cifrato è stato ripristinato
correttamente.

## Non bloccante

- misurazione delle undici biblioteche e prova del preriscaldamento Vaticano;
- concorrenza di più pagine per host;
- singola pagina a piena risoluzione, legata al futuro visore;
- parametri di ottimizzazione specifici per opera;
- esportazione/importazione di un workspace;
- notifiche di sistema;
- barra di stato e console complete;
- controllo spazio libero e primo avvio del deposito;
- applicazione del divieto di scaricamento dell'istituzione;
- ricucitura del legame pagina-segmento dopo un nuovo scaricamento;
- rilevamento reale dei segnaposto nelle cartelle sincronizzate;
- import CSV dei glossari interamente nel backend;
- livello bibliografico per gli stampati.

## Prove manuali della #444

1. Ottimizzare un libro scaricato a piena risoluzione e verificare conteggio,
   spazio liberato e integrità finale.
2. Ripetere l'ottimizzazione con un lato più basso e controllare che la misura
   originaria resti invariata.
3. Avviare scaricamento e provare “Libera spazio” e “Togli opera”: entrambi
   devono spiegare che il lavoro deve concludersi o essere annullato.
4. Mettere in pausa e riprendere l'ottimizzazione senza file parziali.
5. Inserire una pagina illeggibile e verificare conteggio nel pannello ed esito
   non riuscito.
6. Lanciare due volte la stessa ottimizzazione: il secondo passaggio non deve
   ricomprimere i file.
