import { Thermometer } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../ui';

interface TemperatureControlProps {
  value: number | undefined;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

const MIN = 0;
const STEP = 0.1;
const DEFAULT_VALUE = 0;

/**
 * Temperature slider for a single stage/judge call. Always a real, concrete
 * value — no hidden "let the provider decide" state that could show one
 * number while a different one is actually in effect.
 */
export function TemperatureControl({ value, max, disabled, onChange }: TemperatureControlProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (value === undefined && !disabled) onChange(DEFAULT_VALUE);
  }, [value, disabled, onChange]);

  const displayValue = value ?? DEFAULT_VALUE;

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
    </div>
  );
}
