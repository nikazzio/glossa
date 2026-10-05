# Prompt della pipeline — analisi e piano (bozza da discutere)

Stato: proposta del 4 ottobre 2026. Niente di questo è implementato.

## 1. Come funziona oggi

Ogni fase è una richiesta separata al modello. Ogni richiesta ha due messaggi:

- **sistema**: ruolo, regole, contesto, risorse e istruzioni. È uguale per tutti
  i frammenti, quindi il fornitore lo tiene in cache e costa meno;
- **utente**: il frammento da lavorare più la consegna finale.

Legenda: **F** = fisso nel codice, oggi non modificabile · **T** = testo tuo ·
**D** = dati che gestisci altrove · **A** = automatico.

### Traduzione

| # | Pezzo | Tipo | Quando c'è |
|---|---|---|---|
| 1 | Ruolo: «sei un traduttore esperto, segui il contesto e le istruzioni» | F | sempre |
| 2 | Intestazione «Work brief:» + Contesto di traduzione | F + T | sempre |
| 3 | Regole strutturali (paragrafi, a capo, spazi, elenchi, note) | F | sempre |
| 4 | Regole del glossario + tabella dei termini | F + D | sempre; senza dizionario resta la frase «nessun glossario» |
| 5 | Regole Markdown | F | solo documenti importati come Markdown |
| 6 | Esempi di traduzione | F + D | solo se ne hai inseriti |
| 7 | Frammenti vicini del documento, con cornice | F + A | quando il documento è diviso in gruppi; nessun interruttore |
| 8 | «Core Instructions:» + **prompt della fase** | F + T | sempre |
| 9 | Frasi dalla memoria spuntate | F + D | solo se la memoria è attiva e ci sono frasi spuntate |
| 10 | Promemoria del glossario | F | solo se c'è un glossario |
| 11 | «Restituisci solo la traduzione» | F | sempre |
| U | Messaggio utente: id frammento, testo, «traduci solo questo frammento» | F + A | sempre |

### Refine

Come Traduzione. Cambiano il punto 11 («riscrivi tutto il frammento») e il
messaggio utente: originale, traduzione precedente, eventuali rilievi
dell'audit, consegna finale.

### Format

| # | Pezzo | Tipo |
|---|---|---|
| 1 | Ruolo e regole: «correttore di forma, non tradurre né riscrivere» | F |
| 2 | «Core Formatting Instructions:» + **prompt della fase** + «restituisci solo il testo» | F + T |
| U | Testo tradotto + consegna finale | F + A |

Oggi non riceve contesto, glossario, esempi né frammenti vicini. **Riceve però le
frasi della memoria**, attaccate in fondo al prompt della fase: l'esecuzione le
aggiunge a tutte le fasi attive. Probabile svista; l'anteprima del frammento
invece non le mostra per Format.

### Audit

| # | Pezzo | Tipo |
|---|---|---|
| 1 | Ruolo: «giudice di qualità, valuta rispetto al contesto» | F |
| 2 | «Work brief:» + Contesto di traduzione | F + T |
| 3 | «Specific Audit Instructions:» + **prompt dell'audit** | F + T |
| 4 | Tabella del glossario | F + D |
| 5 | Regola Markdown (solo documenti Markdown) | F |
| 6 | Metodo di controllo frase per frase | F |
| 7 | Formato della risposta (giudizio, tipi, gravità, campi); spiegazioni nella lingua dell'interfaccia | F |
| U | Originale + traduzione + consegna | F + A |

### Coerenza

Ruolo F · Contesto T · compito F · **prompt della coerenza** T (vuoto = predefinito)
· glossario F + D · formato della risposta F · traduzioni vicine A · messaggio
utente F + A.

### DeepL

Nessun prompt: solo parametri e il suo campo Contesto.

### Problemi trovati

- Molte parti sono fisse, in inglese, e non si vedono finché non apri l'anteprima.
- Nell'anteprima non è chiaro quali pezzi compaiano solo in certi casi (Markdown,
  glossario, frammenti vicini).
- Le viste «Prompt completo» e «Costruzione» sono due cose diverse. La
  Costruzione è ricostruita a parte e può divergere da ciò che viene inviato.
