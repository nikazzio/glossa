import { useEffect, useState } from 'react';
import {
  BookOpenText,
  Check,
  Clock,
  Download,
  Eraser,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  Minimize2,
  PauseCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ClickPopover, EmptyState, IconButton, SectionLabel, Tooltip } from '../ui';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { useJobsStore, stillReasonOf } from '../../stores/jobsStore';
import { confirm } from '../../stores/confirmStore';
import { enqueueSourceDownload, isTerminal } from '../../services/jobsService';
import { versionProviderKey } from '../../services/libraryService';
import { versionInventory } from '../../services/inventoryService';
import { listIIIFProviders } from '../../services/iiifProviderService';
import {
  deleteVersionFiles,
  freeVersionPages,
  summarizeAvailability,
} from '../../services/vaultService';
import { SourceSizeCap } from './SourceSizeCap';
import { LibraryFilterBar } from './LibraryFilterBar';
import { humanSize } from '../../utils';
import { CachedThumbnail } from '../common/CachedThumbnail';
import { enqueueOptimization } from '../../services/optimizeService';
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryCatalog,
  libraryLanguageOptions,
} from '../../utils/libraryCatalogFilters';
import type { LibraryCatalogEntry, Workspace } from '../../types';

interface LibraryCatalogAreaProps {
  itemId?: string;
}

