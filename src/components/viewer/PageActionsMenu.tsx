import { useCallback, useEffect, useState } from 'react';
import { HardDriveDownload, Minimize2, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ClickPopover, IconButton, MenuActionRow, Spinner } from '../ui';
import { forgetPage, pageLocalCopies, type PageCopy } from '../../services/vaultService';
import { excludePage } from '../../services/excludedPagesService';
import { MAX_SIZE } from '../../services/iiifViewerService';
import { humanSize } from '../../utils';
import { errorMessage, logger } from '../../utils/logger';

/**
 * Cosa si può fare con **questa** pagina.
 *
 * Due comandi simmetrici e nulla di più: prenderla alla massima risoluzione
 * quando serve guardarla davvero, e riportarla alla misura del libro quando lo
 * spazio conta più del dettaglio. Il terzo comando la toglie del tutto, e
 * quella scelta dura: la pagina resta esclusa e non torna con il prossimo
 * scaricamento del libro.
 *
 * Sotto, le misure che di questa pagina ci sono davvero sul computer: servono a
 * vedere cosa occupa spazio e a buttarne una sola, non a scegliere dove
 * scaricare — per quello c'è il comando, che non fa domande.
 */
export function PageActionsMenu({
  providerKey,
  versionId,
  pageIndex,
  bookSize,
  onTakeAtMax,
  onChanged,
}: {
  providerKey: string;
  versionId: string;
  pageIndex: number;
  /** La misura con cui è stato scaricato il libro: è lì che si torna. */
  bookSize: string | null;
  onTakeAtMax: () => Promise<void>;
  /** Le pagine sul computer sono cambiate: inventario e spazio vanno riletti. */
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [copies, setCopies] = useState<PageCopy[] | null>(null);
  const [working, setWorking] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setCopies(await pageLocalCopies(providerKey, versionId, pageIndex));
    } catch (error) {
      logger.warn('library.page.copiesFailed', { reason: errorMessage(error) });
      setCopies([]);
    }
  }, [providerKey, versionId, pageIndex]);

  // Le misure si rileggono a ogni pagina: sono poche righe di deposito, e un
  // elenco vecchio farebbe cancellare la pagina sbagliata.
  useEffect(() => {
    setCopies(null);
  }, [pageIndex, versionId]);

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

  const extra = (copies ?? []).filter((copy) => copy.sizeTag !== bookSize);
  // Finché le misure non sono state lette il comando resta offerto: negarlo
  // per prudenza vorrebbe dire non poterlo mai usare al primo colpo.
  const atMax = (copies ?? []).some((copy) => copy.sizeTag === MAX_SIZE);

  return (
    <ClickPopover
      side="bottom"
      align="end"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && copies === null) void load();
      }}
      trigger={
        <IconButton size="sm" title={t('areas.library.pageActions')}>
          <SlidersHorizontal size={14} />
        </IconButton>
      }
    >
      <div className="w-72 p-1">
        <MenuActionRow
          icon={<HardDriveDownload size={14} />}
          label={t('areas.library.pageTakeAtMax')}
          disabled={working || atMax}
          onClick={() => void act(onTakeAtMax)}
        />
        <MenuActionRow
          icon={<Minimize2 size={14} />}
          label={t('areas.library.pageBackToBookSize')}
          disabled={working || extra.length === 0 || bookSize === null}
          onClick={() =>
            void act(async () => {
              for (const copy of extra) {
                await forgetPage(providerKey, versionId, pageIndex, copy.sizeTag);
              }
            })
          }
        />
        <MenuActionRow
          icon={<Trash2 size={14} />}
          tone="danger"
          label={t('areas.library.pageRemove')}
          disabled={working}
          onClick={() =>
            void act(async () => {
              await forgetPage(providerKey, versionId, pageIndex);
              await excludePage(versionId, pageIndex);
            })
          }
        />

        <div className="mt-1 border-t border-editorial-border/70 pt-1">
          {copies === null ? (
            <Spinner size={12} label={t('areas.library.pageCopiesLoading')}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-editorial-muted" />
          ) : copies.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-editorial-muted">
              {t('areas.library.pageNoCopies')}
            </p>
          ) : (
            <ul className="flex flex-col">
              {copies.map((copy) => (
                <li key={`${copy.sizeTag}-${copy.derived}`} className="flex items-center gap-2 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-xs text-editorial-ink">
                    {copy.sizeTag === MAX_SIZE ? t('areas.library.sizeMax') : copy.sizeTag}
                    {copy.derived ? ` · ${t('areas.library.localVersionDerived')}` : ''}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-editorial-muted">
                    {humanSize(copy.bytes)}
                  </span>
                  <IconButton
                    size="xs"
                    tone="danger"
                    disabled={working}
                    title={t('areas.library.pageRemoveSize', { size: copy.sizeTag })}
                    onClick={() =>
                      void act(async () => {
                        await forgetPage(providerKey, versionId, pageIndex, copy.sizeTag);
                      })
                    }
                  >
                    <Trash2 size={11} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ClickPopover>
  );
}
