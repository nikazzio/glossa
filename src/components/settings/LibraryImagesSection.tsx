import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Minimize2, Ruler } from 'lucide-react';
import { SectionLabel, Select, SettingRow } from '../ui';
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
import {
  DEFAULT_OPTIMIZE_LONG_EDGE,
  DEFAULT_OPTIMIZE_QUALITY,
  getOptimizeLongEdge,
  getOptimizeQuality,
  OPTIMIZE_LONG_EDGES,
  OPTIMIZE_QUALITIES,
  setOptimizeLongEdge,
  setOptimizeQuality,
} from '../../services/optimizeService';

const ROWS = 'divide-y divide-editorial-border/60 border-y border-editorial-border/70';

/**
 * Le misure che valgono per tutte le biblioteche: quanto grande si vuole una
 * pagina, quanto una miniatura, e con quali valori si ricava una versione
 * ridotta. Il *modo* in cui la misura viene chiesta si sceglie per biblioteca,
 * più su nella schermata.
 */
export function LibraryImagesSection() {
  const { t } = useTranslation();
  const [sizeCap, setSizeCap] = useState(DEFAULT_SIZE_CAP);
  const [thumbnailEdge, setEdge] = useState(DEFAULT_THUMBNAIL_EDGE);
  const [optimizeEdge, setOptimizeEdge] = useState(DEFAULT_OPTIMIZE_LONG_EDGE);
  const [optimizeQuality, setOptimizeQualityState] = useState(DEFAULT_OPTIMIZE_QUALITY);

  useEffect(() => {
    const load = async () => {
      try {
        setSizeCap(await getGlobalSizeCap());
        setEdge(await getThumbnailEdge());
        setOptimizeEdge(await getOptimizeLongEdge());
        setOptimizeQualityState(await getOptimizeQuality());
      } catch (error: unknown) {
        toast.error(t('settings.download.loadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
  }, [t]);

  /**
   * Salva e, se il motore rifiuta, riporta il campo al valore che aveva: una
   * schermata che mostra un valore mai arrivato al deposito è peggio di un
   * errore.
   */
  const persist = async <T,>(next: T, previous: T, apply: (value: T) => void, save: (value: T) => Promise<unknown>) => {
    apply(next);
    try {
      await save(next);
    } catch (error: unknown) {
      apply(previous);
      toast.error(t('settings.download.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <>
      <section className="space-y-4">
        <SectionLabel icon={Ruler} label={t('settings.download.sizes')} />
        <div className={ROWS}>
          <SettingRow
            label={t('settings.download.sizeCap')}
            hint={t('settings.download.sizeCapHint')}
          >
            <Select
              value={sizeCap}
              onChange={(value) => void persist(value, sizeCap, setSizeCap, setGlobalSizeCap)}
              ariaLabel={t('settings.download.sizeCap')}
              options={SIZE_CAPS.map((value) => ({
                value,
                label:
                  value === MAX_SIZE_CAP
                    ? t('settings.download.sizeCapMax')
                    : t('settings.download.pixels', { value }),
              }))}
            />
          </SettingRow>

          <SettingRow
            label={t('settings.download.thumbnailEdge')}
            hint={t('settings.download.thumbnailEdgeHint')}
          >
            <Select
              value={String(thumbnailEdge)}
              onChange={(value) =>
                void persist(Number.parseInt(value, 10), thumbnailEdge, setEdge, setThumbnailEdge)
              }
              ariaLabel={t('settings.download.thumbnailEdge')}
              options={THUMBNAIL_EDGES.map((value) => ({
                value: String(value),
                label: t('settings.download.pixels', { value }),
              }))}
            />
          </SettingRow>
        </div>
      </section>

      <section className="space-y-4">
        <SectionLabel icon={Minimize2} label={t('settings.download.optimize')} />
        <div className={ROWS}>
          <SettingRow
            label={t('settings.download.optimizeLongEdge')}
            hint={t('settings.download.optimizeLongEdgeHint')}
          >
            <Select
              value={String(optimizeEdge)}
              onChange={(value) =>
                void persist(Number(value), optimizeEdge, setOptimizeEdge, setOptimizeLongEdge)
              }
              ariaLabel={t('settings.download.optimizeLongEdge')}
              options={OPTIMIZE_LONG_EDGES.map((value) => ({
                value: String(value),
                label: t('settings.download.pixels', { value }),
              }))}
            />
          </SettingRow>

          <SettingRow
            label={t('settings.download.optimizeQuality')}
            hint={t('settings.download.optimizeQualityHint')}
          >
            <Select
              value={String(optimizeQuality)}
              onChange={(value) =>
                void persist(Number(value), optimizeQuality, setOptimizeQualityState, setOptimizeQuality)
              }
              ariaLabel={t('settings.download.optimizeQuality')}
              options={OPTIMIZE_QUALITIES.map((value) => ({
                value: String(value),
                label: String(value),
              }))}
            />
          </SettingRow>
        </div>
      </section>
    </>
  );
}
