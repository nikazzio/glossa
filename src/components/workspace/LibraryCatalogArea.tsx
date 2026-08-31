import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BookOpenText, LayoutGrid, Link2, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EASE_EDITORIAL } from '../layout/motion';
import { ClickPopover, EmptyState, IconButton, LinkChip, PopoverItem, SectionLabel } from '../ui';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useLibrarySavedViewsStore } from '../../stores/librarySavedViewsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { listIIIFProviders } from '../../services/iiifProviderService';
import { isTerminal } from '../../services/jobsService';
import { useJobsStore } from '../../stores/jobsStore';
import { LibraryFilterBar } from './LibraryFilterBar';
import { LibrarySourcePage } from './LibrarySourcePage';
import { SourceActionBar } from './SourceActionBar';
import { useSourceActions } from './useSourceActions';
import { CachedThumbnail } from '../common/CachedThumbnail';
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryCatalog,
  libraryLanguageOptions,
  orderLibraryCatalog,
} from '../../utils/libraryCatalogFilters';
import { libraryLocation } from '../../navigation/appLocation';
import type { LibraryCatalogEntry, SourceField, Workspace } from '../../types';

interface LibraryCatalogAreaProps {
  itemId?: string;
}

/** Catalogo delle fonti salvate in Biblioteca. */
export function LibraryCatalogArea({ itemId }: LibraryCatalogAreaProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const catalog = useSourceLibraryStore((state) => state.catalog);
  const detail = useSourceLibraryStore((state) => state.detail);
  const loadCatalog = useSourceLibraryStore((state) => state.loadCatalog);
  const removeSource = useSourceLibraryStore((state) => state.removeSource);
  const setArchived = useSourceLibraryStore((state) => state.setArchived);
  const correctField = useSourceLibraryStore((state) => state.correctField);
  const collections = useSourceLibraryStore((state) => state.collections);
  const loadCollections = useSourceLibraryStore((state) => state.loadCollections);
  const setCollection = useSourceLibraryStore((state) => state.setCollection);
  const addToNewCollection = useSourceLibraryStore((state) => state.addToNewCollection);
  const savedViews = useLibrarySavedViewsStore((state) => state.views);
  const loadSavedViews = useLibrarySavedViewsStore((state) => state.load);
  const saveView = useLibrarySavedViewsStore((state) => state.save);
  const removeSavedView = useLibrarySavedViewsStore((state) => state.remove);
  const loadDetail = useSourceLibraryStore((state) => state.loadDetail);
  const toggleWorkspaceLink = useSourceLibraryStore((state) => state.toggleWorkspaceLink);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const navigate = useUiStore((state) => state.navigate);
  const location = useUiStore((state) => state.location);
  const workspaceFilter = location.area === 'library' ? location.workspaceFilter : undefined;
  const view = useUiStore((state) => state.libraryView);
  const setView = useUiStore((state) => state.setLibraryView);
  const finishedDownloads = useJobsStore(
    (state) =>
      state.jobs.filter((job) => job.jobType === 'source_download' && isTerminal(job)).length,
  );
  const [filters, setFilters] = useState(EMPTY_LIBRARY_FILTERS);
  const [providers, setProviders] = useState<{ key: string; label: string }[]>([]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog, finishedDownloads]);

  useEffect(() => {
    if (itemId) void loadDetail(itemId);
  }, [itemId, loadDetail]);

  useEffect(() => {
    void loadCollections();
    void loadSavedViews();
  }, [loadCollections, loadSavedViews]);

  useEffect(() => {
    void listIIIFProviders()
      .then((list) =>
        setProviders(list.map((provider) => ({ key: provider.key, label: provider.label }))),
      )
      .catch(() => setProviders([]));
  }, []);

  const filteredCatalog = orderLibraryCatalog(filterLibraryCatalog(catalog, filters), filters.sort);
  // Le tendine offrono i valori delle opere che si stanno guardando: con le
  // archiviate nascoste, una lingua presente solo lì sarebbe una scelta che
  // non seleziona niente.
  const visibleCatalog = filters.includeArchived
    ? catalog
    : catalog.filter((entry) => entry.source.status === 'active');
  const providerOptions = providers.filter((provider) =>
    visibleCatalog.some((entry) => entry.providerKey === provider.key),
  );

  const openSource = (sourceId: string) => navigate(libraryLocation({ itemId: sourceId, workspaceFilter }));
  const openCatalogue = () => navigate(libraryLocation({ workspaceFilter }));

  /** Si torna al catalogo **dopo** che l'opera è sparita davvero: navigare
   *  prima farebbe intravedere l'opera ancora in elenco, come se la rimozione
   *  non avesse funzionato. */
  const removeAndLeave = async (sourceId: string) => {
    await removeSource(sourceId);
    openCatalogue();
  };

  /** Il messaggio lo mostra qui, ma l'errore prosegue: chi ha scritto la
   *  correzione deve restare nel campo, non vederlo chiudersi come se fosse
   *  stata salvata. */
  const correct = async (sourceId: string, field: SourceField, value: string | null) => {
    try {
      await correctField(sourceId, field, value);
    } catch (error: unknown) {
      toast.error(t('areas.library.fieldSaveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  /** Anche le collezioni raccontano il guasto invece di lasciarlo cadere: un
   *  errore che nessuno mostra è un comando che sembra non aver fatto niente. */
  const changeCollection = async (sourceId: string, collectionId: string, member: boolean) => {
    try {
      await setCollection(sourceId, collectionId, member);
    } catch (error: unknown) {
      toast.error(t('areas.library.collectionFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const createCollectionFor = async (sourceId: string, name: string) => {
    try {
      await addToNewCollection(sourceId, name);
    } catch (error: unknown) {
      toast.error(t('areas.library.collectionFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const archive = async (sourceId: string, archived: boolean) => {
    try {
      await setArchived(sourceId, archived);
    } catch (error: unknown) {
      toast.error(archived ? t('areas.library.archiveFailed') : t('areas.library.restoreFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const toggleLink = async (sourceId: string, workspaceId: string, linked: boolean) => {
    try {
      await toggleWorkspaceLink(workspaceId, sourceId, linked);
      await loadCatalog();
    } catch (error: unknown) {
      toast.error(t('areas.library.linkFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const isSourcePage = Boolean(itemId && detail && detail.source.id === itemId);
  const transition = { duration: 0.28, ease: EASE_EDITORIAL };
  const yOffset = reducedMotion ? 0 : 8;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isSourcePage && itemId && detail ? (
        <motion.div
          key={itemId}
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -yOffset }}
          transition={transition}
          className="flex h-full min-h-0 flex-1 flex-col"
        >
          <LibrarySourcePage
            detail={detail}
            entry={catalog.find((item) => item.source.id === itemId)}
            providerLabel={providers.find((provider) => provider.key === detail.providerKey)?.label}
            workspaces={workspaces}
            onBack={openCatalogue}
            onRemoved={() => void removeAndLeave(itemId)}
            onSetArchived={(archived) => archive(itemId, archived)}
            onRefresh={() => void loadCatalog()}
            onToggleLink={(workspaceId, linked) => void toggleLink(itemId, workspaceId, linked)}
            onCorrectField={(field, value) => correct(itemId, field, value)}
            collections={collections}
            onSetCollection={(collectionId, member) => changeCollection(itemId, collectionId, member)}
            onCreateCollection={(name) => createCollectionFor(itemId, name)}
          />
        </motion.div>
      ) : (
        <motion.div
          key="catalogue"
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -yOffset }}
          transition={transition}
          className="flex h-full min-h-0 flex-1 flex-col"
        >
          <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 md:px-6">
              <SectionLabel icon={BookOpenText} label={t('areas.library.title')} />
              <div className="flex items-center gap-1">
                <IconButton
                  size="sm"
                  tone={view === 'list' ? 'accent' : 'default'}
                  onClick={() => setView('list')}
                  title={t('areas.library.viewList')}
                  ariaPressed={view === 'list'}
                >
                  <List size={13} />
                </IconButton>
                <IconButton
                  size="sm"
                  tone={view === 'grid' ? 'accent' : 'default'}
                  onClick={() => setView('grid')}
                  title={t('areas.library.viewGrid')}
                  ariaPressed={view === 'grid'}
                >
                  <LayoutGrid size={13} />
                </IconButton>
              </div>
            </div>

            {catalog.length > 0 && (
              <LibraryFilterBar
                filters={filters}
                onChange={setFilters}
                languageOptions={libraryLanguageOptions(visibleCatalog)}
                providerOptions={providerOptions}
                collectionOptions={collections}
                workspaceOptions={workspaces}
                savedViews={savedViews}
                onSaveView={(name) => void saveView(name, filters)}
                onDeleteView={(viewId) => void removeSavedView(viewId)}
              />
            )}

            {catalog.length === 0 ? (
              <EmptyState
                icon={<BookOpenText size={20} />}
                message={t('areas.library.empty')}
                hint={t('areas.library.emptyHint')}
              />
            ) : filteredCatalog.length === 0 ? (
              <EmptyState icon={<BookOpenText size={20} />} message={t('areas.library.filters.noMatches')} />
            ) : (
              <div
                className={
                  view === 'grid'
                    ? 'grid grid-cols-2 gap-3 px-5 py-4 md:px-6 lg:grid-cols-3'
                    : 'flex flex-col divide-y divide-editorial-border/60 px-5 py-2 md:px-6'
                }
              >
                {filteredCatalog.map((entry) => (
                  <CatalogEntryRow
                    key={entry.source.id}
                    entry={entry}
                    view={view}
                    onOpen={() => openSource(entry.source.id)}
                    onRemove={() => void removeSource(entry.source.id)}
                    onSetArchived={(archived) => archive(entry.source.id, archived)}
                    onRefresh={() => void loadCatalog()}
                    workspaces={workspaces}
                    onToggleLink={(workspaceId, linked) =>
                      void toggleLink(entry.source.id, workspaceId, linked)
                    }
                  />
                ))}
              </div>
            )}
          </main>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CatalogEntryRow({
  entry,
  view,
  onOpen,
  onRemove,
  onSetArchived,
  onRefresh,
  workspaces,
  onToggleLink,
}: {
  entry: LibraryCatalogEntry;
  view: 'list' | 'grid';
  onOpen: () => void;
  onRemove: () => void;
  onSetArchived: (archived: boolean) => Promise<void>;
  onRefresh: () => void;
  workspaces: Workspace[];
  onToggleLink: (workspaceId: string, linked: boolean) => void;
}) {
  const { t } = useTranslation();
  const actions = useSourceActions(entry, { onRemove, onSetArchived, onRefresh });

  const [picking, setPicking] = useState(false);
  const linkedIds = new Set(entry.workspaces.map((link) => link.workspaceId));
  const available = workspaces.filter((workspace) => !linkedIds.has(workspace.id));

  const meta = [entry.creator, entry.date].filter(Boolean).join(' \u00b7 ');
  const summary = actions.summary;
  const availability =
    summary.availability === 'catalogued'
      ? t('areas.library.availabilityRemote')
      : summary.availability === 'complete'
        ? t('areas.library.availabilityComplete')
        : t('areas.library.availabilityPartial', {
            done: summary.presentPages,
            total: summary.expectedPages,
          });
  const extra = entry.sizes
    .filter((size) => size.sizeTag !== entry.principalSize && size.pages > 0)
    .reduce((total, size) => total + size.pages, 0);
  const extraNote = extra > 0 ? t('areas.library.extraFullSize', { count: extra }) : null;
  const pageCount =
    entry.expectedPages !== null && entry.expectedPages > 0
      ? t('areas.library.pageCount', { count: entry.expectedPages })
      : null;

  return (
    <article
      className={`${
        view === 'grid'
          ? 'flex flex-col gap-2 rounded-2xl border border-editorial-border bg-surface-elevated p-3'
          : 'flex items-center gap-3 py-2.5'
      }${actions.archived ? ' opacity-60' : ''}`}
    >
      <div className={view === 'grid' ? 'flex gap-3' : 'flex min-w-0 flex-1 items-center gap-3'}>
        <span className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-editorial-border bg-editorial-textbox">
          <CachedThumbnail
            url={entry.thumbnailUrl}
            providerKey={entry.providerKey}
            className="h-full w-full object-cover"
            fallback={<BookOpenText size={16} className="text-editorial-muted" aria-hidden="true" />}
          />
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <span className="block truncate font-display text-base italic text-editorial-ink">
            {entry.source.title}
          </span>
          {meta && <span className="mt-0.5 block truncate text-xs text-editorial-muted">{meta}</span>}
          <span className="mt-1 block text-xs text-editorial-muted">
            {[pageCount, availability, extraNote].filter(Boolean).join(' \u00b7 ')}
          </span>
        </button>
      </div>

      <span className="flex min-w-0 shrink-0 flex-wrap items-center gap-1">
        {entry.workspaces.map((link) => (
          <LinkChip
            key={link.workspaceId}
            label={link.workspaceName}
            hint={t('areas.library.unlinkFromWorkspace')}
            onClick={() => onToggleLink(link.workspaceId, false)}
          />
        ))}
        {available.length > 0 && (
          <ClickPopover
            open={picking}
            onOpenChange={setPicking}
            trigger={
              <IconButton
                size="sm"
                title={t('areas.library.linkToWorkspace')}
                ariaPressed={picking}
              >
                <Link2 size={13} />
              </IconButton>
            }
          >
            <ul className="flex min-w-40 flex-col py-1">
              {available.map((workspace) => (
                <li key={workspace.id} className="flex">
                  <PopoverItem
                    label={workspace.name}
                    onSelect={() => {
                      setPicking(false);
                      onToggleLink(workspace.id, true);
                    }}
                  />
                </li>
              ))}
            </ul>
          </ClickPopover>
        )}
      </span>

      <SourceActionBar entry={entry} actions={actions} />
    </article>
  );
}
