# Roadmap verso il completamento della beta

Aggiornata: 10 settembre 2026.

## Cosa significa completare Glossa

Glossa è una beta privata, sviluppata e provata dal maintainer; non ha ancora
una base di utenti esterni. La numerazione 2.x deriva dalle prove di rilascio
automatico e non è un indicatore di completezza. Non serve tornare indietro con
i numeri: serve completare i percorsi fondamentali.

Obiettivo: trovare una fonte, conservarla e leggerla, trascriverla e correggerla,
portare il testo approvato in traduzione, revisionare ed esportare il risultato,
ritrovando dati e provenienza dopo il riavvio. Le aree visibili e le tabelle già
esistenti non bastano a considerare completo un percorso.

Le fasi sotto sono l'ordine operativo proposto. Non sono tutte bloccanti una
rispetto all'altra: attività indipendenti possono avanzare, mantenendo priorità
al percorso completo. Le issue conservano i criteri implementativi dettagliati.

## Stato integrato

La Biblioteca è su main: #456 include #457, #460 e #461.
Sono presenti ricerca per le biblioteche implementate, catalogo e scheda opera,
visore IIIF, lettura locale, versioni a più misure, deposito, cache, coda
persistente, ottimizzazione e verifica. La traduzione editoriale, glossari,
memoria di frasi, annotazioni, storico e backup applicativo sono operativi.

Restano incompleti lo Studio di trascrizione, OCR/HTR, collegamento alla
traduzione, PDF nella Biblioteca, Export Studio e Analisi. La proposta di
rilascio automatica non sostituisce questi criteri di completamento.

**Proposta di rilascio aperta: #386.** Si aggiorna da sola a ogni arrivo su
main e resta aperta finché non la si unisce. Unirla pubblica il tag, le note,
gli installatori Linux/Windows/macOS e propone l'aggiornamento a chi ha Glossa
installata; dichiara inoltre che i backup nei formati precedenti non vengono più
accettati. Va unita quando si vuole distribuire, non perché esiste.

## Decisioni già chiuse, da non riaprire

- **Apertura delle pagine** (10 settembre): vince sempre la copia migliore
  presente sul computer; la misura nelle impostazioni dice cosa chiedere alla
  biblioteca, non come mostrare ciò che si possiede. Nessuna preferenza salvata
  per opera o per copia; la scelta a mano vale finché il libro è aperto; il
  ripiego online si spegne per il libro aperto, dal visore.
- **Due copie digitali della stessa opera** sono due opere distinte: non si
  fondono le schede, si aggregano con workspace e collezioni.
- **Provenienza dell'immagine**: due parole («File locale», «File online») e tre
  colori del pallino (deposito, cache, biblioteca appena interpellata).
- **Campi anagrafici**: tutti e venti sempre visibili in sola lettura, «—» dove
  il dato manca; natura dell'originale e formato della copia restano separati.
  Restano da costruire la scelta dei campi modificabili e l'editor dei valori
  multipli.
- **Scheda dell'opera**: colonna visore più colonna informazioni a linguette,
  guscio condiviso con la traduzione. Quando nasce lo Studio di trascrizione
  usa lo stesso schema, non uno nuovo per area.
- **Campi dei log**: opera, copia, pagina, misura, provenienza, esito. Ogni
  parte nuova li scrive già così, perché la #413 debba solo raccoglierli.
- **Compressione** sempre non distruttiva; **PDF** modalità separata dalla
  sequenza IIIF; misure chieste solo fra quelle già pronte.

## 1. Consolidare Biblioteca e visibilità dei lavori

Issue: #183, #187, #397, #459, #462, #413; shell generale #210.

- Verificare i percorsi già presenti e correggere le regressioni prima di
  aggiungere nuove varianti. Revisione UI/UX generale ancora da fare.
