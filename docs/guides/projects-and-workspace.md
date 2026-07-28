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

La barra laterale si può richiudere per lasciare più spazio al contenuto. Nel progetto restano disponibili le frecce per passare al frammento precedente o successivo e il comando di traduzione; il numero tecnico del frammento non occupa più spazio nella barra. Nella Dashboard chiusa restano Dashboard, tutte le aree e le icone dei workspace: quelle non ancora disponibili sono visibili ma non selezionabili.

In alto resta visibile il marchio Glossa. Al passaggio del mouse o con il focus
da tastiera, il marchio diventa il pulsante per riaprire la barra; serve
comunque un clic o l'attivazione da tastiera.

## Riconoscere un workspace

Quando crei un workspace, scegli uno dei segni storico-editoriali disponibili,
come manoscritto, penna, archivio o sigillo. Puoi cambiarlo in seguito dalle
impostazioni del workspace. Lo stesso segno compare nella barra laterale, nel
contesto del workspace, nella Libreria e nelle liste di progetti; passando il
mouse sull'icona, oppure raggiungendola con la tastiera, resta disponibile il
nome completo del workspace.

## Indicatori dei frammenti

La fila di cerchi sopra il documento permette di cambiare frammento e riassume
lo stato senza affidarsi soltanto al colore:

- il segno centrale distingue un frammento da tradurre, in elaborazione,
  completato o in errore;
- in alto a sinistra compare un segnale quando l'audit ha problemi irrisolti;
- in alto a destra compare un segnale quando sono presenti note;
- in basso a sinistra compare un segnale quando la traduzione è bloccata;
- in basso a destra compare un segnale quando la sorgente è cambiata e la
  traduzione deve essere aggiornata;
- un piccolo triangolo sotto il cerchio indica il frammento corrente.

Passa il mouse su un indicatore o raggiungilo da tastiera per leggere il
riepilogo completo degli stati e degli eventuali conteggi.

## Risorse condivise e locali

| Risorsa | Ambito |
|---|---|
| API key | App |
| Preferenze interfaccia | App |
| Storage phrase memory | Workspace |
| Glossari della Libreria | Workspace |
| Glossario assegnato alla pipeline | Progetto / pipeline |
| Chunk, bozze, audit, note | Progetto / pipeline |

## Riutilizzare un dizionario in un altro workspace

Ogni dizionario appartiene a un solo workspace. Se vuoi partire da termini già
raccolti altrove, apri la Libreria del workspace di destinazione e scegli
**Copia un dizionario esistente**. La copia può essere rinominata e diventa
indipendente: modificarla non modifica mai l'originale. Se apri la Libreria da
un progetto, la copia viene anche assegnata a quel progetto.

Non puoi eliminare un workspace finché contiene progetti o dizionari: prima
spostali tramite copia oppure eliminali esplicitamente.

## Consigli sui nomi

- Dai alle pipeline nomi basati sullo scopo, non solo sul provider
- Rinomina le pipeline sperimentali invece di sovrascrivere quella di produzione
- Mantieni un progetto per testo coerente o per unità editoriale

## Cosa dovrebbe restare stabile

- Mantieni stabile una combinazione provider/modello nello stesso progetto, salvo motivo chiaro.
- Non mischiare prompt esplorativi e prompt di produzione nella stessa pipeline salvata senza rinominarla.
- Tratta il workspace come memoria condivisa, non come contenitore di esperimenti temporanei.
