import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BookOpenText, CircleCheck, CircleDashed, LayoutGrid, Link2, List, Tags } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EASE_EDITORIAL } from '../layout/motion';
import { ClickPopover, EmptyState, IconButton, LinkChip, PopoverItem, SectionLabel, Tooltip } from '../ui';
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
import type { LibraryCatalogEntry, SourceCollection, SourceField, Workspace } from '../../types';

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
  const resyncSource = useSourceLibraryStore((state) => state.resyncSource);
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

  const resync = async (sourceId: string) => {
    try {
      await resyncSource(sourceId);
      toast.success(t('areas.library.resyncSuccess'));
    } catch (error: unknown) {
      toast.error(t('areas.library.resyncFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
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
          className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
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
          <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
            <div className="px-5 pt-5 md:px-6">
              <SectionLabel icon={BookOpenText} label={t('areas.library.title')} />
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

            {/* Riguarda come si vedono i risultati, non la ricerca: sta qui,
                accanto all'elenco che governa, non nella barra di ricerca. */}
            {catalog.length > 0 && (
              <div className="flex items-center justify-end gap-1 px-5 md:px-6">
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
                    providerLabel={providers.find((provider) => provider.key === entry.providerKey)?.label}
                    onOpen={() => openSource(entry.source.id)}
                    onRemove={() => void removeSource(entry.source.id)}
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
  onRemove: () => void;
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
  /**
   * Le immagini sul computer si dicono con un'icona, non con una parola: un
   * segno di spunta tondo quando ci sono tutte, un cerchio tratteggiato con il
   * conteggio accanto quando ne manca qualcuna. Un pallino pieno diceva
   * un'altra cosa — sembrava la spia di «collegato». Un'opera solo in rete
   * resta scritta com'era.
   */
  const localImages =
    summary.availability === 'complete'
      ? t('areas.library.localImagesAll')
      : t('areas.library.localImagesSome', {
          done: summary.presentPages,
          total: summary.expectedPages,
        });
  const availability =
    summary.availability === 'catalogued' ? (
      t('areas.library.availabilityRemote')
    ) : (
      <Tooltip label={localImages} side="top">
        <span
          aria-label={localImages}
          className="inline-flex items-center gap-1 align-middle text-editorial-success"
        >
          {summary.availability === 'complete' ? (
            <CircleCheck size={12} aria-hidden="true" />
          ) : (
            <CircleDashed size={12} aria-hidden="true" />
          )}
          {summary.availability === 'partial' && (
            <span className="tabular-nums">
              {summary.presentPages}/{summary.expectedPages}
            </span>
          )}
        </span>
      </Tooltip>
    );
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
            // Si chiede sempre per numero di pagina, anche senza pagine sul
            // disco: «libera spazio» cancella le pagine e **tiene le
            // miniature**, e legarlo al conteggio delle pagine faceva tornare
            // in rete per una copertina che era rimasta in casa. Senza niente
            // in casa, la richiesta ripiega da sola sull'indirizzo remoto.
            versionId={entry.versionId}
            providerKey={entry.providerKey}
            className="h-full w-full object-cover"
            fallback={<BookOpenText size={16} className="text-editorial-muted" aria-hidden="true" />}
          />
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <span className="block truncate font-display text-base italic text-editorial-ink">
              {entry.source.title}
            </span>
            {(providerLabel || authorDate) && (
              <span className="mt-0.5 block truncate text-xs text-editorial-muted">
                {providerLabel && (
                  <span className="font-semibold text-editorial-ink">{providerLabel}</span>
                )}
                {providerLabel && authorDate && ' \u00b7 '}
                {authorDate}
              </span>
            )}
            <span className="mt-1 block truncate text-xs text-editorial-muted">
              {pageCount}
              {pageCount && ' \u00b7 '}
              {availability}
              {extraNote && ' \u00b7 '}
              {extraNote}
            </span>
          </button>

          {/* Collegamenti dell'opera: sotto il titolo, ben lontani dai comandi
              a destra \u2014 non sono azioni sull'opera, sono dove sta l'opera. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
      </div>

      <SourceActionBar entry={entry} actions={actions} />
    </article>
  );
}
