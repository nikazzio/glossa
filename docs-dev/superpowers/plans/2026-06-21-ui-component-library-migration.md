# Migrazione a libreria di componenti (Radix UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire le primitive UI interattive scritte a mano (dialog, menu, tooltip, tab, popover) con primitive headless di Radix UI, mantenendo identico lo stile editoriale attuale.

**Architecture:** Approccio "shadcn-style": Radix fornisce solo il comportamento (focus trap, Escape, scroll-lock, portale, ARIA, navigazione da tastiera); lo stile resta il nostro, applicato con classi Tailwind v4 e `cva` esattamente come oggi. Si crea un layer di wrapper stilizzati in `src/components/ui/`, poi si migrano i consumatori uno alla volta con l'app sempre funzionante. Nessun big-bang, nessuna libreria "vestita" (MUI/Mantine/Chakra) che entrerebbe in conflitto con Tailwind.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, `class-variance-authority`, Radix UI primitives, `lucide-react`, Vitest + Testing Library, Tauri v2.

---

## Sintesi non tecnica (per chi legge l'issue)

Oggi ogni finestra, menu a tendina, suggerimento e pannello dell'app è costruito pezzo per pezzo a mano. Ogni volta si reimplementano le stesse cose — chiusura con Esc, blocco dello scorrimento dietro la finestra, gestione della tastiera, posizionamento — e ogni volta nascono gli stessi difetti. Risultato già visibile: una finestra che non si chiude con Esc e lascia "scappare" il cursore, un menu non usabile da tastiera, nessuna finestra che blocca lo sfondo.

Questo lavoro **non cambia l'aspetto dell'app** e **non cambia cosa fa**. Sostituisce solo il "motore" invisibile sotto le finestre con uno standard collaudato, così smettiamo di reinventare (e di sbagliare) le stesse cose. Si fa a tappe, con l'app sempre utilizzabile.

---

## Global Constraints

- **Stile invariato:** nessuna modifica visiva percepibile. Palette `editorial-*`, font, scala tipografica, tema chiaro/scuro restano identici. Confronto visivo prima/dopo su ogni finestra migrata.
- **Comportamento invariato:** ogni finestra/menu deve fare esattamente ciò che fa oggi (stessi pulsanti, stesse azioni, stesso testo i18n).
- **Versioni:** Radix UI `^1.x` (ultime stabili per React 19). Una dipendenza per primitiva (`@radix-ui/react-dialog`, ecc.), non il meta-pacchetto.
- **Tailwind v4:** nessun `@apply`, nessun CSS-in-JS. Le primitive Radix sono `asChild`/unstyled; lo stile resta utility-class.
- **cva:** le varianti seguono il pattern già in uso in `src/components/ui/IconButton.tsx`.
- **TypeScript:** tipi espliciti, mai `any`. `npm run lint` (`tsc --noEmit`) deve restare verde.
- **Test:** ogni primitiva nuova ha test Testing Library su apertura/chiusura/Escape/focus. Copertura minima 80% sui nuovi file. Mai sopprimere errori in silenzio.
- **i18n:** tutte le label passano da `react-i18next` come oggi; nessuna stringa hardcoded.
- **Commit:** Conventional Commits, frequenti (uno per task). Branch da `main` aggiornato.
- **Docs:** aggiornare `docs-dev/UI_DESIGN_SYSTEM.md` (sezione primitive) e `docs-dev/ARCHITECTURE.md` quando il layer primitive cambia. Aggiornare l'help in-app solo se cambia un comportamento visibile (non dovrebbe).
- **Comandi terminale:** prefisso `rtk` (es. `rtk npm test`).

---

## Inventario di partenza (cosa si migra)

**Finestre/Dialog (10)** — oggi montate con `fixed inset-0` + `useFocusTrap` (o senza), backdrop manuale:

| File | Base attuale | Portale | Focus trap | Esc | Note |
|---|---|---|---|---|---|
| `src/components/common/ConfirmDialog.tsx` | custom | ✗ | ✓ | ✓ | → AlertDialog |
| `src/components/common/PreflightDialog.tsx` | EditorialModalShell | ✗ | ✓ | ✓ | → AlertDialog |
| `src/components/document/ExportDialog.tsx` | custom | ✓ | ✓ | ✓ | → Dialog |
| `src/components/document/ExtractTermDialog.tsx` | custom | ✗ | **✗** | **✗** | **rotta** — priorità |
| `src/components/document/ImportPreviewDialog.tsx` | custom | ✗ | ✓ | ✓ | → Dialog (grande) |
| `src/components/document/StageTraceDialog.tsx` | custom | ✗ | ✓ | ✓ | → Dialog |
| `src/components/library/CsvImportDialog.tsx` | custom | ✓ | ✓ | ✓ | → Dialog |
| `src/components/settings/SettingsModal.tsx` | EditorialModalShell | ✗ | ✓ | ✓ | → Dialog (grande) |
| `src/components/workspace/WorkspaceSettingsModal.tsx` | EditorialModalShell | ✗ | ✓ | ✓ | → Dialog |
| `src/components/help/HelpGuide.tsx` | custom overlay | ✗ | parz. | ✓ | → Dialog |

**Tooltip (1):** `src/components/ui/Tooltip.tsx` — posizionamento manuale con `getBoundingClientRect` + clamp. Usato da `IconButton` e da testo troncato.

**Menu contestuale (1):** `src/components/document/AnnotationContextMenu.tsx` — nessun `role="menu"`, niente tastiera, niente portale, posizionato a coordinate.

