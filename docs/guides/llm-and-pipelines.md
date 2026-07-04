---
title: LLM e pipeline
---

# LLM e pipeline

Glossa usa modelli linguistici dentro un workflow documentale controllato. La pipeline
non esiste per complicare il lavoro: serve a trasformare un modello probabilistico in
un processo editoriale ripetibile, ispezionabile e sostenibile su testi lunghi.

## Che cosa fa davvero un LLM

Un LLM riceve testo in ingresso e genera il seguito più probabile, token dopo token,
in base al contesto fornito. Non consulta una memoria stabile del tuo progetto, non
"capisce" il documento come farebbe una persona e non conserva automaticamente le
decisioni prese in una chiamata precedente.

Questo ha tre conseguenze pratiche:

- il contesto deve essere preparato con cura;
- le istruzioni devono essere stabili e non ambigue;
- l'output va verificato con una passata separata e con revisione umana.

Il vantaggio è che un LLM può adattare stile, registro e terminologia molto meglio di
una traduzione meccanica tradizionale. Il limite è che, se riceve troppi compiti nello
stesso prompt, può mescolare responsabilità diverse: tradurre, riscrivere, correggere,
formattare e giudicare allo stesso tempo.

## Perché non usare un solo prompt enorme

Un prompt unico sembra più semplice, ma su testi lunghi diventa fragile.

| Problema | Effetto nel lavoro reale |
|---|---|
| Contesto troppo ampio | Il modello perde attenzione sui dettagli locali |
| Istruzioni mescolate | Una correzione stilistica può cambiare il significato |
| Costo alto | Ogni chiamata rispedisce istruzioni e contesto inutili |
| Revisione difficile | Non sai quale parte del processo ha introdotto un errore |
| Recupero fragile | Se una chiamata fallisce, devi ripetere troppo lavoro |

Glossa divide il processo in passaggi piccoli per rendere ogni decisione più leggibile.
Il testo viene segmentato in chunk; ogni chunk passa attraverso stadi con compiti
separati; il risultato viene auditato e, se necessario, corretto.

## Perché il documento viene diviso in chunk

I modelli hanno una finestra di contesto limitata e il costo cresce con la quantità di
testo inviata. Anche quando la finestra è molto grande, inviare tutto il documento in
ogni richiesta non è una buona strategia: aumenta il rumore, peggiora il controllo e
rende difficile riprendere il lavoro dopo un errore.

Il chunk è l'unità minima di lavoro in Glossa:

- permette di testare prima un passaggio rappresentativo;
- consente di riprendere un batch dai chunk già completati;
- rende l'audit più preciso;
- mantiene note, correzioni e stato editoriale attaccati a una porzione chiara del testo.

Per non perdere continuità, Glossa invia al modello anche un blocco di riferimento con
chunk vicini. Il modello vede il contesto, ma riceve istruzioni di tradurre solo il
chunk corrente.

## Perché gli stadi sono separati

Ogni stadio ha una responsabilità limitata. Questa separazione riduce gli errori
silenziosi e rende più facile capire dove intervenire.

| Stadio | Responsabilità |
|---|---|
| Translation | Produce la prima traduzione del chunk |
| Refine | Migliora stile, registro, accuratezza o terminologia della bozza |
| Format | Ripulisce Markdown, note e struttura senza ritradurre |
| Judge | Valuta la qualità e segnala problemi strutturati |
| Coherence | Cerca incoerenze tra chunk tradotti |

Lo stadio Format è volutamente stretto: riceve solo la traduzione, non il sorgente. Se
vedesse anche il sorgente, potrebbe ritradurre invece di limitarsi alla formattazione.

Il Judge è separato dalla generazione per lo stesso motivo: chi produce una bozza non
deve essere anche l'unico controllore della propria bozza. Il giudice non sostituisce
la revisione umana, ma intercetta omissioni, problemi di glossario, errori grammaticali
e drift stilistici.

## Come viene costruito il prompt

Glossa organizza il prompt a strati. L'ordine è importante:

1. contesto statico del progetto: persona, regole, lingue, glossario;
2. blocco di riferimento documentale;
3. istruzioni dello stadio;
4. testo del chunk corrente o output dello stadio precedente.

Questa struttura mantiene stabile la parte riutilizzabile del prompt. Quando il provider
supporta il caching del prefisso, le parti statiche possono essere riusate tra chiamate
successive, riducendo costi e latenza.

Il punto non è solo economico. Un ordine stabile rende la pipeline più prevedibile:
glossario e regole restano in alto, il contesto documentale resta separato dal testo da
tradurre, e le istruzioni specifiche dello stadio non contaminano gli altri passaggi.

## Perché esiste la modalità Test

La modalità Test serve a fermare gli errori prima che diventino errori ripetuti su tutto
il documento. Un chunk rappresentativo mostra subito se:

- il provider scelto regge il tipo di testo;
- il prompt produce il registro corretto;
- il glossario viene rispettato;
- il refine migliora davvero la bozza;
- il format resta entro il suo compito.

Solo quando il Test è stabile ha senso passare alla produzione sull'intero documento.

## Provider e modelli non sono intercambiabili

Provider e modelli differiscono per costo, velocità, contesto disponibile, stile,
robustezza del formato e qualità dell'audit. Per questo Glossa permette di scegliere
provider e modello per stadio.

In pratica:

- un modello economico può essere sufficiente per format o passaggi semplici;
- un modello più forte può servire per refine, judge o coerenza;
- un provider locale può essere utile per privacy o lavoro offline;
- DeepL può essere usato come primo passaggio veloce, con un LLM che rifinisce dopo.

La pipeline permette di combinare questi compromessi invece di forzare un solo modello
a fare tutto.

## Revisione: cosa resta umano

Glossa rende il lavoro più controllabile, ma non decide al posto del revisore. La
decisione finale su registro, interpretazione, fedeltà filologica e accettazione del
testo resta umana.

Usa la pipeline per rendere visibili gli errori, non per nasconderli. Una buona run non
è una run senza intervento umano: è una run in cui sai quali passaggi sono stati
generati, quali sono stati controllati e quali richiedono ancora attenzione.

## Vedi anche

- [Pipeline documento](./document-pipeline) - workflow operativo end-to-end
- [Contesto e caching](./context-and-caching) - dettaglio su contesto, chunk e cache
- [Audit e revisione](./audit-review) - come usare il giudice senza delegargli la decisione finale
- [Configurazione pipeline](../reference/pipeline-config) - controlli disponibili per ogni stadio
