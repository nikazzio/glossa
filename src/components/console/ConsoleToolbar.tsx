import { useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ConsoleFilterOption {
  value: string;
  label: string;
  active: boolean;
  /** Colore della voce attiva, dove il livello lo richiede. */
  activeClassName?: string;
}

export interface ConsoleFilterGroup {
  key: string;
  options: ConsoleFilterOption[];
  onToggle: (value: string) => void;
}

/**
 * La seconda riga di una console: ricerca sempre visibile, filtri richiudibili,
 * comandi a destra. Le voci dei filtri restano testo barrato quando sono
 * spente — un interruttore che si legge senza colore, come vuole il design
 * system per gli stati.
 */
export function ConsoleToolbar({
  search,
  onSearchChange,
  groups,
  inlineToggles,
  actions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  groups: ConsoleFilterGroup[];
  inlineToggles?: ReactNode;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="shrink-0 border-b border-terminal-line bg-terminal-bg font-mono text-xs">
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex flex-1 items-center gap-2 text-terminal-muted">
          <Search size={11} className="shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('log.search')}
            className="w-full bg-transparent text-xs text-terminal-ink outline-none placeholder:text-terminal-dim"
          />
        </div>
        {inlineToggles}
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-pressed={filtersOpen}
          className={`shrink-0 text-xs uppercase tracking-[0.14em] transition-colors focus:outline-none ${
            filtersOpen ? 'text-terminal-accent' : 'text-terminal-muted hover:text-terminal-secondary'
          }`}
        >
          {filtersOpen ? '▾' : '▸'} {t('log.filters')}
        </button>
        {actions && (
          <>
            <span className="h-3.5 w-px shrink-0 bg-terminal-line" aria-hidden="true" />
            {actions}
          </>
        )}
      </div>

      {filtersOpen && (
        <div className="space-y-1 px-4 pb-2 pt-0.5">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-wrap gap-x-3 gap-y-0.5">
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => group.onToggle(option.value)}
                  aria-pressed={option.active}
                  className={`text-xs uppercase tracking-[0.16em] transition-colors focus:outline-none ${
                    option.active
                      ? (option.activeClassName ?? 'text-terminal-ink')
                      : 'text-terminal-dim line-through'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
