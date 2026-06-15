---
title: Annotazioni
---

# Annotazioni

Le annotazioni ti permettono di allegare note strutturate ai chunk tradotti, così
il feedback editoriale resta vicino al testo a cui si riferisce e sopravvive al
ricaricamento del progetto.

## Tipi di annotazione

| Tipo | Quando usarlo |
|---|---|
| **Comment** | Osservazione generale, decisione editoriale da conservare |
| **Doubt** | Dubbio interpretativo aperto, traduzione incerta ma non bloccante |
| **Problem** | Errore reale che richiede correzione prima di bloccare il chunk |
| **Approved** | Chunk rivisto e chiuso dopo lettura manuale e audit |

## Come creare un'annotazione

- **Con selezione testo**: fai clic destro su qualsiasi testo nel pannello di
  traduzione e scegli *Aggiungi annotazione*. La frase selezionata viene precompilata
  come ancora.
- **Da un'issue del giudice**: ogni problema nell'output di audit ha un pulsante
  diretto per convertirlo in annotazione, con tipo, ancora e testo già compilati.
- **Senza ancora**: apri il pannello note del chunk e aggiungi un'annotazione libera
  non collegata a un passaggio specifico.

## Dove si visualizzano

Le annotazioni sono visibili nella scheda **Note** del pannello Insight, raggruppate
per chunk. Nella vista renderizzata della traduzione, ogni annotazione con ancora
inserisce un marcatore GFM (`[^a1]`, `[^a2]`, …) subito dopo la frase ancorata,
con la definizione della nota in fondo al chunk. Il testo della traduzione salvato
non viene mai modificato — i marcatori esistono solo nel rendering e scompaiono
se l'annotazione viene eliminata.

## A cosa servono

- Segnare formulazioni irrisolte senza perdere il contesto della revisione
- Conservare decisioni editoriali prese durante l'audit
- Tracciare issue del giudice che richiedono follow-up manuale
- Ancorare un commento a una frase precisa invece che al chunk intero

## Workflow tipico

1. Esegui un chunk di test e apri l'output del giudice.
2. Converti in annotazione i problemi che richiedono revisione editoriale.
3. Correggi la traduzione a mano dove necessario.
4. Aggiungi note di tipo **Comment** per le decisioni che vuoi ricordare.
5. Usa **Approved** solo dopo lettura manuale e audit pulito.

## Note a piè di pagina nei documenti importati

Se importi un DOCX o un Markdown con note a piè di pagina, Glossa le separa
completamente dalla pipeline di traduzione: il modello riceve solo il corpo del
testo, senza marcatori inline e senza il contenuto delle note. Le note originali
vengono salvate con il progetto e restano visibili nell'editor sorgente. Dopo la
traduzione dovrai gestire le note manualmente: adattarne il testo alla lingua di
destinazione e posizionarle dove ha senso nel testo tradotto.

> In una traduzione, una nota non può quasi mai occupare la stessa posizione
> dell'originale e il suo testo va riscritto, non tradotto letteralmente.
> Escluderle dalla pipeline lascia a te la decisione su posizione e formulazione.

## Regole pratiche

- Usa **Problem** per blocchi reali, **Doubt** per dubbi interpretativi aperti.
- Usa **Approved** con parsimonia: indica che il chunk è davvero chiuso.
- L'ancora conta: la nota deve puntare alla frase esatta che hai rivisto.
- Preferisci note brevi e fattuali a discussioni lunghe dentro il chunk.
- Le note sorgente estratte dal documento restano separate dalle annotazioni utente.
