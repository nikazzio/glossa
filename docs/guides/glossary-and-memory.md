---
title: Dizionari e glossario
---

# Dizionari e glossario

I dizionari contengono voci terminologiche riutilizzabili. Il glossario di una
pipeline è l’insieme di termini assegnato alla traduzione. Ogni voce associa
un termine sorgente alla resa richiesta e può includere note d’uso.

## Gestione dei dizionari

Apri **Risorse linguistiche** nel workspace. La finestra distingue dizionari,
modelli di prompt e frasi. Nella scheda dei dizionari puoi creare, rinominare,
duplicare ed eliminare risorse, modificare voci e importare dati da CSV o TSV.

L’importazione dalle risorse crea un nuovo dizionario nel workspace scelto,
con il nome del file. Il comando a icona apre la scelta del file; l’anteprima
mostra le prime voci. Per Excel puoi associare le colonne di termine,
traduzione e note prima di confermare.

Le **Risorse linguistiche generali** offrono la stessa gestione. Il filtro per
workspace mostra tutti i dizionari collegati, compresi quelli condivisi; puoi
anche scegliere tutti o quelli senza workspace. Il filtro restringe l’elenco:
nelle risorse generali si leggono e modificano sempre gli originali.
Per creare, importare o copiare un dizionario scegli il workspace di
destinazione. La ricerca controlla i nomi dei dizionari.

Nel dizionario aperto la condivisione indica l’**Originale condiviso** e lo
scudo le **Correzioni locali**. Il suggerimento dell’icona spiega dove valgono
le modifiche; nei workspace ospiti il più accanto ricorda che le nuove voci
entrano nell’originale condiviso. Un termine sorgente esistente non si rinomina
attraverso una correzione locale.

Le voci affiancano termine e traduzione, senza campi aperti per tutta la lista.
La matita apre la modifica di una coppia; il quaderno mostra le sue note.
**+** inserisce una nuova voce in cima e porta il cursore al termine, rendendola
subito visibile. La spunta termina la modifica della voce: i cambiamenti
restano da salvare con il dischetto del dizionario.

Più e dischetto restano nell’intestazione delle voci mentre scorri.
Il dischetto salva le voci modificate. La copia propone i dizionari con il
workspace di provenienza e segna quello scelto; l’esportazione offre CSV ed
Excel affiancati. **Salva e chiudi** rispetta lo stesso
ambito; se il salvataggio fallisce la finestra resta aperta. **Chiudi senza
salvare** scarta davvero le modifiche. Rinomina ed elimina riguardano il
dizionario originale condiviso; eliminare richiede conferma. Le esportazioni
CSV ed Excel contengono le voci originali salvate.

## Condivisione e correzioni locali

Un dizionario può essere collegato a più workspace. I collegamenti condividono
la stessa risorsa; una copia crea invece un dizionario indipendente. Le
correzioni o esclusioni applicate nel workspace modificano la vista locale
delle voci senza alterare l’originale condiviso.

Assegna il dizionario al progetto con il comando dedicato. La scheda
**Glossario** della colonna Strumenti mostra l’intero glossario assegnato, con
il numero dei termini nel titolo; il comando di evidenziazione colora i termini
nei fogli e, finché è acceso, mostra la legenda dei colori;
nella linguetta Glossario della configurazione della pipeline si assegna il
dizionario e se ne modificano i termini, salvandoli con il dischetto.

## Applicazione alla traduzione

Le fasi di traduzione e revisione ricevono istruzioni che richiedono l’uso
delle rese del glossario. Il valutatore può segnalare le difformità. Queste
istruzioni non garantiscono che il modello applichi correttamente ogni voce:
occorre controllare il risultato, anche dopo la fase di formattazione.

In DeepL Hybrid è possibile creare un glossario DeepL dai termini assegnati,
con i vincoli della coppia linguistica e del servizio. È una risorsa remota
distinta dal dizionario locale.

## Evidenziazioni

La legenda nella scheda Glossario descrive i colori attivi. I valori
predefiniti distinguono termine sorgente in blu sottolineato, resa trovata
in verde e resa attesa mancante in rosa. La ricerca testuale usa un colore
separato. I colori sono configurabili nelle impostazioni delle traduzioni.

L’evidenziazione segnala corrispondenze testuali: non interpreta il contesto
e non sostituisce la verifica linguistica. Una resa assente può richiedere
una correzione o una variante motivata nelle note del glossario.

## Modelli di prompt

La scheda **Modelli Prompt** delle Risorse linguistiche cerca nel nome e nel
testo e filtra per Fasi, Controllo qualità, Contesto di traduzione, Sistema, Memoria oppure OCR.
I modelli sono comuni all’applicazione, senza appartenenza a un workspace.
Usa **+** per crearne uno o la matita sulla sua riga per modificarlo.

Il modulo conserva nome, ambito, flusso, testo e, facoltativamente, servizio e
modello predefinito. I suggerimenti delle etichette spiegano l’uso dei campi.
Scegli servizio e modello per rifinire il testo; il comando spento indica ciò
che manca. Il dischetto salva, la croce annulla. Un nome già usato nello stesso
ambito e flusso richiede di modificare il modello esistente o scegliere un
altro nome. Il cestino elimina soltanto dopo conferma.

Ogni modello ha un titolo riconoscibile e un’anteprima breve sulla stessa carta tenue della voce. L’occhio apre
il testo completo, il comando di riduzione torna all’anteprima. Le icone
accanto al titolo spiegano ambito, flusso e modello al passaggio del mouse o
premendole. La matita apre il modulo nella stessa voce; durante la modifica
ricerca e filtri restano bloccati per conservare la bozza. Il modulo affianca
ambito e flusso, servizio e modello, senza separatori fra i campi.

## Glossario, memoria ed esempi

| Risorsa | Ruolo |
| --- | --- |
| Glossario | Terminologia richiesta per il progetto |
| Memoria di frasi | Coppie bilingui selezionate come riferimento per un frammento |
| Esempi di traduzione | Frammenti approvati che orientano lo stile della pipeline |

Per estrazione, selezione e salvataggio delle coppie bilingui, consulta
[Memoria di frasi ed esempi](./phrase-memory).

Le liste di dizionari e prompt distinguono ogni voce con un unico sfondo tenue, condiviso da testo e dettagli aperti. La matita del titolo del dizionario apre il nome al suo posto, mantenendo i comandi sulla stessa riga; Invio salva, Esc annulla.
