import { HardDrive, ImageIcon, Shrink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChoiceDots, type ChoiceDotsOption } from '../ui';
import type { OcrImageMode } from '../../services/ocrImageSettingsService';

interface OcrImageModePickerProps {
  value: OcrImageMode;
  edge: number;
  onChange: (mode: OcrImageMode) => void;
}

/** Quale immagine parte verso il modello: stessi cerchietti del livello di
 *  ragionamento nella scheda traduzione. */
export function OcrImageModePicker({ value, edge, onChange }: OcrImageModePickerProps) {
  const { t } = useTranslation();
  const options: ChoiceDotsOption<OcrImageMode>[] = [
    { value: 'optimized', label: t('transcription.assist.imageOptimized', { edge }), content: <Shrink size={11} /> },
    { value: 'local', label: t('transcription.assist.imageLocal'), content: <HardDrive size={11} /> },
  ];

  return (
    <ChoiceDots
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel={t('transcription.assist.imageMode')}
      categoryIcon={ImageIcon}
    />
  );
}
