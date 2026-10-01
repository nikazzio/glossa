import type { DragEvent, MouseEvent } from 'react';
import { BookOpenText, Check, FilePen, Link2, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CompletionBar, IconButton, LinkChip, Tooltip } from '../ui';
import { ROW_REVEAL_CLASSNAME } from '../ui/catalogStyles';
import { CachedThumbnail } from '../common/CachedThumbnail';
import { WorkIdentity } from '../common/WorkIdentity';
import { SourceActionBar } from './SourceActionBar';
import { useSourceActions } from './useSourceActions';
import { ListPicker } from './ListPicker';
import { humanSize } from '../../utils';
import type { LibraryCatalogEntry, SourceCollection, Workspace } from '../../types';

/** Come si sceglie una riga: da sola, aggiungendola o togliendola, oppure fino a lei. */
export type RowPick = 'only' | 'toggle' | 'range';

/** Quanti collegamenti si vedono su una copertina prima del «+N». */
const GRID_CHIPS = 2;

/** Il tipo dei dati trascinati da una riga: gli identificativi delle opere. */
export const DRAGGED_SOURCES = 'application/x-glossa-sources';

interface LibraryCatalogRowProps {
  entry: LibraryCatalogEntry;
  view: 'list' | 'grid';
  providerLabel?: string;
  selected: boolean;
  /** Almeno una riga è scelta: la casella di scelta resta visibile su tutte. */
  selecting: boolean;
  onPick: (pick: RowPick) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onOpen: () => void;
  onRemove: () => Promise<void>;
  onSetArchived: (archived: boolean) => Promise<void>;
  onRefresh: () => void;
  workspaces: Workspace[];
  onToggleLink: (workspaceId: string, linked: boolean) => void;
  collections: SourceCollection[];
  onSetCollection: (collectionId: string, member: boolean) => void;
  onCreateTranscription: () => void;
}

/**
 * Una riga del catalogo: l'opera, i suoi collegamenti e lo stato. In basso a
 * sinistra si collega a workspace e raccolte; in alto a destra, sulla prima
 * riga, i comandi dell'opera in tre gruppi (trascrizione | immagini |
 * archivio). Compaiono al passaggio del puntatore o quando la riga ha il
 * fuoco: su trenta righe, centinaia di icone sempre accese erano rumore.
 *
 * Un click apre l'opera; con Ctrl (⌘ sul Mac) la aggiunge alla scelta, con
 * Maiuscolo sceglie fino a lei. La riga si trascina su una raccolta.
 */
