---
title: Configurazione pipeline
---

# Configurazione pipeline

Glossa separa la configurazione della pipeline dal contenuto del documento, così puoi
tarare la run prima di avviare un batch.

Se vuoi capire perché i controlli sono divisi per stage, leggi anche
[LLM e pipeline](../guides/llm-and-pipelines): spiega perché traduzione, refine,
format e judge hanno responsabilità diverse.

## Controlli principali

- Lingua sorgente
- Lingua target
- Modalità pipeline
- Provider e modello per ogni stage
- Istruzioni di traduzione
- Persona
- Glossario / registro terminologico
- Impostazioni phrase memory
- Impostazioni audit e giudice

## Superfici tipiche di configurazione

| Superficie | Cosa imposti di solito |
|---|---|
| Settings tab | Lingue, modalità run, default generali, persona |
| Translation tab | Prompt stage, modelli, opzioni specifiche provider |
| Audit tab | Modello judge, prompt judge, prompt coherence |
| Area glossario | Glossario assegnato e voci terminologiche |

## Cosa cambia di solito per prima cosa

Se una run non è abbastanza buona, cambia questi elementi in ordine:

1. Prompt di traduzione
2. Provider o modello
3. Voci di glossario
4. Recupero phrase memory
5. Prompt del judge

Lascia stare tutto il resto finché non capisci quale parte sta causando il problema.

## Modalità pipeline

| Modalità | Descrizione |
|---|---|
| Standard | Singola passata di traduzione più audit |
| Editoriale | Stage di translation, refine e format prima dell'audit |
| DeepL Hybrid | Prima passata DeepL, refine LLM opzionale e audit LLM |

## Consigli a livello di stage

- Mantieni il translation stage focalizzato su accuratezza e stile di base.
- In modalità DeepL Hybrid, usa lo stage DeepL per la prima bozza e tieni prompt e modello LLM separati per refine e judge.
- Usa refine per riscrivere, non per la prima traduzione.
- Tieni il format stretto, così non altera il significato in modo silenzioso.
- Usa il judge per segnalare problemi, non per sostituire la review umana.

## Opzioni avanzate di Ollama

Usa il blocco JSON avanzato solo se il provider locale ti ha indicato opzioni
specifiche da inviare. Deve contenere un **oggetto JSON**: un elenco, un valore
singolo o testo JSON non valido non viene salvato nella configurazione della pipeline.

## Regole di esecuzione

- Il Test mode processa un chunk e lascia la configurazione modificabile.
- Il Production mode processa l'intero documento.
- Una run cancellata riprende dai chunk già completati quando possibile.

## Consigli di stabilità

- Cambia una variabile importante alla volta.
- Salva la pipeline prima delle run batch più grandi.
- Se un progetto è stabile, clona o rinomina una pipeline prima di sperimentare.

## Quando cambiare la configurazione

Cambia la configurazione prima di una run completa se hai bisogno di un provider,
un prompt o un comportamento del glossario diverso. Se devi solo ispezionare un
risultato, preferisci la modalità Test invece di cambiare l'intera pipeline.

## Preventivo costi

Passando il mouse sull'icona informazioni vicino al costo stimato (nel pannello impostazioni pipeline, e vicino al pulsante di traduzione/esecuzione nella vista documento) vedi un dettaglio per fase con il costo approssimativo in dollari.

- Nel pannello impostazioni pipeline il preventivo copre **sempre l'intero documento**, incluso il controllo di coerenza se configurato.
- Vicino al pulsante di esecuzione nella vista documento, il preventivo segue quello che sta per succedere: in modalità "traduci chunk" copre solo il chunk selezionato, in modalità "esegui tutto" copre l'intero documento.
- È una stima approssimativa basata sul conteggio parole e sul prezzo per token del modello scelto: il costo reale può variare leggermente.
- Gli stage DeepL sono misurati in caratteri fatturati da DeepL: Glossa può mostrarli dopo la run, ma il preventivo in dollari resta basato sui provider LLM con prezzo per token.

## Temperature per stage e per il giudice

Accanto al controllo di ragionamento (dove presente), ogni stage e il giudice hanno un
controllo facoltativo di temperature — quanto il modello varia rispetto alla risposta più
probabile. Valore basso = output più deterministico e ripetibile; valore alto = più
variazione.

- **Anthropic** e **Gemini**: sempre disponibile, intervallo 0–1 per Anthropic, 0–2 per Gemini.
- **OpenAI** e **DeepSeek**: disponibile solo quando il ragionamento per quella fase è
  impostato su "nessuno" o il modello non ragiona affatto — questi due provider rifiutano
  o ignorano il parametro mentre stanno ragionando attivamente. Intervallo 0–2.

Se non tocchi il controllo resta a 0 (massima precisione). Alzalo se vuoi più varietà
stilistica, tienilo basso per traduzioni tecniche o filologiche dove serve precisione.

## Esempi di traduzione (few-shot)

Nelle Impostazioni della pipeline puoi tenere un piccolo set di traduzioni intere
(tetto 5, consigliati 2-3) scelte a mano come esempio di stile per tutta la run —
diverso dalla phrase memory, che suggerisce coppie puntuali frase per frase.

Per aggiungerne uno: nella scheda Audit del frammento, dopo averlo bloccato con una
resa che consideri esemplare, premi il bottone dedicato (mostra anche quanti esempi
hai già salvato). L'esempio compare subito qui nelle Impostazioni, dove puoi
rivederlo, accorciarlo o rimuoverlo.

## Cache Anthropic con TTL esteso

Per i provider Anthropic, il caching del prompt è **spento di default** e va acceso
esplicitamente nelle Impostazioni della pipeline:

- Con l'uso tipico di Glossa (un frammento alla volta, spesso a distanza di minuti
  o ore), la cache di default scadrebbe prima di essere riletta — accenderla senza
  motivo costerebbe solo il sovrapprezzo di scrittura, senza mai far risparmiare.
- Attiva la cache solo se lavori frammenti in rapida successione.
- Se nella pipeline c'è uno stage lento tra un frammento Anthropic e l'altro (es. un
  provider locale), estendi la durata della cache a 1 ora invece dei 5 minuti di
  default — costa il doppio in scrittura invece di 1,25 volte, ma evita di perdere
  la cache per l'attesa dello stage lento.

## Vedi anche

- [Provider supportati](./provider-support) — confronto tra provider e guida alla scelta del modello
- [LLM e pipeline](../guides/llm-and-pipelines) — principi dietro la separazione degli stage
- [Pipeline documento](../guides/document-pipeline) — come le impostazioni si applicano al workflow end-to-end
- [Contesto e caching](../guides/context-and-caching) — come il prompt è strutturato per ottimizzare i costi
