import { useEffect, useState, type DragEvent } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, BookOpenText, LayoutGrid, List, RefreshCw, Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EASE_EDITORIAL, MOTION_DURATION, MOTION_SHIFT } from '../layout/motion';
import { EmptyState, IconButton, ListReveal, Spinner } from '../ui';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useLibrarySavedViewsStore } from '../../stores/librarySavedViewsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { listIIIFProviders } from '../../services/iiifProviderService';
import { isTerminal } from '../../services/jobsService';
import { useJobsStore } from '../../stores/jobsStore';
import { LibraryShelves } from './LibraryShelves';
import { LibraryQuickFilters } from './LibraryQuickFilters';
import { LibrarySourcePage } from './LibrarySourcePage';
import { LibraryCatalogRow, DRAGGED_SOURCES, type RowPick } from './LibraryCatalogRow';
import { LibraryCatalogTable } from './LibraryCatalogTable';
import { groupCatalog } from '../../utils/libraryGrouping';
import { romanNumeral } from '../../utils/workYear';
import { LibrarySelectionBar } from './LibrarySelectionBar';
import { useCatalogSelection } from './useCatalogSelection';
import { enqueueEntryDownload } from '../../services/sourceDownload';
import { CreateTranscriptionDialog } from '../transcription/CreateTranscriptionDialog';
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_FACETS,
  collectionCounts,
  facetCounts,
  filterLibraryCatalog,
  hasActiveLibraryFilters,
  orderLibraryCatalog,
  shelfCounts,
  type LibraryFilters,
} from '../../utils/libraryCatalogFilters';
import { libraryLocation, transcriptionsLocation, withWorkspaceFilter } from '../../navigation/appLocation';
import type { IIIFProvider, LibraryCatalogEntry, SourceField } from '../../types';

interface LibraryCatalogAreaProps {
  itemId?: string;
}

/**
 * Catalogo delle fonti salvate in Biblioteca: scaffali e raccolte a sinistra,
 * ricerca e filtri rapidi sopra l'elenco.
 */
