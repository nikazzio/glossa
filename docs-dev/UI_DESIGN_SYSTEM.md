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
| `editorial-warning` | #7A5A14 | Cautele: cartella irraggiungibile, file corrotti, conseguenza irreversibile |
| `editorial-running` | #C49B2A | Step pipeline in esecuzione (dot + label gialli con `animate-pulse`) |
| `editorial-border` | #C2BCB4 | Bordi e separatori |
| `editorial-textbox` | #EAE5DE | Background input |

> `editorial-warning` era #666666, **lo stesso esadecimale di `editorial-muted`**: ogni avviso risultava identico a una nota di aiuto (verificato nelle Impostazioni, agosto 2026 — deposito irraggiungibile, file corrotti, «il ripristino sostituisce tutto»). Adesso è un'ocra profonda: stesso peso del grigio (5.84:1 su `bg`, 5.09:1 su `textbox`; scuro #D7A76A, 8.15:1) ma cromatica, e **più scura di `running`** perché una cautela non è uno stato *in esecuzione*. Il giallo `editorial-running` resta solo per «sta girando adesso», il rosso `editorial-danger` per il danno e l'errore bloccante.

### Superfici (`bg-surface-*`) — usa questi, non i toni grezzi

I toni grezzi `editorial-bg` / `editorial-page` / `editorial-paper` / `editorial-textbox` sono molto vicini fra loro: usati direttamente a caso (con opacità diverse a piacere) hanno prodotto sfumature leggermente diverse per lo stesso tipo di superficie in punti diversi dell'app (verificato con audit 14 lug 2026 — 65 punti, 9 gruppi di incoerenza diretta). Per componenti **nuovi**, usa i ruoli semantici (definiti in `index.css` come alias dei toni grezzi, un solo punto da cambiare per tema chiaro e scuro):

| Classe | Alias di | Quando |
|---|---|---|
| `bg-surface-elevated` | `editorial-page` | Superficie "staccata dal fondo": dialog, menu, popover, header sticky di pannello |
| `bg-surface-panel` | `editorial-bg` | Wrapper strutturale: colonna documento, sidebar, pannello laterale |
| `bg-surface-hover` (con `/50`) | `editorial-textbox` | Hover su riga/voce cliccabile — sempre `/50`, non altre opacità |

Per campi input/select/textarea e badge "riempiti" resta corretto `editorial-textbox` pieno (nessuna opacità) — non è un ruolo di superficie ma di controllo, non copiare l'opacità `/50` degli hover.

> Componenti esistenti non ancora migrati ai ruoli semantici restano con i toni grezzi diretti finché non li tocchi per altro motivo — non serve una sweep dedicata solo per questo.

**Font:**
- `font-display` (Elstob variable) — heading corsivi, label attive barre filtro. `size-adjust: 110%`.
- `font-sans` — UI generica, etichette, body. Default **Plus Jakarta Sans**, **scelto dall'utente** in Impostazioni → Tipografia (Plus Jakarta Sans / Geist / Inter / IBM Plex Sans). Override runtime `--font-sans` su `:root` via `FontSync` (`App.tsx`), preferenza persistita in `uiStore.uiFont`. Ogni `@font-face` alternativo ha `size-adjust` tarato, no salto dimensione allo switch.
- `font-mono` — solo codice/log

**Type scale app:** `text-xs` 13px / `text-sm` 15px / `text-base` 16px / `text-lg` 18px / `text-xl` 22px / `text-2xl` 26px. Display veri usano `font-display italic` con classi responsive controllate (`text-4xl md:text-5xl` solo titoli vista, non metadati/controlli).

> **Dimensione minima:** testo leggibile (prosa, descrizioni, valori dato serif) non scende sotto `text-sm`/`text-xs`. **Caption sans uppercase** (label stat, header) possono stare a `text-[11px]`: sans resta leggibile compatto, caption non è dato. `text-[10px]` solo strip verticali collassate e badge micro decorativi.

> **Gerarchia tipografica pannelli (documento/insight)** — sans fa da caption, serif fa da dato:
> - **Titolo sezione** (icona accent + uppercase): `text-xs` uppercase `tracking-[0.16em]` muted. Header, non si tocca.
> - **Label stat** (caption sans uppercase): `text-[11px]` `tracking-[0.1em]` muted. Sans piccolo = legge bene anche compatto.
> - **Valore dato** (serif italic): `font-display text-sm italic` ink. Più grande della label: serif corsivo corpo piccolo meno leggibile del sans, quindi valore serve più corpo.
> - **Layout riga**: `flex items-baseline justify-between` — label sinistra, valore allineato destra (lista due colonne scansionabile), mai label+valore ammucchiati con `gap-1`.
> - **Hero** (metrica focale singola: %, qualità composita): `font-display text-lg italic`.
> - Riga stat condivisa: `components/ui/StatRow.tsx`; label sezione: `components/ui/SectionLabel.tsx`. Card breakdown stesso schema (titolo card `text-xs`, righe metriche `justify-between` label `text-[11px]` / valore `text-sm`).

