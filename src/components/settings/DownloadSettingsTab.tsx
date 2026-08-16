import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Info, Ruler } from 'lucide-react';
import { Select, Tooltip } from '../ui';
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
 * la biblioteca dichiara più vicina, sopra o sotto. Vale per tutte le opere;
 * una biblioteca e una singola opera possono dire altro, e vincono in
 * quest'ordine.
 *
 * Le spiegazioni stanno **al passaggio del mouse**, non a schermo: un pannello
 * di impostazioni si legge per le voci, non per la prosa.
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
      className="space-y-4"
    >
      <div className="flex items-center gap-1.5">
        <Ruler size={11} className="shrink-0 text-editorial-accent" />
        <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
          {t('settings.download.sizes')}
        </p>
      </div>
      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow label={t('settings.download.sizeCap')} hint={t('settings.download.sizeCapHint')}>
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
        </SettingRow>

        <SettingRow
          label={t('settings.download.thumbnailEdge')}
          hint={t('settings.download.thumbnailEdgeHint')}
        >
          <Select
            value={String(thumbnailEdge)}
            onChange={(value) => void changeEdge(value)}
            ariaLabel={t('settings.download.thumbnailEdge')}
            options={THUMBNAIL_EDGES.map((value) => ({
              value: String(value),
              label: t('settings.download.pixels', { value }),
            }))}
          />
        </SettingRow>
      </div>
    </div>
  );
}

/** Etichetta, spiegazione al passaggio del mouse, comando. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-1.5 text-sm text-editorial-ink">
        {label}
        {hint && (
          <Tooltip label={hint}>
            <span className="text-editorial-muted" aria-label={hint}>
              <Info size={12} />
            </span>
          </Tooltip>
        )}
      </span>
      {children}
    </div>
  );
}
