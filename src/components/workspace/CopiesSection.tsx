import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eraser, Eye, HardDrive, Loader2, Minimize2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClickPopover, IconButton, SectionLabel, Select, StatBlock, StatRow } from '../ui';
import { useJobsStore } from '../../stores/jobsStore';
import { enqueueSourceDownload, isTerminal } from '../../services/jobsService';
import { versionProviderKey } from '../../services/libraryService';
import {
  versionInventory,
  type DocumentCopy,
  type SizeFolder,
} from '../../services/inventoryService';
import { excludedPages } from '../../services/excludedPagesService';
import { CopyProvenance } from './CopyProvenance';
import { errorMessage, logger } from '../../utils/logger';
import {
  enqueueOptimization,
  getOptimizeQuality,
  OPTIMIZE_QUALITIES,
} from '../../services/optimizeService';
import {
  DEFAULT_SIZE_CAP,
  getVersionSizeCap,
  setVersionSizeCap,
  SIZE_CAPS,
} from '../../services/downloadSettingsService';
import { confirm } from '../../stores/confirmStore';
import { freeVersionSize } from '../../services/vaultService';
import { toast } from 'sonner';
import { humanSize } from '../../utils';
import { resolutionLabel } from '../../utils/resolutionLabel';
import { VersionTechnicalData } from './VersionTechnicalData';
import { OpenPageSection, type ShownPage } from './OpenPageSection';
import { DocumentBlock } from './DocumentBlock';
import type {
  IIIFProvider,
  LibraryCatalogEntry,
  LibrarySourceDetail,
  LibrarySourceVersion,
} from '../../types';

/** Quanto c'è sul computer, per una copia: le risoluzioni presenti, quale è
 *  la principale, quante pagine e quanto pesano. */
interface CopyInventory {
  sizes: SizeFolder[];
  principal: string | null;
  localPages: number;
  localBytes: number;
  /** Il documento unico, per le copie che la biblioteca serve come file. */
  document: DocumentCopy | null;
}

function emptyInventory(): CopyInventory {
  return { sizes: [], principal: null, localPages: 0, localBytes: 0, document: null };
}

/** La misura scritta nella configurazione di un lavoro di scaricamento, per
 *  sapere davvero cosa **quel** lavoro ha portato a casa — e non quello che
 *  la preferenza dice adesso, che può essere cambiata nel frattempo. */
function sizeTagOfConfig(config: string): string | null {
  try {
    const parsed = JSON.parse(config) as { sizeTag?: unknown };
    return typeof parsed.sizeTag === 'string' ? parsed.sizeTag : null;
  } catch {
    return null;
  }
}

/** Le copie digitali dell'opera: per ognuna, cosa è (manifesto IIIF, PDF,
 *  altro), quanto ne hai sul computer — a ogni risoluzione davvero presente,
 *  non solo quella con cui è stata scaricata — e i comandi per cambiarlo:
 *  scaricare a una nuova risoluzione, ricavarne una compressa senza toccare
 *  l'originale, verificare o liberare spazio. Ogni copia è autosufficiente:
 *  non solo quella con cui l'opera è stata trovata. Archiviare e rimuovere
 *  restano nel menu dell'intestazione, perché riguardano l'opera intera, non
 *  una copia sola. */
