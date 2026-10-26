import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Archive, ArchiveRestore, BookOpenText, FilePen, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EASE_EDITORIAL, MOTION_DURATION, MOTION_SHIFT } from '../layout/motion';
import { AREA_PAPER_CLASSNAME, AreaHeading, CatalogViewSwitch, EmptyState, IconButton, ListReveal, Spinner, type RowCommand } from '../ui';
import { CATALOG_GRID_CLASSNAME, CATALOG_GROUP_HEADER_CLASSNAME, CATALOG_LIST_CLASSNAME } from '../ui/catalogStyles';
import { confirm } from '../../stores/confirmStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { libraryLocation, transcriptionsLocation, withWorkspaceFilter } from '../../navigation/appLocation';
import { listIIIFProviders } from '../../services/iiifProviderService';
import { renameDocument, setDocumentStatus } from '../../services/transcriptionService';
import { listTranscriptionCatalog, type TranscriptionCatalogEntry } from '../../services/transcriptionCatalogService';
import {
  EMPTY_TRANSCRIPTION_FILTERS,
  TRANSCRIPTION_FACETS,
  filterTranscriptionCatalog,
  groupTranscriptionCatalog,
  orderTranscriptionCatalog,
  transcriptionFacetCounts,
  transcriptionShelfCounts,
  type TranscriptionFacet,
  type TranscriptionFilters,
} from '../../utils/transcriptionCatalogFilters';
import type { IIIFProvider } from '../../types';
import { CreateTranscriptionDialog } from '../transcription/CreateTranscriptionDialog';
import { TranscriptionStudio } from '../transcription/TranscriptionStudio';
import { TranscriptionCatalogRow, type TranscriptionRowProps } from '../transcription/TranscriptionCatalogRow';
import { TranscriptionCatalogTable } from '../transcription/TranscriptionCatalogTable';
import { TranscriptionQuickFilters } from '../transcription/TranscriptionQuickFilters';
import { TranscriptionShelves } from '../transcription/TranscriptionShelves';

