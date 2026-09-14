---
title: Workspace e progetti
---

# Workspace e progetti

Un workspace definisce l’ambito organizzativo dei progetti e delle risorse
linguistiche. Un progetto di traduzione appartiene a un solo workspace e può
contenere più pipeline, ciascuna con configurazione e risultati propri.

## Ambiti dei dati

| Ambito | Contenuto |
| --- | --- |
| Applicazione | Credenziali, connessioni ai provider, preferenze, catalogo delle fonti e lavori in background |
| Workspace | Progetti, collegamenti alle opere e ai dizionari, memoria di frasi e modifiche terminologiche locali |
| Progetto e pipeline | Testo sorgente, lingue, fasi, prompt, glossario assegnato, frammenti, traduzioni e revisione |

Le opere e i dizionari possono essere collegati a più workspace senza duplicare
i dati. Modificare una voce condivisa e applicare una correzione locale al
workspace sono operazioni distinte. La correzione locale non modifica la voce
originale; creare una copia produce invece un dizionario indipendente.

## Creazione e salvataggio

La pagina del workspace e l’area **Traduzioni** consentono di creare progetti.
L’area Traduzioni raccoglie i progetti di tutti i workspace. Nome, descrizione e
icona del workspace aiutano a riconoscerne l’appartenenza nelle diverse viste.

Il salvataggio automatico opera su progetti già creati. Le modifiche vengono
rilevate e salvate dopo un breve intervallo di inattività; durante l’elaborazione
il salvataggio automatico attende uno stato stabile. La barra di stato distingue
modifiche da salvare, salvataggio in corso, completamento ed errore.
`Ctrl + S` richiede un salvataggio manuale, con i limiti descritti nelle
[scorciatoie](./keyboard-shortcuts).

## Dashboard

La Dashboard comprende una panoramica, la ricerca su più fonti e la ricerca
singola o per identificativo. Solo la scheda visibile viene montata
nell’interfaccia; i lavori già avviati sono gestiti separatamente dal backend.

La panoramica mostra opere e traduzioni recenti, elementi da controllare, lavori
per stato, ricerche e attività recenti. L’apertura dei riquadri viene ricordata.
Il filtro workspace si applica ai riepiloghi pertinenti; lavori e ricerche
mantengono ambito globale. Se una sezione non può caricare i dati, mostra un
errore anziché un conteggio pari a zero.

I riquadri si dispongono come serve: la maniglia a sinistra del titolo permette
di trascinare un riquadro più in alto, più in basso o nell’altra colonna, e la
disposizione scelta viene ricordata. A destra della panoramica sta l’elenco
completo dei jobs, in una colonna ridimensionabile e richiudibile.

## Spostamento e archiviazione

Spostare una traduzione cambia il workspace da cui ricava le risorse, senza
modificarne il testo. Le frasi estratte dalla traduzione la seguono. I costi
e le operazioni già registrati restano attribuiti al workspace in cui sono
stati prodotti; lo spostamento viene registrato nello storico.

Archiviare un workspace lo esclude dall’elenco attivo e ne conserva il contenuto.
Prima dell’eliminazione, la finestra di conferma permette di archiviare,
trasferire il contenuto a un altro workspace oppure eliminarlo. Le opere e i
dizionari collegati restano nel catalogo globale. L’eliminazione dei progetti
comprende invece i rispettivi dati di traduzione.

## Backup

Il [backup](../reference/backup-and-restore) comprende l’applicazione nel suo
insieme. Non è un formato di scambio per un singolo workspace e il ripristino
non unisce i dati del file con quelli presenti.