- Completare azioni sulla singola pagina e selezione multipla (#459):
  sostituzione, eliminazione volontaria, esclusione, verifica e risultati parziali.
  Prima di implementare, confrontare le decisioni del piano con quelle già
  risolte dal lettore; non riaprire scelte di precedenza chiuse.
- Scaricare, elencare e leggere i PDF delle biblioteche (#462), distinti dalla
  sequenza IIIF: non presumere la stessa identità di pagina.
- Rendere visibili log generali, salvataggio e stato dei lavori (#413),
  riusando la coda e i pannelli esistenti.
- Riallineare capacità dichiarate e reali dei provider (#397). La ricerca
  aggregata (#395) viene dopo la verifica dei singoli provider. I risultati
  dichiarano già se il libro si apre: l'assenza si scrive solo quando la
  biblioteca risponde che non ce l'ha, e segna la riga senza nasconderla.
- Completare e-rara, e-manuscripta e Wellcome; implementare ricerca reale per
  le biblioteche oggi limitate al manifesto diretto. Procedere secondo fonti
  realmente usate, non attivare un provider perché presente nel registro.
- Applicare il divieto di download dichiarato dalla fonte; verificare sessione
  Vaticana e ritmi delle biblioteche. Aumentare parallelismo solo dopo misure.
- Completare scelta del deposito al primo avvio, controllo spazio libero,
  riconoscimento segnaposto cloud e spostamento del deposito.
- Metadati: mantenere distinta natura dell'originale e formato della copia;
  completare scelta dei campi modificabili e modifica dei valori multipli.
- Valori di ottimizzazione specifici per opera restano da completare.

Uscita: ricerca → aggiunta → lettura → scaricamento → riapertura offline,
con disponibilità e fallimenti comprensibili e senza duplicare materiale.
Verificare anche interruzione, ripresa e cancellazione durante lavori attivi.

## 2. Studio di trascrizione utilizzabile

Issue: #182, #388, #219, #208, #221, #222, #209, #223.

- Studio pagina + testo + strumenti, coerente con Biblioteca e Traduzioni.
- Trascrizione manuale con salvataggio, revisioni, approvazione per pagina.
- Filtri visuali, ritaglio, coordinate e note; corpus di frammenti riusabile.
- Conservare identità di pagina e collegamenti anche dopo un nuovo download.
- Consultare Scriptoria per viewer, workflow, ritagli e stati di revisione.

Uscita: aprire una fonte reale, trascrivere più pagine, correggere, riaprire
e ritrovare testo, revisioni e riferimenti alla fonte. La trascrizione manuale
deve essere utile anche senza OCR.

## 3. Assistenza OCR/HTR e passaggio alla traduzione

Issue: #185, #220, #189, #224; risorse contestuali #227.

- OCR/HTR tramite lavori persistenti, con provider espliciti ed errori recuperabili.
- Correzione e approvazione umana prima di alimentare la traduzione.
- Creare il progetto di traduzione dal testo approvato senza perdere provenienza.
- Collegare fonte, trascrizioni e traduzioni dalla scheda dell'opera.
- Integrare corpus e suggerimenti contestuali con ambito workspace chiaro.

Uscita: fonte → trascrizione assistita → correzione → approvazione →
traduzione → revisione, con ripresa dopo riavvio e storico ricostruibile.

## 4. Consegna e portabilità

Issue: #188, #225, #375, #434; riferimento per ambiti #213 (già chiusa).

- Export Studio contestuale: contenuto, pagine, versione, formato, profilo
  e destinazione, con output tracciati; riusare il sistema di lavori.
- Definire il set di formati base dai casi d'uso, senza aspettare tutti i
  formati opzionali della #192.
- Esportare/importare un singolo workspace come nuovo contesto (#434),
  senza confonderlo col ripristino dell'intera app.
- Portare import CSV dei glossari nel backend.
- Documentare limiti dei backup: immagini escluse, chiavi provider escluse,
  formati precedenti non supportati. Conservare una copia dei materiali utili.

Uscita: consegnare il risultato e trasferire una ricerca su un'altra installazione,
con riferimenti coerenti e senza sostituire workspace già presenti.

## 5. Analisi e validazione finale

Issue: #377, #379, #391, #382, #380, #381.

Completare prima i riepiloghi utili al lavoro: qualità, costi, tempi, errori,
confronti e provenienza. La raccolta dei fatti già esiste; la superficie Analisi
è ancora da costruire. Dataset versionati, registro modelli/adapter e valutazioni
semantiche restano nella visione, in ordine successivo al percorso principale.
L'addestramento resta esterno a Glossa.

Il loro perimetro minimo per la prima beta completa va deciso sulla base dei
casi reali: non dichiararli rimossi né prometterli tutti nel prossimo tag.

## Riferimenti e lavori trasversali

Scriptoria resta il primo riferimento tecnico per fonti, deposito, lavori,
Studio, trascrizione ed export (#186, #446). Per ogni capacità annotare pattern
consultati, adozione/adattamento/scarto e motivo; non copiare la sua interfaccia
o introdurre compatibilità dati implicita. #383 raccoglie riferimenti secondari;
#404 riguarda approfondimento bibliografico.

#408: ricontrollare l'eccezione di sicurezza e rimuoverla quando risolta.
#410 e #402: evoluzione delle risposte strutturate, evitando di duplicare il
contratto di revisione già implementato. #396: Dashboard orientata alle attività.

Il Backlog conserva estensioni opzionali (nuovi formati, cloud, varianti di
prompt e traduzione). Non sono cancellate; non dettano l'ordine del percorso base.

## Criteri della beta completa

- Percorso fonte → testo approvato → traduzione → export provato su materiali reali.
- Salvataggio, riavvio, interruzione, ripresa e recupero verificati.
- Prova installata sui sistemi supportati; i test browser simulati non bastano.
- Limiti di biblioteche e provider dichiarati; nessun comando promette capacità assenti.
- Backup/ripristino verificati su dati rappresentativi della beta corrente.
- Documentazione in-app e pubblica IT/EN coerente col comportamento.
- Controlli automatici verdi e problemi bloccanti risolti.
- Note di distribuzione con funzionalità incluse e compatibilità; nessuna
  retrocompatibilità presunta durante la beta privata.

Le revisioni dello schema in questa fase possono consolidare la baseline,
ma non autorizzano cancellazioni automatiche dei dati locali del maintainer.
Prima di una distribuzione destinata a utenti reali occorre fissare una
politica stabile di migrazione e recupero.

## Regole di manutenzione

GitHub descrive le attività e i criteri di accettazione; questa roadmap ne
ordina le dipendenze. Lo stato di sessione contiene solo situazione corrente,
decisioni nuove e prossimi passi. Le epic restano aperte finché hanno residui.
Il codice integrato aggiorna guide IT/EN, help e contratti tecnici pertinenti.