> **Scala tracking (label uppercase):** ladder calma — sezione/strip `tracking-[0.16em]`, label stat `tracking-[0.1em]`, badge `tracking-[0.1em]`. Mai `tracking-[0.28em]`/`[0.35em]` su superfici documento/insight.

---

## Regole generali

- **Accenti sempre `editorial-accent`** (verde petrolio) per bottoni selezione, stato attivo, focus ring. Mai `editorial-ink`.
- **Danger sempre `editorial-danger`** per azioni distruttive, stop, segnali errore bloccanti. No `editorial-accent` per pericolo.
- **Hover inattivo:** `hover:border-editorial-accent/40 hover:text-editorial-accent`
- **Disabled:** `disabled:opacity-40 disabled:cursor-not-allowed`
- **Focus:** `focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent`
- **Tooltip obbligatorio:** ogni pulsante icon-only usa `<IconButton>` — tooltip incluso automatico.
- **Nessuna variante locale:** componenti feature non reintroducono button/dot/label custom. Usa sempre primitive condivise.

---

## Primitive condivise (`src/components/ui/`)

### IconButton — pulsanti icon-only (OBBLIGATORIO)

Ogni controllo icon-only **deve** usare `<IconButton>`. No `<button>` raw per controlli visivi app.

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
**Varianti size:** `xs | sm | md | lg` (`xs` = `p-1`, barre molto compatte tipo barra stato)

Regole:
- `ariaPressed` per toggle (on/off). `aria-selected` per tab ARIA.
- Non usare `ariaPressed` e `aria-selected` insieme stesso pulsante.
- `className="shrink-0"` se button in flex row con elementi `w-full`.

---

### Tooltip — tooltip canonico (OBBLIGATORIO per controlli icon-only)

`IconButton` integra già `<Tooltip>` internamente — no tooltip separati sui pulsanti.

Tooltip su altri elementi (testo troncato, badge, etichette):

```tsx
import { Tooltip } from '../ui';

<Tooltip label="Testo del tooltip" side="bottom">
  <span className="truncate">{longText}</span>
</Tooltip>
```

**Non usare** attributo HTML `title` per tooltip visivi su controlli interattivi (genera tooltip nativo sistema, fuori stile). Pulsante icon-only usa `IconButton` (prop `title` diventa tooltip editoriale); altri controlli avvolgi in `<Tooltip label>`. `title` accettabile solo su elementi **non** interattivi.

Implementazione su **Radix Tooltip** (posizionamento automatico con flip ai bordi, Provider interno al componente — no setup a livello App). Box invariato (`font-display` italic), z-index `z-[210]` (sopra finestre `z-[200]`). API invariata: `label`, `side`, `offset`.

---

### Menu — menu contestuale / a tendina (Radix)

Menu su **Radix DropdownMenu**: `role="menu"`, navigazione frecce/Home/End, type-ahead, Esc, focus management — gratis. Per menu a coordinate (es. tasto destro / selezione testo) usa ancora virtuale `anchorRect`.

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
- Voci sempre via `items` (`MenuItem`): no `<button>` raw posizionati a mano.
- z-index `z-[210]` (sopra finestre). Voce evidenziata usa `data-[highlighted]`.

---

### ClickPopover — pannello a comparsa per poche opzioni (OBBLIGATORIO)

Per scegliere fra poche opzioni **senza aprire una finestra modale intera**: cambio pipeline, modalità di visualizzazione risultati, e casi analoghi. Ancorato a un trigger reale (`IconButton`), si apre/chiude al click — diverso da `Popover` (quello apre a hover, per dettagli non interattivi) e da `Menu` (quello ancora a coordinate virtuali, per menu contestuali).

```tsx
import { ClickPopover, IconButton } from '../ui';

const [open, setOpen] = useState(false);

<ClickPopover
  open={open}
  onOpenChange={setOpen}
  trigger={
    <IconButton title={t('...')} ariaPressed={open}>
      <SomeIcon size={16} />
    </IconButton>
  }
>
  {/* righe/opzioni: bottoni pieni larghezza, o gruppo IconButton radiogroup */}
</ClickPopover>
```

