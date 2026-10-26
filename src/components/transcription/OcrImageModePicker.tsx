import { HardDrive, ImageIcon, Shrink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PanelSection, SECTION_SETTING_LIST_CLASSNAME, type ChoiceDotsOption } from '../ui';
import { SettingChoiceRow } from '../settings/SettingChoiceRow';
import type { OcrImageMode } from '../../services/ocrImageSettingsService';

interface OcrImageModePickerProps {
  value: OcrImageMode;
  edge: number;
  onChange: (mode: OcrImageMode) => void;
}

/** Session-only image choice, separate from model and prompt settings. */
export function OcrImageModePicker({ value, edge, onChange }: OcrImageModePickerProps) {
  const { t } = useTranslation();
  const options: ChoiceDotsOption<OcrImageMode>[] = [
    { value: 'optimized', label: t('transcription.assist.imageOptimized', { edge }), content: <Shrink size={11} /> },
    { value: 'local', label: t('transcription.assist.imageLocal'), content: <HardDrive size={11} /> },
  ];

  return (
    <PanelSection icon={ImageIcon} label={t('settings.transcriptions.ocrImage')}>
      <div className={SECTION_SETTING_LIST_CLASSNAME}>
        <SettingChoiceRow
          label={t('transcription.assist.imageMode')}
          hint={t('transcription.assist.imageModeHint')}
          options={options}
          value={value}
          onChange={onChange}
        />
      </div>
    </PanelSection>
  );
}
