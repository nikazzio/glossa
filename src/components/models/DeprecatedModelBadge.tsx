import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider } from '../../types';
import { getModelStatus } from '../../models/catalog';

interface DeprecatedModelBadgeProps {
  provider: ModelProvider;
  model: string;
}

export function DeprecatedModelBadge({ provider, model }: DeprecatedModelBadgeProps) {
  const { t } = useTranslation();
  if (getModelStatus(provider, model) !== 'deprecated') return null;

  return (
    <span
      className="inline-flex items-center justify-center rounded-full border border-editorial-warning/30 bg-editorial-warning/10 p-1 text-editorial-warning"
      data-tooltip={t('pipeline.modelDeprecatedHint')}
    >
      <AlertTriangle size={10} />
    </span>
  );
}
