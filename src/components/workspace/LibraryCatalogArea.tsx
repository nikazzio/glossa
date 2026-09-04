import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import {
  AlertCircle,
  BookOpenText,
  Eraser,
  LayoutGrid,
  Link2,
  List,
  RefreshCw,
  SlidersHorizontal,
  Tags,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EASE_EDITORIAL, PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import {
  ClickPopover,
  EmptyState,
  IconButton,
  InspectorShell,
  LinkChip,
  PopoverItem,
  SectionLabel,
  Spinner,
  Tooltip,
} from '../ui';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
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
  hasActiveLibraryFilters,
  libraryLanguageOptions,
  NO_WORKSPACE,
  orderLibraryCatalog,
  type LibraryFilters,
} from '../../utils/libraryCatalogFilters';
import { libraryLocation, withWorkspaceFilter } from '../../navigation/appLocation';
import type { LibraryCatalogEntry, SourceCollection, SourceField, Workspace } from '../../types';

interface LibraryCatalogAreaProps {
  itemId?: string;
}

const FILTERS_COLLAPSED = 56;
const FILTERS_MIN = 280;
const FILTERS_MAX = 440;
const CATALOG_MIN = 420;

function clampWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(width, min), max);
}

function activeFilterCount(filters: LibraryFilters) {
  return [
    filters.query.trim() !== '',
    filters.kind !== '',
    filters.language !== '',
    filters.providerKey !== '',
    filters.availability !== '',
    filters.includeArchived,
    filters.collectionId !== '',
    filters.workspaceId !== '',
    filters.sort !== EMPTY_LIBRARY_FILTERS.sort,
  ].filter(Boolean).length;
}