- Il ruolo cita «il contesto» anche dove la fase non lo riceve.
- Il glossario compare due volte (regole all'inizio, promemoria alla fine).

## 2. Il Contesto di traduzione, fase per fase

| Fase | Lo riceve? | Perché |
|---|---|---|
| Traduzione | **sì** | dice lingue, varietà, obiettivo |
| Refine | **sì** | deve rivedere con gli stessi criteri |
| Audit | **sì** | giudica rispetto a lingue e obiettivo |
| Coerenza | **sì** | stessi criteri del documento |
| Format | **no** | corregge solo la forma: un testo che parla di tradurre lo spingerebbe a riscrivere |
| DeepL | **no** | non ha prompt |

È una regola della fase, non un'opzione. Stesso ragionamento per le risorse:

| Fase | Glossario | Esempi | Memoria | Frammenti vicini | Markdown |
|---|---|---|---|---|---|
| Traduzione | sì | sì | sì | sì | se Markdown |
| Refine | sì | sì | sì | sì | se Markdown |
| Format | no | no | no | no | se Markdown |
| Audit | sì | no | no | no | se Markdown |
| Coerenza | sì | no | no | sì (traduzioni) | no |

Differenze rispetto a oggi: Format oggi riceve la memoria e non la regola
Markdown; la coerenza oggi non riceve la regola Markdown. Da decidere.

## 3. Proposta: un solo modello per tutte le fasi

Principio: **niente testo nascosto**. Ogni testo che il programma aggiunge
diventa un pezzo con un nome, un testo predefinito modificabile, la freccia di
ripristino e un solo posto dove si modifica.

Ogni richiesta si compone sempre nello stesso ordine. L'ordine non cambia mai:
serve alla cache.

1. **Ruolo** — per fase (traduttore, revisore, correttore, giudice, revisore di coerenza).
2. **Contesto di traduzione** — unico, in Generale; solo per le fasi che lo ricevono.
3. **Regole** — per fase (strutturali per traduzione e Refine, metodo per l'audit, compito per la coerenza).
4. **Risorse** — glossario, Markdown, esempi; ognuna con la sua introduzione modificabile.
5. **Frammenti vicini** — introduzione modificabile; il testo è automatico.
6. **Prompt della fase** — quello che usi oggi, con i template.
7. **Formato della risposta** — per fase.
8. **Messaggio utente** — per fase, con segnaposto visibili ({{frammento}},
   {{traduzione precedente}}, …).

Dove si modificano (proposta):

| Pezzo | Dove |
|---|---|
| Contesto di traduzione | Generale |
| Regole Markdown | Generale (con la nota «solo documenti Markdown») |
| Introduzione e promemoria del glossario | scheda Glossario |
| Introduzione degli esempi e della memoria | scheda Memoria |
| Introduzione dei frammenti vicini | scheda Fasi, sezione Contesto |
| Ruolo, regole, prompt, formato risposta, messaggio utente | scheda della fase (Fasi) o Controllo qualità |

Per pipeline, non globali: così un template di pipeline resta completo.

## 4. Anteprima

- **Una sola vista: Costruzione**, chiesta al backend, quindi identica a ciò
  che parte.
- Ogni blocco mostra: nome, «modificabile in …» con collegamento, e la
  condizione se è condizionale («solo documenti Markdown», «solo con glossario»).
- I blocchi assenti in questa pipeline compaiono spenti con il motivo, così
  si vede che esistono.
- Ipotesi da decidere: spegnere un blocco da qui (per esempio niente esempi
  per l'audit). Se lo vogliamo, la scelta va salvata nella pipeline e mostrata
  anche nella scheda della fase.

## 5. Rischi

- **Formato della risposta di audit e coerenza**: l'app legge quella risposta.
  Se il testo viene cambiato male, l'audit fallisce. Proposta: modificabile, ma
  con il ripristino sempre visibile e un avviso nel suggerimento.
- **Messaggi utente**: senza i segnaposto il frammento non arriva al modello.
  Proposta: la conferma è spenta se manca un segnaposto obbligatorio.
- **Costo**: tutti i pezzi restano costanti per l'intera esecuzione, quindi la
  cache funziona come oggi.

## 6. Ordine di lavoro proposto

1. Anteprima: sola Costruzione dal backend, con etichette e condizioni (solo lettura).
2. Contesto: Format non lo riceve; ruoli corretti per fase.
3. Ruolo, regole e formato della risposta modificabili per fase.
4. Introduzioni di glossario, Markdown, esempi, memoria e frammenti vicini nelle loro schede.
5. Messaggi utente con segnaposto.
6. Documentazione nei tre posti a ogni passo.

## 7. Decisioni da prendere

1. Tabella del punto 2 (Contesto e risorse per fase): va bene, in particolare Format senza Contesto?
2. Pezzi per pipeline (proposta) o validi per tutte le pipeline?
3. Formato della risposta di audit e coerenza: modificabile con avviso, o visibile ma bloccato?
4. Spegnere blocchi dall'anteprima: sì o no?
5. Lingua dei testi predefiniti: restano in inglese (resa migliore con i modelli) o in italiano?

## 8. Decisioni prese (4 ottobre 2026)

- Tabella del punto 2 approvata: Format non riceve il Contesto di traduzione.
- Tutti i pezzi e tutti gli interruttori sono **per pipeline**, come i prompt
  delle fasi. Una pipeline nuova li prende dai predefiniti o dalla copia, secondo
  l'impostazione esistente (copia della prima / della precedente / predefiniti).
- Formato della risposta di audit e coerenza: visibile e bloccato; si sblocca a
  mano con un avviso; il ripristino resta sempre disponibile.
- Anteprima unica (Costruzione, dal backend). Da lì si accendono e spengono i
  pezzi; la scelta si salva nella pipeline.
- Regole Markdown: restano (prevengono i danni durante la traduzione; Format
  ripara dopo e c'è solo in Editoriale), attive solo per documenti Markdown e
  spegnibili dall'anteprima.
- Testi predefiniti in inglese.

## 9. Piano definitivo, a passi

Ogni passo è piccolo, si prova dal vivo e si salva prima del successivo.

1. **Anteprima unica, sola lettura.** Una vista Costruzione chiesta al backend
   per ogni fase (Traduzione, Refine, Format, Audit, Coerenza, DeepL). Ogni
   blocco: nome, tipo (fisso / tuo / dati / automatico), dove si modifica,
   quando compare; i blocchi assenti si vedono spenti con il motivo. Via la
   vista «Prompt completo».
2. **Regole di composizione per fase.** Format senza Contesto e senza memoria;
   ruoli che citano il Contesto solo dove c'è; promemoria del glossario
   unificato con le regole del glossario.
3. **Pezzi modificabili.** Ruolo, regole, introduzioni (glossario, Markdown,
   esempi, memoria, frammenti vicini), messaggio utente con segnaposto,
   formato della risposta bloccato con sblocco. Ognuno con predefinito e
   ripristino, salvati nella pipeline e copiati quando si crea una pipeline
   nuova (compreso il prompt della coerenza, che oggi la copia perde).
4. **Interruttori nell'anteprima.** Accendere e spegnere i pezzi facoltativi;
   la scelta si salva nella pipeline e la ripresa di un lavoro interrotto la
   considera.
5. **Documentazione** nei tre posti a ogni passo; test solo alla fine.

## 10. Avanzamento

- Passo 1 fatto: composizione a pezzi nel backend, anteprima unica con modi
  Struttura / Frammento aperto; tolta la linguetta Anteprima dello Studio.
- Passo 2 fatto: la memoria va solo a traduzione e Refine (non più a Format e
  DeepL); il promemoria del glossario è tolto, le regole restano una volta sola;
  l'intestazione «Work brief:» diventa «Translation context:» e i ruoli citano
  il «translation context», come il nome nell'interfaccia. Format riceveva già
  senza Contesto.
- Passo 3 fatto: testi di sistema modificabili per pipeline, con lucchetto
  nell'anteprima (Struttura), conferma in più per il formato della risposta,
  segnaposto obbligatori, template categoria Sistema, collegamento alla scheda
  per i pezzi con contenuto altrove. Campo `prompt_composition` già pronto anche
  per il passo 4 (pezzi spenti).

- Passo 4 fatto: interruttori per fase sui pezzi facoltativi nell'anteprima,
  salvati in `prompt_composition.disabled`, rispettati in esecuzione.

## 11. Cambi del database previsti, non ancora fatti

- **Lingue**: decise al §12 (nota sull'opera, colonne di lingua tolte dalla
  pipeline, nomi convertiti in codici).

## 12. Lingue dell'opera e Riferimenti (decisioni del 5 ottobre 2026)

Analisi dal codice: la coppia di lingue nasce all'importazione (dieci lingue
moderne), poi è invisibile e immutabile. Etichetta le frasi salvate, filtra la
ricerca dei Riferimenti a confronto esatto, entra nel prompt dell'estrazione
delle coppie e nel registro delle operazioni. I prompt di traduzione non la
usano più (comanda il Contesto di traduzione). DeepL ha una coppia propria nelle
opzioni della fase, richiesta dall'API. Il deposito delle unità di testo
(`0003_text_corpus.sql`) ha già lingua per revisione, tag e provenienza, ma lo
riempie solo la memoria.

### Decisioni

- **Le lingue appartengono all'opera**, non alla pipeline. L'opera ha lingua di
  partenza, lingua di arrivo e una nota libera facoltativa (varietà, periodo).
  Le colonne di lingua dell'opera esistono già; quelle della pipeline si tolgono.
  DeepL conserva la sua coppia nelle opzioni della fase.
- **Tre campi per lingua**, nessuno obbligatorio («non indicata» ammesso):
  lingua con codice ISO 639-3 (registro SIL, usato da cataloghi MARC e TEI),
  varietà con codice Glottolog limitata alle varietà della lingua scelta
  (per esempio latino → latino medievale, tardo, volgare; italiano → italiano
  antico, fiorentino), nota libera. Si salvano codice e nome, così un codice
  ritirato resta leggibile. Verificato il 5 ottobre 2026: ISO non ha codici per
  latino medievale, italiano antico, catalano antico; Glottolog ha le varietà
  come dialetti della lingua ISO; il latino arcaico è per Glottolog una lingua
  con codice non ISO (`qbb`), da trattare a parte.
- **Elenco incluso nell'app** (ISO circa 180 KB, Glottolog circa 2,5 MB),
  funzionante senza rete. Il comando «Aggiorna elenco lingue» dalle fonti
  ufficiali è un passo successivo con issue propria.
- **Un solo selettore di lingua** con ricerca per nome italiano, nome inglese o
  codice; gruppi: già usate nel workspace, lingue storiche, tutte. Varietà con
  ricerca, visibile dopo la lingua; poi la nota. Nomi italiani per le lingue
  comuni, nome ufficiale inglese per le altre. Stesso selettore
  nell'importazione e nel pannello dello Studio. Lingua di arrivo precompilata
  con l'italiano; senza lingua di arrivo i Riferimenti non filtrano per lingua.
  La Biblioteca resta col suo campo libero (fuori da questo lavoro).
- **Lingua di partenza precompilata** dalla lingua del libro in Biblioteca,
  quando c'è.
- **Modifica nella riga in cima allo Studio**: coppia in breve accanto al nome
  dell'opera e alla pipeline, nota nel suggerimento. Un clic apre un pannello con
  due menu e la nota; si salva solo con la conferma (icona di spunta con
  suggerimento), l'annullamento o l'uscita senza conferma non salvano niente.
  Con DeepL in cima compare solo la coppia dell'opera.
- **Frasi salvate**: prendono lingue e nota dell'opera. Se le lingue dell'opera
  cambiano, l'app chiede se aggiornare anche le frasi già salvate. L'estrazione
  automatica riceve le lingue vere dell'opera.
- **Riferimenti nello Studio, tre cerchi**: questo documento (sempre), workspace
  (sempre), tutti i workspace (facoltativo). Il globo che allarga a tutti i
  workspace sta nei Riferimenti accanto all'aggiornamento; la scelta resta
  ricordata per il workspace e sparisce dalle impostazioni del workspace. Ogni
  risultato dice da dove viene; prima quelli del documento. Unico vincolo di
  lingua: stessa lingua di arrivo; la lingua di partenza non filtra.
- **Analisi futura** (ricerche generali, paragrafi di originali, tag, tecniche
  simili): solo predisposta, cioè testi salvati con lingua, nota, provenienza e
  tag puliti. Nessuna interfaccia in questo lavoro.
- **Dati di prova**: dopo il passo 1, le frasi già salvate si aggiornano una
  volta alle lingue della loro opera, con copia del database prima e senza file
  di migrazione (correzione di dati, non di struttura).

### Passi

1. Elenco ISO e Glottolog incluso; selettore di lingua; l'opera unica fonte
   delle lingue; pipeline senza coppia; importazione col selettore e
   precompilazione dal libro. Cambio di struttura: lingua, varietà e nota
   sull'opera, colonne tolte dalla pipeline, nomi attuali convertiti in codici.
2. Riga in cima allo Studio: coppia in breve e pannello con conferma.
3. Memoria: salvataggio ed estrazione con le lingue dell'opera; domanda di
   aggiornamento delle frasi al cambio; catalogo Traduzioni ed elenco Memorie con
   i nomi delle lingue.
4. Riferimenti: tre cerchi, provenienza su ogni risultato, ordine, filtro sulla
   sola lingua di arrivo, globo spostato dalle impostazioni.
5. Aggiornamento una tantum delle frasi di prova.
6. Documentazione nei tre posti; test solo alla verifica finale.

### Avanzamento (5 ottobre 2026)

- Passi 1-4 fatti: elenco ISO/Glottolog incluso e rigenerabile; lingue, varietà
  e note sull'opera (migrazione 0007), pipeline senza coppia; selettore unico
  nell'importazione e nella finestra «Lingue dell'opera» della riga in cima allo
  Studio; frasi salvate con lingue dell'opera, varietà e nota sulle revisioni
  (migrazione 0008), riallineamento proposto dopo ogni Conferma; Riferimenti a
  tre cerchi con globo e filtro sulla sola lingua di arrivo.
- Passo 5: si fa dall'app (Conferma nella finestra delle lingue di ogni opera
  con frasi salvate), senza script sul database.
- Fuori piano, chiesti da Niki: finestra d'importazione sulla `Dialog` comune a
  due colonne; scelta del libro in «Crea traduzione» con elenco a ricerca.
- Resta: verifica finale (test da riallineare alla nuova struttura).

