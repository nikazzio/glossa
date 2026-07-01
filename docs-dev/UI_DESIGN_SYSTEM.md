---
scope: ui-components
when-to-read: prima di creare o modificare qualsiasi componente visivo
---

# Glossa — Design System

## Palette e tipografia

| Token | Valore | Uso |
|---|---|---|
| `editorial-bg` | #F8F5F0 | Background generale |
| `editorial-ink` | #35687A | Testo principale (contrasto 5.7:1) |
| `editorial-charcoal` | #3A7A72 | Testo secondario |
| `editorial-accent` | #2F746C | Accenti, bottoni attivi, selezioni |
| `editorial-danger` | #A64E42 | Azioni distruttive, stop, errori bloccanti |
| `editorial-muted` | #666666 | Testo disabilitato / secondario |
| `editorial-success` | #3A7A65 | Stato positivo |
| `editorial-running` | #C49B2A | Step pipeline in esecuzione (dot + label gialli con `animate-pulse`) |
| `editorial-border` | #C2BCB4 | Bordi e separatori |
| `editorial-textbox` | #EAE5DE | Background input |

> `editorial-warning` (#666666) = grigio, per avvisi generici. Per lo stato *in esecuzione* usa `editorial-running` (giallo).

**Font:**
- `font-display` (Elstob variable) — heading corsivi, label attive nelle barre filtro. `size-adjust: 110%`.
- `font-sans` — UI generica, etichette, body. Default **Plus Jakarta Sans**, ma è **scelto dall'utente** in Impostazioni → Tipografia (Plus Jakarta Sans / Geist / Inter / IBM Plex Sans). Override runtime di `--font-sans` su `:root` via `FontSync` (`App.tsx`), preferenza persistita in `uiStore.uiFont`. Ogni `@font-face` alternativo ha un `size-adjust` tarato per non far saltare la dimensione allo switch.
- `font-mono` — solo codice/log

**Type scale app:** `text-xs` 13px / `text-sm` 15px / `text-base` 16px / `text-lg` 18px / `text-xl` 22px / `text-2xl` 26px. I display veri usano `font-display italic` con classi responsive controllate (`text-4xl md:text-5xl` solo per titoli di vista, non per metadati o controlli).

> **Dimensione minima:** il testo leggibile (prosa, descrizioni, valori dato serif) non scende sotto `text-sm`/`text-xs`. Le **caption sans uppercase** (label stat, header) possono stare a `text-[11px]`: il sans resta leggibile compatto, e la caption non è il dato. `text-[10px]` resta solo per strip verticali collassate e badge micro decorativi.

> **Gerarchia tipografica pannelli (documento/insight)** — il sans fa da caption, il serif fa da dato:
> - **Titolo sezione** (icona accent + uppercase): `text-xs` uppercase `tracking-[0.16em]` muted. È l'header, non si tocca.
> - **Label stat** (caption sans uppercase): `text-[11px]` `tracking-[0.1em]` muted. Sans piccolo = si legge bene anche compatto.
> - **Valore dato** (serif italic): `font-display text-sm italic` ink. Più grande della label: il serif corsivo a corpo piccolo è meno leggibile del sans, quindi al valore serve più corpo.
> - **Layout riga**: `flex items-baseline justify-between` — label a sinistra, valore allineato a destra (lista a due colonne scansionabile), mai label+valore ammucchiati con `gap-1`.
> - **Hero** (metrica focale singola: %, qualità composita): `font-display text-lg italic`.
> - Riga stat condivisa: `components/ui/StatRow.tsx`; label sezione: `components/ui/SectionLabel.tsx`. Le card breakdown seguono lo stesso schema (titolo card `text-xs`, righe metriche `justify-between` con label `text-[11px]` / valore `text-sm`).

> **Scala tracking (label uppercase):** ladder calma — sezione/strip `tracking-[0.16em]`, label stat `tracking-[0.1em]`, badge `tracking-[0.1em]`. Mai `tracking-[0.28em]`/`[0.35em]` sulle superfici documento/insight.

---

## Regole generali

- **Accenti sempre `editorial-accent`** (verde petrolio) per bottoni di selezione, stato attivo, focus ring. Mai `editorial-ink`.
- **Danger sempre `editorial-danger`** per azioni distruttive, stop e segnali d'errore bloccanti. Non usare `editorial-accent` per pericolo.
- **Hover inattivo:** `hover:border-editorial-accent/40 hover:text-editorial-accent`
- **Disabled:** `disabled:opacity-40 disabled:cursor-not-allowed`
- **Focus:** `focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent`
- **Tooltip obbligatorio:** ogni pulsante icon-only usa `<IconButton>` — il tooltip è incluso automaticamente.
- **Nessuna variante locale:** i componenti feature non devono reintrodurre button/dot/label custom. Usa sempre le primitive condivise.

---

## Primitive condivise (`src/components/ui/`)

### IconButton — pulsanti icon-only (OBBLIGATORIO)

Ogni controllo icon-only **deve** usare `<IconButton>`. Non usare `<button>` raw per controlli visivi nell'app.

```tsx
import { IconButton } from '../ui';

// Azione semplice
<IconButton size="md" tone="default" onClick={handler} title={t('chiave.tooltip')}>
  <PlusIcon size={13} />
</IconButton>

// Toggle (stato attivo comunicato via tone + ariaPressed)
<IconButton
  size="md"
  tone={isActive ? 'accent' : 'default'}
  onClick={() => setActive(!isActive)}
  title={t('chiave.tooltip')}
  ariaPressed={isActive}
>
  <SomeIcon size={14} />
</IconButton>

// Tab ARIA (usa role/aria-selected/aria-controls invece di ariaPressed)
<IconButton
  size="lg"
  tone={activeTab === 'foo' ? 'accent' : 'default'}
  onClick={() => setTab('foo')}
  title={t('chiave.tab')}
  id="panel-tab-foo"
  role="tab"
  aria-selected={activeTab === 'foo'}
  aria-controls="panel-panel-foo"
>
  <SomeIcon size={16} />
</IconButton>
```

**Varianti tone:** `default | accent | danger | success | charcoal | muted | running`
**Varianti size:** `xs | sm | md | lg` (`xs` = `p-1`, per barre molto compatte come la barra di stato)

Regole:
- Usa `ariaPressed` per toggle (on/off). Usa `aria-selected` per tab ARIA.
- Non usare `ariaPressed` e `aria-selected` insieme sullo stesso pulsante.
- Aggiungi `className="shrink-0"` se il button è in una flex row con elementi `w-full`.

---

### Tooltip — tooltip canonico (OBBLIGATORIO per controlli icon-only)

`IconButton` integra già `<Tooltip>` internamente — non aggiungere tooltip separati sui pulsanti.

Per tooltip su altri elementi (testo troncato, badge, etichette):

```tsx
import { Tooltip } from '../ui';

<Tooltip label="Testo del tooltip" side="bottom">
  <span className="truncate">{longText}</span>
</Tooltip>
```

**Non usare** l'attributo HTML `title` per tooltip visivi sui controlli interattivi (genera il tooltip nativo del sistema, fuori stile). Per un pulsante icon-only usa `IconButton` (il suo prop `title` diventa tooltip editoriale); per altri controlli avvolgi in `<Tooltip label>`. `title` è accettabile solo su elementi **non** interattivi.

Implementazione su **Radix Tooltip** (posizionamento automatico con flip ai bordi, Provider interno al componente — nessun setup a livello App). Box invariato (`font-display` italic), z-index `z-[210]` (sopra le finestre `z-[200]`). API invariata: `label`, `side`, `offset`.

---

### Menu — menu contestuale / a tendina (Radix)

Menu su **Radix DropdownMenu**: `role="menu"`, navigazione frecce/Home/End, type-ahead, Esc, focus management — gratis. Per menu a coordinate (es. tasto destro / selezione testo) usa l'ancora virtuale `anchorRect`.

```tsx
import { Menu } from '../ui';

<Menu
  open={open}
  onOpenChange={(o) => { if (!o) onClose(); }}
  anchorRect={{ x, y }}
  items={[{ id: 'add', label: t('...'), icon: <Icon size={13} />, onSelect: handleAdd }]}
/>
```

Regole:
- Voci sempre via `items` (`MenuItem`): niente `<button>` raw posizionati a mano.
- z-index `z-[210]` (sopra le finestre). La voce evidenziata usa `data-[highlighted]`.

---

### StatusDot — indicatore stato compatto

Per indicatori di stato non interattivi (stage pipeline, stato chunk, ecc.):

```tsx
import { StatusDot } from '../ui';

<StatusDot tone="success" />
<StatusDot tone="running" />
<StatusDot tone="accent" />
```

**Tone disponibili:** gli stessi di `IconButton` — usa solo token `editorial-*`. Non usare classi Tailwind dirette come `bg-emerald-500`, `bg-amber-400`, ecc.

---

### Badge numerico rotondo con tooltip — conteggi compatti non interattivi

Per conteggi compatti dove basta colore + numero (es. numero di note su un frammento nell'Indice), niente etichetta testuale a fianco: pallino colorato con il numero dentro, descrizione completa in `Tooltip` all'hover.

```tsx
import { Tooltip } from '../ui';

<Tooltip label={t('annotations.badgeCount', { count })} side="top">
  <span
    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${bgClass}`}
    aria-label={t('annotations.badgeCount', { count })}
  >
    {count}
  </span>
</Tooltip>
```

Regole:
- `bgClass` solo da mappe canoniche esistenti (es. `ANNOTATION_META[type].bgClass` in `NotesTab.tsx`) — mai colori inventati.
- Se il conteggio aggrega elementi di tipi/tone diversi, il colore del pallino è quello del tipo più urgente presente (stessa priorità della mappa canonica), non una media o un colore neutro a parte.
- Diametro fisso `h-5 w-5`, testo `text-[10px] font-bold text-white` per restare leggibile anche a 1-2 cifre.
- Non usare per conteggi che necessitano di essere cliccabili: quello è `IconButton`/`PillButton`, non questo pattern.

---

### SectionLabel — intestazione sezione con icona

Per intestazioni di sezione con icona + etichetta uppercase:

```tsx
import { SectionLabel } from '../ui';

<SectionLabel icon={SomeIcon} label={t('chiave.sezione')} />
```

Non reintrodurre il pattern `<div className="flex items-center gap-1.5">` manuale dove `SectionLabel` è sufficiente.

---

### ToggleRow — riga con toggle slide

Per opzioni on/off in pannelli di configurazione, usa `ToggleRow` dentro un contenitore `rounded-[16px] border border-editorial-border/60 bg-editorial-textbox/10 px-4 py-4`. Struttura standard: `SectionLabel` sopra il box, `ToggleRow` dentro.

```tsx
import { SectionLabel, ToggleRow } from '../ui';

<div className="space-y-3">
  <SectionLabel icon={SomeIcon} label={t('chiave.sezione')} />
  <div className="space-y-3 rounded-[16px] border border-editorial-border/60 bg-editorial-textbox/10 px-4 py-4">
    <ToggleRow
      icon={<SomeIcon size={13} />}
      label={t('chiave.opzione')}
      checked={value}
      onChange={() => setValue(!value)}
    />
  </div>
</div>
```

Regole:
- Non usare `<input type="checkbox">` raw nei pannelli config: usa sempre `ToggleRow`.
- Il toggle slide (`bg-editorial-accent` attivo, `bg-editorial-border` inattivo) è lo standard visivo condiviso tra tutti i pannelli.
- `disabled` disabilita sia il click che l'aspetto visivo (opacity-40).

---

### PillButton — comandi testuali compatti

Usa `PillButton` per comandi testuali compatti dentro dashboard, modali e toolbar secondarie.

```tsx
<PillButton variant="secondary">{t('common.cancel')}</PillButton>
<PillButton variant="accent">{t('workspace.newBookCard')}</PillButton>
```

Regole:
- `accent` è pieno: `bg-editorial-accent text-white`. Usalo per l'azione primaria locale.
- `secondary` è neutro e deve restare meno evidente dell'azione primaria.
- Non creare pill locali con `button` raw se `PillButton` basta.

---

### Finestre / overlay — `Dialog` e `AlertDialog` (OBBLIGATORIO)

Tutte le finestre modali poggiano su **Radix UI**. Comportamento (focus trap, Escape, ripristino focus, scroll-lock, portale, `aria-modal`) è gestito dalla libreria: **non** si reimplementa a mano. Vietato `fixed inset-0` + backdrop manuale, `useFocusTrap`, `EditorialModalShell` (rimossi).

- **`Dialog`** — finestra generica con chrome editoriale (eyebrow, icona accent, titolo `font-display` italic, descrizione, body scrollabile, footer, X in alto a destra).

```tsx
import { Dialog } from '../ui';

<Dialog
  open={open}
  onOpenChange={(o) => { if (!o) onClose(); }}
  title={t('...')}
  closeLabel={t('common.close')}
  eyebrow={t('...')}            // opz.
  icon={<SomeIcon size={20} />} // opz.
  widthClassName="max-w-lg"     // default max-w-3xl
  panelClassName="h-[85vh]"     // opz. altezza fissa
  footer={/* pulsanti */}
>
  {/* corpo */}
</Dialog>
```

- **`AlertDialog`** — solo conferme (azione + annulla). Focus iniziale sul pulsante sicuro, non si chiude con click esterno.

```tsx
<AlertDialog open={open} onOpenChange={...} title={...}
  confirmLabel={...} cancelLabel={...} onConfirm={...}
  tone="danger" />   // 'danger' = conferma rossa per azioni distruttive
```

Regole:
- Finestra che si apre **sopra** un pannello/overlay app: lo z-index delle primitive è `z-[200]`, sopra gli overlay app (Libreria `z-[160]`). Non serve override.
- Header bespoke (es. Anteprima import): usare le primitive Radix dirette (`RadixDialog.Root/Portal/Overlay/Content`) con `RadixDialog.Title asChild` sul titolo, mantenendo lo z-index `z-[200]`.

### Pulsanti finestra — `DialogConfirmButton` / `DialogCancelButton` (OBBLIGATORIO)

Pulsanti base di ogni footer finestra. Uniformi ovunque.

```tsx
import { DialogConfirmButton, DialogCancelButton } from '../ui';

<DialogCancelButton onClick={onClose}>{t('common.cancel')}</DialogCancelButton>
<DialogConfirmButton onClick={onConfirm} disabled={!canConfirm}>{t('common.confirm')}</DialogConfirmButton>
```

- **Conferma/Accetta**: pieno color **inchiostro** (`bg-editorial-ink text-white`), `text-sm`, frase normale (no maiuscolo), pillola arrotondata.
- **Annulla/Chiudi/Indietro**: bordo sobrio, testo muted; all'hover sfondo `editorial-textbox/50` + testo/bordo ink.
- Eccezione: conferme **distruttive** usano `AlertDialog tone="danger"` (pulsante `editorial-danger` come segnale di pericolo).
- Non creare pulsanti footer raw: usa sempre queste due primitive.

---

### Barra navigazione filtri (pattern LibraryPanel — OBBLIGATORIO)

Ogni gruppo di filtri/tab usa `<IconButton>` con separatore e label corsiva:

```tsx
<div className="flex items-center gap-2">
  {OPTIONS.map((opt) => (
    <IconButton
      key={opt}
      size="md"
      tone={current === opt ? 'accent' : 'default'}
      onClick={() => setCurrent(opt)}
      title={label(opt)}
      ariaPressed={current === opt}
    >
      <SomeIcon size={14} />
    </IconButton>
  ))}
  <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
  <span className="self-center font-display text-sm italic text-editorial-ink">{label(current)}</span>
</div>
```

Regole:
- Separatore: `span w-px h-4 bg-editorial-border/70`
- Label corsiva: `font-display text-sm italic text-editorial-ink`
- Hover inattivo: `hover:border-editorial-accent/40` (non `/60`) — gestito dal tone `default` di `IconButton`

---

## Multibar shell (sidebar home e progetto)

Le superfici laterali (home e progetto) usano **un'unica barra** (`ShellNav`, `components/layout/ShellNav.tsx`) con sezioni e item navigabili. Niente più colonne multiple né "linguetta" flottante.

```tsx
<motion.nav className="flex shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60 transition-[width] duration-200 w-60" />

// item attivo = barra accent verticale + tint + testo accent (ShellNavItem)
<ShellNavItem active icon={<Icon />} label="..." />
```

Regole:
- Sidebar e dashboard usano `editorial-bg/60` o `editorial-bg`, non bianco puro.
- **Item attivo**: barra accent verticale (`absolute left-0 w-[3px] bg-editorial-accent`) + tint `bg-editorial-accent/10` + testo `text-editorial-accent`. Niente fondo accent pieno, niente linguetta che sfora il bordo colonna.
- **Collapse**: la barra anima la larghezza, mai render condizionale `return null` (provoca scatti). Collassata = solo icone con `Tooltip` (mai `title` nativo), contenuto ancorato alla larghezza collassata (niente slide). **Niente bottone comprimi dedicato** (pattern activity-bar): click sull'item **attivo** comprime/espande; cambiare sezione **conserva** lo stato collassato/espanso (non riapre la barra). Anche il drag del bordo destro collassa/ridimensiona.
- **Footer barra** (`ShellNavFooter`): azioni app-level (Impostazioni, Aiuto) ancorate in fondo alla barra (home e progetto), non nell'header. L'header tiene solo Salva / Libreria / Lingua.
- **Back progetto**: la barra progetto ha una freccia indietro **slim** in cima (striscia bassa, `IconButton size="sm"`), non una riga piena; il ritorno alla home resta anche dal breadcrumb dell'header.
- **Pannelli inline collassati**: icone uniformi (`h-9 w-9`), con icona di sezione in cima; le label testuali (es. modalità Test/Prod del Run) compaiono **solo da collassato**.
- Sezioni con `ShellNavSection` (header `SectionLabel`, tracking calmo `0.1em`). Un solo `border-r`, nessun divider duplicato.
- Workspace/area attivi: usare `ShellNavItem active` (no titolo ripetuto sopra). Area label `labelFont="display"`.
- **Azioni di riga**: comandi contestuali (es. modifica/elimina del workspace attivo) vanno nel `trailing` di `ShellNavItem` (wrapper div + button interno + trailing fratelli — mai button annidati), non in barre d'azione separate nel canvas.
- Dashboard/home: niente card bianche generiche. Usa `editorial-paper`, bordi `editorial-border`, icone tonde, metadati proporzionati.
- Area nav: testi `workspace.areas.<id>.title` e `workspace.areas.<id>.sidebarHint`. Niente badge "Attiva".
- Le aree future possono essere disabilitate ma mantengono forma e gerarchia.

### Colonne progetto (shell #291)

La vista progetto è a **tre colonne** (`ShellNext`, `react-resizable-panels`):
- **Rail sinistro** (`ProjectRailNext`): barra operativa del progetto. In alto (`h-20`) tiene collasso + navigazione frammento; sotto tiene identità pipeline + modalità/azione primaria; poi tab del frammento (Audit / Note / Memoria); in basso azioni progetto. Collassabile a icone.
- **Centro**: documento (`DocumentView`).
- **Ispettore destro** (`ProjectInspectorNext`, testata `h-20`): pannello documento/approfondimenti. Il pannello frammento vive nella rail sinistra, non nel lato destro.

Le testate condividono `h-20` → bordi superiori coincidenti. Larghezze e stato collassato sono persistiti in `uiStore` (`projectSidebarWidth`, `projectFlyoutWidth`, `projectContextCollapsed`/`projectContextUserExpanded`). La **config pipeline** (`ConfigDrawer`) esce come **finestra modale**, non più come fly-out push/overlay. Dettagli in `ARCHITECTURE.md`.

**Caricamento documento**: `chunksStore.loadDocument` **non** apre il pannello Frammento (eviterebbe di spostare il layout di lettura); si apre solo su azione esplicita.

### Rail sinistro progetto (#296)

Gerarchia obbligatoria, dall'alto:
1. **Navigazione frammento**: nella testata `h-20`, accanto al pulsante di collasso. Da rail aperta è orizzontale con contatore; da rail collassata è verticale. Non usare contenitori ovali/card attorno alle frecce.
2. **Pipeline**: nome pipeline compatto (`font-display italic`) + cambio pipeline; sotto, modalità `Chunk/Tutto` e azione primaria. La modalità è lo scope dell'azione, quindi resta vicino al pulsante che traduce/esegue, non nella testata alta.
3. **Tab frammento**: Audit / Note / Memoria, con `IconButton` tab + label corsiva secondo il pattern tab/filter. La tabbar resta fissa.
4. **Contenuto tab**: solo il contenuto basso scorre (`overflow-y-auto`); testata pipeline e tabbar restano ferme.
5. **Footer progetto**: azioni globali ancorate in basso (workspace, libreria, config, import/export).

Regole:
- Rail aperta: default 300px, minimo 280px, massimo 420px. Le larghezze salvate vanno clamped in questo intervallo.
- Rail collassata: solo icone con tooltip; nessuna label visibile, tranne micro valori necessari (es. contatore frammento).
- Comandi icon-only: sempre `IconButton`, tooltip obbligatorio, `ariaPressed` solo per toggle (`Chunk/Tutto`), `aria-selected` solo per tab.
- Stop/errori/distruttive: `editorial-danger`; accento attivo/selezione: `editorial-accent`.
- Audit e Note: niente card rettangolari per singolo item. Usa righe editoriali con separatori orizzontali sottili.
- Audit/Note item: le azioni stanno solo nella riga titolo a destra; testo principale, ancora e descrizione devono occupare tutta la larghezza sotto. Evitare una colonna azioni che restringe il contenuto.
- Audit: la linea verticale tipo quote è ammessa **solo** nei dettagli annidati ("nella traduzione", "frase sorgente", "correzione"), non sulla riga principale del problema.
- Note: note traduzione e note sorgente usano `editorial-danger` per marker/numeri/tono nota; nessuna linea laterale di tipo quote sulle righe principali.
- **Indicatore note altrove nell'app** (es. badge conteggio in `IndexTab`): usa sempre la mappa canonica tipo→colore esportata da `NotesTab.tsx` (`ANNOTATION_META`: comment `editorial-charcoal`, doubt `editorial-warning`, problem `editorial-danger`, approved `editorial-success`) — non inventare colori fuori palette (es. `sky-*`) né una palette parallela. Se l'indicatore aggrega più note di tipi diversi, mostra il colore del tipo più urgente presente (ordine: problem → doubt → comment → approved).

### Resize (drag + tastiera) — pannelli progetto

La vista progetto usa `react-resizable-panels`. Le larghezze e lo stato collapse sono persistiti in `uiStore`.
- Rail sinistra: default 300px, collapsed 64px, min 280px, max 420px.
- Ispettore destro: default 430px, collapsed 56px, min 300px, max 620px.
- Durante il drag la transizione è disattivata (movimento 1:1); allo snap/chiusura riprende l'animazione tramite token motion condiviso.
- Grip sottile sempre visibile, accentuato in hover/drag/focus. Niente larghezze hard-coded nei consumer: leggere da `uiStore`.

### Token di motion — `components/layout/motion.ts`

Spring e curve condivise dalla shell, niente magic number duplicati: `SPRING_PANEL` (`spring 30/280`, fly-out), `EASE_EDITORIAL` (`[0.22,1,0.36,1]`, ingressi barre), `WIDTH_TRANSITION_CLASS` (`transition-[width] duration-200`), `PANEL_FLEX_TRANSITION_CLASS` (`transition-[flex] duration-300`, pannelli `react-resizable-panels`).

### Navigazione da tastiera del rail

Il `role="tablist"` verticale del rail progetto (`PipelineSidebar`) usa roving tabindex (0 sull'attivo, -1 sugli altri): ↑/↓ (e ←/→) spostano il focus tra le voci, Home/End ai estremi; attivazione manuale con Enter/Space/click (non intrusiva sui fly-out). Stesso pattern dei tab strip di `InsightsDrawer`.

---

## Tab accessibili

I tab visuali devono seguire WAI-ARIA APG:

```tsx
<div role="tablist" aria-label={t('workspace.settings.eyebrow')}>
  <IconButton
    id="settings-tab-general"
    role="tab"
    aria-selected={activeTab === 'general'}
    aria-controls="settings-panel-general"
    tone={activeTab === 'general' ? 'accent' : 'default'}
    title={t('workspace.settings.general')}
    onClick={() => setActiveTab('general')}
  >
    <Settings2 size={14} />
  </IconButton>
</div>

<div
  id="settings-panel-general"
  role="tabpanel"
  aria-labelledby="settings-tab-general"
>
  ...
</div>
```

Regole:
- Tab: `role="tab"` + `aria-selected` + `aria-controls`.
- Panel: `role="tabpanel"` + `aria-labelledby`.
- Non usare `ariaPressed` per tab. `ariaPressed` resta solo per toggle on/off.

---

## Coerenza (CRITICO)

**Mai introdurre varianti** di pattern già esistenti.

Prima di aggiungere un nuovo pulsante, tab, o filtro:
1. Cerca nell'app un componente analogo
2. Usa la primitiva condivisa corrispondente (`IconButton`, `StatusDot`, `SectionLabel`, `Tooltip`)
3. Deviazioni richiedono approvazione esplicita dell'utente

Colori da **non usare** fuori dai componenti UI (`StyleGuide.tsx` per riferimento):
- `amber-*`, `emerald-*`, `green-6*` → sostituire con token `editorial-*`
- Ricerca: `grep -rn "amber-\|emerald-\|green-6" src/`

---

## Ordine elementi tab Impostazioni

Dall'alto verso il basso per importanza percepita dall'utente:

1. Modalità di traduzione (scelta che cambia la struttura della pipeline)
2. Coppia linguistica
3. Persona

---

---

## Console Terminal

Il tab Console simula un terminale, ma usa la **versione scura della palette editoriale** — non colori neon generici. Tutti i token sono definiti in `src/index.css` nel blocco `@theme` con prefisso `--color-terminal-*`.

### Token di sfondo

| Token Tailwind | CSS var | Valore | Uso |
|---|---|---|---|
| `bg-terminal-bg` | `--color-terminal-bg` | `#0d0b09` | Sfondo principale — nero caldo |
| `bg-terminal-chrome` | `--color-terminal-chrome` | `#131008` | Header chrome, leggermente elevato |
| `border-terminal-border` | `--color-terminal-border` | `#2a2218` | Bordi e separatori principali |
| `border-terminal-line` | `--color-terminal-line` | `#1e1810` | Bordi gerarchia indent interni |

### Token testo

| Token Tailwind | Valore | Contrasto su `bg` | Uso |
|---|---|---|---|
| `text-terminal-ink` | `#d8cfc5` | ~14:1 | Testo principale messaggi |
| `text-terminal-secondary` | `#8a7a6e` | ~5.2:1 ✓ AA | Timestamp, scope, header label |
| `text-terminal-muted` | `#908070` | ~5.2:1 ✓ AA | Meta items, stats secondari |
| `text-terminal-dim` | `#3a3028` | decorativo | Prompt `$`, placeholder |

### Token livelli log (pastello editoriale)

| Token Tailwind | Valore | Derivazione |
|---|---|---|
| `text-terminal-error` | `#c07060` | family `editorial-danger`, smorzato |
| `text-terminal-warn` | `#c49b2a` | `editorial-running` — riuso esatto |
| `text-terminal-success` | `#5a9a7a` | `editorial-success` #3A7A65, schiarito per dark bg |
| `text-terminal-info` | `#7898aa` | family teal editoriale, smorzato |
| `text-terminal-accent` | `#c49b2a` | amber — highlight interattivi, stato running |

> **Principio fondamentale**: il terminale è la versione *scura* degli stessi toni caldi dell'app.
> Mai usare colori neon (`#69db7c`, `#74c0fc`, `#ff6b6b`) nel Console tab.

### Scrollbar

Usa `.terminal-scrollbar` (definita in `index.css`) al posto di `.custom-scrollbar` in tutte le aree scroll del Console tab.

### Bordo drawer

Il bordo sinistro del drawer è condizionale: `border-terminal-border` con tab `operations` attivo, `border-editorial-border` altrimenti — transizione "carta candela" invece di flash stroboscopico.

---

## Riferimento live

`src/components/help/StyleGuide.tsx` — sezione nell'Help dell'app, mostra tutti i token CSS letti live.