/** Catalogo delle fonti salvate in Biblioteca. */
export function LibraryCatalogArea({ itemId }: LibraryCatalogAreaProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const catalog = useSourceLibraryStore((state) => state.catalog);
  const catalogLoading = useSourceLibraryStore((state) => state.catalogLoading);
  const catalogError = useSourceLibraryStore((state) => state.catalogError);
  const detail = useSourceLibraryStore((state) => state.detail);
  const detailLoading = useSourceLibraryStore((state) => state.detailLoading);
  const detailError = useSourceLibraryStore((state) => state.detailError);
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
  const resyncSource = useSourceLibraryStore((state) => state.resyncSource);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const navigate = useUiStore((state) => state.navigate);
  const location = useUiStore((state) => state.location);
  const workspaceFilter = location.area === 'library' ? location.workspaceFilter : undefined;
  const view = useUiStore((state) => state.libraryView);
  const setView = useUiStore((state) => state.setLibraryView);
  const filtersWidth = useUiStore((state) => state.libraryCatalogFiltersWidth);
  const filtersCollapsed = useUiStore((state) => state.libraryCatalogFiltersCollapsed);
  const setFiltersWidth = useUiStore((state) => state.setLibraryCatalogFiltersWidth);
  const setFiltersCollapsed = useUiStore((state) => state.setLibraryCatalogFiltersCollapsed);
  const finishedDownloads = useJobsStore(
    (state) =>
      state.jobs.filter((job) => job.jobType === 'source_download' && isTerminal(job)).length,
  );
  const [filters, setFilters] = useState(EMPTY_LIBRARY_FILTERS);
  const [providers, setProviders] = useState<{ key: string; label: string }[]>([]);
  const [filtersPanel, setFiltersPanel] = usePanelCallbackRef();
  const [dragging, setDragging] = useResizeDragging();
  const initialFiltersWidth = useRef(clampWidth(filtersWidth || 320, FILTERS_MIN, FILTERS_MAX));

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

  useEffect(() => {
    setFilters((current) => {
      if (workspaceFilter) {
        return current.workspaceId === workspaceFilter
          ? current
          : { ...current, workspaceId: workspaceFilter };
      }
      if (current.workspaceId && current.workspaceId !== NO_WORKSPACE) {
        return { ...current, workspaceId: '' };
      }
      return current;
    });
  }, [workspaceFilter]);

  useEffect(() => {
    if (!filtersPanel) return;
    if (filtersCollapsed && !filtersPanel.isCollapsed()) filtersPanel.collapse();
    if (!filtersCollapsed && filtersPanel.isCollapsed()) filtersPanel.expand();
  }, [filtersCollapsed, filtersPanel]);

  const changeFilters = (next: LibraryFilters) => {
    setFilters(next);
    const nextWorkspaceFilter =
      next.workspaceId && next.workspaceId !== NO_WORKSPACE ? next.workspaceId : null;
    if (nextWorkspaceFilter !== (workspaceFilter ?? null)) {
      navigate(withWorkspaceFilter(location, nextWorkspaceFilter));
    }
  };

  const persistFiltersLayout = () => {
    if (!filtersPanel) return;
    const collapsed = filtersPanel.isCollapsed();
    if (collapsed !== filtersCollapsed) setFiltersCollapsed(collapsed);
    if (!collapsed) {
      const px = Math.round(filtersPanel.getSize().inPixels);
      if (px !== filtersWidth) setFiltersWidth(px);
    }
  };

  const syncFiltersCollapsed = () => {
    const collapsed = filtersPanel?.isCollapsed() ?? false;
    if (collapsed !== filtersCollapsed) setFiltersCollapsed(collapsed);
  };

  const toggleFiltersCollapsed = (next: boolean) => {
    if (!filtersPanel) return;
    if (next) filtersPanel.collapse();
    else filtersPanel.expand();
    setFiltersCollapsed(next);
  };

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
      toast.error(t('areas.library.fieldSaveFailed'));
      throw error;
    }
  };

  const resync = async (sourceId: string) => {
    try {
      await resyncSource(sourceId);
      toast.success(t('areas.library.resyncSuccess'));
    } catch {
      toast.error(t('areas.library.resyncFailed'));
    }
  };

  /** Anche le collezioni raccontano il guasto invece di lasciarlo cadere: un
   *  errore che nessuno mostra è un comando che sembra non aver fatto niente. */
  const changeCollection = async (sourceId: string, collectionId: string, member: boolean) => {
    try {
      await setCollection(sourceId, collectionId, member);
    } catch {
      toast.error(t('areas.library.collectionFailed'));
    }
  };

  const createCollectionFor = async (sourceId: string, name: string) => {
    try {
      await addToNewCollection(sourceId, name);
    } catch {
      toast.error(t('areas.library.collectionFailed'));
    }
  };

  const archive = async (sourceId: string, archived: boolean) => {
    try {
      await setArchived(sourceId, archived);
    } catch {
      toast.error(archived ? t('areas.library.archiveFailed') : t('areas.library.restoreFailed'));
    }
  };

  const toggleLink = async (sourceId: string, workspaceId: string, linked: boolean) => {
    try {
      await toggleWorkspaceLink(workspaceId, sourceId, linked);
      await loadCatalog();
    } catch {
      toast.error(t('areas.library.linkFailed'));
    }
  };

  const isSourcePage = Boolean(itemId && detail && detail.source.id === itemId);
  const filterCount = activeFilterCount(filters);
  const transition = { duration: 0.28, ease: EASE_EDITORIAL };
  const yOffset = reducedMotion ? 0 : 8;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {itemId && !isSourcePage ? (
        <motion.div
          key={`source-state-${itemId}`}
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -yOffset }}
          transition={transition}
          className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-surface-panel"
        >
          {detailLoading || !detailError ? (
            <div className="flex flex-1 items-center justify-center gap-3 text-sm text-editorial-muted">
              <Spinner size={14} />
              <span>{t('areas.library.sourceLoading')}</span>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <EmptyState
                icon={<AlertCircle size={20} />}
                message={t('areas.library.sourceLoadError')}
                hint={t('areas.library.loadErrorHint')}
                className="flex flex-col items-center gap-3"
              />
              <div className="flex items-center gap-2">
                <IconButton size="sm" onClick={openCatalogue} title={t('areas.library.backToCatalogue')}>
                  <BookOpenText size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={() => void loadDetail(itemId)}
                  title={t('areas.library.retry')}
                >
                  <RefreshCw size={14} />
                </IconButton>
              </div>
            </div>
          )}
        </motion.div>
      ) : isSourcePage && itemId && detail ? (
        <motion.div
          key={itemId}
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -yOffset }}
          transition={transition}
          className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
        >
          <LibrarySourcePage
            detail={detail}
            entry={catalog.find((item) => item.source.id === itemId)}
            providerLabel={providers.find((provider) => provider.key === detail.providerKey)?.label}
            workspaces={workspaces}
            onBack={openCatalogue}
            onRemoved={() => removeAndLeave(itemId)}
            onSetArchived={(archived) => archive(itemId, archived)}
            onRefresh={() => void loadCatalog()}
            onToggleLink={(workspaceId, linked) => void toggleLink(itemId, workspaceId, linked)}
            onCorrectField={(field, value) => correct(itemId, field, value)}
            collections={collections}
            onSetCollection={(collectionId, member) => changeCollection(itemId, collectionId, member)}
            onCreateCollection={(name) => createCollectionFor(itemId, name)}
            onResyncSource={() => resync(itemId)}
          />
        </motion.div>
      ) : (
        <motion.div
          key="catalogue"
          initial={{ opacity: 0, y: yOffset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -yOffset }}
          transition={transition}
          className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
        >
          <Group
            orientation="horizontal"
            className="flex h-full min-h-0 flex-1"
            onLayoutChanged={persistFiltersLayout}
          >
            <Panel id="library-catalog" minSize={CATALOG_MIN} className="flex min-w-0 flex-col">
              <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
                <div className="flex items-center justify-between gap-3 px-5 pt-5 md:px-6">
                  <SectionLabel icon={BookOpenText} label={t('areas.library.title')} />
                  {catalog.length > 0 && (
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
                  )}
                </div>

                {catalogLoading && catalog.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center gap-3 text-sm text-editorial-muted">
                    <Spinner size={14} />
                    <span>{t('areas.library.catalogLoading')}</span>
                  </div>
                ) : catalogError && catalog.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                    <EmptyState
                      icon={<AlertCircle size={20} />}
                      message={t('areas.library.catalogLoadError')}
                      hint={t('areas.library.loadErrorHint')}
                      className="flex flex-col items-center gap-3"
                    />
                    <IconButton size="sm" onClick={() => void loadCatalog()} title={t('areas.library.retry')}>
                      <RefreshCw size={14} />
                    </IconButton>
                  </div>
                ) : catalog.length === 0 ? (
                  <EmptyState
                    icon={<BookOpenText size={20} />}
                    message={t('areas.library.empty')}
                    hint={t('areas.library.emptyHint')}
                  />
                ) : filteredCatalog.length === 0 ? (
                  <EmptyState
                    icon={<BookOpenText size={20} />}
                    message={t('areas.library.filters.noMatches')}
                  />
                ) : (
                  <div
                    className={
                      view === 'grid'
                        ? 'grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3 px-5 py-4 md:px-6'
                        : 'flex flex-col divide-y divide-editorial-border/60 px-5 py-2 md:px-6'
                    }
                  >
                    {filteredCatalog.map((entry) => (
                      <CatalogEntryRow
                        key={entry.source.id}
                        entry={entry}
                        view={view}
                        providerLabel={providers.find((provider) => provider.key === entry.providerKey)?.label}
                        onOpen={() => openSource(entry.source.id)}
                        onRemove={() => removeSource(entry.source.id)}
                        onSetArchived={(archived) => archive(entry.source.id, archived)}
                        onRefresh={() => void loadCatalog()}
                        workspaces={workspaces}
                        onToggleLink={(workspaceId, linked) =>
                          void toggleLink(entry.source.id, workspaceId, linked)
                        }
                        collections={collections}
                        onSetCollection={(collectionId, member) =>
                          void changeCollection(entry.source.id, collectionId, member)
                        }
                      />
                    ))}
                  </div>
                )}
              </main>
            </Panel>

            <Separator
              onPointerDown={() => setDragging(true)}
              className={`group/sep relative z-10 flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
                dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
              }`}
            >
              <span
                aria-hidden="true"
                className={`relative h-7 w-px rounded-full transition-colors ${
                  dragging
                    ? 'bg-editorial-accent'
                    : 'bg-editorial-border group-hover/sep:bg-editorial-accent/60'
                }`}
              />
            </Separator>

            <Panel
              id="library-catalog-filters"
              collapsible
              collapsedSize={FILTERS_COLLAPSED}
              minSize={FILTERS_MIN}
              maxSize={FILTERS_MAX}
              defaultSize={initialFiltersWidth.current}
              panelRef={setFiltersPanel}
              onResize={syncFiltersCollapsed}
              className={`flex min-w-0 flex-col border-l border-editorial-border bg-surface-panel ${
                dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
              }`}
            >
              <InspectorShell
                ariaLabel={t('areas.library.filters.title')}
                tabs={[]}
                activeTab=""
                onTabChange={() => undefined}
                panelIcon={<SlidersHorizontal size={15} />}
                panelLabel={t('areas.library.filters.title')}
                collapsed={filtersCollapsed}
                onCollapsedChange={toggleFiltersCollapsed}
                ownsPanelSemantics={false}
                headerActions={
                  hasActiveLibraryFilters(filters) ? (
                    <IconButton
                      size="sm"
                      onClick={() => changeFilters(EMPTY_LIBRARY_FILTERS)}
                      title={t('areas.library.filters.clear')}
                    >
                      <Eraser size={13} />
                    </IconButton>
                  ) : undefined
                }
                collapsedContent={
                  filterCount > 0 ? (
                    <Tooltip label={t('areas.library.filters.activeCount', { count: filterCount })} side="left">
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-editorial-accent/10 px-1.5 text-xs font-semibold tabular-nums text-editorial-accent">
                        {filterCount}
                      </span>
                    </Tooltip>
                  ) : undefined
                }
              >
                <LibraryFilterBar
                  filters={filters}
                  onChange={changeFilters}
                  languageOptions={libraryLanguageOptions(visibleCatalog)}
                  providerOptions={providerOptions}
                  collectionOptions={collections}
                  workspaceOptions={workspaces}
                  savedViews={savedViews}
                  onSaveView={(name) => void saveView(name, filters)}
                  onDeleteView={(viewId) => void removeSavedView(viewId)}
                />
              </InspectorShell>
            </Panel>
          </Group>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CatalogEntryRow({
  entry,
  view,
  providerLabel,
  onOpen,
  onRemove,
  onSetArchived,
  onRefresh,
  workspaces,
  onToggleLink,
  collections,
  onSetCollection,
}: {
  entry: LibraryCatalogEntry;
  view: 'list' | 'grid';
  providerLabel?: string;
  onOpen: () => void;
  onRemove: () => Promise<void>;
  onSetArchived: (archived: boolean) => Promise<void>;
  onRefresh: () => void;
  workspaces: Workspace[];
  onToggleLink: (workspaceId: string, linked: boolean) => void;
  collections: SourceCollection[];
  onSetCollection: (collectionId: string, member: boolean) => void;
}) {
  const { t } = useTranslation();
  const actions = useSourceActions(entry, { onRemove, onSetArchived, onRefresh });

  const [pickingWorkspace, setPickingWorkspace] = useState(false);
  const [pickingCollection, setPickingCollection] = useState(false);
  const linkedWorkspaceIds = new Set(entry.workspaces.map((link) => link.workspaceId));
  const availableWorkspaces = workspaces.filter((workspace) => !linkedWorkspaceIds.has(workspace.id));
  const linkedCollectionIds = new Set(entry.collections.map((collection) => collection.id));
  const linkedCollections = collections.filter((collection) => linkedCollectionIds.has(collection.id));
  const availableCollections = collections.filter((collection) => !linkedCollectionIds.has(collection.id));

  const authorDate = [entry.creator, entry.date].filter(Boolean).join(' \u00b7 ');
  const summary = actions.summary;
  const availability =
    summary.availability === 'complete'
      ? t('areas.library.localImagesAll')
      : summary.availability === 'partial'
        ? t('areas.library.localImagesSome', {
          done: summary.presentPages,
          total: summary.expectedPages,
        })
        : t('areas.library.availabilityRemote');
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
      <div className={view === 'grid' ? 'flex min-w-0 flex-col gap-2' : 'flex min-w-0 flex-1 flex-col'}>
        <button
          type="button"
          onClick={onOpen}
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
            <span className="block truncate font-display text-base italic text-editorial-ink">
              {entry.source.title}
            </span>
            {authorDate && (
              <span className="mt-0.5 block truncate text-xs text-editorial-muted">
                {authorDate}
              </span>
            )}
            {providerLabel && (
              <span className="mt-0.5 block truncate text-xs font-semibold text-editorial-ink">
                {providerLabel}
              </span>
            )}
            <span className="mt-1 block truncate text-xs text-editorial-muted">
              {pageCount}
              {pageCount && ' \u00b7 '}
              {availability}
            </span>
          </span>
        </button>

        <div className={`${view === 'grid' ? '' : 'ml-[3.75rem]'} mt-1.5 flex flex-wrap items-center gap-1`}>
            {entry.workspaces.map((link) => (
              <LinkChip
                key={link.workspaceId}
                label={link.workspaceName}
                hint={t('areas.library.unlinkFromWorkspace')}
                onClick={() => onToggleLink(link.workspaceId, false)}
              />
            ))}
            {linkedCollections.map((collection) => (
              <LinkChip
                key={collection.id}
                label={collection.name}
                hint={t('areas.library.removeFromCollection', { name: collection.name })}
                onClick={() => onSetCollection(collection.id, false)}
              />
            ))}
            {availableWorkspaces.length > 0 && (
              <ClickPopover
                open={pickingWorkspace}
                onOpenChange={setPickingWorkspace}
                trigger={
                  <IconButton
                    size="xs"
                    title={t('areas.library.linkToWorkspace')}
                    ariaPressed={pickingWorkspace}
                  >
                    <Link2 size={12} />
                  </IconButton>
                }
              >
                <ul className="flex min-w-40 flex-col py-1">
                  {availableWorkspaces.map((workspace) => (
                    <li key={workspace.id} className="flex">
                      <PopoverItem
                        label={workspace.name}
                        onSelect={() => {
                          setPickingWorkspace(false);
                          onToggleLink(workspace.id, true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </ClickPopover>
            )}
            {availableCollections.length > 0 && (
              <ClickPopover
                open={pickingCollection}
                onOpenChange={setPickingCollection}
                trigger={
                  <IconButton
                    size="xs"
                    title={t('areas.library.addToCollection')}
                    ariaPressed={pickingCollection}
                  >
                    <Tags size={12} />
                  </IconButton>
                }
              >
                <ul className="flex min-w-40 flex-col py-1">
                  {availableCollections.map((collection) => (
                    <li key={collection.id} className="flex">
                      <PopoverItem
                        label={collection.name}
                        onSelect={() => {
                          setPickingCollection(false);
                          onSetCollection(collection.id, true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </ClickPopover>
            )}
        </div>
      </div>

      <SourceActionBar entry={entry} actions={actions} />
    </article>
  );
}
