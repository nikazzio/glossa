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
| `editorial-accent` | #C8705E | Accenti, bottoni attivi, selezioni |
| `editorial-muted` | #666666 | Testo disabilitato / secondario |
| `editorial-success` | #3A7A65 | Stato positivo |
| `editorial-running` | #C49B2A | Step pipeline in esecuzione (dot + label gialli con `animate-pulse`) |
| `editorial-border` | #C2BCB4 | Bordi e separatori |
| `editorial-textbox` | #EAE5DE | Background input |

> `editorial-warning` (#666666) = grigio, per avvisi generici. Per lo stato *in esecuzione* usa `editorial-running` (giallo).

**Font:**
- `font-display` (Elstob variable) — heading corsivi, label attive nelle barre filtro
- `font-sans` (Plus Jakarta Sans variable) — UI generica, etichette, body
- `font-mono` — solo codice/log

**Type scale app:** `text-xs` 13px / `text-sm` 15px / `text-base` 16px / `text-lg` 18px / `text-xl` 22px / `text-2xl` 26px. I display veri usano `font-display italic` con classi responsive controllate (`text-4xl md:text-5xl` solo per titoli di vista, non per metadati o controlli).

> **Dimensione minima testo contenuto:** `text-xs` (13px). Mai `text-[10px]` o `text-[11px]` per testo leggibile, label di controlli interattivi o descrizioni. `text-[10px]` è **esclusivo** delle etichette sezione uppercase con `tracking-[0.28em]`/`tracking-[0.35em]` e badge micro.

---

## Regole generali

- **Accenti sempre `editorial-accent`** (rosso) per bottoni di selezione, stato attivo, focus ring. Mai `editorial-ink`.
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

**Varianti tone:** `default | accent | success | charcoal | muted | running`
**Varianti size:** `sm | md | lg`

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

**Non usare** l'attributo HTML `title` per tooltip visivi sui controlli interattivi. `title` è accettabile solo per elementi non interattivi dove il tooltip nativo è sufficiente.

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

### SectionLabel — intestazione sezione con icona

Per intestazioni di sezione con icona + etichetta uppercase:

```tsx
import { SectionLabel } from '../ui';

<SectionLabel icon={SomeIcon} label={t('chiave.sezione')} />
```

Non reintrodurre il pattern `<div className="flex items-center gap-1.5">` manuale dove `SectionLabel` è sufficiente.

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

## Sidebar, dashboard e pattern "linguetta"

La pipeline sidebar definisce il riferimento visivo per le superfici laterali:

```tsx
<div className="flex w-52 shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60" />

<div className="-mr-px rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]" />
```

Regole:
- Sidebar e dashboard usano `editorial-bg/60` o `editorial-bg`, non bianco puro.
- La superficie selezionata che deve sembrare agganciata alla pagina usa la "linguetta": `rounded-l-[20px] rounded-r-none border-r-0 bg-editorial-paper`.
- Workspace selezionato: usare il pattern linguetta nella lista, senza ripetere il nome come titolo immediatamente sopra.
- Dashboard/home: niente card bianche generiche. Usa `editorial-paper`, bordi `editorial-border`, icone tonde e metadati proporzionati.
- Area nav: usa i testi `workspace.areas.<id>.title` e `workspace.areas.<id>.sidebarHint`. Non mostrare badge tipo "Attiva" sull'area Traduzioni.
- Le aree future possono essere disabilitate, ma devono mantenere forma e gerarchia visiva coerenti.

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

## Riferimento live

`src/components/help/StyleGuide.tsx` — sezione nell'Help dell'app, mostra tutti i token CSS letti live.
