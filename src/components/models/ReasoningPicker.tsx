import { useTranslation } from 'react-i18next';
import type { ReasoningEffortLevel } from '../../types';

const ALL_EFFORTS: ReasoningEffortLevel[] = ['none', 'low', 'medium', 'high', 'xhigh'];

const EFFORT_I18N_KEY: Record<ReasoningEffortLevel, string> = {
  none: 'pipeline.reasoningEffortNone',
  low: 'pipeline.reasoningEffortLow',
  medium: 'pipeline.reasoningEffortMedium',
  high: 'pipeline.reasoningEffortHigh',
  xhigh: 'pipeline.reasoningEffortXhigh',
};

interface ReasoningPickerProps {
  value: ReasoningEffortLevel;
  showNone: boolean;
  disabled?: boolean;
  onChange: (effort: ReasoningEffortLevel) => void;
}

export function ReasoningPicker({ value, showNone, disabled, onChange }: ReasoningPickerProps) {
  const { t } = useTranslation();
  const options = showNone ? ALL_EFFORTS : ALL_EFFORTS.filter((e) => e !== 'none');

  return (
    <div className="flex gap-1" role="group" aria-label={t('pipeline.reasoningEffort')}>
      {options.map((effort) => (
        <button
          key={effort}
          type="button"
          disabled={disabled}
          onClick={() => onChange(effort)}
          aria-pressed={value === effort}
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
            value === effort
              ? 'border-editorial-accent bg-editorial-accent text-white'
              : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
          }`}
        >
          {t(EFFORT_I18N_KEY[effort])}
        </button>
      ))}
    </div>
  );
}
