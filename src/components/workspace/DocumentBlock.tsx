import { useCallback, useEffect, useState } from 'react';
import { Download, Eraser, ExternalLink, Eye, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, StatRow } from '../ui';
import { useJobsStore } from '../../stores/jobsStore';
import { enqueuePdfDownload, isTerminal } from '../../services/jobsService';
import { registerDeclaredDocument } from '../../services/libraryService';
import { openDocumentExternally } from '../../services/documentService';
import { freeVersionDocument } from '../../services/vaultService';
import { versionInventory, type DocumentCopy } from '../../services/inventoryService';
import { readManifestFacts } from '../../hooks/useManifestFacts';
import { errorMessage, logger } from '../../utils/logger';
import { confirm } from '../../stores/confirmStore';
import { humanSize } from '../../utils';
import type { LibrarySourceVersion } from '../../types';

/** Esito della verifica presso la biblioteca. */
type Availability = 'unverified' | 'checking' | 'available' | 'unavailable';

/**
 * Il PDF dell'opera: disponibilità, scaricamento, stato locale, comandi.
 *
 * Sta **dentro la sezione del libro**, sotto le copie a immagini, perché è la
 * stessa opera in un'altra forma: è lì che si sceglie se visualizzare le
 * immagini o il PDF, e tenerlo in un blocco separato lo rendeva invisibile.
 *
 * Nei dati il PDF resta una copia distinta — le sue pagine non corrispondono a
 * quelle della sequenza di immagini — ma per chi guarda è una riga di questa
 * sezione, non un'altra scheda.
 */
