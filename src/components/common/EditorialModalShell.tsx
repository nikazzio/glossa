import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface EditorialModalShellProps {
  titleId: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  eyebrow?: string;
  icon?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  widthClassName?: string;
  bodyClassName?: string;
  panelClassName?: string;
  closeDisabled?: boolean;
}

export function EditorialModalShell({
  titleId,
  title,
  closeLabel,
  onClose,
  children,
  eyebrow,
  icon,
  description,
  footer,
  headerActions,
  widthClassName = 'max-w-3xl',
  bodyClassName = 'px-6 py-6 md:px-8',
  panelClassName = '',
  closeDisabled = false,
}: EditorialModalShellProps) {
  return (
    <div
      className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)] ${widthClassName} ${panelClassName}`.trim()}
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
              {icon ? (
                <span className="shrink-0 text-editorial-accent">{icon}</span>
              ) : null}
              <h2 id={titleId} className="font-display text-3xl italic tracking-tight text-editorial-ink">
                {title}
              </h2>
            </div>
            {description ? (
              <div className="text-sm leading-relaxed text-editorial-muted">{description}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:bg-editorial-textbox/50 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-35"
              aria-label={closeLabel}
              title={closeLabel}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto custom-scrollbar ${bodyClassName}`.trim()}>
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 border-t border-editorial-border px-6 py-4 md:px-8">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
