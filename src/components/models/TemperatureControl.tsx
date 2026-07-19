import { useTranslation } from 'react-i18next';

interface TemperatureControlProps {
  value: number | undefined;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
}

const MIN = 0;
const MAX = 1;

/** Numeric temperature override for a single stage/judge call. Empty = provider default. */
export function TemperatureControl({ value, disabled, onChange }: TemperatureControlProps) {
  const { t } = useTranslation();

  return (
    <input
      type="number"
      min={MIN}
      max={MAX}
      step={0.1}
      value={value ?? ''}
      disabled={disabled}
      placeholder={t('pipeline.temperatureDefault')}
      aria-label={t('pipeline.temperature')}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === '') {
          onChange(undefined);
          return;
        }
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onChange(Math.min(MAX, Math.max(MIN, parsed)));
      }}
      className="w-16 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
