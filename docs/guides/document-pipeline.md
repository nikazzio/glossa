---
title: Traduzione di un documento
---

# Traduzione di un documento

Durante l’esecuzione non puoi cambiare pipeline o crearne una nuova. I gruppi
Memoria, Revisione e Documento ricordano la sottoscheda scelta quando cambi
scheda; se non è disponibile, viene mostrata una vista disponibile.

La traduzione opera su frammenti di testo, chiamati *chunk* in alcune parti
dell’interfaccia. Ogni frammento conserva sorgente, risultati delle fasi,
traduzione modificabile, valutazione e annotazioni. Anche un documento composto
da un solo frammento utilizza lo stesso flusso.

## Importazione e segmentazione

Importa un file o inserisci il testo sorgente, quindi controlla l’anteprima.
La segmentazione automatica usa una lunghezza obiettivo in parole. Per Markdown,
le opzioni dedicate ai titoli permettono di mantenere un titolo con il testo
successivo oppure di separare sezioni secondo il livello scelto.

Verifica i confini prima di confermare: essi determinano le unità di traduzione
e revisione. I dettagli su formati, limiti e note importate sono nel
[riferimento per importazione ed esportazione](../reference/import-export).

## Lingue dell’opera

Le lingue appartengono all’opera tradotta, non alle sue pipeline: valgono per
tutte le pipeline dell’opera, che non hanno più una coppia di lingue. Il
prompt di traduzione è guidato dal **Contesto di traduzione**; solo DeepL
conserva una coppia propria nelle opzioni della sua fase, perché il servizio
richiede codici.

Partenza e Arrivo hanno ciascuno tre campi facoltativi:

- **Lingua**: codice ISO 639-3 del registro ufficiale SIL, quello dei cataloghi
  bibliotecari, comprese lingue storiche (latino, greco antico, francese antico
  e medio, provenzale/occitano antico, spagnolo antico, inglese antico e
  medio, alto tedesco antico e medio, anglo-normanno e altre). Si cerca per
  nome italiano, nome inglese o codice; a ricerca vuota l’elenco mostra
  «Già usate nel workspace» e «Lingue storiche», scrivendo si cercano tutte le
  circa 7.900 lingue. I nomi sono in italiano dove esiste un nome standard,
  altrimenti l’inglese ufficiale.
- **Varietà**: una varietà di Glottolog, offerta solo tra quelle della lingua
  scelta (latino: tardo latino, latino medievale, latino volgare; italiano:
  italiano antico, fiorentino, laziale, cicolano-reatino-aquilano). Resta
  disabilitata finché non scegli una lingua.
- **Nota**: testo libero per ciò che i codici non dicono (epoca, area, mano),
  per esempio «volgare padano, sec. XV».

Ogni campo può restare vuoto («non indicata») e ha una X per svuotarlo. Una
nuova opera parte con partenza non indicata e arrivo italiano.

Limiti: gli standard non hanno un codice per latino medievale, italiano antico
o catalano antico come lingue; Glottolog non elenca una varietà «latino
classico»; le lingue regionali italo-romanze (veneto, lombardo, ligure,
napoletano, siciliano…) sono lingue separate con sole varietà moderne; non
esistono varietà d’area medievali, per cui si usa la nota. Per un trattato di
scherma volgare del Quattrocento: italiano + italiano antico + nota, oppure la
lingua regionale + nota. L’elenco delle lingue è incluso nell’app e funziona
senza rete; **Impostazioni → Lingue** mostra l’elenco in uso e lo riscarica
dalle fonti ufficiali, conservando come ritirate le lingue che non ci sono più.

Dove si impostano: nella finestra di importazione e nella riga in cima allo
Studio. Lì, a destra prima dei comandi, la coppia compare con le varietà
(«Italiano (Old Italian) → Inglese»); il suggerimento aggiunge le note. L’icona delle
lingue accanto apre la finestra **Lingue dell’opera** con gli stessi campi, Annulla e
Conferma: senza conferma non si salva nulla. Mentre la pipeline lavora il
comando è visibile ma bloccato, con il motivo nel suggerimento. Se l’opera non
ha lingua di partenza e viene da un libro della Biblioteca la cui lingua
corrisponde a una lingua nota, la partenza è proposta già compilata (da
confermare); nella finestra di importazione si precompila allo stesso modo.

Dopo ogni conferma, se la memoria contiene frasi salvate da questa opera con
lingue diverse, l’app chiede se darle le lingue dell’opera: testo e misure di
somiglianza restano uguali e la versione precedente resta nella cronologia. Vale
anche per allineare frasi salvate prima. Vedi la
[memoria di frasi](./phrase-memory).

