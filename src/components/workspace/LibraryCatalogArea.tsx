import { useEffect, useState } from 'react';
import {
  BookOpenText,
  Check,
  Clock,
  Download,
  FolderInput,
  LibraryBig,
  Eraser,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  PauseCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState, IconButton, SectionLabel, Tooltip } from '../ui';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { useJobsStore, stillReasonOf } from '../../stores/jobsStore';
import { confirm } from '../../stores/confirmStore';
import { enqueueSourceDownload, isTerminal } from '../../services/jobsService';
import {
  forgetVersionPages,
  listVersionVaultPaths,
  versionProviderKey,
} from '../../services/libraryService';
import {
  deleteVersionFiles,
  freeVersionPages,
  summarizeAvailability,
  verifyFilesPresent,
} from '../../services/vaultService';
import { SourceSizeCap } from './SourceSizeCap';
import { humanSize } from '../../utils';
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
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  // Di chi sono le opere che si vedono: quelle collegate al workspace, o tutte
  // (#213). Nessuna lettura da un altro workspace senza chiederla — ma il
  // catalogo generale resta il modo di ritrovare un'opera e collegarla.
  const scope = useUiStore((state) => state.catalogScope);
  const setScope = useUiStore((state) => state.setCatalogScope);
  const view = useUiStore((state) => state.libraryView);
  const setView = useUiStore((state) => state.setLibraryView);
  // Quante carte sono sul computer cambia quando un lavoro finisce: senza
  // guardare la coda, la riga continuerebbe a dire quello che diceva
  // all'apertura della schermata, anche dopo un manoscritto intero.
  const finishedDownloads = useJobsStore(
    (state) =>
      state.jobs.filter((job) => job.jobType === 'source_download' && isTerminal(job)).length,
  );

  useEffect(() => {
    void loadCatalog(activeWorkspace?.id, scope === 'workspace');
  }, [loadCatalog, finishedDownloads, activeWorkspace?.id, scope]);

  useEffect(() => {
    if (itemId) void loadDetail(itemId);
  }, [itemId, loadDetail]);

  /**
   * Collega o scollega l'opera dal workspace attivo, e rilegge il catalogo:
   * guardando solo le opere del workspace, quella appena scollegata deve
   * sparire dall'elenco — altrimenti resta lì a dire il contrario di quello che
   * è appena stato fatto.
   */
  const toggleLink = async (entry: LibraryCatalogEntry) => {
    if (!activeWorkspace) return;
    try {
      await toggleWorkspaceLink(activeWorkspace.id, entry.source.id, !entry.linkedToWorkspace);
      await loadCatalog(activeWorkspace.id, scope === 'workspace');
    } catch (error: unknown) {
      // Come gli altri comandi della scheda: un collegamento che non riesce si
      // dice, invece di lasciare la scheda a mostrare il contrario.
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
            <div><dt className="inline text-editorial-muted">{t('areas.library.kind')}</dt><dd className="inline pl-2 text-editorial-ink">{detail.source.kind}</dd></div>
            {detail.versions.map((version) => (
              <div key={version.id}><dt className="inline text-editorial-muted">{version.label}</dt><dd className="inline pl-2 text-editorial-ink">{version.sourceUrl}</dd></div>
            ))}
          </dl>
          {/* La misura con cui si scarica questa opera: l'ultima parola sulla
              politica generale e su quella della biblioteca (D4). */}
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
          {activeWorkspace && (
            <>
              <IconButton
                size="sm"
                tone={scope === 'workspace' ? 'accent' : 'default'}
                onClick={() => setScope('workspace')}
                title={t('areas.library.scopeWorkspace', { name: activeWorkspace.name })}
                ariaPressed={scope === 'workspace'}
              >
                <FolderInput size={13} />
              </IconButton>
              <IconButton
                size="sm"
                tone={scope === 'all' ? 'accent' : 'default'}
                onClick={() => setScope('all')}
                title={t('areas.library.scopeAll')}
                ariaPressed={scope === 'all'}
              >
                <LibraryBig size={13} />
              </IconButton>
              <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
            </>
          )}
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
              onRefresh={() => void loadCatalog(activeWorkspace?.id, scope === 'workspace')}
              workspaceId={activeWorkspace?.id ?? null}
              onToggleLink={() => void toggleLink(entry)}
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
  workspaceId,
  onToggleLink,
}: {
  entry: LibraryCatalogEntry;
  view: 'list' | 'grid';
  onOpen: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  /** Il workspace attivo: senza, collegare non vuol dire niente. */
  workspaceId: string | null;
  onToggleLink: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const jobs = useJobsStore((state) => state.jobs);
  const applyChange = useJobsStore((state) => state.applyChange);

  // Solo un lavoro **non finito** occupa il posto del pulsante: uno fallito o
  // annullato lasciava la percentuale ferma e toglieva il modo di riprovare.
  const runningJob = jobs.find((job) => job.id === `download:${entry.versionId}` && !isTerminal(job));
  // La scheda dice **cosa sta facendo** quel lavoro, non solo che esiste: una
  // rotellina che gira su uno scaricamento in pausa è una bugia, e la pausa
  // premuta nel pannello non risultava da nessun'altra parte.
  const jobState = runningJob ? stillReasonOf(runningJob) : null;

  const meta = [entry.creator, entry.date].filter(Boolean).join(' · ');
  const summary = summarizeAvailability(entry.localPages, entry.expectedPages ?? 0);
  const availability =
    summary.availability === 'catalogued'
      ? t('areas.library.availabilityRemote')
      : summary.availability === 'complete'
        ? t('areas.library.availabilityComplete')
        : t('areas.library.availabilityPartial', {
            done: summary.presentPages,
            total: summary.expectedPages,
          });
  // Quante pagine ha l'opera si vede **senza aprire niente**: è il dato che
  // decide se scaricarla o no. Manca solo per le opere aggiunte da una
  // biblioteca che non lo dichiara, e lì non si inventa.
  const pageCount =
    entry.expectedPages !== null && entry.expectedPages > 0
      ? t('areas.library.pageCount', { count: entry.expectedPages })
      : null;

  /**
   * La chiave con cui questa fonte vive nel deposito: prima quella dei file già
   * scaricati, poi quella dei metadati. Sbagliarla significa riscaricare tutto
   * in una cartella nuova, o cancellare la cartella sbagliata.
   */
  const providerKey = async () =>
    (entry.versionId ? await versionProviderKey(entry.versionId) : null) ??
    entry.providerKey ??
    'generic';

  const startDownload = async () => {
    if (!entry.manifestUrl) return;
    setBusy(true);
    try {
      const job = await enqueueSourceDownload({
        // La chiave della biblioteca, non `external_ref`: quella è chiave più
        // identificativo e come nome di cartella verrebbe rifiutata (D2, D18).
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

  /**
   * Verifica rapida (D5): si prende quello che il database dichiara e si guarda
   * se è ancora sul disco. Non corregge niente da sola — propone di scaricare
   * quello che manca, che è un lavoro come gli altri.
   */
  const verify = async () => {
    if (!entry.versionId) return;
    setBusy(true);
    try {
      const paths = await listVersionVaultPaths(entry.versionId);
      if (paths.length === 0) {
        // Nessun file registrato: non c'è niente da confrontare, e dire «tutto
        // a posto» sarebbe una risposta su zero file.
        toast.info(t('areas.library.verifyNothing'));
        return;
      }
      const checks = await verifyFilesPresent(paths);
      const missing = checks.filter((check) => check.state !== 'present').length;
      if (missing === 0) {
        toast.success(t('areas.library.verifyIntact', { count: checks.length }));
        return;
      }
      const confirmed = await confirm({
        title: t('areas.library.verifyMissingTitle', { count: missing }),
        message: t('areas.library.verifyMissingMessage', { total: checks.length }),
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

  /**
   * «Libera spazio» (D6): cancella le carte e basta. Restano scheda, manifesto e
   * miniature, e le righe delle carte se ne vanno insieme ai file — altrimenti
   * la Biblioteca continuerebbe a dichiararle presenti.
   */
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
      await forgetVersionPages(entry.versionId);
      toast.success(t('areas.library.freeSpaceDone', { size: humanSize(freed.freedBytes) }));
      onRefresh();
    } catch (error: unknown) {
      toast.error(t('areas.library.freeSpaceFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Togliere un'opera la toglie **per intero**: scheda, collegamenti e la sua
   * cartella nel deposito (D6). Lasciare i file dietro produceva cartelle che
   * nessuna schermata sa più mostrare, e che nemmeno riaggiungendo la stessa
   * opera tornerebbero utili: la cartella prende il nome da un identificativo
   * nuovo ogni volta.
   */
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
        // I file prima delle righe: se la cancellazione fallisce, l'opera resta
        // in Biblioteca e si può riprovare, invece di sparire lasciando dietro
        // una cartella che nessuno reclama.
        await deleteVersionFiles(await providerKey(), entry.versionId);
      }
      onRemove();
    } catch (error: unknown) {
      toast.error(t('areas.library.removeFailed'), {
        description: error instanceof Error ? error.message : String(error),
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
          <span className="mt-1 block text-[11px] text-editorial-muted">
            {[pageCount, availability].filter(Boolean).join(' · ')}
          </span>
        </button>
      </div>

      <div className={`flex shrink-0 items-center gap-1 ${view === 'grid' ? 'justify-end' : ''}`}>
        {/* Lo stato non è un comando: sta prima, e non prende il posto di
            nessun pulsante. I comandi restano tutti al loro posto e si
            disattivano quando non si possono usare. */}
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
        {workspaceId && (
          // Un'opera può stare in più workspace insieme: qui si dice se sta in
          // questo, e il comando è lo stesso in entrambi i versi (#213).
          <IconButton
            size="sm"
            tone={entry.linkedToWorkspace ? 'accent' : 'default'}
            onClick={onToggleLink}
            ariaPressed={entry.linkedToWorkspace}
            title={
              entry.linkedToWorkspace
                ? t('areas.library.unlinkFromWorkspace')
                : t('areas.library.linkToWorkspace')
            }
          >
            <Link2 size={13} />
          </IconButton>
        )}
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
