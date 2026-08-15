import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Select } from '../ui';
import {
  DEFAULT_SIZE_CAP,
  DEFAULT_THUMBNAIL_EDGE,
  getGlobalSizeCap,
  getThumbnailEdge,
  MAX_SIZE_CAP,
  setGlobalSizeCap,
  setThumbnailEdge,
  SIZE_CAPS,
  THUMBNAIL_EDGES,
} from '../../services/downloadSettingsService';

/**
 * La politica di scaricamento (#422, D4).
 *
 * Il tetto è una **politica, non un pixel**: la misura effettiva è quella che
 * la biblioteca dichiara più vicina al tetto, sopra o sotto. Quello che si
 * sceglie qui vale per tutte le fonti; una biblioteca e una singola fonte
 * possono dire altro, e vincono in quest'ordine.
 */
export function DownloadSettingsTab() {
  const { t } = useTranslation();
  const [sizeCap, setSizeCap] = useState(DEFAULT_SIZE_CAP);
  const [thumbnailEdge, setEdge] = useState(DEFAULT_THUMBNAIL_EDGE);

  useEffect(() => {
    const load = async () => {
      try {
        setSizeCap(await getGlobalSizeCap());
        setEdge(await getThumbnailEdge());
      } catch (error: unknown) {
        toast.error(t('settings.download.loadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
  }, [t]);

  const changeSizeCap = async (value: string) => {
    const previous = sizeCap;
    setSizeCap(value);
    try {
      await setGlobalSizeCap(value);
    } catch (error: unknown) {
      setSizeCap(previous);
      toast.error(t('settings.download.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const changeEdge = async (value: string) => {
    const previous = thumbnailEdge;
    const chosen = Number.parseInt(value, 10);
    setEdge(chosen);
    try {
      await setThumbnailEdge(chosen);
    } catch (error: unknown) {
      setEdge(previous);
      toast.error(t('settings.download.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div
      id="settings-panel-download"
      role="tabpanel"
      aria-labelledby="settings-tab-download"
      className="flex flex-col gap-6"
    >
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-editorial-ink">
            {t('settings.download.sizeCap')}
          </span>
          <Select
            value={sizeCap}
            onChange={(value) => void changeSizeCap(value)}
            ariaLabel={t('settings.download.sizeCap')}
            options={SIZE_CAPS.map((value) => ({
              value,
              label:
                value === MAX_SIZE_CAP
                  ? t('settings.download.sizeCapMax')
                  : t('settings.download.pixels', { value }),
            }))}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-editorial-muted">
          {t('settings.download.sizeCapHint')}
        </p>
      </section>

      <section className="flex flex-col gap-3 border-t border-editorial-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-editorial-ink">
            {t('settings.download.thumbnailEdge')}
          </span>
          <Select
            value={String(thumbnailEdge)}
            onChange={(value) => void changeEdge(value)}
            ariaLabel={t('settings.download.thumbnailEdge')}
            options={THUMBNAIL_EDGES.map((value) => ({
              value: String(value),
              label: t('settings.download.pixels', { value }),
            }))}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-editorial-muted">
          {t('settings.download.thumbnailEdgeHint')}
        </p>
      </section>
    </div>
  );
}
