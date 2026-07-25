---
title: Progetti e workspace
---

# Progetti e workspace

Glossa separa impostazioni applicative, risorse del workspace e configurazione della pipeline per progetto.

## Tre livelli di stato

| Livello | Cosa contiene |
|---|---|
| App | API key, connessione Ollama, preferenze interfaccia, default |
| Workspace | Phrase memory, glossari della Libreria, contesto area traduzioni |
| Progetto / pipeline | Lingue, stage, prompt, glossario assegnato, chunk, output |

## Significato pratico

- Cambia le impostazioni app quando tutta l'installazione deve comportarsi in modo diverso.
- Cambia le risorse del workspace quando più progetti devono condividerle.
- Cambia progetto o pipeline quando stai tarando un singolo lavoro di traduzione.

## Workflow tipico di progetto

1. Crea o apri un progetto.
2. Seleziona la pipeline attiva.
3. Configura lingue e stage.
4. Assegna un glossario se serve.
5. Importa un documento ed esegui i chunk di test.
6. Salva mentre iteri.

## Navigazione compatta

La barra laterale si può richiudere per lasciare più spazio al contenuto. Nel progetto restano disponibili le frecce per passare al frammento precedente o successivo e il comando di traduzione; il numero tecnico del frammento non occupa più spazio nella barra. Nella Dashboard chiusa restano Dashboard e tutte le aree: quelle non ancora disponibili sono visibili ma non selezionabili; l'elenco dei workspace torna visibile riaprendo la barra.

In alto, il marchio Glossa apre la barra al passaggio del mouse: così la barra chiusa resta riconoscibile ma non aggiunge un comando visibile in permanenza.

## Risorse condivise e locali

| Risorsa | Ambito |
|---|---|
| API key | App |
| Preferenze interfaccia | App |
| Storage phrase memory | Workspace |
| Glossari della Libreria | Workspace |
| Glossario assegnato alla pipeline | Progetto / pipeline |
| Chunk, bozze, audit, note | Progetto / pipeline |

## Consigli sui nomi

- Dai alle pipeline nomi basati sullo scopo, non solo sul provider
- Rinomina le pipeline sperimentali invece di sovrascrivere quella di produzione
- Mantieni un progetto per testo coerente o per unità editoriale

## Cosa dovrebbe restare stabile

- Mantieni stabile una combinazione provider/modello nello stesso progetto, salvo motivo chiaro.
- Non mischiare prompt esplorativi e prompt di produzione nella stessa pipeline salvata senza rinominarla.
- Tratta il workspace come memoria condivisa, non come contenitore di esperimenti temporanei.
