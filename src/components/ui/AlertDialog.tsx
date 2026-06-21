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
    'border border-editorial-border bg-editorial-textbox text-editorial-ink hover:border-editorial-accent/40 hover:text-editorial-accent',
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
