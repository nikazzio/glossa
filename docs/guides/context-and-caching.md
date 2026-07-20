---
title: Contesto e caching
---

# Contesto e caching

Glossa usa due meccanismi per mantenere le traduzioni coerenti tra chunk e contenere
i costi di inferenza: un blocco di riferimento documentale che dà a ogni chunk
accesso al testo sorgente dei vicini, e una struttura del prompt a strati che
permette ai provider di fare caching il più possibile tra le chiamate.

Questa pagina descrive il comportamento tecnico. Per il ragionamento di prodotto
alla base della pipeline, leggi prima [LLM e pipeline](./llm-and-pipelines).

## Contesto documentale per chunk

Quando traduce un chunk, Glossa invia automaticamente il testo sorgente dei chunk
vicini come blocco di riferimento. Il modello lo usa per mantenere coerenti
terminologia, nomi, pronomi e stile attraverso i confini dei chunk — senza dover
vedere l'intero documento in una sola volta.

Per documenti brevi il blocco copre tutto il sorgente; per documenti più lunghi
copre una finestra scorrevole di chunk adiacenti. Il blocco viene fornito solo
come contesto: il modello riceve istruzioni esplicite di tradurre solo il chunk
corrente, non il contenuto del blocco di riferimento.

## Caching del prompt a strati

Ogni prompt contiene tre strati riutilizzabili, seguiti dal contenuto variabile del
chunk o dall'output dello stage precedente. Questa struttura aiuta il provider a
riusare il più possibile il contesto già calcolato:

| Strato | Contenuto | Caching |
|---|---|---|
| 1 | Persona, regole strutturali, glossario | Cachato una volta per tutta la run |
| 2 | Blocco di riferimento documentale | Cachato per gruppo di chunk vicini |
| 3 | Istruzioni specifiche dello stage | Inviato di volta in volta — è la parte più piccola |

Il testo del chunk corrente arriva dopo questi strati. Cambia a ogni chiamata, quindi
non è la parte che Glossa cerca di rendere cachabile.

## Isolamento degli stage

Ogni stage riceve esattamente le informazioni di cui ha bisogno — niente di più.
Questo evita ritraduzione involontaria e mantiene ogni stage focalizzato sul suo
compito specifico.

| Stage | Riceve |
|---|---|
| Traduzione | Testo sorgente del chunk corrente + blocco di riferimento |
| Refine | Testo sorgente + blocco di riferimento + output della traduzione |
| Format | Solo il testo tradotto — non il sorgente, non il blocco di riferimento |
| Audit coerenza | Chunk tradotti vicini — non il sorgente |

Lo stage Format riceve solo la traduzione per design: se ricevesse anche il sorgente,
il modello potrebbe ritradurre invece di limitarsi alla pulizia della formattazione.

## Cosa significa in pratica

Dopo che il primo chunk di un gruppo viene elaborato, i chunk successivi dello stesso
gruppo costano meno perché il provider riusa gli strati già cachati. Su documenti
lunghi con molti chunk il risparmio è significativo, specialmente in modalità
Editoriale dove tre stage vengono eseguiti per chunk.

## Cache retention per modello

La durata della cache varia a seconda del provider e del modello. OpenAI, ad esempio,
distingue due politiche:

- **Modelli completi**: extended retention fino a 24 ore — ogni chunk successivo
  beneficia del riscaldamento della run precedente anche tra sessioni diverse.
- **Modelli mini/nano**: in-memory retention — il prefisso scade dopo 5–10 minuti
  di inattività.

Questo spiega perché lo stage Refine (tipicamente su un modello mini) può mostrare
0% di cache hit anche con prompt identico: se sono passati più di 10 minuti tra
un chunk e il successivo, la cache è già scaduta.

I valori indicati (24 ore, 5–10 minuti) riflettono il comportamento osservato e non costituiscono garanzie contrattuali — i provider possono modificarli senza preavviso. Controlla la documentazione del tuo provider per la politica di retention del modello che stai usando.

## Anthropic: cache opt-in con TTL esteso

A differenza degli altri provider, per Anthropic il caching è **spento di default** e
va acceso a mano nelle Impostazioni della pipeline. Motivo: con l'uso tipico di
Glossa (un frammento alla volta, spesso a distanza di minuti o ore) la cache di
default da 5 minuti scadrebbe quasi sempre prima di essere riletta, e accenderla
senza motivo costerebbe solo il sovrapprezzo di scrittura senza mai risparmiare.

Se serve, puoi anche estendere la durata della cache a 1 ora invece dei 5 minuti
di default — utile quando nella pipeline c'è uno stage lento (es. un provider
locale) tra un frammento Anthropic e l'altro. Costa il doppio in scrittura invece
di 1,25 volte. Vedi [Configurazione pipeline](../reference/pipeline-config) per i
dettagli dei due controlli.

## Vedi anche

- [Configurazione pipeline](../reference/pipeline-config) — come configurare stage e modelli
- [LLM e pipeline](./llm-and-pipelines) — principi teorici dietro chunk, stadi e judge
- [Audit e revisione](./audit-review) — come il giudice valuta l'output di ogni chunk
