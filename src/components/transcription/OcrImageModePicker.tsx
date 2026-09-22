import { HardDrive, ImageIcon, Shrink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../ui';
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
  const options: Array<{ mode: OcrImageMode; label: string; icon: typeof Shrink }> = [
    { mode: 'optimized', label: t('transcription.assist.imageOptimized', { edge }), icon: Shrink },
    { mode: 'local', label: t('transcription.assist.imageLocal'), icon: HardDrive },
  ];

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip label={t('transcription.assist.imageMode')} side="top">
        <ImageIcon size={11} className="shrink-0 text-editorial-warning" aria-hidden="true" />
      </Tooltip>
      <div className="flex gap-1" role="group" aria-label={t('transcription.assist.imageMode')}>
        {options.map(({ mode, label, icon: Icon }) => (
          <Tooltip key={mode} label={label} side="top">
            <button
              type="button"
              onClick={() => onChange(mode)}
              aria-pressed={value === mode}
              aria-label={label}
              className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent ${
                value === mode
                  ? 'border-editorial-accent bg-editorial-accent text-white'
                  : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
              }`}
            >
              <Icon size={11} />
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