Regole:
- Il chiamante gestisce sempre `open`/`onOpenChange` (stato esplicito, non interno al componente).
- Trigger sempre un `IconButton` con `ariaPressed={open}` (è un toggle apertura/chiusura). **Niente `onClick` manuale sul trigger**: `RadixPopover.Trigger` gestisce già il click e chiama `onOpenChange` da solo — aggiungere un `onClick` che flippa `open` produce un doppio toggle (il popup non si apre in modo affidabile).
- z-index `z-[210]` (sopra finestre), incluso di default — non serve override.
- Contenuto: righe piatte con hover (stesso stile liste dentro `Dialog`) oppure gruppo `IconButton` radiogroup — mai reintrodurre `Popover.Root` Radix a mano altrove.

---

### Badge numerico rotondo con tooltip — conteggi compatti non interattivi

Conteggi compatti dove basta colore + numero (es. numero note su frammento nell'Indice), no etichetta testuale a fianco: pallino colorato con numero dentro, descrizione completa in `Tooltip` all'hover.

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
- Se conteggio aggrega elementi di tipi/tone diversi, colore pallino è quello del tipo più urgente presente (stessa priorità mappa canonica), non media o colore neutro a parte.
- Diametro fisso `h-5 w-5`, testo `text-[10px] font-bold text-white` per restare leggibile anche a 1-2 cifre.
- Non usare per conteggi che devono essere cliccabili: quello è `IconButton`/`PillButton`, non questo pattern.

---

### SectionLabel — intestazione sezione con icona

Intestazioni sezione con icona + etichetta uppercase:

```tsx
import { SectionLabel } from '../ui';

<SectionLabel icon={SomeIcon} label={t('chiave.sezione')} />
```

No reintrodurre pattern `<div className="flex items-center gap-1.5">` manuale dove `SectionLabel` basta.

**Misura: `text-[11px]`, icona 11px accento.** Era `text-xs` (13px) mentre ventisei
punti dell'app scrivevano l'intestazione a mano a 11px: la primitiva si è
allineata a loro, non il contrario, così adottarla non sposta niente. Il divieto
del pattern manuale vale anche quando l'intestazione ha un comando accanto —
in quel caso `SectionLabel` sta dentro un `flex items-center justify-between`.

---

### SettingRow — riga di un'impostazione (OBBLIGATORIO nei pannelli config)

Etichetta a sinistra, comando a destra, spiegazione **al passaggio del mouse**:

```tsx
import { SettingRow } from '../ui';

<div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
  <SettingRow label={t('chiave.voce')} hint={t('chiave.voceHint')}>
    <Select … />
  </SettingRow>
</div>
```

Regole:
- Etichetta `text-sm`, riga `py-2.5`: **una sola** altezza di riga nei pannelli
  config. Prima ce n'erano quattro (`py-2.5`, `py-3`, `py-3.5`, righe sciolte).
- Sempre dentro la lista `divide-y` + `border-y`: righe sciolte non si leggono
  come elenco.
- **Una sola icona per riga**, dentro il comando a destra. La stessa icona
  ripetuta a sinistra come decorazione faceva sembrare due comandi uno.
- Un pannello di impostazioni si legge per le voci: la prosa sta nel `hint`, non
  a schermo.

---

### Campi nativi — `FIELD_CLASSNAME` / `FIELD_MONO_CLASSNAME`

```tsx
import { FieldLabel, FIELD_CLASSNAME, FIELD_MONO_CLASSNAME } from '../ui';

<FieldLabel htmlFor="id" block>{t('chiave.campo')}</FieldLabel>
<input id="id" className={FIELD_CLASSNAME} />
```

Fondo `editorial-textbox` (ruolo di controllo), `rounded-md`, `px-3 py-2`,
`text-sm`. Alcuni campi usavano `editorial-bg`, che è **lo stesso colore della
finestra**: si riconoscevano solo dal bordo. Ogni etichetta di campo è
`FieldLabel`, mai un `<p>`/`<label>` con classi proprie.

---

### Riga-comando — l'unica eccezione a «solo IconButton»

Una riga larga che **è** il comando (scelta della cartella dati, del deposito,
del font, della chiave di un provider) resta un `<button>` con dentro etichetta e
valore: non è un controllo icon-only, e un `IconButton` accanto ripeterebbe la
stessa azione occupando spazio. Vincoli: `border-y` (mai riquadri arrotondati
grandi), `hover:bg-surface-hover/50`, `Tooltip` o `aria-label` che dice cosa fa.
Tutto il resto dei comandi resta `IconButton`.

---

### ToggleRow — riga con toggle slide

Opzioni on/off in pannelli config, usa `ToggleRow` dentro contenitore `rounded-[16px] border border-editorial-border/60 bg-editorial-textbox/10 px-4 py-4`. Struttura standard: `SectionLabel` sopra box, `ToggleRow` dentro.

> **Dentro una finestra** quel contenitore arrotondato non si usa (vedi § Finestre: niente `rounded-xl/2xl/3xl` nel corpo delle modali). Lì `ToggleRow` sta nella stessa lista `divide-y` + `border-y` delle `SettingRow`, come una riga fra le altre. Le due regole si contraddicevano e questa è la lettura da seguire.

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
- No `<input type="checkbox">` raw nei pannelli config: usa sempre `ToggleRow`.
- Toggle slide (`bg-editorial-accent` attivo, `bg-editorial-border` inattivo) standard visivo condiviso tra tutti pannelli.
- `disabled` disabilita click e aspetto visivo (opacity-40).

---

### Azioni — solo icona, neutre

Ogni comando visivo usa `IconButton` con `tone="default"`, icona e tooltip. No pulsanti testuali, pill, riempimenti colorati o azioni primarie verdi.

Il verde (`editorial-accent`) è riservato a tab, selettori e stati attivi; non usarlo per comandi. Eccezioni solo se richieste esplicitamente dall'utente.

---

### Finestre / overlay — `Dialog` e `AlertDialog` (OBBLIGATORIO)

Tutte le finestre modali poggiano su **Radix UI**. Comportamento (focus trap, Escape, ripristino focus, scroll-lock, portale, `aria-modal`) gestito dalla libreria: **non** si reimplementa a mano. Vietato `fixed inset-0` + backdrop manuale, `useFocusTrap`, `EditorialModalShell` (rimossi).

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

- **`AlertDialog`** — solo conferme (azione + annulla). Focus iniziale sul pulsante sicuro, no chiusura con click esterno.

```tsx
<AlertDialog open={open} onOpenChange={...} title={...}
  confirmLabel={...} cancelLabel={...} onConfirm={...}
  tone="danger" />   // 'danger' = conferma rossa per azioni distruttive
```

Regole:
- Finestra apre **sopra** pannello/overlay app: z-index primitive è `z-[200]`, sopra overlay app legacy. No override serve.
- Header bespoke (es. Anteprima import): usa primitive Radix dirette (`RadixDialog.Root/Portal/Overlay/Content`) con `RadixDialog.Title asChild` sul titolo, mantenendo z-index `z-[200]`.
- Corpo finestra: evitare card interne con grossi angoli smussati. Sezioni/liste: blocchi piatti (`border-y`, eventuale `border-l-4` tonale, sfondo leggero) e separatori (`divide-y`/righe). Item devono restare distinguibili a colpo d'occhio anche senza riquadro arrotondato.
- Prompt/testi lunghi dentro modali: textarea o preview leggibili (`font-mono`, `text-[13px]`, `leading-6`, `border-2`, `rounded-md` al massimo). Azioni prompt restano icone con tooltip; template/listati usano righe o blocchi con barra laterale, non card morbide.
- Ammessi raggi piccoli sui campi (`rounded-md`) e controlli intrinsecamente circolari (switch, icone, indicatori). No reintrodurre contenitori `rounded-xl/2xl/3xl` nelle modali.

### Pulsanti finestra — `DialogConfirmButton` / `DialogCancelButton` (OBBLIGATORIO)

Pulsanti base ogni footer finestra. Uniformi ovunque.

```tsx
import { DialogConfirmButton, DialogCancelButton } from '../ui';

<DialogCancelButton onClick={onClose}>{t('common.cancel')}</DialogCancelButton>
<DialogConfirmButton onClick={onConfirm} disabled={!canConfirm}>{t('common.confirm')}</DialogConfirmButton>
```

- **Conferma/Accetta**: pieno color **inchiostro** (`bg-editorial-ink text-white`), `text-sm`, frase normale (no maiuscolo), pillola arrotondata.
- **Annulla/Chiudi/Indietro**: bordo sobrio, testo muted; hover sfondo `editorial-textbox/50` + testo/bordo ink.
- Eccezione: conferme **distruttive** usano `AlertDialog tone="danger"` (pulsante `editorial-danger` come segnale pericolo).
- No pulsanti footer raw: usa sempre queste due primitive.

---

### Barra navigazione filtri (pattern LibraryPanel — OBBLIGATORIO)

Ogni gruppo filtri/tab usa `<IconButton>` con separatore e label corsiva:

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
- Hover inattivo: `hover:border-editorial-accent/40` (non `/60`) — gestito da tone `default` di `IconButton`

---

## Multibar shell (sidebar home e progetto)

Superfici laterali (home e progetto) usano **un'unica barra** (`ShellNav`, `components/layout/ShellNav.tsx`) con sezioni e item navigabili. No più colonne multiple né "linguetta" flottante.

```tsx
<motion.nav className="flex shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60 transition-[width] duration-200 w-60" />

// item attivo = barra accent verticale + tint + testo accent (ShellNavItem)
<ShellNavItem active icon={<Icon />} label="..." />
```

Regole:
- Sidebar e dashboard usano `editorial-bg/60` o `editorial-bg`, non bianco puro.
- **Item attivo**: barra accent verticale (`absolute left-0 w-[3px] bg-editorial-accent`) + tint `bg-editorial-accent/10` + testo `text-editorial-accent`. No fondo accent pieno, no linguetta che sfora bordo colonna.
- **Collapse**: barra anima larghezza, mai render condizionale `return null` (provoca scatti). Collassata = solo icone con `Tooltip` (mai `title` nativo), contenuto ancorato alla larghezza collassata (no slide). **Niente bottone comprimi dedicato** (pattern activity-bar): click su item **attivo** comprime/espande; cambiare sezione **conserva** stato collassato/espanso (no riapertura barra). Drag bordo destro collassa/ridimensiona pure.
- **Footer barra** (`ShellNavFooter`): azioni app-level (Impostazioni, Aiuto) ancorate in fondo alla barra (home e progetto), non nell'header. Header tiene solo Salva / Libreria / Lingua.
- **Back progetto**: barra progetto ha freccia indietro **slim** in cima (striscia bassa, `IconButton size="sm"`), non riga piena; ritorno alla home resta anche da breadcrumb dell'header.
- **Pannelli inline collassati**: icone uniformi (`h-9 w-9`), icona di sezione in cima; label testuali (es. modalità Test/Prod del Run) compaiono **solo da collassato**.
- Sezioni con `ShellNavSection` (header `SectionLabel`, tracking calmo `0.1em`). Un solo `border-r`, no divider duplicato.
- Workspace/area attivi: usa `ShellNavItem active` (no titolo ripetuto sopra). Area label `labelFont="display"`.
- **Azioni di riga**: comandi contestuali (es. modifica/elimina workspace attivo) vanno nel `trailing` di `ShellNavItem` (wrapper div + button interno + trailing fratelli — mai button annidati), non in barre azione separate nel canvas.
- Dashboard/home: no card bianche generiche. Usa `editorial-paper`, bordi `editorial-border`, icone tonde, metadati proporzionati.
- Area nav: testi `workspace.areas.<id>.title` e `workspace.areas.<id>.sidebarHint`. No badge "Attiva".
- **Rail home = una sola selezione di navigazione, ogni voce naviga al proprio contenuto**: ordine `Dashboard` (voce standalone in cima, home app-level) → sezione **Aree** (del workspace attivo) → sezione **Workspace** (lista sciolta sempre visibile, `+` icon-only nell'header). Viste esclusive: `dashboard` | `workspace` (pagina del workspace attivo: identità, azioni icon-only Libreria/Configura/Elimina, progetti) | area. Click su un workspace = lo attiva E naviga alla sua pagina (mai selezione senza effetto visibile). Due indicatori con semantiche diverse: pallino accent = workspace attivo (contesto), barra accent + tint = vista corrente (nav). La Dashboard è asciutta: Riprendi cross-workspace, attività recente, righe workspace navigabili, banner provider solo se manca (niente sezioni informative non azionabili, niente teaser). Nessun back dedicato: si naviga sempre dalla barra.
- **Identità workspace:** solo segni preset storico-editoriali di Game Icons, persistiti come chiavi sicure. Non riusare le icone Lucide riservate alle aree globali (Traduzioni, Biblioteca, Trascrizioni, Analisi) né il marchio Glossa. Nelle righe delle aree globali convivono sempre icona di tipo (piccola) + titolo + segno workspace (grande): il segno non sostituisce l'identità dell'oggetto. Nel progetto con rail collassata, invece, il segno sostituisce il marchio Glossa; la Dashboard collassata conserva il marchio generale. Nessuna icona custom.
- **Modale workspace:** testata con segno e nome; ogni campo nativo ha `FieldLabel`, icona e testo di aiuto associato. Sezioni usano `SectionLabel`; azioni backup sono solo `<IconButton>` circolari con tooltip, mai bottoni testuali locali.
- Aree future possono essere disabilitate ma mantengono forma e gerarchia.

### Colonne progetto (shell #291)

Vista progetto a **tre colonne** (`ShellNext`, `react-resizable-panels`):
- **Rail sinistro** (`ProjectRailNext`): barra operativa progetto. In alto (`h-20`) tiene collasso + navigazione frammento; sotto tiene identità pipeline + modalità/azione primaria; poi tab del frammento (Audit / Note / Memoria); in basso azioni progetto. Collassabile a icone.
- **Centro**: documento (`DocumentView`).
- **Ispettore destro** (`ProjectInspectorNext`, testata `h-20`): pannello documento/approfondimenti. Pannello frammento vive nella rail sinistra, non nel lato destro.

Testate condividono `h-20` → bordi superiori coincidenti. Larghezze e stato collassato persistiti in `uiStore` (`projectSidebarWidth`, `projectFlyoutWidth`, `projectContextCollapsed`/`projectContextUserExpanded`). **Config pipeline** (`ConfigDrawer`) esce come **finestra modale**, non più fly-out push/overlay. Dettagli in `ARCHITECTURE.md`.

**Caricamento documento**: `chunksStore.loadDocument` **non** apre pannello Frammento (eviterebbe spostare layout lettura); apre solo su azione esplicita.

### Rail sinistro progetto (#296)

Gerarchia obbligatoria, dall'alto:
1. **Navigazione frammento**: nella testata `h-20`, accanto al pulsante di collasso. Rail aperta = orizzontale con contatore; rail collassata = verticale. No contenitori ovali/card attorno alle frecce.
2. **Pipeline**: nome pipeline compatto (`font-display italic`) + cambio pipeline; sotto, modalità `Chunk/Tutto` e azione primaria. Modalità è scope dell'azione, resta vicino al pulsante che traduce/esegue, non nella testata alta.
3. **Tab frammento**: Audit / Note / Memoria, con `IconButton` tab + label corsiva secondo pattern tab/filter. Tabbar resta fissa.
4. **Contenuto tab**: solo contenuto basso scorre (`overflow-y-auto`); testata pipeline e tabbar restano ferme.
5. **Footer progetto**: azioni globali ancorate in basso (workspace, libreria, config, import/export).

Regole:
- Rail aperta: default 300px, minimo 280px, massimo 520px. Larghezze salvate vanno clamped in questo intervallo.
- Rail collassata: solo icone con tooltip; no label visibile, tranne micro valori necessari (es. contatore frammento).
- Comandi icon-only: sempre `IconButton`, tooltip obbligatorio, `ariaPressed` solo per toggle (`Chunk/Tutto`), `aria-selected` solo per tab.
- Stop/errori/distruttive: `editorial-danger`; accento attivo/selezione: `editorial-accent`.
- Audit e Note: no card rettangolari per singolo item. Usa righe editoriali con separatori orizzontali sottili.
- Audit/Note item: azioni stanno solo nella riga titolo a destra; testo principale, ancora e descrizione devono occupare tutta la larghezza sotto. Evitare colonna azioni che restringe il contenuto.
- Audit: linea verticale tipo quote ammessa **solo** nei dettagli annidati ("nella traduzione", "frase sorgente", "correzione"), non sulla riga principale del problema.
- Note: note traduzione e note sorgente usano `editorial-danger` per marker/numeri/tono nota; no linea laterale tipo quote sulle righe principali.
- **Indicatore note altrove nell'app** (es. badge conteggio in `IndexTab`): usa sempre mappa canonica tipo→colore esportata da `NotesTab.tsx` (`ANNOTATION_META`: comment `editorial-charcoal`, doubt `editorial-warning`, problem `editorial-danger`, approved `editorial-success`) — no colori inventati fuori palette (es. `sky-*`) né palette parallela. Se indicatore aggrega più note di tipi diversi, mostra colore del tipo più urgente presente (ordine: problem → doubt → comment → approved).

### Resize (drag + tastiera) — pannelli progetto

Vista progetto usa `react-resizable-panels`. Larghezze e stato collapse persistiti in `uiStore`.
- Rail sinistra: default 300px, collapsed 64px, min 280px, max 520px.
- Ispettore destro: default 430px, collapsed 56px, min 300px, max 620px.
- Durante drag transizione disattivata (movimento 1:1); allo snap/chiusura riprende animazione tramite token motion condiviso.
- Grip sottile sempre visibile, accentuato in hover/drag/focus. No larghezze hard-coded nei consumer: leggere da `uiStore`.

### Token di motion — `components/layout/motion.ts`

Spring e curve condivise dalla shell, no magic number duplicati: `SPRING_PANEL` (`spring 30/280`, fly-out), `EASE_EDITORIAL` (`[0.22,1,0.36,1]`, ingressi barre), `WIDTH_TRANSITION_CLASS` (`transition-[width] duration-200`), `PANEL_FLEX_TRANSITION_CLASS` (`transition-[flex] duration-300`, pannelli `react-resizable-panels`).

### Navigazione da tastiera del rail

`role="tablist"` verticale del rail progetto (`PipelineSidebar`) usa roving tabindex (0 sull'attivo, -1 sugli altri): ↑/↓ (e ←/→) spostano focus tra voci, Home/End agli estremi; attivazione manuale con Enter/Space/click (non intrusiva sui fly-out). Stesso pattern dei tab strip di `InsightsDrawer`.

---

## Tab accessibili

Tab visuali devono seguire WAI-ARIA APG:

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
- No `ariaPressed` per tab. `ariaPressed` resta solo per toggle on/off.

---

## Coerenza (CRITICO)

**Mai introdurre varianti** di pattern già esistenti.

Prima di aggiungere nuovo pulsante, tab, o filtro:
1. Cerca nell'app componente analogo
2. Usa primitiva condivisa corrispondente (`IconButton`, `SectionLabel`, `Tooltip`)
3. Deviazioni richiedono approvazione esplicita dell'utente

Colori da **non usare** fuori dai componenti UI (`StyleGuide.tsx` per riferimento):
- `amber-*`, `emerald-*`, `green-6*` → sostituire con token `editorial-*`
- Ricerca: `grep -rn "amber-\|emerald-\|green-6" src/`

---

## Ordine elementi tab Impostazioni

Dall'alto verso il basso per importanza percepita dall'utente:

1. Modalità di traduzione (scelta che cambia struttura pipeline)
2. Coppia linguistica
3. Persona

---

## Finestra Impostazioni — forma comune delle schede

Vale per ogni scheda di `components/settings/` (agosto 2026: le sette schede
avevano tre generazioni di stile addosso).

- **Radice del pannello**: `space-y-10`, `role="tabpanel"`, `aria-labelledby`.
  Un solo ritmo verticale: prima erano quattro (`space-y-4`, `gap-6`,
  `space-y-10`, `space-y-12`).
- **Sezione**: `<section className="space-y-4">` con `SectionLabel` in cima;
  comandi di sezione a destra dell'intestazione, non in fondo alla schermata.
- **Elenchi**: lista `divide-y` + `border-y` di `SettingRow`. Niente riquadri
  arrotondati, niente pastiglie: i dati di riga sono metadati in `font-mono`
  separati da `·`.
- **Scelta fra N opzioni con un nome**: `SegmentedControl`. Fila di `IconButton`
  con etichetta corsiva solo quando l'icona basta da sola (pattern barra
  filtri). Erano tre modi diversi nella stessa finestra.
- **Campi**: `FieldLabel` + `FIELD_CLASSNAME`.
- **Colori semantici**: `danger` per errori e danni, `success` per il positivo,
  `warning` per le cautele, accento **solo** per selezione e stato attivo. Verde
  per «non funziona» era il contrario della palette.
- **Linguette**: `IconButton role="tab"` con roving tabindex **e frecce**
  (←/→/↑/↓, Home, End). Con `tabIndex={-1}` sulle inattive e nessun gestore, da
  tastiera si raggiungeva solo la scheda aperta.
- **Salvataggio**: le schede scrivono al cambio. Dove il salvataggio è esplicito
  (profili di rete: un «2» digitato a metà di «250» non deve diventare la
  politica verso una biblioteca) serve un segno di **non salvato** accanto
  all'intestazione, un comando per buttare le modifiche, e lo stato tenuto dalla
  finestra — non dalla scheda, che si smonta cambiando linguetta.

---

## Console Terminal

Il pannello in basso (tab Console + tab Lavori) usa una **palette dedicata `terminal-*`**, sempre della stessa famiglia calda editoriale — mai colori neon generici. Tutti i token sono definiti in `src/index.css`: i **valori chiari** nel blocco `@theme`, gli **override scuri** in `html.dark` (stesso meccanismo di `editorial-*`, classe `dark` applicata da `ThemeSync` in `App.tsx`).

I componenti (`OperationsTab.tsx`, `components/jobs/*`, `AppStatusBar.tsx`) usano **solo** i token: nessun colore cablato, il tema cambia da sé.

### Token di sfondo

| Token Tailwind | CSS var | Chiaro | Scuro | Uso |
|---|---|---|---|---|
| `bg-terminal-bg` | `--color-terminal-bg` | `#F7F3EC` | `#0d0b09` | Sfondo principale — carta calda / nero caldo |
| `bg-terminal-chrome` | `--color-terminal-chrome` | `#EFE8DC` | `#131008` | Header chrome, un gradino staccato dallo sfondo |
| `border-terminal-border` | `--color-terminal-border` | `#C6BEB0` | `#2a2218` | Bordi e separatori principali |
| `border-terminal-line` | `--color-terminal-line` | `#DED5C6` | `#1e1810` | Bordi gerarchia indent interni |

In chiaro `bg` è deliberatamente vicino a `surface-panel` (`#F8F5F0`, rapporto 1.02): il pannello deve **appoggiarsi** al bianco caldo dell'app, non aprirci un buco nero dentro. L'identità "console" resta affidata al monospace, al prompt `$` e alla riga chrome. `border` sta a `bg` come `editorial-border` sta a `editorial-bg` (1.67 vs 1.73) — stessa densità percepita del resto dell'interfaccia.

### Token testo

| Token Tailwind | Chiaro | Contrasto su `bg` chiaro | Su `chrome` chiaro | Scuro | Uso |
|---|---|---|---|---|---|
| `text-terminal-ink` | `#2F2A23` | 12.86:1 ✓ AAA | 11.78:1 | `#d8cfc5` | Testo principale messaggi |
| `text-terminal-secondary` | `#665748` | 6.28:1 ✓ AA | 5.76:1 ✓ AA | `#8a7a6e` | Timestamp, scope, header label |
| `text-terminal-muted` | `#6D5D50` | 5.70:1 ✓ AA | 5.22:1 ✓ AA | `#908070` | Meta items, stats secondari |
| `text-terminal-dim` | `#B0A597` | 2.19:1 decorativo | 2.00:1 | `#3a3028` | Prompt `$`, placeholder, maniglia resize |

### Token livelli log

| Token Tailwind | Chiaro | Contrasto su `bg` chiaro | Su `chrome` chiaro | Scuro | Derivazione |
|---|---|---|---|---|---|
| `text-terminal-error` | `#862E1E` | 7.84:1 ✓ AAA | 7.18:1 ✓ AAA | `#c07060` | family `editorial-danger`, terracotta scurita |
| `text-terminal-warn` | `#6F5410` | 6.43:1 ✓ AA | 5.89:1 ✓ AA | `#c49b2a` | `editorial-running` amber, scurito |
| `text-terminal-success` | `#275B4A` | 7.08:1 ✓ AAA | 6.49:1 ✓ AA | `#5a9a7a` | `editorial-success` `#3A7A65`, scurito |
| `text-terminal-info` | `#315B72` | 6.62:1 ✓ AA | 6.06:1 ✓ AA | `#7898aa` | family teal editoriale, scurito |
| `text-terminal-accent` | `#6F5410` | 6.43:1 ✓ AA | 5.89:1 ✓ AA | `#c49b2a` | amber — highlight interattivi, stato running |

**Perché i livelli chiari sono più scuri degli omologhi `editorial-*`**: diversi punti li usano con opacità ridotta o su tinta dello stesso colore. Con questi valori restano AA anche lì:

| Combinazione (tema chiaro) | Contrasto |
|---|---|
| `text-terminal-error/80` su `bg-terminal-error/[0.08]` (stack trace) | 4.52:1 ✓ AA |
| `text-terminal-accent` su `bg-terminal-accent/12` (pill di stato) | 4.98:1 ✓ AA |
| `text-terminal-info` su `bg-terminal-info/12` (pill di stato) | 5.11:1 ✓ AA |
| `text-terminal-error/70` icona pulisci su `chrome` | 3.73:1 ✓ AA non-testuale |

> **Principio fondamentale**: il pannello è la versione *chiara o scura* degli stessi toni caldi dell'app, mai una palette a sé.
> Mai colori neon (`#69db7c`, `#74c0fc`, `#ff6b6b`) nel Console tab.

### Scrollbar

Usa `.terminal-scrollbar` (definita in `index.css`) al posto di `.custom-scrollbar` in tutte aree scroll del Console tab.

### Bordo drawer

Bordo sinistro del drawer condizionale: `border-terminal-border` con tab `operations` attivo, `border-editorial-border` altrimenti — transizione "carta candela" invece di flash stroboscopico.

### Header del drawer Console (#296)

Un solo header a due righe con ruoli distinti, non due header sovrapposti:
- **Riga chrome** (`bg-terminal-chrome`): icona + titolo + pill di stato live inline (elaborazione/memoria in corso, con `Loader2` animato) + pulsante chiudi. No righe di stato separate sotto.
- **Riga toolbar** (`bg-terminal-bg`, sotto chrome): ricerca sempre visibile + toggle raggruppato + trigger filtri a scomparsa (chip scope/livello restano dietro accordion — troppi per stare sempre visibili senza affollare) + vai al frammento + pulisci.

**Colori (CRITICO):** dentro drawer Console usa **solo** token `terminal-*` (`terminal-accent`, `terminal-secondary`, ecc.), mai `editorial-*`, e mai valori esadecimali o classi colore Tailwind cablate — i token sono l'unico punto in cui il pannello cambia col tema. Il pannello ha palette dedicata apposta per restare "gli stessi toni caldi, declinati per il tema corrente": infiltrare l'accento dell'interfaccia (verde) rompe quel principio.

**Ridimensionabile:** maniglia orizzontale in cima al drawer (`cursor-ns-resize`, trascinabile), altezza persistita in `uiStore.consoleDrawerHeight` (default 256px, min 160, max 520).

---

## Riferimento live

`src/components/help/StyleGuide.tsx` — sezione nell'Help dell'app, mostra tutti token CSS letti live.
