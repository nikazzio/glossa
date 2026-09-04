---
scope: ui-components
when-to-read: prima di creare o modificare componenti visivi
---
# Glossa — design system

Questo documento contiene solo contratti visivi stabili. L'implementazione delle
primitive condivise resta la sorgente di verità per API e varianti disponibili.

## Principi

- Interfaccia editoriale, calma e leggibile.
- Verde petrolio solo per selezione, focus e stato attivo.
- Rosso per azioni distruttive ed errori bloccanti.
- Ocra per cautele; giallo solo per attività in corso.
- Comandi visivi neutri, icon-only, con tooltip.
- Nessuna variante locale quando esiste una primitiva condivisa.
- Testo leggibile almeno `text-xs`; `text-[11px]` solo per caption uppercase.
- Focus, tastiera e ruoli ARIA fanno parte del componente.

## Palette

| Token | Valore chiaro | Uso |
|---|---:|---|
| `editorial-bg` | `#F8F5F0` | sfondo generale |
| `editorial-ink` | `#35687A` | testo principale |
| `editorial-charcoal` | `#3A7A72` | testo secondario |
| `editorial-accent` | `#2F746C` | selezione, focus, stato attivo |
| `editorial-danger` | `#A64E42` | danno ed errore bloccante |
| `editorial-muted` | `#666666` | testo secondario o disabilitato |
| `editorial-success` | `#3A7A65` | stato positivo |
| `editorial-warning` | `#7A5A14` | cautela |
| `editorial-running` | `#C49B2A` | attività in corso |
| `editorial-border` | `#C2BCB4` | bordi e separatori |
| `editorial-textbox` | `#EAE5DE` | campi e badge pieni |

Usare ruoli semantici per le superfici:

| Classe | Uso |
|---|---|
| `bg-surface-elevated` | dialog, menu, popover, header sticky |
| `bg-surface-panel` | sidebar, colonne e pannelli |
| `bg-surface-hover/50` | hover su righe cliccabili |

Campi, select e textarea usano `editorial-textbox` pieno. Vietati colori
Tailwind grezzi e valori esadecimali nei componenti.

## Tipografia

- `font-display`: titoli di vista e valori editoriali.
- `font-sans`: controlli, etichette e testo UI.
- `font-mono`: codice, log e metadati tecnici.
- Scala: `text-xs` 13 px, `text-sm` 15 px, `text-base` 16 px,
  `text-lg` 18 px, `text-xl` 22 px, `text-2xl` 26 px.
- Titolo di vista: `font-display italic`, responsive solo quando serve.
- Titolo sezione: uppercase, `text-[11px]`, `tracking-[0.16em]`.
- Label statistica: uppercase, `text-[11px]`, `tracking-[0.1em]`.
- Valore statistico: `font-display text-sm italic`.
- Metrica focale singola: `font-display text-lg italic`.

## Primitive obbligatorie

Le primitive vivono in `src/components/ui/`.

### IconButton

Usare per ogni comando icon-only. Include tooltip, focus e varianti canoniche.

