import { Database, Timer } from 'lucide-react';
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
    <div className="space-y-2 border-l-4 border-l-editorial-charcoal/25 border-y border-editorial-border/70 bg-editorial-textbox/18 px-4 py-3">
      <ToggleRow
        icon={<Database size={13} className={enableCaching ? 'text-editorial-ink' : 'text-editorial-muted'} />}
        label={t('pipeline.anthropicCache.toggle')}
        checked={enableCaching}
        disabled={disabled}
        onChange={() => onChange({ ...value, enableCaching: !enableCaching })}
      />
      {!enableCaching && (
        <p className="pl-[21px] text-xs leading-relaxed text-editorial-muted/70">
          {t('pipeline.anthropicCache.hint')}
        </p>
      )}
      {enableCaching && (
        <>
          <ToggleRow
            icon={<Timer size={13} className={extendedCacheTtl ? 'text-editorial-ink' : 'text-editorial-muted'} />}
            label={t('pipeline.anthropicCache.extendedTtlToggle')}
            checked={extendedCacheTtl}
            disabled={disabled}
            onChange={() => onChange({ ...value, enableCaching, extendedCacheTtl: !extendedCacheTtl })}
          />
          <p className="pl-[21px] text-xs leading-relaxed text-editorial-muted/70">
            {t('pipeline.anthropicCache.extendedTtlHint')}
          </p>
        </>
      )}
    </div>
  );
}
