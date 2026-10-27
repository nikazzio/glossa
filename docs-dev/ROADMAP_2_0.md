# Roadmap della beta privata

## Stato corrente

Glossa permette di cercare fonti in più biblioteche, conservarle e consultarle,
trascrivere con assistenza OCR, tradurre con glossari e memoria, revisionare ed
esportare. Sono integrati Studio di trascrizione e traduzione, contesto e
composizione dei prompt, lingue e varietà dell’opera, corpus con revisioni e
misure multiple, Panoramica e Statistiche. Le superfici condividono le regole
di leggibilità e il pannello OCR distingue la scelta dell’immagine dalle istruzioni.

Le issue #311 (modifica dei prompt salvati) e #489 (contesto e lingue) sono
chiuse. Le epic ancora aperte non indicano che le loro fondamenta siano da rifare.
Lo Studio di traduzione è accettabile per questa fase; rifiniture UI/UX rimandate.

## Ordine dei prossimi interventi

1. **Home, Ricerca e Statistiche**, in una PR dedicata da main (#485/#379).
   Home all’apertura e sempre raggiungibile: ricerca in primo piano, ripresa
   del lavoro e riepilogo sintetico. Ricerca come destinazione autonoma
   principale; Statistiche dentro Analisi, collegate anche dalla Home.
   Riutilizzare motore, risultati e riepiloghi esistenti. Conservare ricerca
   e filtri durante la navigazione; non duplicare le richieste passando dalla Home.
   Verificare contestualmente i residui di #210, senza prometterne la chiusura
   prima del confronto con tutti i criteri.
2. **Cartella predefinita degli export (#375).** Preferenza proposta nei dialoghi
   di salvataggio, modificabile per ogni file. Nessuno spostamento dei file esistenti.
   È una funzione piccola ancora da realizzare, non una consegna già conclusa.
3. **Filtri del visore e preset (#221).** Zoom, pan e cambio fonte esistono;
   restano luminosità, contrasto, saturazione, tonalità, inversione e scala di grigi.
   I filtri non devono alterare gli originali. Ritaglio e corpus visivo restano separati.
4. **Selezione multipagina e OCR (#388/#220).** Definire insieme selezione e
   azioni collettive: intervalli, pagine non contigue, seleziona tutto/azzera,
   numero di pagine visibile. Riutilizzare i comandi singoli e la coda esistente.
   Restano OCR da PDF e contesto delle pagine vicine. Lo Studio e l’OCR della
   pagina singola sono già disponibili.

La PR di navigazione non include nuovi operatori di ricerca, nuove biblioteche,
OCR multipagina o analisi avanzate. #485 raccoglie più interventi: non si chiude
automaticamente spostando Statistiche. Gli altri rilievi storici vanno prima
confrontati con l’app attuale.

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

- #222/#223 e #208/#209: ritaglio con coordinate e note, corpus di evidenze
  visive riutilizzabili, collegato al corpus testuale ma distinto da esso.
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
- #408: monitorare eccezioni rkyv e ZIP transitivo dell’updater Windows;
  riesaminarle agli aggiornamenti upstream o al cambio formato degli installer.
  Motivazioni e criteri di rimozione in ARCHITECTURE; nessun monitor automatico configurato.
- #410/#402: evoluzione delle risposte strutturate senza duplicare il contratto esistente.
- Da valutare separatamente: processi rimasti attivi alla chiusura, anteprima
  di audit/coerenza sul frammento, fasi configurabili, posizione del comando
  di aggiornamento dell’app oggi nella guida.
- #186/#446: Scriptoria resta riferimento tecnico; #383/#404 raccolgono
  riferimenti di prodotto e approfondimenti bibliografici.
- Nuovi formati, cloud, varianti dei prompt e altre estensioni restano nel backlog.

## Criteri di completamento e distribuzione

La beta resta privata: il numero di versione non misura la completezza.
La PR automatica #386 è una proposta di rilascio, non il prossimo merge obbligatorio.

Prima della distribuzione: percorso completo su materiali reali, salvataggio e
riavvio, interruzione/ripresa, backup e recupero, prova installata sui sistemi
supportati, limiti dei servizi dichiarati, guide IT/EN coerenti e controlli verdi.
Il backup esclude deposito e credenziali; il ripristino non importa un singolo
workspace. Le modifiche allo schema non autorizzano cancellazioni automatiche.
Prima di distribuire all’esterno va fissata una politica stabile di migrazione.

GitHub conserva requisiti e criteri delle singole attività; questa roadmap
ne ordina le priorità. Architettura e guide descrivono il comportamento corrente.
Le prove e le decisioni di sessione restano nei registri del progetto e nelle PR.
