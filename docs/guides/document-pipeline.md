---
title: Traduzione di un documento
---

# Traduzione di un documento

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

## Configurazione

Apri la configurazione della pipeline (l’ingranaggio nella riga in cima allo
Studio) e imposta lingue, modalità, provider, modelli e istruzioni: le
linguette sono descritte nella [configurazione della pipeline](../reference/pipeline-config). Le modalità definiscono questa sequenza:

| Modalità | Elaborazione |
| --- | --- |
| Standard | Traduzione e valutazione automatica |
| Editoriale | Traduzione, revisione della bozza (*Refine*), formattazione (*Format*) e valutazione |
| DeepL Hybrid | Traduzione DeepL, revisione LLM facoltativa e valutazione LLM |

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

Mentre un frammento si traduce, il testo della sua traduzione è coperto da un
velo oro, «Traduzione in corso…», e non si modifica: il testo non compare man
mano, arriva quando la fase finisce. La colonna delle fasi nel margine resta
usabile; l’originale è in sola lettura e la matita dice perché.

## Lettura e revisione

Lo Studio di traduzione si apre dentro la cornice dell’applicazione: la barra
principale a sinistra resta in vista e porta a qualunque area, chiudendo la
traduzione. Mentre la pipeline lavora le sue voci sono spente, come il ritorno
al catalogo.

In cima, la riga d’intestazione riporta al catalogo delle Traduzioni e mostra
il nome della traduzione (un clic lo rinomina); al centro della riga, la
pipeline aperta: il suo
nome (anche questo si rinomina con un clic), ⇄ per sceglierne un’altra, crearne
una o eliminarla, l’ingranaggio con le sue opzioni e la sua coppia di lingue.
Le lingue appartengono alla pipeline: due pipeline della stessa traduzione
possono averne di diverse. A destra della stessa riga stanno i comandi della
traduzione intera: importa, esporta, risorse linguistiche del workspace ed
eliminazione.

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

La configurazione mostra la struttura dei prompt. La scheda **Anteprima** del
frammento costruisce invece la richiesta della fase scelta per il testo corrente.
Questa operazione non chiama il modello e non produce una traduzione.

## Esportazione

Controlla anche i frammenti incompleti prima di esportare: nei formati ordinari,
un frammento senza traduzione può essere esportato con il testo sorgente.
Il formato bilingue distingue esplicitamente originale e traduzione assente.
Vedi [formati e contenuto esportato](../reference/import-export).
