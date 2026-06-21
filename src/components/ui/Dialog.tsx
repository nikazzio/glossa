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
