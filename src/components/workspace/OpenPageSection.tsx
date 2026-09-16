import { useCallback, useEffect, useState } from 'react';
import { FileText, HardDriveDownload, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton, SectionLabel, Spinner } from '../ui';
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

  const keepAt = async (size: string) => {
    if (!shownPage) return;
    // Chiedere una pagina esclusa la riammette: un comando che non fa quello
    // che dice è peggio di un comando assente.
    await includePage(version.id, shownPage.index);
    await keepViewerPage({
      kind: 'page',
      versionId: version.id,
      index: shownPage.index,
      size,
      remoteUrl: pageSourceUrl(shownPage.imageService, size, shownPage.presentation2),
      providerKey,
    });
  };

  const beyondBook = copies.filter((copy) => copy.sizeTag !== bookSize);
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
            disabled={idle || copies.some((copy) => copy.sizeTag === MAX_SIZE)}
            title={t('areas.library.pageTakeAtMax')}
            onClick={() => void act(() => keepAt(MAX_SIZE))}
          >
            <Maximize2 size={13} />
          </IconButton>
          <IconButton
            size="sm"
            disabled={idle || beyondBook.length === 0 || bookSize === null}
            title={t('areas.library.pageBackToBookSize')}
            onClick={() =>
              void act(async () => {
                for (const copy of beyondBook) {
                  await forgetPage(providerKey, version.id, shownPage!.index, copy.sizeTag);
                }
              })
            }
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
        copies.length > 0 && (
          <dl className="space-y-1 pl-0.5">
            {copies.map((copy) => (
              <div
                key={`${copy.sizeTag}-${copy.derived ? 'derived' : 'native'}`}
                className="flex items-center gap-2"
              >
                <dt className="min-w-0 flex-1 truncate text-xs text-editorial-muted">
                  {resolutionLabel(copy.sizeTag, t)}
                </dt>
                <dd className="shrink-0 font-display text-sm italic text-editorial-ink">
                  {humanSize(copy.bytes)}
                </dd>
                <IconButton
                  size="xs"
                  disabled={working}
                  title={t('areas.library.pageRemoveSize', {
                    size: resolutionLabel(copy.sizeTag, t),
                  })}
                  onClick={() =>
                    void act(async () => {
                      await forgetPage(providerKey, version.id, shownPage!.index, copy.sizeTag);
                    })
                  }
                >
                  <Trash2 size={11} />
                </IconButton>
              </div>
            ))}
          </dl>
        )
      )}
    </section>
  );
}
