import { RotateCcw, Thermometer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip } from '../ui';

interface TemperatureControlProps {
  value: number | undefined;
  max: number;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
}

const MIN = 0;
const STEP = 0.1;
const DEFAULT_DISPLAY = 1;

/** Temperature slider for a single stage/judge call. Untouched = provider default. */
export function TemperatureControl({ value, max, disabled, onChange }: TemperatureControlProps) {
  const { t } = useTranslation();
  const displayValue = value ?? Math.min(DEFAULT_DISPLAY, max);

  return (
    <div className="flex flex-1 items-center gap-1.5">
      <Tooltip label={t('pipeline.temperature')} side="top">
        <Thermometer size={11} className="shrink-0 text-editorial-warning" aria-hidden="true" />
      </Tooltip>
      <input
        type="range"
        min={MIN}
        max={max}
        step={STEP}
        value={displayValue}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-editorial-accent"
        aria-label={t('pipeline.temperature')}
      />
      <span className="w-7 shrink-0 text-right font-mono text-xs font-bold text-editorial-accent">
        {displayValue.toFixed(1)}
      </span>
      {value !== undefined && (
        <IconButton
          size="xs"
          title={t('pipeline.temperatureReset')}
          onClick={() => onChange(undefined)}
          disabled={disabled}
        >
          <RotateCcw size={10} />
        </IconButton>
      )}
    </div>
  );
}
