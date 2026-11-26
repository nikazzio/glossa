import { useCallback, useEffect, useState } from 'react';
import { Download, Eraser, ExternalLink, Eye, FileUp, Images, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, StatRow } from '../ui';
import { useJobsStore } from '../../stores/jobsStore';
import { enqueuePdfDownload, isTerminal, parseJobDetail } from '../../services/jobsService';
import { registerDeclaredDocument } from '../../services/libraryService';
import { openDocumentExternally } from '../../services/documentService';
import { freeVersionDocument } from '../../services/vaultService';
import { versionInventory, type DocumentCopy } from '../../services/inventoryService';
import { readManifestFacts } from '../../hooks/useManifestFacts';
import { enqueuePdfExtraction, importPdfIntoWork, isImportUrl, pickPdfFile } from '../../services/pdfImportService';
import { errorMessage, logger } from '../../utils/logger';
import { confirm } from '../../stores/confirmStore';
import { humanSize } from '../../utils';
import type { LibrarySourceVersion } from '../../types';

/** Esito della verifica presso la biblioteca. */
type Availability = 'unverified' | 'checking' | 'available' | 'unavailable';

/** A che punto è l'estrazione delle pagine del PDF. */
type Extraction = 'todo' | 'running' | 'done' | 'incomplete';

/** Le pagine non estratte, dall'errore del lavoro (`extraction_incomplete:3,7`). */
function failedPages(error: string | null | undefined): string | null {
  const match = /extraction_incomplete:([\d,]+)/.exec(error ?? '');
  return match ? match[1].split(',').join(', ') : null;
}

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
  extractedVersionId = null,
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
  /** La copia a immagini nata dall'estrazione delle pagine del PDF, se c'è. */
  extractedVersionId?: string | null;
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

  // Quante pagine estratte ci sono sul computer: con tutte le pagine del PDF
  // l'estrazione è fatta, anche senza il lavoro in elenco.
  const [extractedPages, setExtractedPages] = useState(0);
  useEffect(() => {
    if (!extractedVersionId) {
      setExtractedPages(0);
      return;
    }
    let cancelled = false;
    void versionInventory(extractedVersionId)
      .then((inventory) => {
        const pages = inventory?.sizes.reduce((most, size) => Math.max(most, size.pages), 0) ?? 0;
        if (!cancelled) setExtractedPages(pages);
      })
      .catch(() => {
        if (!cancelled) setExtractedPages(0);
      });
    return () => {
      cancelled = true;
    };
  }, [extractedVersionId, reloadTick, reloadToken]);

  const extractJob = documentVersionId ? jobs.find((entry) => entry.id === `extract:${documentVersionId}`) : null;
  const extraction: Extraction = extractJob && !isTerminal(extractJob)
    ? 'running'
    : local?.pages && extractedPages >= local.pages
      ? 'done'
      : extractJob?.status === 'error' || extractedPages > 0
        ? 'incomplete'
        : 'todo';
  const extractionFinished = extractJob && isTerminal(extractJob) ? extractJob.id + extractJob.status : null;
  useEffect(() => {
    if (!extractionFinished) return;
    setReloadTick((tick) => tick + 1);
    onChanged();
  }, [extractionFinished, onChanged]);
  const missingPages = failedPages(extractJob?.error);

  const extract = async () => {
    if (!documentVersion) return;
    setBusy(true);
    try {
      applyChange(await enqueuePdfExtraction(documentVersion.id));
      onChanged();
    } catch (error: unknown) {
      logger.warn('library.document.extractFailed', { reason: errorMessage(error) });
      toast.error(t('areas.library.extractFailed'));
    } finally {
      setBusy(false);
    }
  };

  const importLocal = async () => {
    const path = await pickPdfFile(t('areas.library.importPdfPick'));
    if (!path) return;
    setBusy(true);
    try {
      await importPdfIntoWork(sourceId, path);
      toast.success(t('areas.library.importPdfDone'));
      setReloadTick((tick) => tick + 1);
      onChanged();
    } catch (error: unknown) {
      const reason = errorMessage(error);
      logger.warn('library.document.importFailed', { reason });
      toast.error(t(reason.includes('pdf_invalid') || reason.includes('pdf_pages_unreadable')
        ? 'areas.library.importPdfInvalid'
        : 'areas.library.importPdfFailed'));
    } finally {
      setBusy(false);
    }
  };

  const job = documentVersionId ? jobs.find((entry) => entry.id === `pdf:${documentVersionId}`) : null;
  const downloading = Boolean(job && !isTerminal(job));
  // Uno scaricamento finito ha cambiato il disco: senza rileggerlo la riga
  // resterebbe su «non scaricato», con il comando di scaricamento ancora
  // acceso, finché non si riapre l'opera.
  const finished = job && isTerminal(job) ? job.id + job.status : null;
  useEffect(() => {
    if (!finished) return;
    setReloadTick((tick) => tick + 1);
  }, [finished]);

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
      // Il motivo tecnico va nel registro, non a schermo: può contenere
      // percorsi del disco o dettagli di rete, e a chi legge non dice niente.
      logger.warn('library.document.downloadFailed', { reason: errorMessage(error) });
      toast.error(t('areas.library.documentDownloadFailed'));
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
      logger.warn('library.document.freeFailed', { reason });
      toast.error(t('areas.library.documentFreeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openOutside = async () => {
    if (!documentVersion) return;
    try {
      await openDocumentExternally(providerKey, documentVersion.id);
    } catch (error: unknown) {
      logger.warn('library.document.openFailed', { reason: errorMessage(error) });
      toast.error(t('areas.library.documentOpenFailed'));
    }
  };

  // Uno stato solo, con le parole che descrivono la situazione vera.
  const status = documentVersion
    ? local
      ? extraction === 'running'
        ? t('areas.library.extractProgress', {
          done: parseJobDetail(extractJob?.detail ?? null).units?.done ?? 0,
          total: local.pages ?? 0,
        })
        : t(isImportUrl(documentVersion.sourceUrl) ? 'areas.library.documentImported' : 'areas.library.documentDownloaded')
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
              {local && (
                <IconButton
                  size="sm"
                  tone={extraction === 'running' ? 'running' : extraction === 'done' ? 'success' : extraction === 'incomplete' ? 'warning' : 'default'}
                  disabled={busy || extraction === 'running'}
                  onClick={() => void extract()}
                  title={extraction === 'running'
                    ? t('areas.library.extractRunning')
                    : extraction === 'done'
                      ? t('areas.library.extractDone')
                      : missingPages
                        ? t('areas.library.extractIncomplete', { pages: missingPages })
                        : t('areas.library.extractAction')}
                >
                  {extraction === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Images size={13} />}
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
                <>
                <IconButton
                  size="sm"
                  disabled={busy || downloading}
                  onClick={() => void importLocal()}
                  title={t('areas.library.importPdfAction')}
                >
                  <FileUp size={13} />
                </IconButton>
                {!isImportUrl(documentVersion.sourceUrl) && (
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
              )}
            </>
          ) : (
            <>
            <IconButton
              size="sm"
              disabled={busy}
              onClick={() => void importLocal()}
              title={t('areas.library.importPdfAction')}
            >
              <FileUp size={13} />
            </IconButton>
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
            </>
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
