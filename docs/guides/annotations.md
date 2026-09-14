---
title: Annotazioni e note
---

# Annotazioni e note

Le annotazioni registrano osservazioni sul frammento e possono riferirsi a un
passaggio preciso della traduzione. Sono salvate separatamente dal testo,
così una nota può essere modificata o rimossa senza riscrivere la traduzione.

## Tipi

| Tipo | Uso |
| --- | --- |
| Commento | Osservazione o decisione editoriale |
| Dubbio | Interpretazione da verificare |
| Problema | Errore che richiede un intervento |
| Approvato | Nota che registra l’esito della revisione |

Il tipo Approvato non sostituisce il comando **Blocca traduzione**. Le
annotazioni descrivono il lavoro di revisione; il blocco controlla la
possibilità di rielaborare il frammento.

## Creazione

Seleziona un passaggio nella traduzione e usa **Aggiungi annotazione** dal
menu contestuale. Il testo selezionato diventa il riferimento della nota.
Puoi anche aggiungere una nota senza selezione dalla scheda **Note** del
frammento, oppure convertire una segnalazione dell’audit in annotazione.

Le note del frammento si trovano nella barra laterale del progetto. Non sono
le note bibliografiche dell’opera, che appartengono alla scheda della Biblioteca.

## Visualizzazione ed esportazione

Nell’anteprima della traduzione, le annotazioni ancorate possono essere rese
come note Markdown (`[^a1]`, `[^a2]` e così via). I marcatori vengono composti
per la visualizzazione; non sono inseriti nel testo salvato della traduzione.
Se il testo di riferimento cambia, verifica che la nota sia ancora associata
al passaggio corretto.

Le esportazioni basate sul Markdown possono includere queste annotazioni
come note. Il formato bilingue usa una struttura propria con originale,
traduzione e risultati dell’audit. Vedi [Importazione ed esportazione](../reference/import-export).

## Note del documento sorgente

Le note a piè di pagina importate da Markdown o DOCX sono conservate con il
progetto e visualizzate nell’originale. Marcatori e contenuto delle note sono
esclusi dal testo inviato alla pipeline di traduzione.

Le note sorgente e le annotazioni del revisore sono dati distinti. Per includere
una nota nella traduzione finale, rivedine il testo e inseriscila nella
posizione appropriata: la pipeline non la traduce né la riposiziona automaticamente.
