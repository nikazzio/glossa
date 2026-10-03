import { Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PanelSection, ToggleRow } from '../ui';
import { NumberSettingRow } from './NumberSettingRow';

const MAX_RESULTS_LIMIT = 50;

interface PhraseMemoryConfigValue {
  usePhraseMemory: boolean;
  autoSearchPhraseMemory: boolean;
  phraseMemoryMaxResults: number;
}

interface PhraseMemoryConfigProps extends PhraseMemoryConfigValue {
  onChange: (value: PhraseMemoryConfigValue) => void;
  disabled?: boolean;
}

const DEFAULT_MAX_RESULTS = 10;

export function PhraseMemoryConfig({
  usePhraseMemory,
  autoSearchPhraseMemory,
  phraseMemoryMaxResults,
  onChange,
  disabled = false,
}: PhraseMemoryConfigProps) {
  const { t } = useTranslation();
  const effectiveMaxResults = Number.isFinite(phraseMemoryMaxResults)
    ? phraseMemoryMaxResults
    : DEFAULT_MAX_RESULTS;

  const emit = (patch: Partial<PhraseMemoryConfigValue>) =>
    onChange({
      usePhraseMemory,
      autoSearchPhraseMemory,
      phraseMemoryMaxResults: effectiveMaxResults,
      ...patch,
    });

  return (
    <PanelSection icon={Brain} label={t('settings.phraseMemoryTab')}>
      <div className="divide-y divide-rule border-y border-rule">
        <div className="py-2.5">
          <ToggleRow
            icon={null}
            label={t('settings.phraseMemoryToggle')}
            checked={usePhraseMemory}
            disabled={disabled}
            onChange={() => emit({ usePhraseMemory: !usePhraseMemory })}
          />
        </div>
        {usePhraseMemory && (
          <>
            <div className="py-2.5">
              <ToggleRow
                icon={null}
                label={t('settings.phraseMemoryAutoSearch')}
                hint={t('settings.phraseMemoryManualRefreshHint')}
                checked={autoSearchPhraseMemory}
                disabled={disabled}
                onChange={() => emit({ autoSearchPhraseMemory: !autoSearchPhraseMemory })}
              />
            </div>
            <NumberSettingRow
              label={t('settings.phraseMemoryMaxResults')}
              value={effectiveMaxResults}
              min={1}
              max={MAX_RESULTS_LIMIT}
              disabled={disabled}
              onChange={(raw) => emit({ phraseMemoryMaxResults: Math.max(1, parseInt(raw, 10) || 1) })}
            />
          </>
        )}
      </div>
    </PanelSection>
  );
}