/** Catalogo delle fonti salvate in Biblioteca. */
export function LibraryCatalogArea({ itemId }: LibraryCatalogAreaProps) {
  const { t } = useTranslation();
  const catalog = useSourceLibraryStore((state) => state.catalog);
  const detail = useSourceLibraryStore((state) => state.detail);
  const loadCatalog = useSourceLibraryStore((state) => state.loadCatalog);
  const removeSource = useSourceLibraryStore((state) => state.removeSource);
  const loadDetail = useSourceLibraryStore((state) => state.loadDetail);
  const toggleWorkspaceLink = useSourceLibraryStore((state) => state.toggleWorkspaceLink);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
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
    void listIIIFProviders().then((list) =>
      setProviders(list.map((provider) => ({ key: provider.key, label: provider.label }))),
    );
  }, []);

  const filteredCatalog = filterLibraryCatalog(catalog, filters);
  const providerOptions = providers.filter((provider) =>
    catalog.some((entry) => entry.providerKey === provider.key),
  );

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

  if (itemId && detail && detail.source.id === itemId) {
    return (
      <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
        <div className="px-5 py-5 md:px-6">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{detail.source.title}</h1>
          <dl className="mt-4 space-y-2 text-sm text-editorial-muted">
            <div><dt className="inline text-editorial-muted">{t('areas.library.kind')}</dt><dd className="inline pl-2 text-editorial-ink">{t(`areas.library.kindLabels.${detail.source.kind}`)}</dd></div>
            {detail.versions.map((version) => (
              <div key={version.id}><dt className="inline text-editorial-muted">{version.label}</dt><dd className="inline pl-2 text-editorial-ink">{version.sourceUrl}</dd></div>
            ))}
          </dl>
          <div className="mt-4 flex flex-col gap-2">
            {detail.versions.map((version) => (
              <SourceSizeCap key={version.id} versionId={version.id} />
            ))}
          </div>
          {workspaces.length > 0 && (
            <div className="mt-6">
              <SectionLabel icon={Link2} label={t('areas.library.linkedWorkspaces')} />
              <ul className="mt-2 space-y-1">
                {workspaces.map((workspace) => {
                  const linked = detail.linkedWorkspaceIds.includes(workspace.id);
                  return (
                    <li key={workspace.id} className="flex items-center justify-between gap-3 rounded-md border border-editorial-border bg-surface-elevated px-3 py-2">
                      <span className="min-w-0 truncate text-sm text-editorial-ink">{workspace.name}</span>
                      <IconButton
                        title={linked ? t('areas.library.unlinkWorkspace', { name: workspace.name }) : t('areas.library.linkWorkspace', { name: workspace.name })}
                        onClick={() => void toggleWorkspaceLink(workspace.id, detail.source.id, !linked)}
                        tone={linked ? 'accent' : 'default'}
                        ariaPressed={linked}
                        size="sm"
                      >
                        <Link2 size={14} />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
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
          languageOptions={libraryLanguageOptions(catalog)}
          providerOptions={providerOptions}
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
              onOpen={() => void loadDetail(entry.source.id)}
              onRemove={() => void removeSource(entry.source.id)}
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
  );
}

function CatalogEntryRow({
  entry,
  view,
  onOpen,
  onRemove,
  onRefresh,
  workspaces,
  onToggleLink,
}: {
  entry: LibraryCatalogEntry;
  view: 'list' | 'grid';
  onOpen: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  workspaces: Workspace[];
  onToggleLink: (workspaceId: string, linked: boolean) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const jobs = useJobsStore((state) => state.jobs);
  const applyChange = useJobsStore((state) => state.applyChange);

  const runningJob = jobs.find((job) => job.id === `download:${entry.versionId}` && !isTerminal(job));
  const jobState = runningJob ? stillReasonOf(runningJob) : null;

  const [picking, setPicking] = useState(false);
  const linkedIds = new Set(entry.workspaces.map((link) => link.workspaceId));
  const available = workspaces.filter((workspace) => !linkedIds.has(workspace.id));

  const meta = [entry.creator, entry.date].filter(Boolean).join(' · ');
  const principal = entry.sizes.find((size) => size.sizeTag === entry.principalSize);
  const notServed = principal?.missing ?? 0;
  const summary = summarizeAvailability(entry.localPages, entry.expectedPages ?? 0, notServed);
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

  const providerKey = async () =>
    (entry.versionId ? await versionProviderKey(entry.versionId) : null) ??
    entry.providerKey ??
    'generic';

  const startDownload = async () => {
    if (!entry.manifestUrl) return;
    setBusy(true);
    try {
      const job = await enqueueSourceDownload({
        providerKey: await providerKey(),
        manifestUrl: entry.manifestUrl,
        versionId: entry.versionId ?? undefined,
      });
      applyChange(job);
      toast.success(t('areas.library.downloadQueued'));
    } catch (error: unknown) {
      toast.error(t('areas.library.downloadFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!entry.versionId) return;
    setBusy(true);
    try {
      const inventory = await versionInventory(entry.versionId);
      const principal = inventory?.sizes.find((size) => size.sizeTag === inventory.principal);
      if (!principal) {
        toast.info(t('areas.library.verifyNothing'));
        return;
      }
      const expected = entry.expectedPages ?? 0;
      if (expected <= 0) {
        toast.info(t('areas.library.verifyNoExpected', { count: principal.pages }));
        return;
      }
      const missing = Math.max(0, expected - principal.pages - principal.missing);
      if (missing === 0) {
        toast.success(t('areas.library.verifyIntact', { count: principal.pages }));
        return;
      }
      const confirmed = await confirm({
        title: t('areas.library.verifyMissingTitle', { count: missing }),
        message: t('areas.library.verifyMissingMessage', { total: expected }),
        confirmLabel: t('areas.library.verifyDownloadMissing'),
      });
      if (confirmed) await startDownload();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(
        reason.includes('vault_unreachable')
          ? t('areas.library.vaultUnreachable')
          : t('areas.library.verifyFailed'),
        { description: reason },
      );
    } finally {
      setBusy(false);
    }
  };

  const freeSpace = async () => {
    if (!entry.versionId) return;
    const confirmed = await confirm({
      title: t('areas.library.freeSpaceTitle', { size: humanSize(entry.localBytes) }),
      message: t('areas.library.freeSpaceMessage'),
      confirmLabel: t('areas.library.freeSpaceConfirm'),
      danger: true,
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const freed = await freeVersionPages(await providerKey(), entry.versionId);
      toast.success(t('areas.library.freeSpaceDone', { size: humanSize(freed.freedBytes) }));
      onRefresh();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('version_work_in_progress')) {
        toast.info(t('areas.library.filesBusy'));
        return;
      }
      toast.error(t('areas.library.freeSpaceFailed'), {
        description: reason,
      });
    } finally {
      setBusy(false);
    }
  };

  const optimise = async () => {
    if (!entry.versionId || !entry.principalSize) return;
    setBusy(true);
    try {
      const job = await enqueueOptimization(entry.versionId, entry.principalSize);
      applyChange(job);
      toast.success(t('areas.library.optimizeQueued'));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('download_in_corso')) {
        toast.info(t('areas.library.optimizeWhileDownloading'));
        return;
      }
      toast.error(t('areas.library.optimizeFailed'), { description: reason });
    } finally {
      setBusy(false);
    }
  };

  const askRemoval = async () => {
    const confirmed = await confirm({
      title: t('areas.library.removeTitle', { title: entry.source.title }),
      message:
        entry.localBytes > 0
          ? t('areas.library.removeMessageWithFiles', { size: humanSize(entry.localBytes) })
          : t('areas.library.removeMessage'),
      confirmLabel: t('areas.library.removeConfirm'),
      danger: true,
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      if (entry.versionId) {
        await deleteVersionFiles(await providerKey(), entry.versionId);
      }
      onRemove();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('version_work_in_progress')) {
        toast.info(t('areas.library.filesBusy'));
        return;
      }
      toast.error(t('areas.library.removeFailed'), {
        description: reason,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={
        view === 'grid'
          ? 'flex flex-col gap-2 rounded-2xl border border-editorial-border bg-surface-elevated p-3'
          : 'flex items-center gap-3 py-2.5'
      }
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
          <span className="mt-1 block text-[11px] text-editorial-muted">
            {[pageCount, availability, extraNote].filter(Boolean).join(' · ')}
          </span>
        </button>
      </div>

      <span className="flex min-w-0 shrink-0 flex-wrap items-center gap-1">
        {entry.workspaces.map((link) => (
          <Tooltip key={link.workspaceId} label={t('areas.library.unlinkFromWorkspace')} side="top">
            <button
              type="button"
              onClick={() => onToggleLink(link.workspaceId, false)}
              className="rounded-full border border-editorial-accent/40 bg-editorial-accent/8 px-2 py-0.5 text-[11px] text-editorial-accent transition-colors hover:border-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {link.workspaceName}
            </button>
          </Tooltip>
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
                <li key={workspace.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false);
                      onToggleLink(workspace.id, true);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-editorial-ink transition-colors hover:bg-surface-hover/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {workspace.name}
                  </button>
                </li>
              ))}
            </ul>
          </ClickPopover>
        )}
      </span>

      <div className={`flex shrink-0 items-center gap-1 ${view === 'grid' ? 'justify-end' : ''}`}>
        <span className="mr-1 flex h-6 w-6 items-center justify-center text-[11px] text-editorial-muted">
          {runningJob ? (
            <Tooltip label={t('areas.library.downloadRunning')} side="top">
              <span className="text-editorial-accent">{Math.round(runningJob.progress * 100)}%</span>
            </Tooltip>
          ) : summary.availability === 'complete' ? (
            <Tooltip label={t('areas.library.availabilityComplete')} side="top">
              <span aria-label={t('areas.library.availabilityComplete')}>
                <Check size={13} />
              </span>
            </Tooltip>
          ) : null}
        </span>

        <IconButton
          size="sm"
          onClick={() => void startDownload()}
          disabled={!entry.manifestUrl || busy || Boolean(runningJob) || summary.availability === 'complete'}
          title={
            jobState === 'paused'
              ? t('areas.library.downloadPaused')
              : jobState === 'libraryLimits'
                ? t('jobs.waitingForLibrary')
                : jobState
                  ? t('areas.library.downloadWaiting')
                  : runningJob
                    ? t('areas.library.downloadRunning')
                    : t('areas.library.download')
          }
        >
          {/* Mentre il lavoro gira il comando lo dice da sé: la percentuale sta
              altrove, e un pulsante spento senza motivo visibile sembra rotto. */}
          {jobState === 'paused' ? (
            <PauseCircle size={13} />
          ) : jobState ? (
            <Clock size={13} />
          ) : runningJob ? (
            <Loader2 size={13} className="motion-safe:animate-spin" />
          ) : (
            <Download size={13} />
          )}
        </IconButton>
        <IconButton
          size="sm"
          onClick={() => void verify()}
          disabled={busy || entry.localPages === 0}
          title={t('areas.library.verify')}
        >
          <ShieldCheck size={13} />
        </IconButton>
        <IconButton
          size="sm"
          onClick={() => void optimise()}
          disabled={busy || entry.localPages === 0}
          title={t('areas.library.optimizeAction')}
        >
          <Minimize2 size={13} />
        </IconButton>
        <IconButton
          size="sm"
          onClick={() => void freeSpace()}
          disabled={busy || entry.localPages === 0}
          title={t('areas.library.freeSpace')}
        >
          <Eraser size={13} />
        </IconButton>
        <IconButton size="sm" tone="danger" onClick={() => void askRemoval()} title={t('areas.library.remove')}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </article>
  );
}