export function LibraryCatalogRow({
  entry,
  view,
  providerLabel,
  selected,
  selecting,
  onPick,
  onDragStart,
  onOpen,
  onRemove,
  onSetArchived,
  onRefresh,
  workspaces,
  onToggleLink,
  collections,
  onSetCollection,
  onCreateTranscription,
}: LibraryCatalogRowProps) {
  const { t } = useTranslation();
  const actions = useSourceActions(entry, { onRemove, onSetArchived, onRefresh });
  const { summary } = actions;

  const linkedWorkspaceIds = new Set(entry.workspaces.map((link) => link.workspaceId));
  const linkedCollectionIds = new Set(entry.collections.map((collection) => collection.id));

  /**
   * La riga piccola sotto il titolo: biblioteca, pagine, misure presenti,
   * spazio, e a che punto è il lavoro. Numeri e unità, niente frasi.
   */
  const facts = [
    providerLabel,
    entry.expectedPages ? t('areas.library.pageCountShort', { count: entry.expectedPages }) : null,
    entry.localPages > 0 && entry.sizes.some((size) => size.pages > 0)
      ? t('areas.library.sizesShort', { sizes: entry.sizes.filter((size) => size.pages > 0).map((size) => size.sizeTag).join('+') })
      : null,
    entry.localBytes > 0 ? humanSize(entry.localBytes) : null,
    entry.localPages === 0 ? t('areas.library.availabilityRemoteShort') : null,
    entry.stage !== 'none' ? t(`areas.library.stage.${entry.stage}`) : null,
  ].filter(Boolean).join(' · ');
  // La barra c'è solo quando qualcosa è sul computer: su un libro tutto online
  // sarebbe una barra vuota su ogni riga, cioè rumore.
  const total = summary.expectedPages > 0 ? summary.expectedPages : entry.expectedPages ?? 0;
  const done = Math.min(summary.presentPages, total > 0 ? total : summary.presentPages);
  const progress = total > 0 ? Math.min(1, done / total) : null;
  const progressLabel = summary.availability === 'complete' ? '100%' : progress !== null ? `${done}/${total}` : String(done);

  const open = (event: MouseEvent) => {
    if (event.shiftKey) onPick('range');
    else if (event.ctrlKey || event.metaKey) onPick('toggle');
    else onOpen();
  };
  const isGrid = view === 'grid';
  const chips = [
    ...entry.workspaces.map((link) => ({
      key: `w:${link.workspaceId}`,
      label: link.workspaceName,
      hint: t('areas.library.unlinkFromWorkspace'),
      remove: () => onToggleLink(link.workspaceId, false),
    })),
    ...entry.collections.map((collection) => ({
      key: `c:${collection.id}`,
      label: collection.name,
      hint: t('areas.library.removeFromCollection', { name: collection.name }),
      remove: () => onSetCollection(collection.id, false),
    })),
  ];
  // Nelle copertine ne stanno pochi: gli altri si contano, e si leggono al
  // passaggio del puntatore. Tagliarli e basta lasciava comandi invisibili
  // raggiungibili col tabulatore.
  const visibleChips = isGrid ? chips.slice(0, GRID_CHIPS) : chips;
  const hiddenChips = isGrid ? chips.slice(GRID_CHIPS) : [];
  const shownChips = visibleChips.map((chip) => (
    <LinkChip key={chip.key} label={chip.label} hint={chip.hint} onClick={chip.remove} />
  ));
  const transcriptionButton = (
    <IconButton size="xs" title={t('transcription.createFromSource')} onClick={onCreateTranscription}>
      <FilePen size={12} />
    </IconButton>
  );
  const revealed = ROW_REVEAL_CLASSNAME;

  return (
    <article
      draggable
      onDragStart={onDragStart}
      className={`group/row ${
        view === 'grid'
          ? 'flex h-full flex-col justify-between gap-2 rounded-2xl border bg-surface-elevated p-3'
          : 'flex items-start gap-3 rounded px-1 py-2.5'
      } ${selected ? 'border-editorial-accent bg-editorial-accent/5' : 'border-editorial-border'}${actions.archived ? ' opacity-60' : ''}`}
    >
      <div className={isGrid ? 'flex min-w-0 flex-col gap-2' : 'flex min-w-0 flex-1 items-start gap-2'}>
        <IconButton
          size="xs"
          tone={selected ? 'accent' : 'default'}
          ariaPressed={selected}
          title={selected ? t('areas.library.selection.deselect') : t('areas.library.selection.select')}
          onClick={() => onPick('toggle')}
          className={`mt-5 ${selected || selecting ? '' : revealed}`}
        >
          <Check size={12} />
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={open}
            className="flex w-full min-w-0 items-center gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-editorial-border bg-editorial-textbox">
              <CachedThumbnail
                url={entry.thumbnailUrl}
                versionId={entry.versionId}
                providerKey={entry.providerKey}
                className="h-full w-full object-cover"
                fallback={<BookOpenText size={16} className="text-editorial-muted" aria-hidden="true" />}
              />
            </span>
            <span className="min-w-0 flex-1">
              <WorkIdentity
                work={{
                  title: entry.source.title,
                  creator: entry.fields.creator,
                  date: entry.fields.date,
                  place: entry.fields.origin_place,
                  publisher: entry.fields.publisher,
                }}
                details={
                  <>
                    <span className="min-w-0 truncate">{facts}</span>
                    {entry.localPages > 0 && (
                      <CompletionBar ratio={progress ?? 1} label={progressLabel}
                        ariaLabel={t('areas.library.filters.facet.availability')}
                        complete={summary.availability === 'complete'} />
                    )}
                  </>
                }
              />
            </span>
          </button>

          {/* Nella griglia i collegamenti stanno su una riga sola: le schede
              devono essere tutte uguali, e a stringersi è il titolo. */}
          <div className={`${isGrid ? 'flex-nowrap' : 'ml-[3.75rem] flex-wrap'} mt-1.5 flex min-w-0 items-center gap-1`}>
            <span className={isGrid ? 'flex min-w-0 flex-1 items-center gap-1 overflow-hidden' : 'contents'}>
              {shownChips}
              {hiddenChips.length > 0 && (
                <Tooltip label={hiddenChips.map((chip) => chip.label).join(' · ')}>
                  <span className="shrink-0 text-xs tabular-nums text-editorial-muted">+{hiddenChips.length}</span>
                </Tooltip>
              )}
            </span>
            <span className={`flex shrink-0 items-center gap-1 ${revealed}`}>
              <ListPicker icon={<Link2 size={12} />} title={t('areas.library.linkToWorkspace')}
                items={workspaces.filter((workspace) => !linkedWorkspaceIds.has(workspace.id))
                  .map((workspace) => ({ id: workspace.id, label: workspace.name }))}
                onPick={(workspaceId) => onToggleLink(workspaceId, true)} />
              <ListPicker icon={<Tags size={12} />} title={t('areas.library.addToCollection')}
                items={collections.filter((collection) => !linkedCollectionIds.has(collection.id))
                  .map((collection) => ({ id: collection.id, label: collection.name }))}
                onPick={(collectionId) => onSetCollection(collectionId, true)} />
              {isGrid && transcriptionButton}
            </span>
          </div>
        </div>
      </div>

      <div className={actions.runningJob ? '' : revealed}>
        {isGrid
          ? <SourceActionBar entry={entry} actions={actions} />
          : <SourceActionBar entry={entry} actions={actions} variant="inline" leading={transcriptionButton} />}
      </div>
    </article>
  );
}
