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
| `editorial-border` | #C2BCB4 | Bordi e separatori |
| `editorial-textbox` | #EAE5DE | Background input |

> Warning rimosso — usa `editorial-muted` (#666666) al suo posto.

**Font:**
- `font-display` (Elstob variable) — heading corsivi, label attive nelle barre filtro
- `font-sans` (Plus Jakarta Sans variable) — UI generica, etichette, body
- `font-mono` — solo codice/log

**Type scale:** display italic / heading roman wght 560 / body 15px / secondary 13px / label `text-[10px] tracking-[0.35em]` / micro `text-[10px] tracking-[0.12em]`

---

## Regole generali

- **Accenti sempre `editorial-accent`** (rosso) per bottoni di selezione, stato attivo, focus ring. Mai `editorial-ink`.
- **Hover inattivo:** `hover:border-editorial-accent/40 hover:text-editorial-accent`
- **Disabled:** `disabled:opacity-40 disabled:cursor-not-allowed`
- **Focus:** `focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent`
- **Tooltip obbligatorio:** ogni pulsante icon-only deve avere `title` + `aria-label`

---

## Componenti

### Label di sezione

Ogni sezione ha intestazione icona + etichetta uppercase:

```tsx
<div className="flex items-center gap-1.5">
  <IconName size={11} className="text-editorial-accent shrink-0" />
  <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
    {t('chiave.etichetta')}
  </p>
</div>
```

---

### Pulsanti pill (selezione tra opzioni)

Per toggle tra opzioni mutuamente esclusive (es. modalità, lingua):

```tsx
className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors
  focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent
  disabled:cursor-not-allowed disabled:opacity-40 ${
    isActive
      ? 'border-editorial-accent bg-editorial-accent text-white'
      : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
  }`}
```

Componente: `src/components/ui/PillButton.tsx`

---

### Pulsanti azione (icon-only)

Sempre **solo icona**, mai testo + icona nei pannelli libreria/configurazione:

```tsx
<button onClick={handler} title={t('...')} aria-label={t('...')}
  className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors
    hover:border-editorial-accent/60 hover:text-editorial-accent
    focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
  <PlusIcon size={13} />
</button>
```

Componente: `src/components/ui/IconButton.tsx`

---

### Barra navigazione filtri (pattern LibraryPanel — OBBLIGATORIO)

Ogni gruppo di filtri/tab deve usare **esattamente** questo pattern:

```tsx
<div className="flex items-center gap-2">
  {OPTIONS.map((opt) => {
    const isActive = current === opt;
    return (
      <button key={opt} onClick={() => setCurrent(opt)}
        title={label(opt)} aria-label={label(opt)}
        className={`rounded-full border p-2 transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
          isActive
            ? 'border-editorial-accent bg-editorial-accent text-white'
            : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
        }`}>
        <SomeIcon size={14} />
      </button>
    );
  })}
  <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
  <span className="self-center font-display text-sm italic text-editorial-ink">{label(current)}</span>
</div>
```

Regole:
- Pulsanti **solo icona** (descrizione in `title`/`aria-label`)
- Separatore: `span w-px h-4 bg-editorial-border/70`
- Label corsiva: `font-display text-sm italic text-editorial-ink`
- Hover inattivo: `hover:border-editorial-accent/40` (non `/60`)

---

## Coerenza (CRITICO)

**Mai introdurre varianti** di pattern già esistenti.

Prima di aggiungere un nuovo pulsante, tab, o filtro:
1. Cerca nell'app un componente analogo
2. Replica **esattamente** lo stesso stile e struttura
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
