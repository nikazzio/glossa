import { useEffect, useState } from 'react';
import { BookOpenText, Download, LayoutGrid, Link2, List, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState, IconButton, SectionLabel, Tooltip } from '../ui';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { useJobsStore } from '../../stores/jobsStore';
import { confirm } from '../../stores/confirmStore';
import { enqueueSourceDownload } from '../../services/jobsService';
import type { LibraryCatalogEntry } from '../../types';

interface LibraryCatalogAreaProps {
  itemId?: string;
}

/**
 * Il catalogo delle fonti. La ricerca vive nella Dashboard: qui si guarda
 * quello che si ha, si scarica, si toglie.
 *
 * Quante carte sono davvero sul computer si legge dai file presenti, non da uno
 * stato tenuto a parte (D7): «parziale» è una condizione normale, non un
 * avviso — chi salva la scheda e scarica tre carte su duecento lo fa apposta.
 */
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

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (itemId) void loadDetail(itemId);
  }, [itemId, loadDetail]);

  if (itemId && detail && detail.source.id === itemId) {
    return (
      <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
        <div className="px-5 py-5 md:px-6">
          <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{detail.source.title}</h1>
          <dl className="mt-4 space-y-2 text-sm text-editorial-muted">
            <div><dt className="inline text-editorial-muted">{t('areas.library.kind')}</dt><dd className="inline pl-2 text-editorial-ink">{detail.source.kind}</dd></div>
            {detail.versions.map((version) => (
              <div key={version.id}><dt className="inline text-editorial-muted">{version.label}</dt><dd className="inline pl-2 text-editorial-ink">{version.sourceUrl}</dd></div>
            ))}
          </dl>
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

      {catalog.length === 0 ? (
        <EmptyState
          icon={<BookOpenText size={20} />}
          message={t('areas.library.empty')}
          hint={t('areas.library.emptyHint')}
        />
      ) : (
        <div
          className={
            view === 'grid'
              ? 'grid grid-cols-2 gap-3 px-5 py-4 md:px-6 lg:grid-cols-3'
              : 'flex flex-col divide-y divide-editorial-border/60 px-5 py-2 md:px-6'
          }
        >
          {catalog.map((entry) => (
            <CatalogEntryRow
              key={entry.source.id}
              entry={entry}
              view={view}
              onOpen={() => void loadDetail(entry.source.id)}
              onRemove={() => void removeSource(entry.source.id)}
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
}: {
  entry: LibraryCatalogEntry;
  view: 'list' | 'grid';
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const jobs = useJobsStore((state) => state.jobs);
  const applyChange = useJobsStore((state) => state.applyChange);

  const runningJob = jobs.find(
    (job) => job.id === `download:${entry.versionId}` && job.status !== 'completed',
  );

  const meta = [entry.creator, entry.date].filter(Boolean).join(' · ');
  const availability =
    entry.localPages === 0
      ? t('areas.library.availabilityRemote')
      : entry.expectedPages && entry.localPages >= entry.expectedPages
        ? t('areas.library.availabilityComplete')
        : t('areas.library.availabilityPartial', {
            done: entry.localPages,
            total: entry.expectedPages ?? '?',
          });

  const startDownload = async () => {
    if (!entry.manifestUrl) return;
    setDownloading(true);
    try {
      const job = await enqueueSourceDownload({
        providerKey: entry.source.externalRef ?? 'unknown',
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
      setDownloading(false);
    }
  };

  const askRemoval = async () => {
    const confirmed = await confirm({
      title: t('areas.library.removeTitle', { title: entry.source.title }),
      message: t('areas.library.removeMessage'),
      confirmLabel: t('areas.library.removeConfirm'),
      danger: true,
    });
    if (confirmed) onRemove();
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
          {entry.thumbnailUrl ? (
            <img src={entry.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <BookOpenText size={16} className="text-editorial-muted" aria-hidden="true" />
          )}
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
          <span className="mt-1 block text-[11px] text-editorial-muted">{availability}</span>
        </button>
      </div>

      <div className={`flex shrink-0 items-center gap-1 ${view === 'grid' ? 'justify-end' : ''}`}>
        {runningJob ? (
          <Tooltip label={t('areas.library.downloadRunning')} side="top">
            <span className="text-[11px] text-editorial-accent">
              {Math.round(runningJob.progress * 100)}%
            </span>
          </Tooltip>
        ) : (
          <IconButton
            size="sm"
            onClick={() => void startDownload()}
            disabled={!entry.manifestUrl || downloading}
            title={t('areas.library.download')}
          >
            <Download size={13} />
          </IconButton>
        )}
        <IconButton size="sm" tone="danger" onClick={() => void askRemoval()} title={t('areas.library.remove')}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </article>
  );
}
