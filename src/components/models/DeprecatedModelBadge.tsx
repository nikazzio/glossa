import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelProvider } from '../../types';
import { getModelStatus } from '../../models/catalog';
import { Tooltip } from '../ui';

interface DeprecatedModelBadgeProps {
  provider: ModelProvider;
  model: string;
}

export function DeprecatedModelBadge({ provider, model }: DeprecatedModelBadgeProps) {
  const { t } = useTranslation();
  if (getModelStatus(provider, model) !== 'deprecated') return null;

  return (
    <Tooltip label={t('pipeline.modelDeprecatedHint')}>
      <span className="inline-flex items-center justify-center rounded-full border border-editorial-warning/30 bg-editorial-warning/10 p-1 text-editorial-warning">
        <AlertTriangle size={10} />
      </span>
    </Tooltip>
  );
}
