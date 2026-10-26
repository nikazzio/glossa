import { useTranslation } from 'react-i18next';
import type { AnthropicConfig } from '../../types';
import { ToggleRow } from '../ui';

interface AnthropicCacheConfigProps {
  value?: AnthropicConfig;
  onChange: (value: AnthropicConfig | undefined) => void;
  disabled?: boolean;
}

export function AnthropicCacheConfig({ value, onChange, disabled = false }: AnthropicCacheConfigProps) {
  const { t } = useTranslation();
  const enableCaching = value?.enableCaching ?? false;
  const extendedCacheTtl = value?.extendedCacheTtl ?? false;

  return (
    <div className="divide-y divide-rule border-y border-rule">
      <div className="py-2.5">
        <ToggleRow
          icon={null}
          label={t('pipeline.anthropicCache.toggle')}
          hint={t('pipeline.anthropicCache.hint')}
          checked={enableCaching}
          disabled={disabled}
          onChange={() => onChange({ ...value, enableCaching: !enableCaching })}
        />
      </div>
      {enableCaching && (
        <div className="py-2.5">
          <ToggleRow
            icon={null}
            label={t('pipeline.anthropicCache.extendedTtlToggle')}
            hint={t('pipeline.anthropicCache.extendedTtlHint')}
            checked={extendedCacheTtl}
            disabled={disabled}
            onChange={() => onChange({ ...value, enableCaching, extendedCacheTtl: !extendedCacheTtl })}
          />
        </div>
      )}
    </div>
  );
}
