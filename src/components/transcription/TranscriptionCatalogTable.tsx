import { useTranslation } from 'react-i18next';
import { CommandBar, Tooltip } from '../ui';
import { ROW_REVEAL_CLASSNAME } from '../ui/catalogStyles';
import type { TranscriptionCatalogEntry } from '../../services/transcriptionCatalogService';
import type { TranscriptionSort } from '../../utils/transcriptionCatalogFilters';
import { RenameField, useProgressFacts, type TranscriptionRowProps } from './TranscriptionCatalogRow';

/** Le colonne che si ordinano cliccando l'intestazione, con l'ordine che scelgono. */
const SORTABLE: Partial<Record<string, TranscriptionSort>> = {
  name: 'title', creator: 'creator', year: 'year', progress: 'progress',
};
const COLUMNS = ['name', 'creator', 'work', 'year', 'workspace', 'provider', 'progress', 'verified'] as const;

function TableRow({ entry, workspaceName, providerLabel, commands, renaming, onRename, onRenameCancel, onOpen }:
  TranscriptionRowProps & { providerLabel?: string }) {
  const { written } = useProgressFacts(entry);
  const work = entry.work;
  return (
    <tr className={`group/row border-b border-rule align-top hover:bg-surface-hover/50${
      entry.document.status === 'archived' ? ' opacity-60' : ''}`}>
      <td className="py-2 pr-3">
        {renaming ? (
          <RenameField initial={entry.document.title} onSave={onRename} onCancel={onRenameCancel} />
        ) : (
          <Tooltip label={entry.document.title} variant="panel" className="w-full min-w-0">
            <button type="button" onClick={onOpen}
              className="line-clamp-2 text-left font-display text-sm italic text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
              {entry.document.title}
            </button>
          </Tooltip>
        )}
      </td>
      <td className="max-w-[12rem] truncate py-2 pr-3 text-sm font-semibold text-editorial-ink">{work?.fields.creator}</td>
      <td className="max-w-[16rem] py-2 pr-3">
        {work && (
          <Tooltip label={work.source.title} variant="panel" className="w-full min-w-0">
            <span className="block truncate font-display text-sm italic text-editorial-ink">{work.source.title}</span>
          </Tooltip>
        )}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-sm tabular-nums text-editorial-ink">{work?.fields.date}</td>
      <td className="max-w-[10rem] truncate py-2 pr-3 text-xs text-editorial-muted">{workspaceName}</td>
      <td className="max-w-[9rem] truncate py-2 pr-3 text-xs text-editorial-muted">{providerLabel}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums text-editorial-muted">{written}</td>
      <td className="py-2 pr-3 text-right text-xs tabular-nums text-editorial-muted">{entry.verifiedPages || ''}</td>
      <td className={`w-10 py-1 ${ROW_REVEAL_CLASSNAME}`}>
        <CommandBar groups={commands} variant="menu" />
      </td>
    </tr>
  );
}

/**
 * Le trascrizioni come tabella, sul modello di quella della Biblioteca: una
 * riga per trascrizione, nome, opera, workspace e avanzamento.
 */
export function TranscriptionCatalogTable({ entries, sort, onSort, rowPropsFor, providerLabel }: {
  entries: TranscriptionCatalogEntry[];
  sort: TranscriptionSort;
  onSort: (sort: TranscriptionSort) => void;
  rowPropsFor: (entry: TranscriptionCatalogEntry) => TranscriptionRowProps;
  providerLabel: (entry: TranscriptionCatalogEntry) => string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <table className="w-full table-auto border-collapse">
      <thead>
        <tr className="border-b border-editorial-border text-left">
          {COLUMNS.map((column) => {
            const sortKey = SORTABLE[column];
            const label = t(`areas.transcriptions.catalog.table.${column}`);
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
          <TableRow key={entry.document.id} {...rowPropsFor(entry)} providerLabel={providerLabel(entry)} />
        ))}
      </tbody>
    </table>
  );
}
