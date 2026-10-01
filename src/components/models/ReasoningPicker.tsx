import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Zap, BrainCircuit } from 'lucide-react';
import { ChoiceDots } from '../ui';
import type { ReasoningEffortLevel } from '../../types';

const ALL_EFFORTS: ReasoningEffortLevel[] = ['none', 'low', 'medium', 'high', 'xhigh'];

const EFFORT_I18N_KEY: Record<ReasoningEffortLevel, string> = {
  none: 'pipeline.reasoningEffortNone',
  low: 'pipeline.reasoningEffortLow',
  medium: 'pipeline.reasoningEffortMedium',
  high: 'pipeline.reasoningEffortHigh',
  xhigh: 'pipeline.reasoningEffortXhigh',
};

const EFFORT_CONTENT: Record<ReasoningEffortLevel, ReactNode> = {
  none: <Ban size={11} />,
  low: 'L',
  medium: 'M',
  high: <Zap size={11} />,
  xhigh: <BrainCircuit size={11} />,
};

interface ReasoningPickerProps {
  value: ReasoningEffortLevel;
  showNone: boolean;
  disabled?: boolean;
  onChange: (effort: ReasoningEffortLevel) => void;
}

export function ReasoningPicker({ value, showNone, disabled, onChange }: ReasoningPickerProps) {
  const { t } = useTranslation();
  const efforts = showNone ? ALL_EFFORTS : ALL_EFFORTS.filter((effort) => effort !== 'none');

  return (
    <ChoiceDots
      options={efforts.map((effort) => ({
        value: effort,
        label: t(EFFORT_I18N_KEY[effort]),
        content: EFFORT_CONTENT[effort],
      }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={t('pipeline.reasoningEffort')}
    />
  );
}