interface TranscriptionsCatalogAreaProps {
  documentId?: string;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Area globale Trascrizioni: il catalogo di tutte le trascrizioni di tutti i
 * workspace, sul modello della Biblioteca — scaffali a destra, ricerca e
 * filtri rapidi sopra l'elenco, tre viste — e, con `documentId`, lo Studio.
 */
export function TranscriptionsCatalogArea({ documentId }: TranscriptionsCatalogAreaProps) {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const location = useUiStore((s) => s.location);
  const view = useUiStore((s) => s.transcriptionsView);
  const setView = useUiStore((s) => s.setTranscriptionsView);
  const grouping = useUiStore((s) => s.transcriptionsGrouping);
  const setGrouping = useUiStore((s) => s.setTranscriptionsGrouping);
  const markLibraryOpened = useUiStore((s) => s.markLibraryOpened);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspaceFilter = location.area === 'transcriptions' ? location.workspaceFilter : undefined;

  const [catalog, setCatalog] = useState<TranscriptionCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [providers, setProviders] = useState<IIIFProvider[]>([]);
  const [filters, setFilters] = useState(EMPTY_TRANSCRIPTION_FILTERS);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [firstReveal, setFirstReveal] = useState(true);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await listTranscriptionCatalog());
      setLoadError(false);
    } catch (err: unknown) {
      setLoadError(true);
      toast.error(t('areas.transcriptions.catalog.loadFailed'), { description: errorText(err) });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!documentId) void loadCatalog();
  }, [documentId, loadCatalog]);

  useEffect(() => {
    if (catalog.length > 0) setFirstReveal(false);
  }, [catalog.length]);

  useEffect(() => {
    void listIIIFProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  // Il filtro workspace vive anche nell'indirizzo, come in Biblioteca.
  useEffect(() => {
    setFilters((current) =>
      current.workspaceId === (workspaceFilter ?? '') ? current : { ...current, workspaceId: workspaceFilter ?? '' });
  }, [workspaceFilter]);

  const changeFilters = (next: TranscriptionFilters) => {
    setFilters(next);
    const nextWorkspaceFilter = next.workspaceId || null;
    if (nextWorkspaceFilter !== (workspaceFilter ?? null)) navigate(withWorkspaceFilter(location, nextWorkspaceFilter));
  };

  if (documentId) {
    return (
      <TranscriptionStudio
        key={documentId}
        documentId={documentId}
        onBack={() => navigate(transcriptionsLocation({ workspaceFilter }))}
      />
    );
  }

  const now = Date.now();
  const filtered = orderTranscriptionCatalog(filterTranscriptionCatalog(catalog, filters, now), filters.sort);
  const counts = Object.fromEntries(TRANSCRIPTION_FACETS.map((facet) =>
    [facet, transcriptionFacetCounts(catalog, filters, now, facet)])) as Record<TranscriptionFacet, Map<string, number>>;
  const providerLabel = (key: string) => providers.find((provider) => provider.key === key)?.label ?? key;
  const workspaceName = (id: string) => workspaces.find((workspace) => workspace.id === id)?.name ?? '';
  const groupLabel = (key: string) => key === ''
    ? t(`areas.transcriptions.catalog.grouping.missing.${grouping}`)
    : grouping === 'workspace' ? workspaceName(key) || t('areas.transcriptions.catalog.grouping.missing.workspace') : providerLabel(key);
  const groups = groupTranscriptionCatalog(filtered, grouping, (a, b) => groupLabel(a).localeCompare(groupLabel(b)));

  const openDocument = (id: string) => navigate(transcriptionsLocation({ documentId: id, workspaceFilter }));

  const run = async (work: () => Promise<void>, failure: string) => {
    try {
      await work();
      await loadCatalog();
    } catch (err: unknown) {
      toast.error(t(failure), { description: errorText(err) });
    }
  };

  const remove = async (entry: TranscriptionCatalogEntry) => {
    const ok = await confirm({
      title: t('transcription.confirmDeleteTitle'),
      message: t('transcription.confirmDeleteMessage', { name: entry.document.title }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await setDocumentStatus(entry.document.id, 'trashed');
      toast.success(t('transcription.deleted'));
    }, 'transcription.deleteFailed');
  };

  /** I comandi di una trascrizione, uguali in elenco, copertine e tabella:
   *  opera e nome | conservazione. */
  const commandsFor = (entry: TranscriptionCatalogEntry): RowCommand[][] => {
    const archived = entry.document.status === 'archived';
    const work = entry.work;
    return [
      [
        {
          key: 'openWork',
          icon: <BookOpenText size={14} />,
          label: t(work ? 'areas.transcriptions.catalog.openWork' : 'areas.transcriptions.catalog.noWork'),
          disabled: !work,
          onClick: () => {
            if (!work) return;
            markLibraryOpened(work.source.id);
            navigate(libraryLocation({ itemId: work.source.id }));
          },
        },
        {
          key: 'rename',
          icon: <Pencil size={14} />,
          label: t('areas.transcriptions.catalog.rename'),
          onClick: () => setRenamingId(entry.document.id),
        },
      ],
      [
        {
          key: 'archive',
          icon: archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
          label: t(archived ? 'areas.transcriptions.catalog.restore' : 'areas.transcriptions.catalog.archive'),
          onClick: () => void run(() => setDocumentStatus(entry.document.id, archived ? 'active' : 'archived'),
            archived ? 'areas.transcriptions.catalog.restoreFailed' : 'areas.transcriptions.catalog.archiveFailed'),
        },
        {
          key: 'remove',
          icon: <Trash2 size={14} />,
          label: t('transcription.delete'),
          tone: 'danger',
          onClick: () => void remove(entry),
        },
      ],
    ];
  };

  const rowPropsFor = (entry: TranscriptionCatalogEntry): TranscriptionRowProps => ({
    entry,
    workspaceName: workspaceName(entry.document.workspace_id),
    commands: commandsFor(entry),
    renaming: renamingId === entry.document.id,
    onRename: (title) => {
      setRenamingId(null);
      void run(() => renameDocument(entry.document.id, title), 'areas.transcriptions.catalog.renameFailed');
    },
    onRenameCancel: () => setRenamingId(null),
    onOpen: () => openDocument(entry.document.id),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: MOTION_SHIFT }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION_DURATION, ease: EASE_EDITORIAL }}
      className="flex h-full min-h-0 w-full min-w-0 flex-1"
    >
      <main className={`flex h-full min-h-0 min-w-0 flex-1 flex-col ${AREA_PAPER_CLASSNAME.transcriptions}`}>
        <div className="px-5 pt-5 md:px-6">
          <AreaHeading area="transcriptions" title={t('areas.transcriptions.title')}>
            <div className="flex items-center gap-1">
              <IconButton size="sm" onClick={() => setShowNewDialog(true)} title={t('areas.transcriptions.catalog.newTranscription')}>
                <Plus size={13} />
              </IconButton>
              {catalog.length > 0 && <CatalogViewSwitch view={view} onChange={setView} />}
            </div>
          </AreaHeading>
        </div>
        {catalog.length > 0 && (
          <TranscriptionQuickFilters filters={filters} onChange={changeFilters} counts={counts}
            providerLabel={providerLabel} workspaceName={workspaceName}
            grouping={grouping} onGrouping={setGrouping} />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size={14} label={t('common.loading')} className="flex items-center gap-2 text-sm text-editorial-muted" />
            </div>
          ) : loadError && catalog.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <EmptyState icon={<AlertCircle size={20} />} message={t('areas.transcriptions.catalog.loadFailed')}
                className="flex flex-col items-center gap-3" />
              <IconButton size="sm" onClick={() => void loadCatalog()} title={t('areas.library.retry')}>
                <RefreshCw size={14} />
              </IconButton>
            </div>
          ) : catalog.length === 0 ? (
            <EmptyState icon={<FilePen size={20} />} message={t('areas.transcriptions.emptyMessage')}
              hint={t('areas.transcriptions.emptyHint')} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<FilePen size={20} />} message={t('areas.transcriptions.catalog.filters.noMatches')} />
          ) : (
            <div className="px-5 pb-4 md:px-6">
              {groups.map((group) => (
                <section key={group.key} aria-label={groupLabel(group.key)}>
                  {grouping !== 'none' && (
                    <h2 className={`${CATALOG_GROUP_HEADER_CLASSNAME} ${AREA_PAPER_CLASSNAME.transcriptions}`}>
                      {groupLabel(group.key)}
                      <span className="font-sans text-xs not-italic tabular-nums text-editorial-muted">{group.entries.length}</span>
                    </h2>
                  )}
                  {view === 'table' ? (
                    <TranscriptionCatalogTable
                      entries={group.entries}
                      sort={filters.sort}
                      onSort={(sort) => changeFilters({ ...filters, sort })}
                      rowPropsFor={rowPropsFor}
                      providerLabel={(entry) => (entry.work?.providerKey ? providerLabel(entry.work.providerKey) : undefined)}
                    />
                  ) : (
                    <div className={view === 'grid' ? CATALOG_GRID_CLASSNAME : CATALOG_LIST_CLASSNAME}>
                      {group.entries.map((entry, index) => (
                        <ListReveal key={entry.document.id} index={index} stagger={firstReveal}
                          className={view === 'grid' ? 'h-full' : undefined}>
                          <TranscriptionCatalogRow view={view} {...rowPropsFor(entry)} />
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
      <aside className="flex w-56 shrink-0 flex-col border-l border-editorial-border bg-surface-panel">
        <TranscriptionShelves filters={filters} onChange={changeFilters} counts={transcriptionShelfCounts(catalog, now)} />
      </aside>

      <CreateTranscriptionDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreated={(id) => {
          void loadCatalog();
          openDocument(id);
        }}
      />
    </motion.div>
  );
}