**Tab:** `src/components/document/tabs/TabButton.tsx` (con navigazione tastiera custom), tablist inline in `SettingsModal.tsx`, `src/components/pipeline/SettingsTabPanel.tsx`.

**Popover/floating:** badge costi in `src/components/layout/PipelineSidebarSections.tsx` (sotto-componente `SidebarCostPanel`, `getBoundingClientRect` + `createPortal` manuali).

**Drawer (2):** `src/components/document/InsightsDrawer.tsx`, `src/components/document/ConfigDrawer.tsx` — pannelli NON modali (no backdrop). **Fuori scope** per questa migrazione (restano com'è; eventuale `ConfigDrawer` Escape resta).

**Select nativi (13 file):** restano `<select>` HTML nativi. **Fuori scope** (l'a11y nativa è corretta); eventuale fase stretch opzionale in coda.

**Hook da dismettere a fine lavoro:** `src/hooks/useFocusTrap.ts` (+ test), `EditorialModalShell` (assorbito dal nuovo `Dialog`).

---

## File Structure (nuovi file)

- `src/components/ui/Dialog.tsx` — wrapper modale generico su `@radix-ui/react-dialog`. Riproduce esattamente il chrome di `EditorialModalShell` (eyebrow, icona accent, titolo display italic, descrizione, body scrollabile, footer, pulsante X).
- `src/components/ui/AlertDialog.tsx` — wrapper conferma su `@radix-ui/react-alert-dialog` (per ConfirmDialog/PreflightDialog: azione + annulla, focus sul pulsante sicuro).
- `src/components/ui/Tooltip.tsx` — **riscrittura** su `@radix-ui/react-tooltip` mantenendo l'API `<Tooltip label side>`.
- `src/components/ui/TooltipProvider.tsx` — provider unico montato in `App.tsx`.
- `src/components/ui/Menu.tsx` — wrapper menu su `@radix-ui/react-dropdown-menu` (item, separator, label) per il menu annotazioni.
- `src/components/ui/Tabs.tsx` — wrapper su `@radix-ui/react-tabs` (Root/List/Trigger/Content) stilizzato come `TabButton`.
- `src/components/ui/Popover.tsx` — wrapper su `@radix-ui/react-popover` per il badge costi.
- Test affiancati: `Dialog.test.tsx`, `AlertDialog.test.tsx`, `Tooltip.test.tsx`, `Menu.test.tsx`, `Tabs.test.tsx`, `Popover.test.tsx`.
- Aggiornamenti barrel: `src/components/ui/index.ts`.

---

## Fasi e ordine di esecuzione

- **Fase 0** — Fondamenta (deps + primitiva Dialog + AlertDialog + provider).
- **Fase 1** — Migrazione delle 10 finestre (una per task), partendo dalla rotta.
- **Fase 2** — Tooltip su Radix.
- **Fase 3** — Menu contestuale annotazioni.
- **Fase 4** — Tab su Radix.
- **Fase 5** — Popover badge costi.
- **Fase 6** — Pulizia (rimozione `useFocusTrap`, `EditorialModalShell`, flag overlay ridondanti).
- **Fase 7 (stretch, opzionale)** — Select su Radix.

Ogni task termina con un deliverable testabile in autonomia.

---

# FASE 0 — Fondamenta

### Task 0.1: Installare le dipendenze Radix

**Files:**
- Modify: `package.json` (dependencies)

**Interfaces:**
- Produces: pacchetti `@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tabs`, `@radix-ui/react-popover` disponibili all'import.

- [ ] **Step 1: Installare i pacchetti**

```bash
rtk npm install @radix-ui/react-dialog @radix-ui/react-alert-dialog @radix-ui/react-tooltip @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-popover
```

- [ ] **Step 2: Verificare il build dei tipi**

Run: `rtk npm run lint`
Expected: PASS (nessun errore TypeScript; le nuove deps portano i propri tipi).

- [ ] **Step 3: Verificare che la suite esistente resti verde**

Run: `rtk npm test`
Expected: PASS (nessun test toccato).

- [ ] **Step 4: Commit**

```bash
rtk git add package.json package-lock.json
rtk git commit -m "chore(ui): aggiunge primitive Radix UI per migrazione componenti"
```

---

### Task 0.2: Primitiva `Dialog` su Radix (chrome = EditorialModalShell)

**Files:**
- Create: `src/components/ui/Dialog.tsx`
- Test: `src/components/ui/Dialog.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `@radix-ui/react-dialog`, `lucide-react` (`X`).
- Produces:
  ```ts
  interface DialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    closeLabel: string;
    children: React.ReactNode;
    eyebrow?: string;
    icon?: React.ReactNode;
    description?: React.ReactNode;
    footer?: React.ReactNode;
    headerActions?: React.ReactNode;
    tabBar?: React.ReactNode;
    widthClassName?: string;   // default 'max-w-3xl'
    bodyClassName?: string;    // default 'px-6 py-6 md:px-8'
    closeDisabled?: boolean;   // blocca chiusura via X/Esc/overlay
  }
  export function Dialog(props: DialogProps): JSX.Element;
  ```
  Comportamento garantito da Radix: focus trap, Escape, focus restore, scroll-lock, portale su `document.body`, `aria-modal`, `aria-labelledby` collegato al titolo.

- [ ] **Step 1: Scrivere il test che fallisce**

```tsx
// src/components/ui/Dialog.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Dialog } from './Dialog';

function Harness({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        onOpenChange?.(o);
      }}
      title="Esporta documento"
      closeLabel="Chiudi"
    >
      <button type="button">azione interna</button>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('rende il titolo e collega aria-labelledby al dialog', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Esporta documento')).toBeInTheDocument();
  });

  it('chiude con Escape e notifica onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('chiude dal pulsante di chiusura', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Eseguire il test (deve fallire)**

Run: `rtk npm test -- src/components/ui/Dialog.test.tsx`
Expected: FAIL — `Cannot find module './Dialog'`.

- [ ] **Step 3: Implementare la primitiva**

```tsx
// src/components/ui/Dialog.tsx
import type { ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  eyebrow?: string;
  icon?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  tabBar?: ReactNode;
  widthClassName?: string;
  bodyClassName?: string;
  closeDisabled?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  eyebrow,
  icon,
  description,
  footer,
  headerActions,
  tabBar,
  widthClassName = 'max-w-3xl',
  bodyClassName = 'px-6 py-6 md:px-8',
  closeDisabled = false,
}: DialogProps) {
  // closeDisabled: blocca Esc, click overlay e tasto X (es. durante operazioni in corso).
  const guardClose = (event: Event) => {
    if (closeDisabled) event.preventDefault();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-editorial-ink/30 backdrop-blur-sm" />
        <RadixDialog.Content
          onEscapeKeyDown={guardClose}
          onPointerDownOutside={guardClose}
          onInteractOutside={guardClose}
          className={`fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[var(--shadow-modal)] ${widthClassName}`}
        >
          <div className="shrink-0 border-b border-editorial-border px-6 py-5 md:px-8 md:py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                {eyebrow ? (
                  <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
                    {eyebrow}
                  </div>
                ) : null}
                <div className="flex items-center gap-3">
                  {icon ? <span className="shrink-0 text-editorial-accent">{icon}</span> : null}
                  <RadixDialog.Title className="font-display text-3xl italic tracking-tight text-editorial-ink">
                    {title}
                  </RadixDialog.Title>
                </div>
                {description ? (
                  <RadixDialog.Description className="text-sm leading-relaxed text-editorial-muted">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {headerActions}
                <RadixDialog.Close asChild>
                  <button
                    type="button"
                    disabled={closeDisabled}
                    className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label={closeLabel}
                    title={closeLabel}
                  >
                    <X size={16} />
                  </button>
                </RadixDialog.Close>
              </div>
            </div>
            {tabBar ? <div className="mt-4">{tabBar}</div> : null}
          </div>
          <div className={`flex-1 overflow-y-auto custom-scrollbar ${bodyClassName}`.trim()}>
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-editorial-border px-6 py-4 md:px-8">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run: `rtk npm test -- src/components/ui/Dialog.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Esportare dal barrel**

In `src/components/ui/index.ts` aggiungere:
```ts
export { Dialog } from './Dialog';
```

- [ ] **Step 6: Lint + commit**

```bash
rtk npm run lint
rtk git add src/components/ui/Dialog.tsx src/components/ui/Dialog.test.tsx src/components/ui/index.ts
rtk git commit -m "feat(ui): primitiva Dialog su Radix con chrome editoriale"
```

---

### Task 0.3: Primitiva `AlertDialog` su Radix (conferme)

**Files:**
- Create: `src/components/ui/AlertDialog.tsx`
- Test: `src/components/ui/AlertDialog.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `@radix-ui/react-alert-dialog`.
- Produces:
  ```ts
  type AlertTone = 'default' | 'danger';
  interface AlertDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    tone?: AlertTone;      // 'danger' = pulsante conferma rosso accent pieno
    busy?: boolean;        // disabilita pulsanti durante azione async
    children?: React.ReactNode; // contenuto extra opzionale sopra i pulsanti
  }
  export function AlertDialog(props: AlertDialogProps): JSX.Element;
  ```
  `AlertDialog` di Radix mette il focus iniziale sul pulsante Cancel (azione sicura) e non chiude su click esterno: comportamento corretto per le conferme distruttive.

- [ ] **Step 1: Scrivere il test che fallisce**

```tsx
// src/components/ui/AlertDialog.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { AlertDialog } from './AlertDialog';

