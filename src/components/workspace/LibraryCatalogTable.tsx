import type { DragEvent, MouseEvent } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip } from '../ui';
import { ROW_REVEAL_CLASSNAME } from '../ui/catalogStyles';
import { imprint } from '../common/WorkIdentity';
import { SourceActionBar } from './SourceActionBar';
import { useSourceActions } from './useSourceActions';
import type { RowPick } from './LibraryCatalogRow';
import type { LibrarySort } from '../../utils/libraryCatalogFilters';
import type { LibraryCatalogEntry } from '../../types';

/** Le colonne che si ordinano cliccando l'intestazione, con l'ordine che scelgono. */
const SORTABLE: Partial<Record<string, LibrarySort>> = { creator: 'creator', title: 'title', year: 'year' };
const COLUMNS = ['creator', 'title', 'year', 'imprint', 'provider', 'pages', 'state'] as const;

interface RowHandlers {
  onPick: (pick: RowPick) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onOpen: () => void;
  onRemove: () => Promise<void>;
  onSetArchived: (archived: boolean) => Promise<void>;
  onRefresh: () => void;
}

function TableRow({ entry, providerLabel, selected, selecting, handlers }: {
  entry: LibraryCatalogEntry;
  providerLabel?: string;
  selected: boolean;
  selecting: boolean;
  handlers: RowHandlers;
}) {
  const { t } = useTranslation();
  const actions = useSourceActions(entry, handlers);
  const { summary } = actions;
  const revealed = ROW_REVEAL_CLASSNAME;
  const download = entry.localPages === 0
    ? t('areas.library.availabilityRemoteShort')
    : summary.availability === 'complete' ? '100%' : `${summary.presentPages}/${summary.expectedPages || entry.expectedPages || '?'}`;
  const state = [entry.stage !== 'none' ? t(`areas.library.stage.${entry.stage}`) : null, download].filter(Boolean).join(' · ');
  const open = (event: MouseEvent) => {
    if (event.shiftKey) handlers.onPick('range');
    else if (event.ctrlKey || event.metaKey) handlers.onPick('toggle');
    else handlers.onOpen();
  };

  return (
    <tr draggable onDragStart={handlers.onDragStart}
      className={`group/row border-b border-rule align-top ${selected ? 'bg-editorial-accent/5' : 'hover:bg-surface-hover/50'}${actions.archived ? ' opacity-60' : ''}`}>
      <td className="w-8 py-2 pl-1">
        <IconButton size="xs" tone={selected ? 'accent' : 'default'} ariaPressed={selected}
          title={selected ? t('areas.library.selection.deselect') : t('areas.library.selection.select')}
          onClick={() => handlers.onPick('toggle')} className={selected || selecting ? '' : revealed}>
          <Check size={12} />
        </IconButton>
      </td>
      <td className="max-w-[12rem] truncate py-2 pr-3 text-sm font-semibold text-editorial-ink">{entry.fields.creator}</td>
      <td className="py-2 pr-3">
        <Tooltip label={entry.source.title} variant="panel" className="w-full min-w-0">
          <button type="button" onClick={open}
            className="line-clamp-2 text-left font-display text-sm italic text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
            {entry.source.title}
          </button>
        </Tooltip>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-sm tabular-nums text-editorial-ink">{entry.fields.date}</td>
      <td className="max-w-[12rem] truncate py-2 pr-3 text-xs text-editorial-muted">{imprint(entry.fields.origin_place, entry.fields.publisher)}</td>
      <td className="max-w-[9rem] truncate py-2 pr-3 text-xs text-editorial-muted">{providerLabel}</td>
      <td className="py-2 pr-3 text-right text-xs tabular-nums text-editorial-muted">{entry.expectedPages ?? ''}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-xs text-editorial-muted">{state}</td>
      <td className={`w-10 py-1 ${actions.runningJob ? '' : revealed}`}>
        <SourceActionBar entry={entry} actions={actions} />
      </td>
    </tr>
  );
}

/**
 * Il catalogo come tabella, per chi ha molti titoli: una riga per opera, le
 * colonne che servono a riconoscerla e a confrontarla. Autore, titolo e anno
 * si ordinano cliccando l'intestazione.
 */
export function LibraryCatalogTable({ entries, sort, onSort, providerLabel, isSelected, selecting, handlersFor }: {
  entries: LibraryCatalogEntry[];
  sort: LibrarySort;
  onSort: (sort: LibrarySort) => void;
  providerLabel: (entry: LibraryCatalogEntry) => string | undefined;
  isSelected: (entry: LibraryCatalogEntry) => boolean;
  selecting: boolean;
  handlersFor: (entry: LibraryCatalogEntry) => RowHandlers;
}) {
  const { t } = useTranslation();
  return (
    <table className="w-full table-auto border-collapse">
      <thead>
        <tr className="border-b border-editorial-border text-left">
          <th className="w-8" aria-label={t('areas.library.selection.label')} />
          {COLUMNS.map((column) => {
            const sortKey = SORTABLE[column];
            const label = t(`areas.library.table.${column}`);
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
          <TableRow key={entry.source.id} entry={entry} providerLabel={providerLabel(entry)}
            selected={isSelected(entry)} selecting={selecting} handlers={handlersFor(entry)} />
        ))}
      </tbody>
    </table>
  );
}
