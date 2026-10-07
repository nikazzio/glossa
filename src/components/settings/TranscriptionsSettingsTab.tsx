import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { HardDrive, ImageIcon, Shrink } from 'lucide-react';
import { Select, SettingRow, PanelSection, SECTION_SETTING_LIST_CLASSNAME } from '../ui';
import { errorMessage, logger } from '../../utils/logger';
import { SettingChoiceRow } from './SettingChoiceRow';
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
      logger.warn('settings.transcriptions.loadFailed', { message: errorMessage(error) });
      toast.error(t('settings.transcriptions.loadFailed'));
    });
  }, [t]);

  const save = async (next: OcrImagePreferences, write: () => Promise<void>) => {
    const previous = image;
    setImage(next);
    try {
      await write();
    } catch (error: unknown) {
      setImage(previous);
      logger.warn('settings.transcriptions.saveFailed', { message: errorMessage(error) });
      toast.error(t('settings.transcriptions.saveFailed'));
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
      <PanelSection icon={ImageIcon} label={t('settings.transcriptions.ocrImage')}>
        <div className={SECTION_SETTING_LIST_CLASSNAME}>
          <SettingChoiceRow<OcrImageMode>
            label={t('settings.transcriptions.imageMode')}
            hint={t('settings.transcriptions.imageModeHint')}
            value={image.mode}
            onChange={changeMode}
            options={[
              { value: 'optimized', label: t('settings.transcriptions.optimized'), content: <Shrink size={11} /> },
              { value: 'local', label: t('settings.transcriptions.local'), content: <HardDrive size={11} /> },
            ]}
          />
          <SettingRow
            label={t('settings.transcriptions.imageEdge')}
            hint={t('settings.transcriptions.imageEdgeHint')}
          >
            <Select
              size="md"
              value={String(image.edge)}
              onChange={changeEdge}
              ariaLabel={t('settings.transcriptions.imageEdge')}
              options={OCR_IMAGE_EDGES.map((edge) => ({ value: String(edge), label: `${edge} px` }))}
            />
          </SettingRow>
        </div>
      </PanelSection>
    </div>
  );
}
