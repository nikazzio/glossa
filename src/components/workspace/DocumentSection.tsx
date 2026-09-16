import { useEffect, useState } from 'react';
import { Download, Eraser, Eye, ExternalLink, HardDrive, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, SectionLabel, StatRow } from '../ui';
import { useJobsStore } from '../../stores/jobsStore';
import { enqueuePdfDownload, isTerminal } from '../../services/jobsService';
import { versionProviderKey } from '../../services/libraryService';
import { openDocumentExternally } from '../../services/documentService';
import { freeVersionDocument } from '../../services/vaultService';
import { confirm } from '../../stores/confirmStore';
import { humanSize } from '../../utils';
import type { DocumentCopy } from '../../services/inventoryService';
import type { LibrarySourceVersion } from '../../types';

/**
 * La copia di un'opera che la biblioteca serve come file unico.
 *
 * Non è una misura della copia a immagini: sta accanto ad essa, con il suo
 * conteggio di pagine letto dal file, e si elimina da sola senza toccare le
 * immagini della stessa opera.
 */
export function DocumentSection({
  version,
  document,
  isOpenInViewer,
  viewing,
  onView,
  onChanged,
}: {
  version: LibrarySourceVersion;
  /** Il documento già presente sul computer, quando c'è. */
  document: DocumentCopy | null;
  /** Vero quando il visore sta mostrando questa digitalizzazione. */
  isOpenInViewer: boolean;
  /** Vero quando il visore sta leggendo proprio questo documento. */
  viewing: boolean;
  onView?: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const applyChange = useJobsStore((state) => state.applyChange);
  const [busy, setBusy] = useState(false);
  const [providerKey, setProviderKey] = useState(version.providerKey ?? null);

  useEffect(() => {
    if (providerKey) return;
    let cancelled = false;
    void versionProviderKey(version.id).then((key) => {
      if (!cancelled) setProviderKey(key ?? 'generic');
    });
    return () => {
      cancelled = true;
    };
  }, [version.id, providerKey]);

  const job = jobs.find((entry) => entry.id === `pdf:${version.id}`);
  const running = Boolean(job && !isTerminal(job));

  const download = async () => {
    if (!version.sourceUrl) return;
    setBusy(true);
    try {
      const key = providerKey ?? (await versionProviderKey(version.id)) ?? 'generic';
      const queued = await enqueuePdfDownload({
        providerKey: key,
        sourceUrl: version.sourceUrl,
        versionId: version.id,
      });
      applyChange(queued);
      onChanged();
      toast.success(t('areas.library.documentQueued'));
    } catch (error: unknown) {
      toast.error(t('areas.library.documentDownloadFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const confirmed = await confirm({
      title: t('areas.library.documentFreeTitle', { size: humanSize(document?.bytes ?? 0) }),
      message: t('areas.library.documentFreeMessage'),
      confirmLabel: t('areas.library.freeSpaceConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const key = providerKey ?? (await versionProviderKey(version.id)) ?? 'generic';
      const freed = await freeVersionDocument(key, version.id);
      toast.success(t('areas.library.freeSpaceDone', { size: humanSize(freed.freedBytes) }));
      onChanged();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('version_work_in_progress')) {
        toast.info(t('areas.library.filesBusy'));
        return;
      }
      toast.error(t('areas.library.documentFreeFailed'), { description: reason });
    } finally {
      setBusy(false);
    }
  };

  const openOutside = async () => {
    try {
      const key = providerKey ?? (await versionProviderKey(version.id)) ?? 'generic';
      await openDocumentExternally(key, version.id);
    } catch (error: unknown) {
      toast.error(t('areas.library.documentOpenFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="space-y-8 border-t border-editorial-border/60 pt-4">
      <section className="space-y-3">
        <SectionLabel icon={HardDrive} label={t('areas.library.documentSection')} />

        {/* Il documento è un file solo: niente misure da scegliere, quindi il
            comando è uno e sta da solo sopra quello che se n'è già preso. */}
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="min-w-0 truncate text-xs text-editorial-muted">
            {document
              ? t('areas.library.documentPresent')
              : running
                ? t('areas.library.documentDownloading')
                : t('areas.library.documentAbsent')}
          </span>
          <IconButton
            size="sm"
            onClick={() => void download()}
            disabled={busy || running || !version.sourceUrl || Boolean(document)}
            title={
              document ? t('areas.library.documentAlreadyHere') : t('areas.library.documentDownload')
            }
          >
            {busy || running ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
          </IconButton>
        </div>

        {document && (
          <div className="space-y-2 border-t border-editorial-border/60 pt-3">
            <div className="flex items-center justify-end gap-1">
              {isOpenInViewer && onView && (
                <IconButton
                  size="sm"
                  tone={viewing ? 'accent' : 'default'}
                  onClick={onView}
                  ariaPressed={viewing}
                  disabled={viewing}
                  title={t(
                    viewing
                      ? 'areas.library.localVersionBeingRead'
                      : 'areas.library.localVersionRead',
                  )}
                >
                  <Eye size={13} />
                </IconButton>
              )}
              <IconButton
                size="sm"
                onClick={() => void openOutside()}
                title={t('areas.library.documentOpenOutside')}
              >
                <ExternalLink size={13} />
              </IconButton>
              <IconButton
                size="sm"
                tone="danger"
                onClick={() => void remove()}
                disabled={busy}
                title={t('areas.library.documentFreeAction')}
              >
                <Eraser size={13} />
              </IconButton>
            </div>
            <dl className="space-y-1 pl-0.5">
              <StatRow
                label={t('areas.library.localVersionOrigin')}
                value={t('areas.library.localVersionDownloaded')}
              />
              {/* Le pagine si contano dal file: quando il documento non si è
                  potuto aprire per contarle, non se ne inventa un numero. */}
              <StatRow
                label={t('areas.library.pagesField')}
                value={
                  document.pages === null
                    ? t('areas.library.documentPagesUnknown')
                    : t('areas.library.pageCount', { count: document.pages })
                }
              />
              <StatRow
                label={t('areas.library.localVersionSpace')}
                value={humanSize(document.bytes)}
              />
              <StatRow
                label={t('areas.library.statusField')}
                value={t('areas.library.documentComplete')}
              />
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}