export function DocumentBlock({
  sourceId,
  imagesVersion,
  documentVersion,
  shownVersionId,
  onShowVersion,
  onChanged,
  reloadToken = 0,
}: {
  sourceId: string;
  /** La copia a immagini: da qui si legge il manifesto per la verifica. */
  imagesVersion: LibrarySourceVersion | null;
  /** La copia PDF registrata, quando la biblioteca l'ha dichiarata. */
  documentVersion: LibrarySourceVersion | null;
  /** La copia che il visore sta mostrando. */
  shownVersionId?: string | null;
  /** Cambia la copia mostrata dal visore: immagini o PDF. */
  onShowVersion?: (versionId: string) => void;
  onChanged: () => void;
  reloadToken?: number;
}) {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const applyChange = useJobsStore((state) => state.applyChange);
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<Availability>('unverified');
  const [local, setLocal] = useState<DocumentCopy | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const providerKey = documentVersion?.providerKey ?? imagesVersion?.providerKey ?? 'generic';
  const documentVersionId = documentVersion?.id ?? null;

  // Quanto c'è sul disco di questa copia lo dice il deposito, non il catalogo.
  useEffect(() => {
    if (!documentVersionId) {
      setLocal(null);
      return;
    }
    let cancelled = false;
    void versionInventory(documentVersionId)
      .then((inventory) => {
        if (!cancelled) setLocal(inventory?.document ?? null);
      })
      .catch(() => {
        if (!cancelled) setLocal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [documentVersionId, reloadTick, reloadToken]);

  const verify = useCallback(
    async (fresh: boolean) => {
      if (!imagesVersion?.sourceUrl) return;
      setAvailability('checking');
      try {
        const facts = await readManifestFacts(
          imagesVersion.providerKey ?? 'generic',
          imagesVersion.sourceUrl,
          { fresh },
        );
        if (!facts.document) {
          // Manifesto letto e nessun PDF dichiarato è una risposta; manifesto
          // non letto non lo è, e le due non vanno confuse.
          setAvailability(facts.openable === null ? 'unverified' : 'unavailable');
          return;
        }
        setAvailability('available');
        const added = await registerDeclaredDocument(sourceId, {
          url: facts.document.url,
          label: facts.document.label,
          providerKey: imagesVersion.providerKey ?? null,
        });
        if (added) onChanged();
      } catch (error: unknown) {
        logger.debug('library.document.checkFailed', { reason: errorMessage(error) });
        setAvailability('unverified');
      }
    },
    [imagesVersion?.providerKey, imagesVersion?.sourceUrl, sourceId, onChanged],
  );

  // All'apertura vale quello che si sa già: se la verifica è stata fatta in
  // questa sessione non si richiede niente alla biblioteca.
  useEffect(() => {
    if (documentVersionId) return;
    void verify(false);
  }, [documentVersionId, verify]);

  const job = documentVersionId ? jobs.find((entry) => entry.id === `pdf:${documentVersionId}`) : null;
  const downloading = Boolean(job && !isTerminal(job));

  const download = async () => {
    if (!documentVersion?.sourceUrl) return;
    setBusy(true);
    try {
      const queued = await enqueuePdfDownload({
        providerKey,
        sourceUrl: documentVersion.sourceUrl,
        versionId: documentVersion.id,
      });
      applyChange(queued);
      toast.success(t('areas.library.documentQueued'));
    } catch (error: unknown) {
      toast.error(t('areas.library.documentDownloadFailed'), { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!documentVersion) return;
    const confirmed = await confirm({
      title: t('areas.library.documentFreeTitle', { size: humanSize(local?.bytes ?? 0) }),
      message: t('areas.library.documentFreeMessage'),
      confirmLabel: t('areas.library.freeSpaceConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const freed = await freeVersionDocument(providerKey, documentVersion.id);
      toast.success(t('areas.library.freeSpaceDone', { size: humanSize(freed.freedBytes) }));
      setReloadTick((tick) => tick + 1);
      onChanged();
    } catch (error: unknown) {
      const reason = errorMessage(error);
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
    if (!documentVersion) return;
    try {
      await openDocumentExternally(providerKey, documentVersion.id);
    } catch (error: unknown) {
      toast.error(t('areas.library.documentOpenFailed'), { description: errorMessage(error) });
    }
  };

  // Uno stato solo, con le parole che descrivono la situazione vera.
  const status = documentVersion
    ? local
      ? t('areas.library.documentDownloaded')
      : downloading
        ? t('areas.library.documentDownloading')
        : t('areas.library.documentNotDownloaded')
    : availability === 'checking'
      ? t('areas.library.documentChecking')
      : availability === 'unavailable'
        ? t('areas.library.documentUnavailable')
        : imagesVersion?.sourceUrl
          ? t('areas.library.documentUnverified')
          : t('areas.library.documentNoManifest');

  const showing = Boolean(documentVersionId && shownVersionId === documentVersionId);

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-editorial-muted">
          {t('areas.library.documentField')} · {status}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {documentVersion ? (
            <>
              {local && onShowVersion && (
                <IconButton
                  size="sm"
                  tone={showing ? 'accent' : 'default'}
                  ariaPressed={showing}
                  disabled={showing}
                  onClick={() => onShowVersion(documentVersion.id)}
                  title={t(showing ? 'areas.library.documentShown' : 'areas.library.documentShow')}
                >
                  <Eye size={13} />
                </IconButton>
              )}
              {local && (
                <IconButton
                  size="sm"
                  onClick={() => void openOutside()}
                  title={t('areas.library.documentOpenOutside')}
                >
                  <ExternalLink size={13} />
                </IconButton>
              )}
              {local ? (
                <IconButton
                  size="sm"
                  tone="danger"
                  disabled={busy}
                  onClick={() => void remove()}
                  title={t('areas.library.documentFreeAction')}
                >
                  <Eraser size={13} />
                </IconButton>
              ) : (
                <IconButton
                  size="sm"
                  disabled={busy || downloading || !documentVersion.sourceUrl}
                  onClick={() => void download()}
                  title={t('areas.library.documentDownload')}
                >
                  {busy || downloading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                </IconButton>
              )}
            </>
          ) : (
            <IconButton
              size="sm"
              disabled={availability === 'checking' || !imagesVersion?.sourceUrl}
              onClick={() => void verify(true)}
              title={t('areas.library.documentVerify')}
            >
              {availability === 'checking' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
            </IconButton>
          )}
        </span>
      </div>

      {local && (
        <dl className="space-y-1 pl-0.5">
          <StatRow
            label={t('areas.library.pagesField')}
            value={
              local.pages === null
                ? t('areas.library.documentPagesUnknown')
                : t('areas.library.pageCount', { count: local.pages })
            }
          />
          <StatRow label={t('areas.library.localVersionSpace')} value={humanSize(local.bytes)} />
        </dl>
      )}
    </div>
  );
}
