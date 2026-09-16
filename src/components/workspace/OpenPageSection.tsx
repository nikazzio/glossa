import { useCallback, useEffect, useState } from 'react';
import { FileText, HardDriveDownload, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, SectionLabel, Spinner, StatRow } from '../ui';
import { keepViewerPage } from '../../services/cacheService';
import { excludePage, includePage } from '../../services/excludedPagesService';
import { MAX_SIZE, pageSourceUrl } from '../../services/iiifViewerService';
import { forgetPage, pageLocalCopies, type PageCopy } from '../../services/vaultService';
import { resolutionLabel } from '../../utils/resolutionLabel';
import { humanSize } from '../../utils';
import { errorMessage, logger } from '../../utils/logger';
import type { LibrarySourceVersion } from '../../types';

/** La pagina che il visore sta mostrando di questa copia. */
export interface ShownPage {
  index: number;
  imageUrl: string | null;
  imageService: string;
  presentation2: boolean;
}

/**
 * Cosa si può fare con la pagina aperta nel visore.
 *
 * Sta qui e non nella barra del visore perché è una manovra sul deposito, come
 * scaricare il libro o liberare una misura: la barra resta per la lettura. I
 * comandi sono icone con il nome al passaggio del mouse, e restano al loro
 * posto anche quando non c'è una pagina aperta — spenti, senza spiegazioni
 * scritte: una riga che dice «non stai leggendo questa copia» è rumore, perché
 * lo si vede.
 */
export function OpenPageSection({
  version,
  providerKey,
  shownPage,
  bookSize,
  onChanged,
}: {
  version: LibrarySourceVersion;
  providerKey: string;
  /** Nulla quando il visore mostra un'altra copia, o nessuna. */
  shownPage: ShownPage | null;
  /** La misura con cui è stato scaricato il libro: è lì che si torna. */
  bookSize: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [copies, setCopies] = useState<PageCopy[]>([]);
  const [reading, setReading] = useState(false);
  const [working, setWorking] = useState(false);
  const pageIndex = shownPage?.index ?? null;

  const load = useCallback(async () => {
    if (pageIndex === null) {
      setCopies([]);
      return;
    }
    setReading(true);
    try {
      setCopies(await pageLocalCopies(providerKey, version.id, pageIndex));
    } catch (error) {
      logger.warn('library.page.copiesFailed', { reason: errorMessage(error) });
      setCopies([]);
    } finally {
      setReading(false);
    }
  }, [providerKey, version.id, pageIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (work: () => Promise<void>) => {
    setWorking(true);
    try {
      await work();
      await load();
      onChanged();
    } catch (error) {
      logger.error('library.page.actionFailed', { reason: errorMessage(error) });
      toast.error(t('areas.library.pageActionFailed'));
    } finally {
      setWorking(false);
    }
  };

  /**
   * Riprende la pagina alla misura chiesta e la **sostituisce** nella copia.
   *
   * La cartella resta quella del libro: di una pagina si tiene un file solo, e
   * la misura chiesta cambia solo cosa si domanda alla biblioteca. I pixel veri
   * restano scritti nella riga di lato, che è l'unica cosa che poi dice quanto
   * misura davvero quella pagina.
   */
  const keepAt = async (requested: string) => {
    if (!shownPage || !bookSize) return;
    // Chiedere una pagina esclusa la riammette: un comando che non fa quello
    // che dice è peggio di un comando assente.
    await includePage(version.id, shownPage.index);
    await keepViewerPage({
      kind: 'page',
      versionId: version.id,
      index: shownPage.index,
      size: bookSize,
      remoteUrl: pageSourceUrl(shownPage.imageService, requested, shownPage.presentation2),
      providerKey,
    });
  };

  const page = copies[0] ?? null;
  const atMax = page?.pixels !== undefined && page?.pixels !== null && bookPixels(bookSize) !== null
    ? Math.max(...page.pixels) > bookPixels(bookSize)!
    : false;
  const idle = shownPage === null || working;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel
          icon={FileText}
          label={
            shownPage
              ? t('areas.library.openPageSection', { page: shownPage.index + 1 })
              : t('areas.library.openPageSectionIdle')
          }
        />
        <span className="flex shrink-0 items-center gap-1">
          <IconButton
            size="sm"
            disabled={idle || bookSize === null}
            title={t('areas.library.pageKeep')}
            onClick={() => void act(() => keepAt(bookSize ?? MAX_SIZE))}
          >
            <HardDriveDownload size={13} />
          </IconButton>
          <IconButton
            size="sm"
            disabled={idle || atMax}
            title={t('areas.library.pageTakeAtMax')}
            onClick={() => void act(() => keepAt(MAX_SIZE))}
          >
            <Maximize2 size={13} />
          </IconButton>
          <IconButton
            size="sm"
            disabled={idle || !atMax || bookSize === null}
            title={t('areas.library.pageBackToBookSize')}
            onClick={() => void act(() => keepAt(bookSize ?? MAX_SIZE))}
          >
            <Minimize2 size={13} />
          </IconButton>
          <IconButton
            size="sm"
            tone="danger"
            disabled={idle || copies.length === 0}
            title={t('areas.library.pageRemove')}
            onClick={() =>
              void act(async () => {
                await forgetPage(providerKey, version.id, shownPage!.index);
                await excludePage(version.id, shownPage!.index);
              })
            }
          >
            <Trash2 size={13} />
          </IconButton>
        </span>
      </div>

      {reading ? (
        <Spinner size={12} className="flex items-center gap-2 text-xs text-editorial-muted" />
      ) : (
        page && (
          // Una pagina, un file: quello che conta è quanto misura davvero e
          // quanto pesa — il nome della cartella dice la misura del libro, che
          // dopo una ripresa non è più la sua.
          <dl className="space-y-1 pl-0.5">
            <StatRow
              label={t('areas.library.pageSizeField')}
              value={
                page.pixels
                  ? t('areas.library.pagePixels', {
                      width: page.pixels[0],
                      height: page.pixels[1],
                    })
                  : resolutionLabel(page.sizeTag, t)
              }
            />
            <StatRow label={t('areas.library.localVersionSpace')} value={humanSize(page.bytes)} />
          </dl>
        )
      )}
    </section>
  );
}

/** Il lato lungo che il libro dichiara, quando è un numero: «max» non lo è, e
 *  allora non c'è niente da confrontare. */
function bookPixels(bookSize: string | null): number | null {
  if (!bookSize || bookSize === MAX_SIZE) return null;
  const value = Number(bookSize);
  return Number.isFinite(value) ? value : null;
}