## Configurazione

Apri la configurazione della pipeline (l’ingranaggio nella riga in cima allo
Studio) e imposta Contesto di traduzione, modalità, provider, modelli e istruzioni; le lingue stanno nell’opera (vedi sotto) e solo DeepL ha una propria coppia: le
linguette sono descritte nella [configurazione della pipeline](../reference/pipeline-config). Le modalità definiscono questa sequenza:

| Modalità | Elaborazione |
| --- | --- |
| Standard | Traduzione e valutazione automatica |
| Editoriale | Traduzione, revisione della bozza (*Refine*), formattazione (*Format*) e valutazione |
| DeepL Hybrid | Traduzione DeepL, revisione LLM e valutazione LLM |

Provider e modelli delle fasi LLM sono indipendenti. DeepL richiede una propria
chiave API e non svolge il ruolo di valutatore. La modalità della pipeline non
è modificabile quando l’elaborazione o i risultati presenti ne bloccano il cambio.

## Prova ed esecuzione

Usa **Test** per valutare un frammento mantenendo la configurazione modificabile.
Controlla la bozza e le segnalazioni prima di passare alla produzione.
I comandi di esecuzione consentono di lavorare sul frammento corrente o su più
frammenti; il numero impostato limita il gruppo da elaborare.

L’elaborazione procede per frammenti e ne aggiorna lo stato. L’annullamento
interrompe il lavoro corrente senza eliminare i risultati già completati.
La ripresa e la rielaborazione hanno scopi diversi: la prima completa il lavoro
restante, la seconda ricalcola i frammenti non verificati selezionati dall’azione.
Se dopo l’interruzione cambi modelli, prompt delle fasi o dell’audit, la
Contesto di traduzione o le opzioni DeepL, la ripresa avvisa che la configurazione non è
più quella con cui il lavoro era cominciato.

Mentre un frammento si traduce, il testo della sua traduzione è coperto da un
velo oro, «Traduzione in corso…», e non si modifica: il testo non compare man
mano, arriva quando la fase finisce. La colonna delle fasi nel margine resta
usabile; l’originale è in sola lettura e la matita dice perché.

## Lettura e revisione

Lo Studio di traduzione si apre dentro la cornice dell’applicazione: la barra
principale a sinistra resta in vista e porta a qualunque area, chiudendo la
traduzione. Mentre la pipeline lavora le sue voci sono spente, come il ritorno
al catalogo.

In cima, la barra mostra opera / pipeline e il tipo Semplice, Editoriale o DeepL. I nomi lunghi si troncano; il suggerimento mostra il nome completo. Il nome dell’opera si rinomina con un clic. Il nome della pipeline, con la piccola freccia accanto, apre il menu per scegliere, creare, rinominare o eliminare; l’ingranaggio apre le opzioni. Accanto compaiono le lingue dell’opera in forma breve (vedi [Lingue dell’opera]). A destra stanno importa, esporta, risorse linguistiche ed eliminazione.

Al centro i due fogli affiancano originale e traduzione. Sopra di loro, a
sinistra, il numero del frammento aperto; al centro una finestra di sette
pallini, uno per frammento con il suo stato: il frammento aperto resta fermo
sotto il segno centrale e gli altri scorrono ai lati. Le frecce singole passano
al frammento vicino, quelle doppie saltano di sette; anche la rotella del mouse
sopra i pallini scorre i frammenti, e un clic su un pallino lo apre. A destra
dei pallini, le spie delle fasi dicono a che punto è il frammento aperto
(traduzione, revisione, formattazione, audit): un clic apre il dettaglio della
fase. La lente accanto apre, sotto la fila, la ricerca in tutto il documento;
un risultato porta al suo frammento, Esc la chiude.

A destra, la colonna **Strumenti** tiene in cima l’esecuzione — traduci, l’interruttore **Blocchi multipli** con il
numero di frammenti da elaborare (sempre in vista, spento quando si traduce un
frammento solo) — e i costi, poi le linguette, in quest’ordine:
**Glossario**, **Memoria**, **Anteprima**, **Revisione** e **Documento**, che
raccoglie in tre sottolinguette i riepiloghi del documento intero: **Indice**,
**Statistiche** e **Coerenza**. Memoria raccoglie in due
sottolinguette le **frasi simili in memoria**, da usare traducendo, e
**Estrai frasi**, che salva le coppie del frammento; l’estrazione si accende a
frammento tradotto. Revisione
raccoglie in tre sottolinguette **Audit**, **Note** e **Note del testo** (le
note a piè di pagina importate con l’originale, presenti solo se il frammento
ne ha), linguette a icona con nome e conteggio nel suggerimento, ognuna con il
suo elenco; si apre
sull’audit se ha segnalazioni aperte, altrimenti sulle note. L’audit si
accende a frammento tradotto, il Glossario con un glossario assegnato; il
motivo resta nel suggerimento. Chiusa a icone, la
colonna lascia in vista il solo pulsante traduci, o lo stop durante
l’esecuzione.