export function CopiesSection({
  detail,
  entry,
  onRefresh,
  openVersionId = null,
  viewedLocalSize = null,
  onViewLocalSize,
  reloadToken = 0,
  provider,
  shownPage = null,
  shownVersionId = null,
  onShowVersion,
}: {
  detail: LibrarySourceDetail;
  entry?: LibraryCatalogEntry;
  onRefresh: () => void;
  /** Cambia quando qualcosa fuori da questa scheda ha toccato i file — una
   *  pagina conservata dal visore: le versioni locali si rileggono. */
  reloadToken?: number;
  /** La digitalizzazione che il visore sta mostrando: solo le sue versioni
   *  locali si possono aprire da qui. */
  openVersionId?: string | null;
  /** La versione locale che il visore sta leggendo, quando è stata scelta. */
  viewedLocalSize?: string | null;
  onViewLocalSize?: (sizeTag: string | null) => void;
  /** La biblioteca di questa copia: serve ai collegamenti dei dati tecnici. */
  provider?: IIIFProvider;
  /** La pagina aperta nel visore, per darne gli indirizzi fra i dati tecnici. */
  shownPage?: ShownPage | null;
  /** La copia che il visore sta mostrando, e come cambiarla. */
  shownVersionId?: string | null;
  onShowVersion?: (versionId: string) => void;
}) {
  const { t } = useTranslation();
  // Il PDF non è una voce dell'elenco: è una riga dentro la sezione del libro
  // della copia a immagini, perché è la stessa opera in un'altra forma e la
  // scelta di cosa visualizzare si fa lì.
  const imageVersions = detail.versions.filter((version) => version.versionKind !== 'pdf');
  const documentVersion = detail.versions.find((version) => version.versionKind === 'pdf') ?? null;

  return (
    // Niente intestazione di sezione qui: la tab la dà già ("Copie digitali").
    // Niente riquadro a sfondo: la tab stessa è già il contenitore, un'altra
    // cornice attorno sarebbe una scatola dentro la scatola.
    <ul className="divide-y divide-editorial-border/70">
      {imageVersions.map((version) => (
        <li key={version.id} className="space-y-3 py-4 first:pt-0">
          <div>
            <CopyProvenance
              providerLabel={provider?.label}
              className="block truncate font-display text-sm italic text-editorial-ink"
            />
            {/* Il tipo sta sotto il nome della biblioteca; senza nome sarebbe
                l'unica riga e ripeterebbe quello che il segno già dice. */}
            {provider?.label && (
              <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
                {t(`areas.library.versionKindLabels.${version.versionKind}`)}
              </span>
            )}
          </div>

          <CopyDetails
            version={version}
            sourceId={detail.source.id}
            documentVersion={documentVersion}
            shownVersionId={shownVersionId}
            onShowVersion={onShowVersion}
            shownPage={version.id === openVersionId ? shownPage : null}
            entry={entry && version.id === entry.versionId ? entry : undefined}
            onRefresh={onRefresh}
            reloadToken={reloadToken}
            isOpenInViewer={version.id === openVersionId}
            viewedLocalSize={viewedLocalSize}
            onViewLocalSize={onViewLocalSize}
          />

          <VersionTechnicalData
            version={version}
            detail={detail}
            provider={provider}
            shownPage={version.id === openVersionId ? shownPage : null}
          />
        </li>
      ))}
    </ul>
  );
}

/** Quanto c'è sul computer di questa copia, a ogni risoluzione: lo chiede al
 *  motore, che legge le cartelle. La riga di catalogo ne porta una fotografia,
 *  scattata all'apertura della Biblioteca, e serve solo per il conteggio
 *  atteso e la chiave della biblioteca: dopo uno scaricamento o una
 *  compressione quella fotografia è vecchia, e mostrarla significava non far
 *  comparire la versione appena creata. */
