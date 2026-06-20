import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui';

interface PaneSearchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoFocus?: boolean;
}

export function PaneSearch({ value, onChange, label, autoFocus = false }: PaneSearchProps) {
  const { t } = useTranslation();

  return (
    <form
      role="search"
      className="mb-3 shrink-0"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="sr-only">{label}</label>
      <div className="flex items-center gap-2 rounded-full border border-editorial-divider-soft bg-editorial-bg/70 px-3 py-2 shadow-[var(--inset-highlight)] transition-colors focus-within:border-editorial-accent/40 focus-within:ring-2 focus-within:ring-editorial-accent/20">
        <Search size={13} className="shrink-0 text-editorial-muted" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('document.searchChunkPlaceholder')}
          aria-label={label}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent text-xs text-editorial-ink placeholder:text-editorial-muted/55 focus:outline-none"
        />
        {value ? (
          <IconButton
            size="sm"
            tone="muted"
            onClick={() => onChange('')}
            title={t('document.clearPaneSearch')}
            className="shrink-0"
          >
            <X size={12} />
          </IconButton>
        ) : null}
      </div>
    </form>
  );
}