I risultati intermedi delle fasi permettono di individuare dove è stata
introdotta una modifica. I comandi stanno in colonna nel margine destro del
foglio della traduzione, accanto alla barra di scorrimento: in alto le fasi
nell’ordine della pipeline, poi il confronto e le coppie da confrontare; quella
che stai guardando è evidenziata. Dopo una correzione manuale, **Rivaluta** esegue il
solo controllo qualità. Se correggi l’originale con la matita, accanto al titolo della traduzione
compare l’etichetta ocra **Sorgente modificata** e il pallino del frammento ha
un segno ocra: la traduzione va aggiornata.

La spunta accanto al titolo **Traduzione candidata** segna la traduzione come
verificata: diventa verde, il testo si blocca e la rielaborazione dei soli
frammenti non verificati la salta. Verificare toglie anche il «da aggiornare»,
perché vuol dire averla controllata sull’originale di adesso; lo stesso comando
la riporta in bozza. La spunta è spenta mentre il frammento è in traduzione o
quando non c’è ancora una traduzione. Ogni comando spento dice il motivo nel
suggerimento.

Limite attuale: il «da aggiornare» non si conserva chiudendo la traduzione;
riaprendola, il segno non c’è più.

### Storico del frammento

**Revisione → Storico** elenca le versioni del frammento aperto, dalla più
recente, con l’autore (**Pipeline** o **Manuale**), data e ora, e i segni
**Corrente** e **Verificata**. Una versione nasce a ogni passata della pipeline
(anche la riscrittura dopo l’audit), a ogni salvataggio col dischetto o con
`Ctrl + S` se il testo del frammento è cambiato dall’ultima versione, e alla
verifica quando il testo verificato è diverso. Il salvataggio automatico non
scrive versioni, per non riempire lo storico a ogni pausa.

Il comando di ripristino riporta il testo di una versione nel foglio e lo
scrive come versione nuova: le precedenti restano. È spento su una traduzione
verificata (prima va riportata in bozza) e mentre il frammento è in
traduzione. Limiti attuali: le versioni non si eliminano, non si possono
nominare, e lo storico non indica il modello usato, perché una pipeline ne usa
più d’uno. Lo storico è per pipeline e si perde se il documento viene diviso di
nuovo in frammenti diversi.

## Anteprima delle richieste

L’**Anteprima prompt** nelle opzioni della pipeline ha due modi. **Struttura**
mostra i pezzi di ogni richiesta con i segnaposto dove entrano i dati.
**Frammento aperto** li riempie con il frammento aperto nello Studio: testo,
frammenti vicini, frasi della memoria spuntate, traduzione precedente. Audit e
Coerenza usano la traduzione attuale del frammento; senza traduzione lo dicono.
Questa operazione non chiama il modello e non produce una traduzione.

## Esportazione

Controlla anche i frammenti incompleti prima di esportare: nei formati ordinari,
un frammento senza traduzione può essere esportato con il testo sorgente.
Il formato bilingue distingue esplicitamente originale e traduzione assente.
Vedi [formati e contenuto esportato](../reference/import-export).


## Salvataggio, navigazione e costi

Durante una traduzione in corso lo Studio resta aperto: per uscire, attendi la fine
o interrompi l’elaborazione. Il dischetto e Ctrl/⌘+S salvano; dopo un errore il
comando propone **Riprova**. Gli errori visibili sono messaggi tradotti; i dettagli
tecnici sono nel log. Lo stesso vale per caricamento e ripristino dello storico.

Le schede disattivate restano raggiungibili col tabulatore, così puoi leggere il
motivo nell’etichetta. Non si attivano; le frecce passano alle schede disponibili.
I selettori circolari restano raggiungibili anche se la scelta corrente non è disponibile.

Nella colonna Strumenti, passa sulla stima o sui consumi per aprire il dettaglio.
La stima segue modalità e numero di blocchi selezionati; i consumi sono quelli
del frammento aperto. Il numero di blocchi non indica ripetizioni della traduzione.