- `tone`: `default | accent | danger | success | charcoal | muted | running`.
- `size`: `xs | sm | md | lg`.
- Toggle: `ariaPressed`.
- Tab: `role="tab"`, `aria-selected`, `aria-controls`; niente `ariaPressed`.
- Tab disattivato per fase/stato: resta visibile e raggiungibile col focus,
  ma `disabled` e il motivo va nel tooltip (`label` include il motivo, non
  solo il nome — sennò lo screen reader perde l'identità del comando). La
  navigazione da tastiera (freccie/Home/End) salta i tab disattivati invece
  di poterli attivare.
- In righe flex può richiedere `className="shrink-0"`.
- Nessun `<button>` raw per comandi visivi dell'app.

### Tooltip

`IconButton` integra già il tooltip. Per testo troncato, badge o elementi
non-pulsante usare `Tooltip`. Non usare il tooltip nativo `title` su elementi
interattivi.

### Menu e ClickPopover

- `Menu`: azioni contestuali o a coordinate; voci tramite `items`.
- `ClickPopover`: poche opzioni interattive ancorate a un `IconButton`.
- Il chiamante controlla `open` e `onOpenChange`.
- Il trigger usa `ariaPressed={open}` e non ribalta manualmente lo stato.
- Overlay sopra le finestre: `z-[210]`.

### PopoverItem e LinkChip

- `PopoverItem`: voce di elenco dentro un `ClickPopover` (scegliere workspace,
  collezione, vista salvata). Si usa quando accanto alla voce vive un altro
  comando o un campo, cioè dove `Menu` non arriva.
- `MenuActionRow`: voce di comando dentro un `ClickPopover` (icona, etichetta,
  `tone` opzionale `danger`) — per menu di azioni (es. archivia/rimuovi
  raccolti in un unico trigger), non per scegliere un'opzione da un elenco
  (quello resta `PopoverItem`).
- `LinkChip`: etichetta di un legame già stabilito che, cliccata, lo scioglie.
  Il motivo sta nel `Tooltip`, mai nel `title` nativo; il nome leggibile del
  legame resta il nome del comando.
- Nessuna riga di elenco, etichetta di legame o voce di menu scritta a mano
  nei componenti.

### SectionLabel, StatRow e StatBlock

- `SectionLabel`: intestazione di sezione con icona.
- `StatRow`: label e valore corti, allineati su due colonne — non va a capo.
- `StatBlock`: label sopra, valore sotto, va a capo con `break-words` — per
  pannelli stretti con valori lunghi (titoli, descrizioni fisiche, fondi di
  conservazione); prop `href` opzionale per i link veri (pagina web, scheda
  del catalogo), che aggiunge da sé un comando di copia (`CopyButton`)
  accanto al link.
- `CopyButton`: copia negli appunti, icona che diventa un segno di spunta per
  due secondi, `size` come `IconButton`. Ogni indirizzo copiabile (manifesti,
  link a pagine esterne) lo usa — mai un pulsante di copia scritto a mano.
- Non ricreare localmente gli stessi pattern.

### TabStrip

Fila di linguette icona con la propria navigazione da tastiera: frecce, Home ed
End, con il focus che segue la linguetta scelta come vuole il modello ARIA.
Usarla per ogni gruppo di linguette che non sia già dentro `InspectorShell` —
sotto-schede di una finestra di impostazioni, linguette di un pannello.

- `tabs`: `{ id, label, icon }`; l'etichetta vive nel tooltip, non a schermo.
- `idPrefix`: da cui derivano `<prefix>-tab-<id>` e `<prefix>-panel-<id>`, così
  il pannello si collega con `aria-labelledby`.
- Il pannello attivo lo monta il chiamante, con `role="tabpanel"`.
- Non riscrivere la gestione delle frecce nei componenti: esisteva tre volte a
  mano e ogni copia divergeva su Home o sul percorso di tabulazione.

### InspectorShell

Guscio comune per una colonna a tab con collasso — nato per il pannello
Insight della traduzione, riusato identico dalla scheda opera in Biblioteca,
pensato per qualunque colonna laterale a tab futura (es. Trascrizioni): un
domani si aggiunge una tab o si cambia lo stile di collasso **in un punto
solo**.

- `tabs`/`activeTab`/`onTabChange`: barra tab a roving tabindex (`TabButton`),
  le frecce/Home/End saltano le tab disattivate.
- `actions`: contenuto a destra della barra tab (etichetta della tab attiva,
  comandi contestuali) — libero, ogni uso ci mette il suo.
- `panelIcon`/`panelLabel`: se presenti, mostrano sopra la barra tab
  un'intestazione con il comando di collassa/espandi (`collapsed`/
  `onCollapsedChange`) e uno slot `headerActions` per comandi accanto (es.
  chiudere il pannello). Senza `panelLabel`, niente collasso: solo tab e
  contenuto.
- Chi monta il componente resta responsabile della larghezza fisica del
  riquadro (es. un `Panel` di `react-resizable-panels` con `collapsible`):
  `collapsed` qui è solo lo specchio di quello stato, non lo decide da sé.
- `ownsPanelSemantics` (default vero): falso solo se `children` porta già un
  proprio wrapper `role="tabpanel"` per tab (più componenti di contenuto,
  ognuno con la sua identità — come i tab del documento).

### SettingRow e campi

- Ogni impostazione usa `SettingRow` dentro una lista con `divide-y` e
  `border-y`.
- Riga `py-2.5`, label `text-sm`, una sola icona nel comando a destra.
- L'etichetta prende lo spazio disponibile, il comando non lo ruba: `SettingRow`
  incapsula i figli in un contenitore che non si allarga. Un campo a larghezza
  piena dentro una riga riduceva «Nome» a «No…».
- Spiegazioni nel `hint`, che è un suggerimento al passaggio del mouse
  raggiungibile da tastiera, non un paragrafo permanente. Ogni valore che ha una
  conseguenza non ovvia ne ha uno.
- Input, select e textarea usano le classi campo condivise:

| Classe | Uso |
|---|---|
| `FIELD_CLASSNAME` | campo a larghezza piena, per moduli e riquadri propri |
| `FIELD_INLINE_CLASSNAME` | campo di testo accanto alla sua etichetta, che non si allarga |
| `FIELD_NUMBER_CLASSNAME` | numero breve: `w-16`, allineato a destra, monospaziato, senza le frecce native |
| `FIELD_MONO_CLASSNAME` | valori tecnici a spaziatura fissa |

- Un numero con unità di misura tiene l'unità **fuori dall'etichetta**, in una
  colonna di larghezza fissa accanto al campo: senza, i campi di due righe
  vicine finiscono a larghezze diverse e le cifre non si incolonnano.
