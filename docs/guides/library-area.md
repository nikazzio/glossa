---
title: Area Biblioteca
---

# Area Biblioteca

La Biblioteca è un'area del workspace che raccoglie le risorse terminologiche e i template condivisi tra tutti i progetti.

## Come accedervi

- **Dal workspace hub**: clicca la card **Biblioteca** nella schermata principale del workspace.
- **Dall'header (anche dentro un progetto aperto)**: clicca l'icona Libreria (📚) in alto a destra. Glossa chiude il progetto corrente e porta direttamente alla Biblioteca.

## Sezioni

### Dizionari

Contiene i glossari di termini. Puoi:

- Creare un nuovo dizionario con il pulsante **+**
- Rinominare un dizionario con doppio clic
- Duplicarlo con **Crea copia**
- Importare termini da CSV/XLSX
- Assegnare un dizionario alla sessione corrente di progetto

### Phrase Memory

Mostra le coppie sorgente-target memorizzate per il workspace attivo. Le coppie vengono estratte automaticamente dagli output approvati durante i run.

Dalla sezione Memorie puoi:

- Cercare tra le coppie memorizzate
- Eliminare coppie singole o in blocco
- **Esportare in CSV** le coppie del workspace corrente con il pulsante **Esporta CSV**

### Template di prompt

Raccoglie i template di prompt riusabili, filtrabili per contesto e workflow.

**Filtro workflow** — seleziona tra **Traduzione** e **Trascrizione** per vedere solo i template relativi all'area di lavoro corrente. I template vengono associati a un workflow alla creazione.

**Filtro contesto** — restringe ulteriormente la lista per tipo di template:

| Contesto | Usato in |
|---|---|
| Fase | Stage di traduzione (Translate, Refine, Format) |
| Audit | Prompt Giudice e Prompt Coerenza |
| Persona | Sezione Persona nella config pipeline |
| Memory | Estrattore phrase memory del workspace |

## Navigazione interna

Dall'hub Biblioteca, clicca una card per entrare nella sezione. Il breadcrumb in alto riporta sempre alla schermata precedente:

- Dentro una sezione → clic sul nome della Biblioteca → torna all'hub Biblioteca
- Nell'hub Biblioteca → clic sul nome del workspace → torna al workspace hub
