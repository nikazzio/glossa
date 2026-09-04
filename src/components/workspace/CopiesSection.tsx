import { useEffect, useRef, useState } from 'react';
import { Download, Eraser, Eye, HardDrive, Loader2, Minimize2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClickPopover, CopyButton, IconButton, SectionLabel, Select, StatBlock, StatRow } from '../ui';
import { useJobsStore } from '../../stores/jobsStore';
import { enqueueSourceDownload, isTerminal } from '../../services/jobsService';
import { versionProviderKey } from '../../services/libraryService';
import { versionInventory, type SizeFolder } from '../../services/inventoryService';
import {
  enqueueOptimization,
  getOptimizeQuality,
  OPTIMIZE_LONG_EDGES,
  OPTIMIZE_QUALITIES,
} from '../../services/optimizeService';
import {
  DEFAULT_SIZE_CAP,
  getVersionSizeCap,
  MAX_SIZE_CAP,
  setVersionSizeCap,
  SIZE_CAPS,
} from '../../services/downloadSettingsService';
import { confirm } from '../../stores/confirmStore';
import { freeVersionPages, freeVersionSize } from '../../services/vaultService';
import { toast } from 'sonner';
import { humanSize } from '../../utils';
import type { LibraryCatalogEntry, LibrarySourceDetail, LibrarySourceVersion } from '../../types';

/** L'etichetta di una risoluzione — con l'unità di misura, non il numero
 *  grezzo, e "Massima disponibile" per l'ultimo scalino della scala. */
export function resolutionLabel(tag: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (tag === MAX_SIZE_CAP) return t('settings.download.sizeCapMax');
  // Solo un numero è davvero un lato lungo in pixel: una biblioteca può
  // dichiarare una risoluzione fuori scala con un'etichetta propria (es.
  // "full"), e inventarle un'unità di misura sarebbe falso.
  return /^\d+$/.test(tag) ? t('settings.download.pixels', { value: tag }) : tag;
}

/** Quanto c'è sul computer, per una copia: le risoluzioni presenti, quale è
 *  la principale, quante pagine e quanto pesano. */
interface CopyInventory {
  sizes: SizeFolder[];
  principal: string | null;
  localPages: number;
  localBytes: number;
}