function CopyDetails({
  version,
  sourceId,
  documentVersion,
  shownVersionId,
  onShowVersion,
  entry,
  onRefresh,
  reloadToken,
  isOpenInViewer,
  viewedLocalSize,
  onViewLocalSize,
  shownPage,
}: {
  version: LibrarySourceVersion;
  sourceId: string;
  /** La copia PDF della stessa opera, quando la biblioteca l'ha dichiarata. */
  documentVersion: LibrarySourceVersion | null;
  shownVersionId?: string | null;
  onShowVersion?: (versionId: string) => void;
  /** La pagina aperta nel visore, quando è di questa copia. */
  shownPage?: ShownPage | null;
  entry?: LibraryCatalogEntry;
  onRefresh: () => void;
  reloadToken: number;
  isOpenInViewer: boolean;
  viewedLocalSize: string | null;
  onViewLocalSize?: (sizeTag: string | null) => void;
}) {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const [fetched, setFetched] = useState<CopyInventory | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [excluded, setExcluded] = useState(0);
  const [sizeCap, setSizeCap] = useState(DEFAULT_SIZE_CAP);
  const providerKeyRef = useRef<string | null>(null);

  // Si rilegge anche quando il catalogo l'aveva già dato: dopo una
  // compressione o una cancellazione la lista delle misure è cambiata, e la
  // fotografia scattata dal catalogo all'apertura non lo sa.
  // Sempre dal deposito, anche quando il catalogo aveva già una fotografia:
  // dopo una compressione, uno scaricamento o una cancellazione le cartelle
  // sono cambiate, e quella fotografia è di prima.
  useEffect(() => {
    let cancelled = false;
    void versionInventory(version.id).then((result) => {
      if (!cancelled) {
        setFetched(
          result
            ? {
                sizes: result.sizes,
                principal: result.principal,
                localPages: result.sizes.find((size) => size.sizeTag === result.principal)?.pages ?? 0,
                localBytes: result.sizes.reduce((total, size) => total + size.bytes, 0),
                document: result.document,
              }
            : emptyInventory(),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [version.id, reloadTick, reloadToken]);

  const reload = () => setReloadTick((tick) => tick + 1);

  /** Un lavoro ha cambiato i file: rilegge il deposito e la riga di catalogo. */
  const reloadAll = () => {
    reload();
    onRefresh();
  };

  const providerKey = async () => {
    if (providerKeyRef.current) return providerKeyRef.current;
    const key = entry?.providerKey ?? version.providerKey ?? (await versionProviderKey(version.id)) ?? 'generic';
    providerKeyRef.current = key;
    return key;
  };

  const inventory: CopyInventory = fetched ?? emptyInventory();
  // La risoluzione scelta per questa copia vale anche prima di scaricare il
  // libro: è lì che finisce una pagina presa da sola leggendo online.
  useEffect(() => {
    let cancelled = false;
    void getVersionSizeCap(version.id)
      .then((stored) => {
        if (!cancelled) setSizeCap(stored ?? DEFAULT_SIZE_CAP);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [version.id, reloadTick]);

  // Le pagine tolte di proposito non sono un buco: vanno dette, altrimenti la
  // copia sembra incompleta per un guasto.
  useEffect(() => {
    let cancelled = false;
    void excludedPages(version.id)
      .then((pages) => {
        if (!cancelled) setExcluded(pages.size);
      })
      .catch(() => {
        if (!cancelled) setExcluded(0);
      });
    return () => {
      cancelled = true;
    };
  }, [version.id, reloadToken, reloadTick]);

  const reading = fetched === null;
  const expectedPages = entry?.expectedPages ?? version.expectedPages ?? 0;
  const { sizes, principal, localPages, localBytes } = inventory;
  // Le pagine contate dal deposito, oppure le cartelle di misura quando
  // l'inventario non risponde ma il catalogo sa già che c'è qualcosa.
  const hasLocalPages = localPages > 0 || sizes.some((size) => size.pages > 0);
  const runningDownload = jobs.some((job) => job.id === `download:${version.id}` && !isTerminal(job));
  const lastDownload = jobs.find((job) => job.id === `download:${version.id}`);
  // Una compressione finita ha cambiato le cartelle: la lista delle versioni
  // locali va riletta, altrimenti la copia appena ricavata non compare finché
  // non si riapre l'opera. Un download fallito o annullato rilegge anche lui —
  // le pagine già arrivate potrebbero essere cambiate — ma **non consolida**:
  // quello lo fa solo il ramo qui sotto, e solo a scaricamento riuscito.
  const finishedOptimizeJobs = jobs.filter(
    (job) => job.id.startsWith(`optimize:${version.id}:`) && isTerminal(job),
  ).length;

  useEffect(() => {
    if (finishedOptimizeJobs === 0) return;
    setReloadTick((tick) => tick + 1);
  }, [finishedOptimizeJobs]);

  // Un download **riuscito** porta l'opera a una misura sola: le altre se ne
  // vanno adesso, non prima, così un guasto di rete non lascia il libro senza
  // niente. La misura da tenere è quella che **quel lavoro** ha scaricato
  // davvero — letta dalla sua configurazione — e non la preferenza corrente:
  // cambiarla mentre lo scaricamento era ancora in corso cancellava altrimenti
  // la copia appena arrivata invece di una vecchia.
  const completedDownload = jobs.find(
    (job) => job.id === `download:${version.id}` && job.status === 'completed',
  );
  // Chiave primitiva e non l'oggetto lavoro: lo stesso completamento non deve
  // far ripartire il consolidamento a ogni nuovo render, ma un rilancio con
  // un'altra misura — stesso identificativo, configurazione diversa — sì.
  const completedDownloadKey = completedDownload
    ? `${completedDownload.id}:${completedDownload.config}`
    : null;

  const consolidate = useCallback(async (kept: string) => {
    const inventory = await versionInventory(version.id);
    if (!inventory) return;
    const extra = inventory.sizes.filter((size) => size.sizeTag !== kept && !size.derived);
    if (extra.length === 0) return;
    for (const size of extra) {
      await freeVersionSize(inventory.providerKey ?? 'generic', version.id, size.sizeTag, false);
    }
    logger.info('library.version.consolidated', {
      versionId: version.id,
      kept,
      removed: extra.length,
    });
  }, [version.id]);

  useEffect(() => {
    if (!completedDownload) return;
    const kept = sizeTagOfConfig(completedDownload.config) ?? DEFAULT_SIZE_CAP;
    void consolidate(kept).catch((error: unknown) => {
      logger.warn('library.version.consolidateFailed', { reason: errorMessage(error) });
    });
    setReloadTick((tick) => tick + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `completedDownloadKey` è la chiave primitiva voluta: `completedDownload` cambierebbe riferimento a ogni render senza motivo.
  }, [completedDownloadKey, consolidate]);

  const startDownload = async () => {
    if (!version.sourceUrl) return;
    const job = await enqueueSourceDownload({
      providerKey: await providerKey(),
      manifestUrl: version.sourceUrl,
      versionId: version.id,
    });
    useJobsStore.getState().applyChange(job);
    toast.success(t('areas.library.downloadQueued'));
  };

  const verify = async () => {
    setBusy(true);
    try {
      const principalSize = sizes.find((size) => size.sizeTag === principal);
      if (!principalSize) {
        toast.info(t('areas.library.verifyNothing'));
        return;
      }
      if (expectedPages <= 0) {
        toast.info(t('areas.library.verifyNoExpected', { count: principalSize.pages }));
        return;
      }
      const missing = Math.max(0, expectedPages - principalSize.pages - principalSize.missing);
      if (missing === 0) {
        toast.success(t('areas.library.verifyIntact', { count: principalSize.pages }));
        return;
      }
      const confirmed = await confirm({
        title: t('areas.library.verifyMissingTitle', { count: missing }),
        message: t('areas.library.verifyMissingMessage', { total: expectedPages }),
        confirmLabel: t('areas.library.verifyDownloadMissing'),
      });
      if (confirmed) await startDownload();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(
        reason.includes('vault_unreachable') ? t('areas.library.vaultUnreachable') : t('areas.library.verifyFailed'),
        { description: reason },
      );
    } finally {
      setBusy(false);
    }
  };


  const freeSizeRow = (size: SizeFolder) => async () => {
    const confirmed = await confirm({
      title: t('areas.library.freeSizeTitle', { size: humanSize(size.bytes) }),
      message: t('areas.library.freeSizeMessage'),
      confirmLabel: t('areas.library.freeSpaceConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      const freed = await freeVersionSize(await providerKey(), version.id, size.sizeTag, size.derived);
      toast.success(t('areas.library.freeSpaceDone', { size: humanSize(freed.freedBytes) }));
      reloadAll();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('version_work_in_progress')) {
        toast.info(t('areas.library.filesBusy'));
        return;
      }
      toast.error(t('areas.library.freeSpaceFailed'), { description: reason });
    }
  };

  return (
    <div className="space-y-8 border-t border-editorial-border/60 pt-4">
      {/* La pagina aperta viene prima: è il contesto in cui si sta mentre si
          legge, e i suoi comandi sono quelli che si cercano subito. */}
      {version.versionKind === 'iiif_manifest' && (
        <OpenPageSection
          version={version}
          providerKey={version.providerKey ?? 'generic'}
          shownPage={isOpenInViewer ? (shownPage ?? null) : null}
          bookSize={principal}
          sizeCap={sizeCap}
          onChanged={reloadAll}
        />
      )}
      {/* Il libro: prima come si prende, poi cosa se n'è già preso. Sopra
          resta la pagina che si sta leggendo, che è un'altra scala. */}
      <section className="space-y-3">
        {/* Nell'intestazione non restano comandi: verifica, ricompressione ed
            eliminazione riguardano le pagine sul disco, e stanno sulla riga che
            le descrive. */}
        <SectionLabel icon={HardDrive} label={t('areas.library.bookSection')} />

        {/* Le digitalizzazioni a immagini si scaricano dal manifesto; il
            documento unico ha la sua sezione. Per un file di altro tipo non
            c'è niente da chiedere alla biblioteca, e offrirlo prometterebbe un
            lavoro che finisce in errore. */}
        {version.versionKind === 'iiif_manifest' ? (
          <DownloadRow
            version={version}
            existingSizes={sizes}
            expectedPages={expectedPages}
            disabled={busy || runningDownload || !version.sourceUrl}
            onDownloaded={reloadAll}
          />
        ) : (
          <p className="text-xs text-editorial-muted">{t('areas.library.downloadOnlyImages')}</p>
        )}

        <StatBlock label={t('areas.library.occupiedField')} value={humanSize(localBytes)} />

        {!reading && !hasLocalPages && (
          <p className="text-xs text-editorial-muted">
            {lastDownload?.status === 'error'
              ? t('areas.library.localVersionLastDownloadFailed')
              : t('areas.library.localVersionNeverDownloaded')}
          </p>
        )}

        {excluded > 0 && (
          // Dichiarate qui e non dentro una misura: l'esclusione vale per la
          // copia, e una copia «incompleta» senza spiegazione sembra guasta.
          <p className="text-xs text-editorial-muted">
            {t('areas.library.excludedPagesCount', { count: excluded })}
          </p>
        )}
        {sizes.length > 0 && (
          <div className="space-y-4 pt-1">
            {sizes.map((size) => (
              <ResolutionRow
                key={`${size.sizeTag}-${size.derived ? 'derived' : 'native'}`}
                version={version}
                size={size}
                onCompressed={reloadAll}
                expectedPages={expectedPages}
                viewing={isOpenInViewer && shownVersionId === version.id && viewedLocalSize === size.sizeTag}
                onView={
                  onViewLocalSize
                    ? (sizeTag) => {
                        // Scegliere una misura è anche scegliere le immagini:
                        // se a schermo c'è il PDF, si torna indietro.
                        onShowVersion?.(version.id);
                        onViewLocalSize(sizeTag);
                      }
                    : undefined
                }
                onFree={freeSizeRow(size)}
                onVerify={verify}
                excluded={excluded}
              />
            ))}
          </div>
        )}

        {/* Il PDF è la stessa opera in un'altra forma: sta qui, sotto le copie
            a immagini, perché è qui che si sceglie cosa visualizzare. */}
        <DocumentBlock
          sourceId={sourceId}
          imagesVersion={version}
          documentVersion={documentVersion}
          shownVersionId={shownVersionId}
          onShowVersion={onShowVersion}
          onChanged={reloadAll}
          reloadToken={reloadToken}
        />
      </section>
    </div>
  );
}

/** Una risoluzione già presente sul computer: quante pagine (su quante
 *  dichiarate), quanto occupa, se è l'originale o una copia ricavata in
 *  locale, e il comando per liberare solo questa — senza toccare le altre. */
function ResolutionRow({
  version,
  size,
  expectedPages,
  viewing,
  onView,
  onFree,
  onVerify,
  onCompressed,
  excluded,
}: {
  version: LibrarySourceVersion;
  size: SizeFolder;
  /** Pagine tolte di proposito: non sono un buco, e senza contarle la copia
   *  resterebbe «incompleta» per sempre. */
  excluded: number;
  expectedPages: number;
  /** Vero quando il visore sta leggendo proprio questa versione. */
  viewing: boolean;
  /** Presente solo per la digitalizzazione aperta nel visore. */
  onView?: (sizeTag: string) => void;
  onFree: () => Promise<void>;
  onVerify: () => Promise<void>;
  onCompressed: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const pagesLabel =
    expectedPages > 0
      ? t('areas.library.resolutionPages', { done: size.pages, total: expectedPages })
      : t('areas.library.pageCount', { count: size.pages });
  // Le pagine che la biblioteca dichiara di non servire non sono un buco: una
  // versione con tutte quelle servite è completa, ed è lo stesso conto che fa
  // la disponibilità nel catalogo.
  const complete = expectedPages > 0 && size.pages + size.missing + excluded >= expectedPages;

  return (
    <div className="space-y-2 border-t border-editorial-border/60 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-display text-sm italic text-editorial-ink">
          {resolutionLabel(size.sizeTag, t)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {onView && (
            <IconButton
              size="sm"
              tone={viewing ? 'accent' : 'default'}
              onClick={() => onView(size.sizeTag)}
              ariaPressed={viewing}
              disabled={viewing || size.pages === 0}
              title={t(viewing ? 'areas.library.localVersionBeingRead' : 'areas.library.localVersionRead')}
            >
              <Eye size={13} />
            </IconButton>
          )}
          {/* I tre comandi che riguardano queste pagine, nell'ordine in cui si
              usano: controlla, alleggerisci, elimina. */}
          <IconButton
            size="sm"
            onClick={() => {
              setBusy(true);
              void onVerify().finally(() => setBusy(false));
            }}
            disabled={busy || size.pages === 0}
            title={t('areas.library.verify')}
          >
            <ShieldCheck size={13} />
          </IconButton>
          {/* Una copia già ridotta non si ricomprime: il motore la rifiuta, e
              offrire il comando prometterebbe qualcosa che non succede. */}
          {!size.derived && size.pages > 0 && (
            <CompressPopover
              version={version}
              sourceTag={size.sizeTag}
              onRefresh={onCompressed}
            />
          )}
          <IconButton
            size="sm"
            tone="danger"
            onClick={() => {
              setBusy(true);
              void onFree().finally(() => setBusy(false));
            }}
            disabled={busy}
            title={t('areas.library.freeSizeAction')}
          >
            <Eraser size={13} />
          </IconButton>
        </span>
      </div>
      {/* Una riga per informazione: su una riga sola erano quattro dati
          separati da punti, illeggibili in una colonna stretta. */}
      <dl className="space-y-1 pl-0.5">
        <StatRow
          label={t('areas.library.localVersionOrigin')}
          value={
            size.derived
              ? t('areas.library.localVersionDerived')
              : t('areas.library.localVersionDownloaded')
          }
        />
        <StatRow label={t('areas.library.pagesField')} value={pagesLabel} />
        <StatRow label={t('areas.library.localVersionSpace')} value={humanSize(size.bytes)} />
        <StatRow
          label={t('areas.library.statusField')}
          value={t(complete ? 'areas.library.localVersionComplete' : 'areas.library.localVersionPartial')}
        />
        {size.missing > 0 && (
          <StatRow
            label={t('areas.library.localVersionNotServedLabel')}
            value={String(size.missing)}
          />
        )}
      </dl>
    </div>
  );
}

/** A che risoluzione scaricare **una nuova** cartella di misura — mirata, non
 *  un'impostazione da un'altra parte: il comando legge sempre quella scelta
 *  qui, e resta acceso finché quella specifica risoluzione non è davvero
 *  completa. */
function DownloadRow({
  version,
  existingSizes,
  expectedPages,
  disabled,
  onDownloaded,
}: {
  version: LibrarySourceVersion;
  existingSizes: SizeFolder[];
  expectedPages: number;
  disabled: boolean;
  /** Lo scaricamento è partito: chi mostra le versioni locali deve rileggere. */
  onDownloaded: () => void;
}) {
  const { t } = useTranslation();
  const applyChange = useJobsStore((state) => state.applyChange);
  const [cap, setCap] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getVersionSizeCap(version.id).then((stored) => {
      if (!cancelled) setCap(stored ?? DEFAULT_SIZE_CAP);
    });
    return () => {
      cancelled = true;
    };
  }, [version.id]);

  const changeCap = async (value: string) => {
    setCap(value);
    await setVersionSizeCap(version.id, value);
  };

  const targetSize = existingSizes.find((size) => size.sizeTag === cap);
  const isComplete =
    Boolean(targetSize) && expectedPages > 0 && targetSize!.missing === 0 && targetSize!.pages >= expectedPages;

  const download = async () => {
    if (!cap || !version.sourceUrl) return;
    // Di un'opera si tiene una misura sola: chiederne un'altra sostituisce
    // quella che c'è, e va detto prima — non dopo, quando lo spazio è già
    // sparito. Le altre misure si cancellano a scaricamento riuscito, così un
    // guasto di rete non lascia l'opera senza niente.
    const replaced = existingSizes.filter((size) => size.sizeTag !== cap && size.pages > 0);
    if (replaced.length > 0) {
      const confirmed = await confirm({
        title: t('areas.library.downloadReplaceTitle', { size: resolutionLabel(cap, t) }),
        message: t('areas.library.downloadReplaceMessage', {
          sizes: replaced.map((size) => resolutionLabel(size.sizeTag, t)).join(' · '),
        }),
        confirmLabel: t('areas.library.downloadReplaceConfirm'),
      });
      if (!confirmed) return;
    }
    setDownloading(true);
    try {
      const providerKey = version.providerKey ?? (await versionProviderKey(version.id)) ?? 'generic';
      const job = await enqueueSourceDownload({
        providerKey,
        manifestUrl: version.sourceUrl,
        versionId: version.id,
        sizeTag: cap,
      });
      applyChange(job);
      onDownloaded();
      toast.success(t('areas.library.downloadQueued'));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      // Il motore tiene un lavoro per digitalizzazione: chiedere una misura
      // diversa mentre ne sta scaricando un'altra va detto, non ignorato.
      const running = reason.match(/download_in_progress:(.*)$/);
      if (running) {
        toast.info(
          t('areas.library.downloadInProgress', { size: resolutionLabel(running[1].trim(), t) }),
        );
        return;
      }
      toast.error(t('areas.library.downloadFailed'), { description: reason });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-2">
      <Select
        value={cap ?? ''}
        onChange={(value) => void changeCap(value)}
        ariaLabel={t('areas.library.sizeCap')}
        className="flex-1"
        options={SIZE_CAPS.map((value) => ({ value, label: resolutionLabel(value, t) }))}
      />
      <IconButton
        size="sm"
        onClick={() => void download()}
        disabled={disabled || !cap || downloading || isComplete}
        title={isComplete ? t('areas.library.resolutionComplete') : t('areas.library.downloadWholeBook')}
      >
        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </IconButton>
    </div>
  );
}

/**
 * Ricomprime le pagine della copia **sul posto**: stessi pixel, meno byte.
 *
 * Non crea una seconda copia del libro — di copie se ne tiene una — e non è
 * reversibile: l'originale non resta da nessuna parte e per riavere la qualità
 * di prima si riscarica dalla biblioteca. Si sceglie solo la qualità.
 */
function CompressPopover({
  version,
  sourceTag,
  onRefresh,
}: {
  version: LibrarySourceVersion;
  /** La misura della copia: la riga che ospita il comando. */
  sourceTag: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const applyChange = useJobsStore((state) => state.applyChange);
  const jobs = useJobsStore((state) => state.jobs);
  const [open, setOpen] = useState(false);
  const [quality, setQuality] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const running = jobs.some((job) => job.id.startsWith(`optimize:${version.id}:`) && !isTerminal(job));

  useEffect(() => {
    if (!open || quality !== null) return;
    void getOptimizeQuality().then(setQuality);
  }, [open, quality]);

  const confirmCompress = async () => {
    if (quality === null) return;
    const confirmed = await confirm({
      title: t('areas.library.compressTitle'),
      message: t('areas.library.compressMessage'),
      confirmLabel: t('areas.library.compressConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const job = await enqueueOptimization(version.id, sourceTag, quality);
      applyChange(job);
      toast.success(t('areas.library.optimizeQueued'));
      setOpen(false);
      onRefresh();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('download_in_corso')) {
        toast.info(t('areas.library.optimizeWhileDownloading'));
      } else {
        toast.error(t('areas.library.optimizeFailed'), { description: reason });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ClickPopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <IconButton
          size="sm"
          disabled={running}
          title={t('areas.library.compressAction')}
          ariaPressed={open}
        >
          <Minimize2 size={13} className={running ? 'animate-spin' : undefined} />
        </IconButton>
      }
    >
      <div className="flex min-w-48 flex-col gap-2 p-3">
        <label className="flex flex-col gap-1 text-xs text-editorial-muted">
          {t('settings.download.optimizeQuality')}
          <Select
            value={quality !== null ? String(quality) : ''}
            onChange={(value) => setQuality(Number(value))}
            ariaLabel={t('settings.download.optimizeQuality')}
            options={OPTIMIZE_QUALITIES.map((value) => ({ value: String(value), label: String(value) }))}
          />
        </label>
        <IconButton
          size="sm"
          onClick={() => void confirmCompress()}
          disabled={busy || quality === null}
          title={t('areas.library.compressConfirm')}
        >
          <Minimize2 size={13} />
        </IconButton>
      </div>
    </ClickPopover>
  );
}
