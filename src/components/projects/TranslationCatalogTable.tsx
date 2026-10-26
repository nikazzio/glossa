import { useTranslation } from 'react-i18next';
import { CommandBar, Tooltip } from '../ui';
import { ROW_REVEAL_CLASSNAME } from '../ui/catalogStyles';
import type { TranslationCatalogEntry } from '../../services/translationCatalogService';
import type { TranslationSort } from '../../utils/translationCatalogFilters';
import { timestampOf } from '../../utils/libraryCatalogFilters';
import { TranslationRenameField, useLanguagePair, useTranslationProgress, type TranslationRowProps } from './TranslationCatalogRow';

/** Le colonne che si ordinano cliccando l'intestazione, con l'ordine che scelgono. */
const SORTABLE: Partial<Record<string, TranslationSort>> = { name: 'name', progress: 'progress', edited: 'edited' };
const COLUMNS = ['name', 'languages', 'workspace', 'progress', 'verified', 'edited'] as const;

function TableRow({ entry, commands, renaming, onRename, onRenameCancel, onOpen, disabled, formatDate }:
  TranslationRowProps & { formatDate: (value: string) => string }) {
  const languages = useLanguagePair(entry);
  const { translated } = useTranslationProgress(entry);
  return (
    <tr className="group/row border-b border-rule align-top hover:bg-surface-hover/50">
      <td className="py-2 pr-3">
        {renaming ? (
          <TranslationRenameField initial={entry.name} onSave={onRename} onCancel={onRenameCancel} />
        ) : (
          <Tooltip label={entry.name} variant="panel" className="w-full min-w-0">
            <button type="button" onClick={onOpen} disabled={disabled}
              className="line-clamp-2 text-left font-display text-sm italic text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-wait">
              {entry.name}
            </button>
          </Tooltip>
        )}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-sm text-editorial-ink">{languages}</td>
      <td className="max-w-[10rem] truncate py-2 pr-3 text-xs text-editorial-muted">{entry.workspaceName}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums text-editorial-muted">{translated}</td>
      <td className="py-2 pr-3 text-right text-xs tabular-nums text-editorial-muted">{entry.verifiedChunks || ''}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums text-editorial-muted">{formatDate(entry.updatedAt)}</td>
      <td className={`w-10 py-1 ${ROW_REVEAL_CLASSNAME}`}>
        <CommandBar groups={commands} variant="menu" />
      </td>
    </tr>
  );
}

/** Le traduzioni come tabella, sul modello di quella delle Trascrizioni. */
export function TranslationCatalogTable({ entries, sort, onSort, rowPropsFor }: {
  entries: TranslationCatalogEntry[];
  sort: TranslationSort;
  onSort: (sort: TranslationSort) => void;
  rowPropsFor: (entry: TranslationCatalogEntry) => TranslationRowProps;
}) {
  const { t, i18n } = useTranslation();
  const formatDate = (value: string) => {
    const timestamp = timestampOf(value);
    return Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(timestamp))
      : '—';
  };
  return (
    <table className="w-full table-auto border-collapse">
      <thead>
        <tr className="border-b border-editorial-border text-left">
          {COLUMNS.map((column) => {
            const sortKey = SORTABLE[column];
            const label = t(`areas.translations.catalog.table.${column}`);
            return (
              <th key={column} scope="col" aria-sort={sortKey && sortKey === sort ? 'ascending' : undefined}
                className="py-2 pr-3 text-xs font-semibold uppercase tracking-caption text-editorial-muted">
                {sortKey ? (
                  <button type="button" onClick={() => onSort(sortKey)}
                    className={`uppercase tracking-caption focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${sortKey === sort ? 'text-editorial-accent' : 'hover:text-editorial-ink'}`}>
                    {label}
                  </button>
                ) : label}
              </th>
            );
          })}
          <th className="w-10" aria-label={t('areas.library.moreActions')} />
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <TableRow key={entry.id} {...rowPropsFor(entry)} formatDate={formatDate} />
        ))}
      </tbody>
    </table>
  );
}
