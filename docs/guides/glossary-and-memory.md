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

L’importazione mostra un’anteprima e permette di scegliere tra integrazione
e sostituzione del contenuto. Verifica l’associazione dei campi sorgente,
destinazione e note prima di confermare. La sostituzione elimina le voci
precedenti del dizionario.

Le **Risorse linguistiche generali** offrono la stessa gestione. Il filtro per
workspace mostra tutti i dizionari collegati, compresi quelli condivisi; puoi
anche scegliere tutti o quelli senza workspace. Il filtro restringe l’elenco:
nelle risorse generali si leggono e modificano sempre gli originali.
Per creare, importare o copiare un dizionario scegli il workspace di
destinazione. La ricerca controlla i nomi dei dizionari.

Nel dizionario aperto, **Stai modificando** e **Le modifiche valgono per**
indicano la risorsa e l’ambito effettivo. Nell’originale condiviso le modifiche
valgono per tutti i workspace collegati; le correzioni locali già presenti
restano valide. Salvare una correzione in un workspace ospite cambia solo la
sua vista delle voci. Un termine nuovo entra invece nell’originale: una riga
separata lo specifica. Il termine sorgente di una voce esistente non si
rinomina da una correzione locale.

Il dischetto salva le voci modificate. **Salva e chiudi** rispetta lo stesso
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
testo e filtra per Fasi, Controllo qualità, Persona, Memoria oppure OCR.
I modelli sono comuni all’applicazione, senza appartenenza a un workspace.
Usa **+** per crearne uno o la matita sulla sua riga per modificarlo.

Il modulo conserva nome, ambito, flusso, testo e, facoltativamente, servizio e
modello predefinito. I suggerimenti delle etichette spiegano l’uso dei campi.
Scegli servizio e modello per rifinire il testo; il comando spento indica ciò
che manca. Il dischetto salva, la croce annulla. Un nome già usato nello stesso
ambito e flusso richiede di modificare il modello esistente o scegliere un
altro nome. Il cestino elimina soltanto dopo conferma.

## Glossario, memoria ed esempi

| Risorsa | Ruolo |
| --- | --- |
| Glossario | Terminologia richiesta per il progetto |
| Memoria di frasi | Coppie bilingui selezionate come riferimento per un frammento |
| Esempi di traduzione | Frammenti approvati che orientano lo stile della pipeline |

Per estrazione, selezione e salvataggio delle coppie bilingui, consulta
[Memoria di frasi ed esempi](./phrase-memory).
