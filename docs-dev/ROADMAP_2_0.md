# Roadmap della beta privata

## Stato corrente

Glossa permette di cercare fonti in più biblioteche, conservarle e consultarle,
trascrivere con assistenza OCR, tradurre con glossari e memoria, revisionare ed
esportare. Sono integrati Studio di trascrizione e traduzione, contesto e
composizione dei prompt, lingue e varietà dell’opera, corpus con revisioni e
misure multiple, Home con casella di ricerca, Ricerca come voce autonoma e
Statistiche dentro Analisi. Le superfici condividono le regole
di leggibilità e il pannello OCR distingue la scelta dell’immagine dalle istruzioni.

Le issue #311 (modifica dei prompt salvati) e #489 (contesto e lingue) sono
chiuse. Le epiche sono chiuse: il lavoro residuo sta nelle issue citate qui.
Lo Studio di traduzione resta utilizzabile mentre si completa la Trascrizione;
il suo consolidamento viene dopo il percorso descritto qui sotto.

## Ordine dei prossimi interventi

Priorità: completare la Trascrizione lavorando soprattutto pagina per pagina,
con controllo a vista. Si parte dalle issue esistenti; ogni intervento si
definisce e si approva in OpenSpec prima di implementarlo. Pulizia del codice,
UI/UX, design system e guide accompagnano ciascun intervento.

1. **Importare PDF e metadati acquisiti fuori da Glossa: priorità alta.**
   Portare in Biblioteca un PDF scaricato dal browser, anche quando la
   biblioteca blocca le richieste automatiche. Associare il manifest, quando
   disponibile; in sua assenza, definire come collegare la scheda della
   biblioteca o recuperare autore e altri metadati da fonti alternative,
   rendendo visibili provenienza e dati da confermare. Il download diretto
   del PDF dentro Glossa esiste già ed è distinto da questa importazione.
   Includere il percorso di OCR delle pagine PDF, già richiesto da #502.
   Il dettaglio dell'importazione va definito in OpenSpec.