- `Select` ha due misure di testo: `sm` (predefinita) per barre e righe
  compatte, `md` dentro le liste di impostazioni, dove un valore più piccolo
  dell'etichetta accanto si legge come una nota a margine invece che come la
  scelta fatta. La larghezza si lascia al contenuto, senza numeri fissi, salvo
  un tetto per i testi lunghi.
- Scelte esclusive con nome usano `SegmentedControl`.
- Interruttori booleani usano `ToggleRow`.

### Dialog

- Finestre modali tramite `Dialog`; conferme distruttive tramite `AlertDialog`.
- Conferma e annullamento usano i pulsanti dialog condivisi.
- Niente overlay, focus trap o gestione Escape implementati localmente.
- Comandi di conferma testuali sono ammessi solo dentro dialog.

### Badge numerici

Conteggi compatti non interattivi: cerchio `h-5 w-5`, testo
`text-[10px] font-bold text-white`, tooltip e `aria-label`. Il colore deriva
dalla mappa semantica esistente. Conteggi cliccabili usano una primitiva
interattiva.

## Pattern di layout

### Barre filtro

- Label attiva in `font-display italic`.
- Opzioni icon-only con tooltip.
- Selezione tramite `tone="accent"`.
- Ordine e posizione restano stabili tra viste equivalenti.

### Shell e pannelli

- Sidebar e rail usano larghezze persistite nello store UI.
- Consumer non duplicano larghezze hard-coded.
- Grip sempre visibile; stato hover, drag e focus riconoscibile.
- Animazioni usano i token di motion condivisi.
- Fly-out non coprono il controllo che li ha aperti e si chiudono con Escape.

### Impostazioni

- Radice: `space-y-10`, `role="tabpanel"`, `aria-labelledby`.
- Sezione: `space-y-4` con `SectionLabel`.
- Elenchi: righe piatte separate, niente card o pill.
- Una scheda che raccoglie argomenti diversi si divide in **sotto-linguette**
  (`TabStrip`) invece di diventare un rotolo unico: accanto alla fila,
  l'etichetta della linguetta attiva in `font-display italic`.
- Salvataggio al cambio, salvo input intermedi che richiedono conferma
  esplicita. In quel caso mostrare stato non salvato e comando di ripristino.
- Ordine generale: modalità di traduzione, coppia linguistica, persona.

### Elenchi di versioni e comandi per riga

Quando una riga descrive una cosa su cui si può agire — una versione locale di
un libro, un profilo, un file — i comandi che la riguardano stanno **su quella
riga**, non nell'intestazione della sezione: nell'intestazione non si capisce su
quale delle righe agiscano. Restano nell'intestazione soltanto i comandi che
valgono per l'insieme, e il loro testo dice che valgono per tutto.

I dati della riga stanno su righe separate (`StatRow` dentro un `dl`), non
concatenati con punti su una riga sola: in una colonna stretta quattro dati
separati da «·» non si leggono.

### Barra di stato

Tre zone stabili: contesto a sinistra, stato centrale, comandi globali a
destra. Un'informazione non cambia posizione passando tra sezioni.

## Accessibilità

- Focus visibile: `focus-visible:ring-2 focus-visible:ring-editorial-accent`.
- Disabilitato: `disabled:opacity-40 disabled:cursor-not-allowed`.
- Tablist con roving tabindex; frecce, Home ed End spostano il focus.
- Enter, Space o click attivano la voce.
- Tabpanel collegato con `aria-labelledby`.
- Testo e stati non dipendono dal solo colore.
- Animazioni rispettano `prefers-reduced-motion`.

## Console e pannello lavori

Console usa solo token `terminal-*`; pannello lavori usa token editoriali.
Niente colori neon o valori locali.

| Token console | Chiaro | Scuro | Uso |
|---|---:|---:|---|
| `terminal-bg` | `#F7F3EC` | `#0D0B09` | sfondo |
| `terminal-chrome` | `#EFE8DC` | `#131008` | header |
| `terminal-border` | `#C6BEB0` | `#2A2218` | separatori |
| `terminal-ink` | `#2F2A23` | `#D8CFC5` | testo |
| `terminal-secondary` | `#665748` | `#8A7A6E` | metadati |
| `terminal-error` | `#862E1E` | `#C07060` | errori |
| `terminal-warn` | `#6F5410` | `#C49B2A` | avvisi |
| `terminal-success` | `#275B4A` | `#5A9A7A` | esiti positivi |
| `terminal-info` | `#315B72` | `#7898AA` | informazioni |

- Aree scroll console: `.terminal-scrollbar`.
- Header: riga chrome con titolo, stato e chiusura; toolbar separata.
- Drawer ridimensionabile tra 160 e 520 px, altezza persistita.

## Controllo prima di aggiungere UI

1. Cercare un caso equivalente.
2. Riutilizzare la primitiva esistente.
3. Verificare tema chiaro/scuro, focus, tastiera, tooltip e testo lungo.
4. Aggiungere una variante solo quando il comportamento non è esprimibile con
   quelle esistenti.

Il riferimento visivo live è nella guida di stile interna dell'app.
