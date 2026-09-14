import type { ReactNode } from 'react';
import { TerminalSquare, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../ui';

/**
 * La prima riga di una console: nome, quante righe si stanno vedendo, stato
 * corrente e chiusura. Condivisa fra i messaggi della pipeline e il log
 * dell'applicazione, che devono comportarsi allo stesso modo.
 */
export function ConsoleChrome({
  title,
  rowCount,
  status,
  onClose,
}: {
  title: string;
  rowCount: number;
  status?: ReactNode;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-terminal-border bg-terminal-chrome px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-terminal-ink">
        <TerminalSquare size={13} className="shrink-0 text-terminal-accent" />
        <span className="text-xs font-bold uppercase tracking-[0.1em]">{title}</span>
        <span className="text-xs text-terminal-secondary">
          · {t('document.operationsRowCount', { count: rowCount })}
        </span>
      </div>
      {status}
      <div className="flex-1" />
      {onClose && (
        <Tooltip label={t('common.close')}>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-6.5 w-6.5 items-center justify-center rounded-full border border-terminal-border text-terminal-secondary transition-colors hover:border-terminal-accent/60 hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent"
          >
            <X size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