function setup(props: Partial<React.ComponentProps<typeof AlertDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AlertDialog
      open
      onOpenChange={onOpenChange}
      title="Eliminare il workspace?"
      description="Operazione irreversibile."
      confirmLabel="Elimina"
      cancelLabel="Annulla"
      onConfirm={onConfirm}
      tone="danger"
      {...props}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe('AlertDialog', () => {
  it('mostra titolo, descrizione e pulsanti', () => {
    setup();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Eliminare il workspace?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeInTheDocument();
  });

  it('invoca onConfirm al click su conferma', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    await user.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disabilita i pulsanti quando busy', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Eseguire il test (deve fallire)**

Run: `rtk npm test -- src/components/ui/AlertDialog.test.tsx`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementare la primitiva**

```tsx
// src/components/ui/AlertDialog.tsx
import type { ReactNode } from 'react';
import * as RadixAlert from '@radix-ui/react-alert-dialog';

type AlertTone = 'default' | 'danger';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  tone?: AlertTone;
  busy?: boolean;
  children?: ReactNode;
}

const CONFIRM_CLASS: Record<AlertTone, string> = {
  default:
    'border border-editorial-accent bg-editorial-accent text-editorial-bg hover:bg-editorial-accent/90',
  danger:
    'border border-editorial-accent bg-editorial-accent text-editorial-bg hover:bg-editorial-accent/90',
};

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone = 'default',
  busy = false,
  children,
}: AlertDialogProps) {
  return (
    <RadixAlert.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlert.Portal>
        <RadixAlert.Overlay className="fixed inset-0 z-50 bg-editorial-ink/30 backdrop-blur-sm" />
        <RadixAlert.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-editorial-border bg-editorial-bg p-6 shadow-[var(--shadow-modal)] md:p-8">
          <RadixAlert.Title className="font-display text-2xl italic tracking-tight text-editorial-ink">
            {title}
          </RadixAlert.Title>
          {description ? (
            <RadixAlert.Description className="mt-3 text-sm leading-relaxed text-editorial-muted">
              {description}
            </RadixAlert.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-6 flex justify-end gap-3">
            <RadixAlert.Cancel asChild>
              <button
                type="button"
                disabled={busy}
                className="rounded-full border border-editorial-border px-4 py-2 text-sm text-editorial-ink transition-colors hover:bg-editorial-textbox/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cancelLabel}
              </button>
            </RadixAlert.Cancel>
            <RadixAlert.Action asChild>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className={`rounded-full px-4 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${CONFIRM_CLASS[tone]}`}
              >
                {confirmLabel}
              </button>
            </RadixAlert.Action>
          </div>
        </RadixAlert.Content>
      </RadixAlert.Portal>
    </RadixAlert.Root>
  );
}
```

> Nota: `RadixAlert.Action` chiude di default al click. Se `onConfirm` avvia un'azione asincrona che deve tenere aperta la finestra (con `busy`), intercettare nel chiamante via `event.preventDefault()` nel handler dell'Action, oppure gestire la chiusura dal `onOpenChange`. Per i due consumatori attuali (ConfirmDialog/PreflightDialog) la chiusura immediata è il comportamento desiderato.

- [ ] **Step 4: Eseguire il test (deve passare)**

Run: `rtk npm test -- src/components/ui/AlertDialog.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Esportare dal barrel**

In `src/components/ui/index.ts`:
```ts
export { AlertDialog } from './AlertDialog';
```

- [ ] **Step 6: Lint + commit**

```bash
rtk npm run lint
rtk git add src/components/ui/AlertDialog.tsx src/components/ui/AlertDialog.test.tsx src/components/ui/index.ts
rtk git commit -m "feat(ui): primitiva AlertDialog su Radix per conferme"
```

---

# FASE 1 — Migrazione delle finestre

> **Pattern di migrazione (vale per ogni dialog).** Per ciascun file:
> 1. Sostituire il guscio manuale (`fixed inset-0` + backdrop + `useFocusTrap` o `EditorialModalShell`) con `<Dialog open onOpenChange ...>`.
> 2. Mappare le prop esistenti del titolo/eyebrow/icona/descrizione/footer sulle prop di `Dialog` (i nomi coincidono volutamente con `EditorialModalShell`).
> 3. Il contenuto interno (form, liste, tab body) resta **identico**: si sposta solo dentro `children`.
> 4. Rimuovere import e uso di `useFocusTrap`/`EditorialModalShell` dal file.
> 5. Tradurre la chiusura: dove oggi c'è `onClose()` passare `onOpenChange={(o) => { if (!o) onClose(); }}`.
> 6. Aggiungere/aggiornare un test di rendering+chiusura per il dialog migrato.
> 7. Smoke test manuale in `tauri:dev`: la finestra si apre, Esc chiude, Tab resta dentro, lo sfondo non scrolla, l'aspetto è identico.

### Task 1.1: Riparare e migrare `ExtractTermDialog` (la rotta — priorità)

**Files:**
- Modify: `src/components/document/ExtractTermDialog.tsx`
- Test: `src/components/document/ExtractTermDialog.test.tsx` (creare se assente)

**Interfaces:**
- Consumes: `Dialog` da `src/components/ui`.
- Produces: nessuna API nuova; props del componente invariate.

- [ ] **Step 1: Leggere il file e individuare il guscio attuale**

Run: `rtk read src/components/document/ExtractTermDialog.tsx`
Annotare: prop di apertura/chiusura, titolo, contenuto form (input termine + `<select>` nativo + pulsanti azione).

- [ ] **Step 2: Scrivere il test che fallisce (Esc chiude, focus intrappolato)**

```tsx
// src/components/document/ExtractTermDialog.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ExtractTermDialog } from './ExtractTermDialog';

// Adattare le props richieste reali al momento della scrittura (selezione termine, onClose, onSave).
describe('ExtractTermDialog', () => {
  it('chiude con Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(/* <ExtractTermDialog open onClose={onClose} ...props minime /> */);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
```

> Compilare le props reali leggendo l'interfaccia del componente allo Step 1. Il test deve fallire ORA perché oggi Esc non chiude (manca focus trap/handler).

- [ ] **Step 3: Eseguire il test (deve fallire)**

Run: `rtk npm test -- src/components/document/ExtractTermDialog.test.tsx`
Expected: FAIL — `onClose` non chiamato su Escape.

- [ ] **Step 4: Applicare il pattern di migrazione**

Sostituire il guscio manuale con `<Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={t('extractTerm.title')} closeLabel={t('common.close')}>` e spostare il form dentro `children`. Rimuovere il `fixed inset-0`/backdrop manuale.

- [ ] **Step 5: Eseguire il test (deve passare)**

Run: `rtk npm test -- src/components/document/ExtractTermDialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint + smoke test manuale + commit**

```bash
rtk npm run lint
rtk npm test
rtk git add src/components/document/ExtractTermDialog.tsx src/components/document/ExtractTermDialog.test.tsx
rtk git commit -m "fix(ui): ExtractTermDialog su primitiva Dialog (ripristina Esc + focus trap)"
```

---

### Task 1.2 → 1.7: Migrare i dialog generici su `Dialog`

Un task per file, **stesso pattern di migrazione** (vedi riquadro Fase 1). Ordine consigliato (dal più semplice al più complesso):

- [ ] **Task 1.2** `src/components/document/StageTraceDialog.tsx` → `Dialog`. Commit: `refactor(ui): StageTraceDialog su primitiva Dialog`.
- [ ] **Task 1.3** `src/components/document/ExportDialog.tsx` → `Dialog` (rimuovere il `createPortal` manuale, ora gestito da Radix). Commit: `refactor(ui): ExportDialog su primitiva Dialog`.
- [ ] **Task 1.4** `src/components/library/CsvImportDialog.tsx` → `Dialog` (rimuovere `createPortal` manuale). Commit: `refactor(ui): CsvImportDialog su primitiva Dialog`.
- [ ] **Task 1.5** `src/components/workspace/WorkspaceSettingsModal.tsx` → `Dialog` (oggi usa `EditorialModalShell`: mappatura prop 1:1). Commit: `refactor(ui): WorkspaceSettingsModal su primitiva Dialog`.
- [ ] **Task 1.6** `src/components/help/HelpGuide.tsx` → `Dialog`. Commit: `refactor(ui): HelpGuide su primitiva Dialog`.
- [ ] **Task 1.7** `src/components/document/ImportPreviewDialog.tsx` → `Dialog` (finestra grande, modalità `cards`/`segments`: il contenuto resta invariato, cambia solo il guscio; mantenere `widthClassName` largo). Commit: `refactor(ui): ImportPreviewDialog su primitiva Dialog`.

Per **ognuno**:
- [ ] Step A: `rtk read <file>` e individuare guscio + titolo/footer.
- [ ] Step B: aggiungere/estendere il test di chiusura (Esc → callback di chiusura) — far fallire prima se possibile, altrimenti test di rendering del titolo.
- [ ] Step C: applicare il pattern, rimuovere `useFocusTrap`/`EditorialModalShell`/portali manuali.
- [ ] Step D: `rtk npm run lint && rtk npm test -- <file test>` → verde.
- [ ] Step E: smoke test manuale (apre/Esc/Tab/scroll-lock/aspetto identico).
- [ ] Step F: commit con il messaggio indicato sopra.

---

### Task 1.8: Migrare `SettingsModal` (grande) su `Dialog`

**Files:**
- Modify: `src/components/settings/SettingsModal.tsx`

**Interfaces:**
- Consumes: `Dialog`. La tablist interna resta invariata in questa fase (migrerà in Fase 4).

- [ ] **Step 1:** `rtk read src/components/settings/SettingsModal.tsx` — mappare `EditorialModalShell` (title/eyebrow/icon/tabBar/footer) sulle prop di `Dialog`. La `tabBar` esistente va su `tabBar`.
- [ ] **Step 2:** Migrare il guscio; il body (tab panels, color picker, selettori) resta identico dentro `children`.
- [ ] **Step 3:** `rtk npm run lint && rtk npm test` → verde.
- [ ] **Step 4:** Smoke test manuale: tutte le tab impostazioni, focus, Esc, scroll-lock.
- [ ] **Step 5: Commit**
```bash
rtk git add src/components/settings/SettingsModal.tsx
rtk git commit -m "refactor(ui): SettingsModal su primitiva Dialog"
```

---

### Task 1.9: Migrare le conferme su `AlertDialog`

**Files:**
- Modify: `src/components/common/ConfirmDialog.tsx`
- Modify: `src/components/common/PreflightDialog.tsx`

**Interfaces:**
- Consumes: `AlertDialog`.

- [ ] **Step 1:** Riscrivere `ConfirmDialog` come sottile adattatore sopra `AlertDialog` (mantenere la firma pubblica del componente per non toccare i chiamanti). Mappare `tone` distruttivo su `tone="danger"`.
- [ ] **Step 2:** Idem `PreflightDialog` (oggi su `EditorialModalShell`; il suo contenuto descrittivo va in `children`/`description`, i due pulsanti su confirm/cancel).
- [ ] **Step 3:** Aggiornare/estendere i test esistenti dei due componenti (conferma → callback, annulla → chiusura).
- [ ] **Step 4:** `rtk npm run lint && rtk npm test` → verde.
- [ ] **Step 5: Commit**
```bash
rtk git add src/components/common/ConfirmDialog.tsx src/components/common/PreflightDialog.tsx
rtk git commit -m "refactor(ui): ConfirmDialog e PreflightDialog su primitiva AlertDialog"
```

---

# FASE 2 — Tooltip su Radix

### Task 2.1: Provider tooltip in `App.tsx`

**Files:**
- Create: `src/components/ui/TooltipProvider.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Produces: `<TooltipProvider>` (wrapper di `@radix-ui/react-tooltip` `Provider` con `delayDuration` coerente con l'attuale ritardo del tooltip custom).

- [ ] **Step 1:** Leggere il ritardo attuale in `src/components/ui/Tooltip.tsx` (apertura su hover/focus) per replicarlo in `delayDuration`.
- [ ] **Step 2:** Creare `TooltipProvider`:
```tsx
// src/components/ui/TooltipProvider.tsx
import type { ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      {children}
    </RadixTooltip.Provider>
  );
}
```
- [ ] **Step 3:** In `src/App.tsx` avvolgere l'albero applicativo con `<TooltipProvider>` (al livello più alto, accanto agli altri provider/sync come `FontSync`/`ThemeSync`).
- [ ] **Step 4:** `rtk npm run lint && rtk npm test` → verde.
- [ ] **Step 5: Commit**
```bash
rtk git add src/components/ui/TooltipProvider.tsx src/App.tsx src/components/ui/index.ts
rtk git commit -m "feat(ui): TooltipProvider Radix montato in App"
```

---

### Task 2.2: Riscrivere `Tooltip` su Radix mantenendo l'API

**Files:**
- Modify: `src/components/ui/Tooltip.tsx`
- Test: `src/components/ui/Tooltip.test.tsx` (creare)

**Interfaces:**
- Produces (invariato per i chiamanti):
  ```ts
  interface TooltipProps {
    label: ReactNode;
    side?: 'top' | 'bottom' | 'left' | 'right';
    children: ReactNode; // l'elemento ancora
  }
  ```

- [ ] **Step 1:** Verificare i call-site attuali per non rompere l'API: `rtk grep -rn "<Tooltip" src/components`. Confermare le prop usate (`label`, `side`). `IconButton` integra Tooltip internamente: verificare anche lì.
- [ ] **Step 2: Test che fallisce**
```tsx
// src/components/ui/Tooltip.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Tooltip } from './Tooltip';
import { TooltipProvider } from './TooltipProvider';

describe('Tooltip', () => {
  it('mostra la label al focus dell-ancora', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip label="Esporta">
          <button type="button">trigger</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Esporta');
  });
});
```
- [ ] **Step 3:** Eseguire (deve fallire finché non riscritto su Radix con `role="tooltip"` accessibile via focus).
- [ ] **Step 4:** Riscrivere:
```tsx
// src/components/ui/Tooltip.tsx
import type { ReactNode } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

interface TooltipProps {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

export function Tooltip({ label, side = 'top', children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-editorial-border bg-editorial-ink px-2.5 py-1.5 text-xs text-editorial-bg shadow-[var(--shadow-tooltip)]"
        >
          {label}
          <RadixTooltip.Arrow className="fill-editorial-ink" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
```
> Replicare le classi esatte del box tooltip attuale (`TOOLTIP_BOX` nel file odierno) per aspetto identico. `asChild` richiede che `children` accetti `ref`/props: `IconButton` deve inoltrare i prop al `<button>` — verificare/forwardare.
- [ ] **Step 5:** Eseguire test → verde. `IconButton`: verificare che il tooltip interno usi il nuovo `Tooltip` e che `asChild` non rompa il forward dei prop.
- [ ] **Step 6:** Smoke test manuale: tooltip su pulsanti icona in più viste; verifica posizionamento ai bordi schermo (Radix Floating gestisce il flip automatico — il clamp manuale non serve più).
- [ ] **Step 7: Commit**
```bash
rtk npm run lint && rtk npm test
rtk git add src/components/ui/Tooltip.tsx src/components/ui/Tooltip.test.tsx
rtk git commit -m "refactor(ui): Tooltip su Radix con posizionamento automatico"
```

---

# FASE 3 — Menu contestuale annotazioni

### Task 3.1: `Menu` primitiva + migrazione `AnnotationContextMenu`

**Files:**
- Create: `src/components/ui/Menu.tsx`
- Test: `src/components/ui/Menu.test.tsx`
- Modify: `src/components/document/AnnotationContextMenu.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `@radix-ui/react-dropdown-menu`.
- Produces:
  ```ts
  interface MenuItem { id: string; label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; }
  interface MenuProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: MenuItem[];
    anchorRect: { x: number; y: number } | null; // posizione del click sulla selezione
  }
  export function Menu(props: MenuProps): JSX.Element;
  ```
  Radix DropdownMenu fornisce `role="menu"`, `role="menuitem"`, frecce su/giù, Home/End, type-ahead, Escape e focus management. Il menu si ancora a un elemento virtuale di dimensione zero posizionato alle coordinate del click (sostituisce il posizionamento manuale odierno).

- [ ] **Step 1: Test che fallisce (ruolo menu + selezione voce)**
```tsx
// src/components/ui/Menu.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Menu } from './Menu';

describe('Menu', () => {
  it('espone role=menu e invoca onSelect della voce', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <Menu
        open
        onOpenChange={() => {}}
        anchorRect={{ x: 10, y: 10 }}
        items={[{ id: 'note', label: 'Aggiungi nota', onSelect }]}
      />,
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Aggiungi nota' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
```
- [ ] **Step 2:** Eseguire (FAIL — modulo assente).
- [ ] **Step 3: Implementare `Menu`**
```tsx
// src/components/ui/Menu.tsx
import type { ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MenuItem[];
  anchorRect: { x: number; y: number } | null;
}

export function Menu({ open, onOpenChange, items, anchorRect }: MenuProps) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      {/* Trigger virtuale a coordinate fisse: 0x0, invisibile, posizionato al click. */}
      <DropdownMenu.Trigger
        aria-hidden
        style={{
          position: 'fixed',
          left: anchorRect?.x ?? 0,
          top: anchorRect?.y ?? 0,
          width: 0,
          height: 0,
        }}
      />
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-50 min-w-44 overflow-hidden rounded-xl border border-editorial-border bg-editorial-bg p-1 shadow-[var(--shadow-modal)]"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-editorial-ink outline-none data-[highlighted]:bg-editorial-textbox/60 data-[highlighted]:text-editorial-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
            >
              {item.icon ? <span className="shrink-0 text-editorial-accent">{item.icon}</span> : null}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```
- [ ] **Step 4:** Eseguire test → verde.
- [ ] **Step 5:** Migrare `AnnotationContextMenu.tsx`: sostituire il div posizionato a mano + handler click-outside/Escape con `<Menu open onOpenChange items={...} anchorRect={...} />`. Le voci attuali del menu diventano `items` con i rispettivi `onSelect`. Rimuovere gli handler manuali.
- [ ] **Step 6:** Smoke test manuale nel viewer documento: selezione testo → menu compare alla posizione, frecce navigano, Esc chiude, click voce esegue l'azione.
- [ ] **Step 7: Commit**
```bash
rtk npm run lint && rtk npm test
rtk git add src/components/ui/Menu.tsx src/components/ui/Menu.test.tsx src/components/document/AnnotationContextMenu.tsx src/components/ui/index.ts
rtk git commit -m "feat(ui): menu annotazioni su Radix DropdownMenu (role=menu + tastiera)"
```

---

# FASE 4 — Tab su Radix

### Task 4.1: Primitiva `Tabs`

**Files:**
- Create: `src/components/ui/Tabs.tsx`
- Test: `src/components/ui/Tabs.test.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `@radix-ui/react-tabs`.
- Produces:
  ```ts
  interface TabDef { value: string; label: ReactNode; icon?: ReactNode; }
  interface TabsProps {
    value: string;
    onValueChange: (value: string) => void;
    tabs: TabDef[];
    children: ReactNode; // i <Tabs.Panel> o il contenuto controllato dal chiamante
  }
  ```
  Replica lo stile di `TabButton.tsx` (tono attivo accent, label display nelle barre filtro) ma la navigazione (frecce, Home/End, roving tabindex) è di Radix.

- [ ] **Step 1: Test che fallisce** (render lista tab con `role="tab"`, cambio con freccia destra aggiorna `aria-selected`).
- [ ] **Step 2:** Eseguire (FAIL).
- [ ] **Step 3:** Implementare `Tabs` su `RadixTabs.Root/List/Trigger/Content` replicando le classi di `TabButton` (tono accent attivo, hover).
- [ ] **Step 4:** Eseguire → verde.
- [ ] **Step 5: Commit** `feat(ui): primitiva Tabs su Radix`.

### Task 4.2: Migrare i consumatori di `TabButton`

- [ ] **Step 1:** `rtk grep -rln "TabButton\|role=\"tab\"" src/components` per l'elenco esatto (almeno `InsightsDrawer`, `SettingsModal`, `pipeline/SettingsTabPanel`).
- [ ] **Step 2:** Per ogni consumatore: sostituire la tablist `TabButton` con `<Tabs value onValueChange tabs={...}>` mantenendo gli stessi `value` e gli stessi pannelli. Verificare che gli `aria-controls`/`id` non siano referenziati altrove prima di rimuoverli.
- [ ] **Step 3:** Quando tutti i consumatori sono migrati, rimuovere `src/components/document/tabs/TabButton.tsx` se non più referenziato (`rtk grep -rn TabButton src` → vuoto).
- [ ] **Step 4:** `rtk npm run lint && rtk npm test` → verde. Smoke test manuale: tab insight, tab impostazioni, tab pipeline.
- [ ] **Step 5: Commit** `refactor(ui): migra tab a primitiva Tabs Radix`.

---

# FASE 5 — Popover badge costi

### Task 5.1: Primitiva `Popover` + migrazione `SidebarCostPanel`

**Files:**
- Create: `src/components/ui/Popover.tsx`
- Test: `src/components/ui/Popover.test.tsx`
- Modify: `src/components/layout/PipelineSidebarSections.tsx`
- Modify: `src/components/ui/index.ts`

**Interfaces:**
- Consumes: `@radix-ui/react-popover`.
- Produces:
  ```ts
  interface PopoverProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactNode;     // l'elemento ancora (il badge)
    children: ReactNode;    // contenuto del pannello
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
  }
  ```

- [ ] **Step 1:** `rtk read src/components/layout/PipelineSidebarSections.tsx` — isolare `SidebarCostPanel` (calcolo posizione `getBoundingClientRect`, `clamp`, `createPortal`).
- [ ] **Step 2: Test che fallisce** (apre al click sul trigger, mostra contenuto, chiude su Esc/click esterno).
- [ ] **Step 3:** Implementare `Popover` su `RadixPopover.Root/Trigger/Portal/Content` con `Popover.Arrow`, replicando lo stile del pannello costi attuale.
- [ ] **Step 4:** Eseguire → verde.
- [ ] **Step 5:** Sostituire `SidebarCostPanel` con `<Popover ...>`: rimuovere `calculatePosition`, `getBoundingClientRect`, `clamp` e il `createPortal` manuale (Radix Floating fa flip/clamp). Il contenuto del pannello (breakdown costi) resta invariato dentro `children`.
- [ ] **Step 6:** Smoke test manuale: badge costi nella sidebar pipeline; apertura, posizionamento, chiusura, niente overflow ai bordi.
- [ ] **Step 7: Commit**
```bash
rtk npm run lint && rtk npm test
rtk git add src/components/ui/Popover.tsx src/components/ui/Popover.test.tsx src/components/layout/PipelineSidebarSections.tsx src/components/ui/index.ts
rtk git commit -m "refactor(ui): badge costi su primitiva Popover Radix"
```

---

# FASE 6 — Pulizia

### Task 6.1: Rimuovere `useFocusTrap` e `EditorialModalShell`

**Files:**
- Delete: `src/hooks/useFocusTrap.ts`, `src/hooks/useFocusTrap.test.tsx`
- Delete: `src/components/common/EditorialModalShell.tsx`
- Modify: `src/components/common/index.ts` (rimuovere export)

- [ ] **Step 1:** Verificare zero referenze residue:
```bash
rtk grep -rn "useFocusTrap" src
rtk grep -rn "EditorialModalShell" src
```
Expected: nessun risultato (tutto migrato a `Dialog`/`AlertDialog`).
- [ ] **Step 2:** Eliminare i file e l'export dal barrel.
- [ ] **Step 3:** `rtk npm run lint && rtk npm test` → verde.
- [ ] **Step 4: Commit** `chore(ui): rimuove useFocusTrap ed EditorialModalShell (sostituiti da Radix)`.

### Task 6.2: Ridurre i flag overlay in `uiStore` (cautela)

**Files:**
- Modify: `src/stores/uiStore.ts` (+ test in `src/stores/__tests__`)

> Solo per gli overlay il cui stato apertura/chiusura non serve più globalmente dopo la migrazione (es. una finestra ora controllata localmente). **Non** rimuovere flag ancora letti da più componenti o persistiti (larghezze sidebar, tab attive condivise). Verificare ogni flag con `rtk grep -rn "<flagName>" src` prima di toccarlo.

- [ ] **Step 1:** Elencare i flag overlay candidati (`showSettings`, `showHelp`, `showExportDialog`, ecc.) e per ciascuno controllare i lettori con grep.
- [ ] **Step 2:** Rimuovere SOLO quelli con un unico punto di controllo che può diventare stato locale; lasciare invariati gli altri. Aggiornare i test dello store.
- [ ] **Step 3:** `rtk npm run lint && rtk npm test` → verde. Smoke test manuale delle finestre coinvolte.
- [ ] **Step 4: Commit** `refactor(state): rimuove flag overlay ridondanti dopo migrazione Radix`.

### Task 6.3: Aggiornare la documentazione

**Files:**
- Modify: `docs-dev/UI_DESIGN_SYSTEM.md`
- Modify: `docs-dev/ARCHITECTURE.md`
- Modify: `STATO_SESSIONE_2.0.md`

- [ ] **Step 1:** In `UI_DESIGN_SYSTEM.md` aggiungere la sezione "Primitive overlay (Radix)": `Dialog`, `AlertDialog`, `Tooltip` (+ `TooltipProvider`), `Menu`, `Tabs`, `Popover` — regola: nessun nuovo overlay scritto a mano, usare le primitive.
- [ ] **Step 2:** In `ARCHITECTURE.md` annotare che gli overlay poggiano su Radix e che il focus/scroll-lock/portale sono delegati alla libreria.
- [ ] **Step 3:** Aggiornare `STATO_SESSIONE_2.0.md` con lo stato della migrazione.
- [ ] **Step 4: Commit** `docs(ui): documenta primitive overlay Radix`.

---

# FASE 7 — (Stretch, opzionale) Select su Radix

> Solo se si decide di unificare anche i menu a tendina. I `<select>` nativi attuali sono accessibili: questa fase è puramente di coerenza visiva. 13 file coinvolti (vedi inventario). Da pianificare separatamente se prioritario; **non** bloccante per chiudere l'epica.

---

## Definition of Done

- [ ] Tutte le 10 finestre usano `Dialog`/`AlertDialog`; nessuna usa più `fixed inset-0` manuale o `useFocusTrap`.
- [ ] `ExtractTermDialog` chiude con Esc e intrappola il focus (bug risolto).
- [ ] Tooltip, menu annotazioni, tab e badge costi su Radix.
- [ ] `useFocusTrap` ed `EditorialModalShell` rimossi; `rtk grep` non li trova più.
- [ ] `rtk npm run lint` verde, `rtk npm test` verde, copertura ≥ 80% sui nuovi file.
- [ ] Smoke test manuale in `tauri:dev`: ogni overlay si apre/chiude, Esc funziona, Tab resta dentro, sfondo bloccato, **aspetto identico al pre-migrazione**.
- [ ] Documentazione UI/architettura aggiornata.

## Rischi e mitigazioni

- **`asChild` di Radix richiede il forward dei prop/ref.** `IconButton`/`PillButton` usati come trigger devono inoltrare props al `<button>`. Mitigazione: verificare ogni trigger; se necessario `React.forwardRef`.
- **Radix in jsdom.** Alcune misurazioni di posizione non avvengono in test; testare comportamento (apertura/chiusura/ruoli), non coordinate pixel.
- **Scroll-lock Radix** aggiunge padding per compensare la scrollbar: verificare che non causi "salti" di layout sulle viste a tutta larghezza; eventualmente configurare.
- **Regressioni visive.** Mitigazione: confronto manuale prima/dopo a ogni task; le classi del chrome sono copiate verbatim da `EditorialModalShell`/`TOOLTIP_BOX`.
- **Migrazione lunga.** Mitigazione: ordine incrementale, app sempre funzionante, un commit per task → revert mirato facile.

## Stima

~22 task atomici. Fase 0 e Fase 1.1 (bug) per prime danno valore subito; il resto è incrementale e parallelizzabile per file.