function emptyInventory(): CopyInventory {
  return { sizes: [], principal: null, localPages: 0, localBytes: 0 };
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
}: {
  detail: LibrarySourceDetail;
  entry?: LibraryCatalogEntry;
  onRefresh: () => void;
  /** La digitalizzazione che il visore sta mostrando: solo le sue versioni
   *  locali si possono aprire da qui. */
  openVersionId?: string | null;
  /** La versione locale che il visore sta leggendo, quando è stata scelta. */
  viewedLocalSize?: string | null;
  onViewLocalSize?: (sizeTag: string | null) => void;
}) {
  const { t } = useTranslation();

  return (
    // Niente intestazione di sezione qui: la tab la dà già ("Copie digitali").
    // Niente riquadro a sfondo: la tab stessa è già il contenitore, un'altra
    // cornice attorno sarebbe una scatola dentro la scatola.
    <ul className="divide-y divide-editorial-border/70">
      {detail.versions.map((version) => (
        <li key={version.id} className="space-y-3 py-4 first:pt-0">
          <div>
            <span className="block truncate font-display text-sm italic text-editorial-ink">
              {version.label}
            </span>
            <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
              {t(`areas.library.versionKindLabels.${version.versionKind}`)}
            </span>
          </div>

          <CopyDetails
            version={version}
            entry={entry && version.id === entry.versionId ? entry : undefined}
            onRefresh={onRefresh}
            isOpenInViewer={version.id === openVersionId}
            viewedLocalSize={viewedLocalSize}
            onViewLocalSize={onViewLocalSize}
          />

          {version.sourceUrl && (
            <details className="border-t border-editorial-border/70 pt-2">
              <summary className="cursor-pointer text-xs font-semibold text-editorial-muted">
                {t('areas.library.technicalData')}
              </summary>
              <span className="mt-2 flex items-start gap-1">
                <a
                  href={version.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-xs text-editorial-accent underline underline-offset-2"
                >
                  {version.sourceUrl}
                </a>
                <CopyButton text={version.sourceUrl} size="xs" />
              </span>
            </details>
          )}
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
  entry,
  onRefresh,
  isOpenInViewer,
  viewedLocalSize,
  onViewLocalSize,
}: {
  version: LibrarySourceVersion;
  entry?: LibraryCatalogEntry;
  onRefresh: () => void;
  isOpenInViewer: boolean;
  viewedLocalSize: string | null;
  onViewLocalSize?: (sizeTag: string | null) => void;
}) {
  const { t } = useTranslation();
  const jobs = useJobsStore((state) => state.jobs);
  const [fetched, setFetched] = useState<CopyInventory | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
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
              }
            : emptyInventory(),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [version.id, reloadTick]);

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
  const reading = fetched === null;
  const expectedPages = entry?.expectedPages ?? version.expectedPages ?? 0;
  const { sizes, principal, localPages, localBytes } = inventory;
  // Le pagine contate dal deposito, oppure le cartelle di misura quando
  // l'inventario non risponde ma il catalogo sa già che c'è qualcosa.
  const hasLocalPages = localPages > 0 || sizes.some((size) => size.pages > 0);
  const runningDownload = jobs.some((job) => job.id === `download:${version.id}` && !isTerminal(job));
  const lastDownload = jobs.find((job) => job.id === `download:${version.id}`);
  // Uno scaricamento o una compressione finiti hanno cambiato le cartelle: la
  // lista delle versioni locali va riletta, altrimenti la copia appena
  // ricavata non compare finché non si riapre l'opera.
  const finishedJobs = jobs.filter(
    (job) =>
      (job.id === `download:${version.id}` || job.id.startsWith(`optimize:${version.id}:`)) &&
      isTerminal(job),
  ).length;

  useEffect(() => {
    if (finishedJobs === 0) return;
    setReloadTick((tick) => tick + 1);
  }, [finishedJobs]);

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

  const freeSpace = async () => {
    const confirmed = await confirm({
      title: t('areas.library.freeSpaceTitle', { size: humanSize(localBytes) }),
      message: t('areas.library.freeSpaceMessage'),
      confirmLabel: t('areas.library.freeSpaceConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const freed = await freeVersionPages(await providerKey(), version.id);
      toast.success(t('areas.library.freeSpaceDone', { size: humanSize(freed.freedBytes) }));
      reload();
      onRefresh();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('version_work_in_progress')) {
        toast.info(t('areas.library.filesBusy'));
        return;
      }
      toast.error(t('areas.library.freeSpaceFailed'), { description: reason });
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
      {/* Prima si prende, poi si guarda cosa si ha: lo scaricamento sta in
          cima perché è il gesto con cui questa scheda comincia. */}
      <section className="space-y-3">
        <SectionLabel icon={Download} label={t('areas.library.downloadSection')} />
        {/* Solo le digitalizzazioni a immagini si scaricano: per un PDF o un
            file di altro tipo lo scaricamento chiederebbe alla biblioteca un
            manifesto che non esiste, e il lavoro finirebbe in errore. */}
        {version.versionKind === 'iiif_manifest' ? (
          <DownloadRow
            version={version}
            existingSizes={sizes}
            expectedPages={expectedPages}
            disabled={busy || runningDownload || !version.sourceUrl}
          />
        ) : (
          <p className="text-xs text-editorial-muted">{t('areas.library.downloadOnlyImages')}</p>
        )}
      </section>

      {/* I comandi restano sempre in vista, spenti quando non c'è niente sul
          computer: dentro l'elenco delle versioni sparivano del tutto quando
          l'inventario del deposito non risponde, e allora non si poteva più né
          verificare né liberare spazio. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel icon={HardDrive} label={t('areas.library.localVersionsSection')} />
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              onClick={() => void verify()}
              disabled={busy || !hasLocalPages}
              title={t('areas.library.verify')}
            >
              <ShieldCheck size={13} />
            </IconButton>
            <IconButton
              size="sm"
              onClick={() => void freeSpace()}
              disabled={busy || !hasLocalPages}
              title={t('areas.library.freeSpace')}
            >
              <Eraser size={13} />
            </IconButton>
          </div>
        </div>

        <StatBlock label={t('areas.library.occupiedField')} value={humanSize(localBytes)} />

        {!reading && !hasLocalPages && (
          <p className="text-xs text-editorial-muted">
            {lastDownload?.status === 'error'
              ? t('areas.library.localVersionLastDownloadFailed')
              : t('areas.library.localVersionNeverDownloaded')}
          </p>
        )}

        {sizes.length > 0 && (
          <div className="space-y-4 pt-1">
            {sizes.map((size) => (
              <ResolutionRow
                key={`${size.sizeTag}-${size.derived ? 'derived' : 'native'}`}
                version={version}
                size={size}
                allSizes={sizes}
                onCompressed={reloadAll}
                expectedPages={expectedPages}
                viewing={isOpenInViewer && viewedLocalSize === size.sizeTag}
                onView={isOpenInViewer && onViewLocalSize ? onViewLocalSize : undefined}
                onFree={freeSizeRow(size)}
              />
            ))}
          </div>
        )}
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
  allSizes,
  expectedPages,
  viewing,
  onView,
  onFree,
  onCompressed,
}: {
  version: LibrarySourceVersion;
  size: SizeFolder;
  /** Tutte le versioni locali di questa copia: servono a non proporre una
   *  misura d'arrivo che esiste già. */
  allSizes: SizeFolder[];
  expectedPages: number;
  /** Vero quando il visore sta leggendo proprio questa versione. */
  viewing: boolean;
  /** Presente solo per la digitalizzazione aperta nel visore. */
  onView?: (sizeTag: string) => void;
  onFree: () => Promise<void>;
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
  const complete = expectedPages > 0 && size.pages + size.missing >= expectedPages;

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
          {/* Una copia già ridotta non si ricomprime: il motore la rifiuta, e
              offrire il comando prometterebbe qualcosa che non succede. */}
          {!size.derived && size.pages > 0 && (
            <CompressPopover
              version={version}
              sourceTag={size.sizeTag}
              sizes={allSizes}
              onRefresh={onCompressed}
            />
          )}
          <IconButton
            size="sm"
            onClick={() => {
              setBusy(true);
              void onFree().finally(() => setBusy(false));
            }}
            disabled={busy}
            title={t('areas.library.freeSizeAction', { size: resolutionLabel(size.sizeTag, t) })}
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
}: {
  version: LibrarySourceVersion;
  existingSizes: SizeFolder[];
  expectedPages: number;
  disabled: boolean;
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
        title={isComplete ? t('areas.library.resolutionComplete') : t('areas.library.download')}
      >
        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </IconButton>
    </div>
  );
}

/** Ricava una copia ridotta **dalla versione locale su cui si apre**: la fonte
 *  è quella riga, non una scelta dentro il pannello — nell'intestazione della
 *  sezione non si capiva quale versione si stesse comprimendo. Si scelgono solo
 *  la misura d'arrivo (fra quelle più piccole della fonte e non ancora
 *  presenti) e la qualità. L'originale non si tocca mai: la copia nasce a
 *  parte. */
function CompressPopover({
  version,
  sourceTag,
  sizes,
  onRefresh,
}: {
  version: LibrarySourceVersion;
  /** La versione locale da cui partire: la riga che ospita il comando. */
  sourceTag: string;
  sizes: SizeFolder[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const applyChange = useJobsStore((state) => state.applyChange);
  const jobs = useJobsStore((state) => state.jobs);
  const [open, setOpen] = useState(false);
  const [targetEdge, setTargetEdge] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const running = jobs.some((job) => job.id.startsWith(`optimize:${version.id}:`) && !isTerminal(job));

  useEffect(() => {
    if (!open || quality !== null) return;
    void getOptimizeQuality().then(setQuality);
  }, [open, quality]);

  const sourceNumeric = /^\d+$/.test(sourceTag) ? Number(sourceTag) : null;
  const existingTags = new Set(sizes.map((size) => size.sizeTag));
  const targetOptions: number[] = OPTIMIZE_LONG_EDGES.filter((edge) => {
    if (existingTags.has(String(edge))) return false;
    return sourceNumeric === null || edge < sourceNumeric;
  });

  useEffect(() => {
    if (targetEdge !== null && targetOptions.includes(targetEdge)) return;
    setTargetEdge(targetOptions[targetOptions.length - 1] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOptions.join(',')]);

  const confirmCompress = async () => {
    if (targetEdge === null || quality === null) return;
    setBusy(true);
    try {
      const job = await enqueueOptimization(version.id, sourceTag, targetEdge, quality);
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
          title={t('areas.library.compressAction', { size: resolutionLabel(sourceTag, t) })}
          ariaPressed={open}
        >
          <Minimize2 size={13} className={running ? 'animate-spin' : undefined} />
        </IconButton>
      }
    >
      <div className="flex min-w-56 flex-col gap-2 p-3">
        <span className="text-[11px] text-editorial-muted">
          {t('areas.library.compressFrom', { size: resolutionLabel(sourceTag, t) })}
        </span>
        <label className="flex flex-col gap-1 text-[11px] text-editorial-muted">
          {t('areas.library.compressTargetLabel')}
          <Select
            value={targetEdge !== null ? String(targetEdge) : ''}
            onChange={(value) => setTargetEdge(Number(value))}
            ariaLabel={t('areas.library.compressTargetLabel')}
            options={targetOptions.map((value) => ({ value: String(value), label: t('settings.download.pixels', { value }) }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-editorial-muted">
          {t('settings.download.optimizeQuality')}
          <Select
            value={quality !== null ? String(quality) : ''}
            onChange={(value) => setQuality(Number(value))}
            ariaLabel={t('settings.download.optimizeQuality')}
            options={OPTIMIZE_QUALITIES.map((value) => ({ value: String(value), label: String(value) }))}
          />
        </label>
        {targetOptions.length === 0 ? (
          <span className="text-[11px] text-editorial-muted">{t('areas.library.compressNoTarget')}</span>
        ) : (
          <IconButton
            size="sm"
            onClick={() => void confirmCompress()}
            disabled={busy || targetEdge === null || quality === null}
            title={t('areas.library.compressConfirm')}
          >
            <Minimize2 size={13} />
          </IconButton>
        )}
      </div>
    </ClickPopover>
  );
}
