import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HardDrive, ImageIcon, Shrink } from 'lucide-react';
import { SectionLabel, SegmentedControl, Select, SettingRow } from '../ui';
import { OCR_IMAGE_EDGES } from '../../constants';
import {
  DEFAULT_OCR_IMAGE_PREFERENCES,
  getOcrImagePreferences,
  setOcrImageEdge,
  setOcrImageMode,
  type OcrImageMode,
  type OcrImagePreferences,
} from '../../services/ocrImageSettingsService';

/** Impostazioni generali delle trascrizioni: per ora l'immagine inviata al
 *  modello OCR. Nello Studio la scelta si cambia per la sessione. */
export function TranscriptionsSettingsTab() {
  const { t } = useTranslation();
  const [image, setImage] = useState<OcrImagePreferences>(DEFAULT_OCR_IMAGE_PREFERENCES);

  useEffect(() => {
    getOcrImagePreferences().then(setImage).catch((error: unknown) => {
      toast.error(t('settings.transcriptions.loadFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    });
  }, [t]);

  const save = async (next: OcrImagePreferences, write: () => Promise<void>) => {
    const previous = image;
    setImage(next);
    try {
      await write();
    } catch (error: unknown) {
      setImage(previous);
      toast.error(t('settings.transcriptions.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const changeEdge = (value: string) => {
    const edge = Number(value);
    void save({ ...image, edge }, () => setOcrImageEdge(edge));
  };

  const changeMode = (mode: OcrImageMode) => {
    void save({ ...image, mode }, () => setOcrImageMode(mode));
  };

  return (
    <div
      id="settings-panel-transcriptions"
      role="tabpanel"
      aria-labelledby="settings-tab-transcriptions"
      className="space-y-10"
    >
      <section className="space-y-4">
        <SectionLabel icon={ImageIcon} label={t('settings.transcriptions.ocrImage')} />
        <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
          <SettingRow
            label={t('settings.transcriptions.imageMode')}
            hint={t('settings.transcriptions.imageModeHint')}
          >
            <SegmentedControl
              ariaLabel={t('settings.transcriptions.imageMode')}
              value={image.mode}
              onChange={changeMode}
              options={[
                { value: 'optimized', label: t('settings.transcriptions.optimized'), icon: <Shrink size={14} /> },
                { value: 'local', label: t('settings.transcriptions.local'), icon: <HardDrive size={14} /> },
              ]}
            />
          </SettingRow>
          <SettingRow
            label={t('settings.transcriptions.imageEdge')}
            hint={t('settings.transcriptions.imageEdgeHint')}
          >
            <Select
              value={String(image.edge)}
              onChange={changeEdge}
              ariaLabel={t('settings.transcriptions.imageEdge')}
              options={OCR_IMAGE_EDGES.map((edge) => ({ value: String(edge), label: `${edge} px` }))}
            />
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