export function LibraryCatalogArea({ itemId }: LibraryCatalogAreaProps) {
  const { t } = useTranslation();
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
  const createCollection = useSourceLibraryStore((state) => state.createCollection);
  const deleteCollection = useSourceLibraryStore((state) => state.deleteCollection);
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
  const openedAt = useUiStore((state) => state.libraryOpenedAt);
  const grouping = useUiStore((state) => state.libraryGrouping);
  const setGrouping = useUiStore((state) => state.setLibraryGrouping);
  const markOpened = useUiStore((state) => state.markLibraryOpened);
  const finishedDownloads = useJobsStore(
    (state) =>
      state.jobs.filter((job) => job.jobType === 'source_download' && isTerminal(job)).length,
  );
  const [filters, setFilters] = useState(EMPTY_LIBRARY_FILTERS);
  const [providers, setProviders] = useState<IIIFProvider[]>([]);
  const [transcriptionTarget, setTranscriptionTarget] = useState<LibraryCatalogEntry | null>(null);
  // La cascata delle righe vale solo la prima volta che il catalogo compare.
  const [firstReveal, setFirstReveal] = useState(true);
  // Le righe già montate hanno avviato il loro ingresso: spegnere la cascata
  // dopo il primo disegno vale solo per quelle che entreranno.
  useEffect(() => {
    if (catalog.length > 0) setFirstReveal(false);
  }, [catalog.length]);

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
      .then((list) => setProviders(list))
      .catch(() => setProviders([]));
  }, []);

  // Il filtro workspace vive anche nell'indirizzo: arrivando da un workspace la
  // Biblioteca si apre già ristretta alle sue opere.
  useEffect(() => {
    setFilters((current) =>
      current.workspaceId === (workspaceFilter ?? '') ? current : { ...current, workspaceId: workspaceFilter ?? '' });
  }, [workspaceFilter]);

  const changeFilters = (next: LibraryFilters) => {
    setFilters(next);
    const nextWorkspaceFilter = next.workspaceId || null;
    if (nextWorkspaceFilter !== (workspaceFilter ?? null)) {
      navigate(withWorkspaceFilter(location, nextWorkspaceFilter));
    }
  };

  // Un catalogo personale sono centinaia di opere, non milioni: filtri e
  // conteggi si rifanno a ogni disegno senza costare niente di visibile.
  const clock = { now: Date.now(), openedAt };
  const filteredCatalog = orderLibraryCatalog(filterLibraryCatalog(catalog, filters, clock), filters.sort, openedAt);
  const counts = Object.fromEntries(LIBRARY_FACETS.map((facet) => [facet, facetCounts(catalog, filters, clock, facet)])) as
    Record<(typeof LIBRARY_FACETS)[number], Map<string, number>>;

  const providerLabel = (key: string) => providers.find((provider) => provider.key === key)?.label ?? key;
  const workspaceName = (id: string) => workspaces.find((workspace) => workspace.id === id)?.name ?? id;
  const groupLabel = (key: string): string => {
    if (key === '') return t(`areas.library.grouping.missing.${grouping}`);
    switch (grouping) {
      case 'century': return t('areas.library.filters.centuryValue', { century: romanNumeral(Number(key)) });
      case 'provider': return providerLabel(key);
      case 'collection': return collections.find((collection) => collection.id === key)?.name ?? key;
      default: return key;
    }
  };
  const compareGroupKeys = (a: string, b: string) => grouping === 'century'
    ? Number(a) - Number(b)
    : groupLabel(a).localeCompare(groupLabel(b));
  const groups = groupCatalog(filteredCatalog, grouping, compareGroupKeys);
  // La scelta per intervallo segue l'ordine in cui le righe si vedono, gruppi compresi.
  const selection = useCatalogSelection([...new Set(groups.flatMap((group) => group.entries.map((entry) => entry.source.id)))]);
  // I comandi valgono solo per le opere scelte che si vedono: una scelta
  // nascosta da un filtro non deve subire un comando dato guardando altro.
  const selectedEntries = filteredCatalog.filter((entry) => selection.selected.has(entry.source.id));
  const applyJobChange = useJobsStore((state) => state.applyChange);
  // Cambiando scaffale o raccolta la scelta si svuota.
  const { clear: clearSelection } = selection;
  useEffect(() => { clearSelection(); }, [filters.shelf, filters.collectionId, clearSelection]);
  // Esc svuota la scelta, tranne quando chiude un menu o un campo aperto.
  const hasSelection = selection.selected.size > 0;
  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== 'Escape' || target?.closest('input, select, textarea, [data-radix-popper-content-wrapper], [role="dialog"]')) return;
      clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSelection, clearSelection]);

  const openSource = (sourceId: string) => {
    markOpened(sourceId);
    navigate(libraryLocation({ itemId: sourceId, workspaceFilter }));
  };
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
  const collectionAction = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch {
      toast.error(t('areas.library.collectionFailed'));
    }
  };

  const removeCollection = (collectionId: string) => collectionAction(async () => {
    await deleteCollection(collectionId);
    if (filters.collectionId === collectionId) setFilters({ ...filters, collectionId: '' });
  });

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

  /** Un comando su più opere: tutte, una alla volta, anche se qualcuna non
   *  riesce; un solo messaggio d'errore alla fine. Dice quante non sono riuscite. */
  const forEachEntry = async (
    entries: LibraryCatalogEntry[],
    work: (entry: LibraryCatalogEntry) => Promise<unknown>,
    failure: string,
  ): Promise<number> => {
    let failed = 0;
    for (const entry of entries) {
      try {
        await work(entry);
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) toast.error(t(failure));
    return failed;
  };
  const forEachSelected = (work: (entry: LibraryCatalogEntry) => Promise<unknown>, failure: string) =>
    forEachEntry(selectedEntries, work, failure);
  const addToCollection = (collectionId: string, entries: LibraryCatalogEntry[]) =>
    void forEachEntry(entries, (entry) => setCollection(entry.source.id, collectionId, true), 'areas.library.collectionFailed');
  const linkSelection = async (workspaceId: string) => {
    await forEachSelected(async (entry) => {
      if (!entry.workspaces.some((link) => link.workspaceId === workspaceId)) {
        await toggleWorkspaceLink(workspaceId, entry.source.id, true);
      }
    }, 'areas.library.linkFailed');
    await loadCatalog();
  };
  const downloadSelection = async () => {
    let queued = 0;
    const failed = await forEachSelected(async (entry) => {
      const job = await enqueueEntryDownload(entry);
      if (!job) return;
      applyJobChange(job);
      queued += 1;
    }, 'areas.library.downloadFailed');
    if (queued > 0 && failed === 0) toast.success(t('areas.library.downloadQueued'));
  };
  const archiveSelection = async (archived: boolean) => {
    await forEachSelected((entry) => setArchived(entry.source.id, archived),
      archived ? 'areas.library.archiveFailed' : 'areas.library.restoreFailed');
    selection.clear();
  };

  /** Quello che una riga fa, uguale nell'elenco, nella griglia e nella tabella. */
  const rowHandlers = (entry: LibraryCatalogEntry) => ({
    onPick: (pick: RowPick) => selection.pick(entry.source.id, pick),
    onDragStart: (event: DragEvent<HTMLElement>) => {
      const ids = selection.selected.has(entry.source.id) ? selectedEntries.map((item) => item.source.id) : [entry.source.id];
      event.dataTransfer.setData(DRAGGED_SOURCES, JSON.stringify(ids));
      event.dataTransfer.effectAllowed = 'copy';
    },
    onOpen: () => openSource(entry.source.id),
    onRemove: () => removeSource(entry.source.id),
    onSetArchived: (archived: boolean) => archive(entry.source.id, archived),
    onRefresh: () => void loadCatalog(),
  });

  const isSourcePage = Boolean(itemId && detail && detail.source.id === itemId);
  // Lista e scheda entrano senza aspettare che l'altra esca: un'uscita animata
  // prima dell'ingresso rendeva ogni apertura più lenta di quello che era.
  const enter = {
    initial: { opacity: 0, y: MOTION_SHIFT },
    animate: { opacity: 1, y: 0 },
    transition: { duration: MOTION_DURATION, ease: EASE_EDITORIAL },
  };

  return (
    <>
      {itemId && !isSourcePage ? (
        <motion.div
          key={`source-state-${itemId}`}
          {...enter}
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
                <IconButton size="sm" onClick={() => void loadDetail(itemId)} title={t('areas.library.retry')}>
                  <RefreshCw size={14} />
                </IconButton>
              </div>
            </div>
          )}
        </motion.div>
      ) : isSourcePage && itemId && detail ? (
        <motion.div
          key={itemId}
          {...enter}
          className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
        >
          <LibrarySourcePage
            detail={detail}
            entry={catalog.find((item) => item.source.id === itemId)}
            providerLabel={providers.find((provider) => provider.key === detail.providerKey)?.label}
            provider={providers.find((provider) => provider.key === detail.providerKey)}
            workspaces={workspaces}
            onBack={openCatalogue}
            onRemoved={() => removeAndLeave(itemId)}
            onSetArchived={(archived) => archive(itemId, archived)}
            onRefresh={() => void loadCatalog()}
            onToggleLink={(workspaceId, linked) => void toggleLink(itemId, workspaceId, linked)}
            onCorrectField={(field, value) => correct(itemId, field, value)}
            collections={collections}
            onSetCollection={(collectionId, member) => collectionAction(() => setCollection(itemId, collectionId, member))}
            onCreateCollection={(name) => collectionAction(() => addToNewCollection(itemId, name))}
            onResyncSource={() => resync(itemId)}
          />
        </motion.div>
      ) : (
        <motion.div
          key="catalogue"
          {...enter}
          className="flex h-full min-h-0 w-full min-w-0 flex-1"
        >
          <aside className="flex w-56 shrink-0 flex-col border-r border-editorial-border bg-surface-panel">
            <LibraryShelves
              filters={filters}
              onChange={changeFilters}
              shelfCounts={shelfCounts(catalog, clock)}
              collections={collections}
              collectionCounts={collectionCounts(catalog)}
              savedViews={savedViews}
              canSaveView={hasActiveLibraryFilters(filters)}
              onCreateCollection={(name) => void collectionAction(() => createCollection(name))}
              onDeleteCollection={(collectionId) => void removeCollection(collectionId)}
              onDropOnCollection={(collectionId, sourceIds) =>
                addToCollection(collectionId, catalog.filter((entry) => sourceIds.includes(entry.source.id)))}
              onSaveView={(name) => void saveView(name, filters)}
              onDeleteView={(viewId) => void removeSavedView(viewId)}
            />
          </aside>
          <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface-panel">
            <div className="flex items-end justify-between gap-3 px-5 pt-5 md:px-6">
              <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
                {t('areas.library.title')}
              </h1>
              {catalog.length > 0 && (
                <div className="flex items-center gap-1">
                  <IconButton size="sm" tone={view === 'list' ? 'accent' : 'default'} onClick={() => setView('list')}
                    title={t('areas.library.viewList')} ariaPressed={view === 'list'}>
                    <List size={13} />
                  </IconButton>
                  <IconButton size="sm" tone={view === 'grid' ? 'accent' : 'default'} onClick={() => setView('grid')}
                    title={t('areas.library.viewGrid')} ariaPressed={view === 'grid'}>
                    <LayoutGrid size={13} />
                  </IconButton>
                  <IconButton size="sm" tone={view === 'table' ? 'accent' : 'default'} onClick={() => setView('table')}
                    title={t('areas.library.viewTable')} ariaPressed={view === 'table'}>
                    <Table2 size={13} />
                  </IconButton>
                </div>
              )}
            </div>
            {catalog.length > 0 && (
              <LibraryQuickFilters filters={filters} onChange={changeFilters} counts={counts}
                providerLabel={providerLabel} workspaceName={workspaceName}
                grouping={grouping} onGrouping={setGrouping} />
            )}
            {selectedEntries.length > 0 && (
              <LibrarySelectionBar
                count={selectedEntries.length}
                allArchived={selectedEntries.every((entry) => entry.source.status === 'archived')}
                collections={collections}
                workspaces={workspaces}
                onAddToCollection={(collectionId) => addToCollection(collectionId, selectedEntries)}
                onCreateCollection={(name) => void forEachSelected((entry) => addToNewCollection(entry.source.id, name), 'areas.library.collectionFailed')}
                onLinkWorkspace={(workspaceId) => void linkSelection(workspaceId)}
                onDownload={() => void downloadSelection()}
                onSetArchived={(archived) => void archiveSelection(archived)}
                onClear={selection.clear}
              />
            )}

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
              {catalogLoading && catalog.length === 0 ? (
                <div className="flex h-full items-center justify-center gap-3 text-sm text-editorial-muted">
                  <Spinner size={14} />
                  <span>{t('areas.library.catalogLoading')}</span>
                </div>
              ) : catalogError && catalog.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
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
                <EmptyState icon={<BookOpenText size={20} />} message={t('areas.library.empty')} hint={t('areas.library.emptyHint')} />
              ) : filteredCatalog.length === 0 ? (
                <EmptyState icon={<BookOpenText size={20} />} message={t('areas.library.filters.noMatches')} />
              ) : (
                <div className="px-5 pb-4 md:px-6">
                  {groups.map((group) => (
                    <section key={group.key} aria-label={groupLabel(group.key)}>
                      {grouping !== 'none' && (
                        <h2 className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-editorial-border bg-surface-panel py-2 font-display text-lg italic text-editorial-ink">
                          {groupLabel(group.key)}
                          <span className="font-sans text-xs not-italic tabular-nums text-editorial-muted">{group.entries.length}</span>
                        </h2>
                      )}
                      {view === 'table' ? (
                        <LibraryCatalogTable
                          entries={group.entries}
                          sort={filters.sort}
                          onSort={(sort) => changeFilters({ ...filters, sort })}
                          providerLabel={(entry) => (entry.providerKey ? providerLabel(entry.providerKey) : undefined)}
                          isSelected={(entry) => selection.selected.has(entry.source.id)}
                          selecting={selection.selected.size > 0}
                          handlersFor={rowHandlers}
                        />
                      ) : (
                        <div className={view === 'grid'
                          ? 'grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3 py-4'
                          : 'flex flex-col divide-y divide-editorial-border/60 py-2'}>
                          {group.entries.map((entry, index) => (
                            <ListReveal key={entry.source.id} index={index} stagger={firstReveal}>
                              <LibraryCatalogRow
                                entry={entry}
                                view={view}
                                selected={selection.selected.has(entry.source.id)}
                                selecting={selection.selected.size > 0}
                                providerLabel={entry.providerKey ? providerLabel(entry.providerKey) : undefined}
                                workspaces={workspaces}
                                onToggleLink={(workspaceId, linked) => void toggleLink(entry.source.id, workspaceId, linked)}
                                collections={collections}
                                onSetCollection={(collectionId, member) =>
                                  void collectionAction(() => setCollection(entry.source.id, collectionId, member))}
                                onCreateTranscription={() => setTranscriptionTarget(entry)}
                                {...rowHandlers(entry)}
                              />
                            </ListReveal>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </main>
        </motion.div>
      )}
    <CreateTranscriptionDialog
      open={transcriptionTarget !== null}
      onClose={() => setTranscriptionTarget(null)}
      sourceVersionId={transcriptionTarget?.versionId ?? null}
      sourceId={transcriptionTarget?.source.id}
      defaultTitle={transcriptionTarget?.source.title ?? ''}
      onCreated={(documentId) => navigate(transcriptionsLocation({ documentId }))}
    />
    </>
  );
}
