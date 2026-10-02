import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui';
import { PaneSearch } from './PaneSearch';

/**
 * Un foglio dello Studio di traduzione (originale o traduzione): testata con
 * titolo, stato e comandi, poi la pagina con il testo e la ricerca interna.
 */
export interface DocumentPageProps {
  label: string;
  eyebrow: string;
  eyebrowMeta?: React.ReactNode;
  subtitle?: string;
  subtitleAction?: React.ReactNode;
  readOnly?: boolean;
  highlighted?: boolean;
  statusBadge?: React.ReactNode;
  actions?: React.ReactNode | null;
  // Pulsante che apre il menu controlli testo, in fila con le azioni pagina.
  textMenuButton?: React.ReactNode;
  footer?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

export function DocumentPage({
  label,
  eyebrow,
  eyebrowMeta,
  subtitle,
  subtitleAction,
  readOnly = false,
  highlighted = false,
  statusBadge,
  actions,
  textMenuButton,
  footer,
  searchValue,
  onSearchChange,
  searchLabel,
  scrollRef,
  children,
}: DocumentPageProps) {
  const { t } = useTranslation();
  const searchable = Boolean(onSearchChange && searchLabel);
  const [searchOpen, setSearchOpen] = useState(false);
  // Il campo resta aperto finché c'è una query attiva.
  const showSearch = searchable && (searchOpen || Boolean(searchValue));

  const searchToggle = searchable ? (
    <IconButton
      size="sm"
      tone={showSearch ? 'accent' : 'default'}
      onClick={() => setSearchOpen((open) => !open)}
      title={t('document.searchInPane')}
      ariaLabel={t('document.searchInPane')}
      ariaPressed={showSearch}
    >
      <Search size={13} />
    </IconButton>
  ) : null;

  return (
    <section className={`relative bg-editorial-bg px-12 py-8 flex flex-col flex-1 min-h-0 min-w-0 ${
      highlighted ? 'ring-2 ring-inset ring-editorial-accent' : ''
    }`}>
      {/* Header: riga unica allineata al titolo — controlli pagina + pulsante menu testo a destra. */}
      <div className="shrink-0 mb-6 border-b border-editorial-divider-soft pb-4">
        <div className="flex items-center gap-2">
          <div className="text-caption font-bold uppercase tracking-section text-editorial-muted">
            {eyebrow}
          </div>
          {eyebrowMeta}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-display text-2xl italic tracking-tight text-editorial-ink">
              {label}
            </h3>
            {statusBadge}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {searchToggle}
            {actions}
            {(searchToggle || actions) && textMenuButton && (
              <span className="h-4 w-px bg-rule" aria-hidden="true" />
            )}
            {textMenuButton}
          </div>
        </div>
        {subtitle && (
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-caption font-bold uppercase tracking-section text-editorial-accent">
              {subtitle}
            </p>
            {subtitleAction}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className={`flex flex-col flex-1 min-h-0 rounded-2xl border border-rule bg-editorial-page px-7 py-4 shadow-page-card ${readOnly ? 'opacity-90' : ''}`}
      >
        {showSearch && onSearchChange && searchLabel ? (
          <PaneSearch
            value={searchValue ?? ''}
            onChange={onSearchChange}
            label={searchLabel}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- si apre da un'azione esplicita dell'utente (mostra ricerca)
            autoFocus
          />
        ) : null}
        {children}
      </div>
      {footer && (
        <div className="mt-3 pt-3 border-t border-editorial-divider-soft shrink-0">
          {footer}
        </div>
      )}
    </section>
  );
}