2. **Valutare il metodo editoriale punto per punto (#502).** Le note separate
   dal testo sono già fatte. Discutere singolarmente minuta e trascrizione
   pulita, passaggi fra fasi, dubbi dell'intero documento, cartulazione, stati
   di revisione e controllo del curatore, profili riusabili. Il contenuto
   dell'issue non implica che serva tutto né una grande catena automatica:
   scegliere e specificare i singoli interventi prima di implementarli.
3. **Strumenti visivi, ritagli e catalogazione come insieme unico
   (#221, #222, #223).** Progettare un percorso continuo: migliorare la
   leggibilità della pagina, ritagliare un segno, classificarlo, ritrovarlo e
   confrontarlo con altre occorrenze. Comprendere regolazioni di luce,
   contrasto, gamma e colori; ricercare e valutare sui materiali reali gli
   altri strumenti utili a scansioni vecchie, stampe deboli e foto difficili.
   Il catalogo raccoglie grafemi, glifi, abbreviazioni, parole e altre scritte,
   con categorie, note e provenienza. Progettazione comune, implementazione
   suddivisa in change OpenSpec gestibili; scelte degli strumenti e UI da
   approvare, senza assumere un elenco definitivo di algoritmi.
4. **Esportazione della trascrizione (#500, #375).** Alla fine, quando testo,
   note e materiali da consegnare sono definiti: documento unico con pagine
   ordinate e segni di pagina; decidere formati, resa delle note e cartella
   predefinita di destinazione.
5. **Valutare il tag 2.0.** Il punto previsto è dopo questo percorso di
   Trascrizione, dall'acquisizione del documento alla consegna del risultato,
   provato sui materiali reali. La pubblicazione richiede una decisione
   esplicita; non dipende dal completamento di tutto il backlog.
6. **Poi completare la Traduzione e affrontare il resto.** Consolidare il
   flusso, fare il refactor necessario e uniformare codice e UI/UX; dettaglio
   e ordine degli interventi da definire prima dell'implementazione.

La lettura automatica a intervalli o di più pagine (#499) è secondaria: non è
una condizione per completare questo percorso o valutare il tag 2.0.
Anche immagini o trascrizioni delle pagine vicine come contesto dell'OCR
restano un eventuale esperimento successivo, non un requisito: nella minuta
le parole spezzate al confine della pagina possono restare tali.

### Consolidamento successivo della Traduzione (#503, #224)

La pagina di trascrizione e la scheda Note usano già l'editor nuovo;
testo di partenza, traduzione e pagina della fonte in Biblioteca devono
ancora adottarlo. Estenderlo un'area alla volta, con specifica e schema
approvati, poi eliminare l'editor sostituito. Valutare insieme l'unificazione
delle note e il passaggio dei prompt della traduzione al pannello condiviso.
Completare il collegamento dalla trascrizione approvata alla traduzione
preservando versione, provenienza e workspace (#224).

#485 raccoglie più interventi: restano il ripensamento del collasso della barra
e gli altri rilievi storici, da confrontare prima con l’app attuale. Di #210
vanno verificati i criteri residui prima di chiuderla.

## Ricerca e Biblioteca

La ricerca persistente, i lavori per fonte/pagina, i risultati progressivi,
il monitor e i rilanci sono disponibili. La Biblioteca contiene il catalogo
personale; la ricerca esterna resta globale, il workspace è destinazione di
aggiunta e non filtro dei cataloghi remoti.

- #468: operatori booleani e filtri nativi verificati per biblioteca; distinguere
  restrizioni inviate al servizio dai filtri applicati ai risultati ricevuti.
- #487: ricerca nel testo delle pagine separata dalla ricerca nei metadati e
  comando «cerca in questo libro» dove supportato. Non promettere pagine o
  estratti quando il servizio non li restituisce.
- #397/#472: copertura delle fonti, prima Europa e poi grandi raccolte
  internazionali. Verificare capacità e limiti reali prima di rendere una fonte
  disponibile; nessun aggiramento dei controlli anti-bot o crawling massivo.
- Residui da valutare sui casi reali: filtri per campo, retry configurabili,
  archiviazione/eliminazione delle ricerche, paginazione server dei risultati,
  confronto affiancato delle occorrenze e riepiloghi per workspace.
- Deposito/metadati (#183/#187): rivalutare i residui di primo avvio, spazio
  libero, segnaposto cloud, spostamento, valori multipli e ottimizzazione per
  opera prima di implementarli. Le vecchie descrizioni non provano un’assenza attuale.

## Percorso fonte → trascrizione → traduzione

- #221/#222/#223 e #208/#209: strumenti visivi, ritagli e catalogazione
  compresi nel percorso prioritario di Trascrizione sopra; corpus di evidenze
  visive collegato al corpus testuale ma distinto da esso.
- #224/#189: creare una traduzione dal testo approvato preservando versione,
  provenienza e workspace; non partire direttamente da immagini grezze.
- #227: selezionare passaggi, pagine e sezioni anche multipagina; classificazione
  assistita con conferma, ricerca ibrida e analisi estese. Unità, revisioni,
  tag manuali, provenienza e misure multiple sono già nella fondazione.
- #391: motore locale FastEmbed e rigenerazione esplicita tramite coda, con
  modello, ambito, progresso ed errori visibili. Conservare le altre misure;
  confrontare solo provider/modello/dimensioni/profili compatibili.

## Export, portabilità e Analisi

- #188/#225: Export Studio contestuale, profili e risultati tracciati; formati
  base scelti dai casi d’uso, senza aspettare tutte le estensioni di #192.
- #434: esportare/importare un workspace come nuovo contesto, rigenerando
  identificatori e collegamenti senza sovrascrivere gli altri. È distinto dal
  backup dell’intera app e non è un lavoro piccolo.
- Import CSV dei glossari nel backend: residuo da affrontare nel percorso export/import.
- #377/#379: oltre alle Statistiche presenti, esplorazione filtrabile, accesso
  agli oggetti di origine, confronti controllati e viste salvate.
- #382/#380/#381: allineamento semantico, dataset versionati e modelli locali;
  priorità e minimo necessario alla beta da definire sui materiali reali.
  L’addestramento resta esterno. Confronti fra testimoni, vocabolari multilingui
  e tag automatici sono estensioni successive.

## Rimandati e manutenzione

- #469: traduzione nella coda persistente. Rimandati anche sblocco dei prompt
  con frammenti già tradotti e ulteriori rifiniture UI/UX delle traduzioni.
- #408: monitorare le eccezioni rkyv e SQLite (`libsqlite3-sys` bloccata da
  `tauri-plugin-sql`/`sqlx` 0.8); riesaminarle a ogni aggiornamento upstream.
  Motivazioni e criteri di rimozione in ARCHITECTURE; nessun monitor automatico configurato.
- Aggiornamenti di librerie rimandati, per rischio:
  - medio: `quick-xml` (import Word, ricerca Gallica/MDZ), `reqwest` (tutte le
    chiamate di rete), `schemars` (schemi delle risposte strutturate), `rand`;
    interfaccia: `lucide-react` 1, `@iconify-icons/game-icons` 2, `i18next`/`react-i18next`,
    `motion`; strumenti: ESLint 10, Vitest 5, jsdom, jest-dom;
  - alto: `aes-gcm`/`argon2` (cifratura di backup e chiavi) e `keyring` 4
    (chiavi API salvate), da provare con backup e chiavi reali;
  - TypeScript 7 quando gli strumenti lo supportano; `@types/node` resta sulla
    versione di Node usata;
  - bloccati: `sqlx`, `rusqlite`, `libsqlite3-sys`, `gtk` (legato a Tauri).
- #410/#402: evoluzione delle risposte strutturate senza duplicare il contratto esistente.
- #495: chiudere i processi rimasti attivi alla chiusura dell’app.
- #496: spostare il comando di aggiornamento dell’app, oggi nella guida; posizione da decidere.
- Da valutare separatamente: anteprima di audit/coerenza sul frammento, fasi configurabili.
- #186/#446: Scriptoria resta riferimento tecnico; #383/#404 raccolgono
  riferimenti di prodotto e approfondimenti bibliografici.
- Nuovi formati, cloud, varianti dei prompt e altre estensioni restano nel backlog.

## Criteri di completamento e distribuzione

La beta resta privata: il numero di versione non misura la completezza.
La PR automatica #386 è una proposta di rilascio. Il tag 2.0 si valuta dopo il
percorso prioritario di Trascrizione sopra, prima del consolidamento della
Traduzione e del resto del backlog; non è una pubblicazione automatica né
richiede lettura a intervalli o contesto OCR dalle pagine vicine.

Prima della distribuzione: percorso completo su materiali reali, salvataggio e
riavvio, interruzione/ripresa, backup e recupero, prova installata sui sistemi
supportati, limiti dei servizi dichiarati, guide IT/EN coerenti e controlli verdi.
Il backup esclude deposito e credenziali; il ripristino non importa un singolo
workspace. Le modifiche allo schema non autorizzano cancellazioni automatiche.
Prima di distribuire all’esterno va fissata una politica stabile di migrazione.

GitHub conserva requisiti e criteri delle singole attività; questa roadmap
ne ordina le priorità. Architettura e guide descrivono il comportamento corrente.
Le prove e le decisioni di sessione restano nei registri del progetto e nelle PR.
