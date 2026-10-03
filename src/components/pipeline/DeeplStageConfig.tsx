import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { deeplService } from '../../services/deeplService';
import type { DeeplConfig, DeeplLanguageInfo, GlossaryEntry } from '../../types';
import type { DeeplGlossaryInfo } from '../../services/deeplService';
import { DEFAULT_DEEPL_STAGE_OPTIONS, toDeeplCode } from '../../constants';
import { FIELD_CLASSNAME, FieldLabel, IconButton, Select, SettingRow, ToggleRow } from '../ui';
import { confirm } from '../../stores/confirmStore';

interface DeeplStageConfigProps {
  value?: DeeplConfig;
  sourceLang: string;
  targetLanguage: string;
  glossaryEntries: GlossaryEntry[];
  glossaryName: string;
  onChange: (next: DeeplConfig) => void;
}

export function DeeplStageConfig({
  value,
  sourceLang,
  targetLanguage,
  glossaryEntries,
  glossaryName: _glossaryName,
  onChange,
}: DeeplStageConfigProps) {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState<DeeplLanguageInfo[]>([]);
  const [glossaries, setGlossaries] = useState<DeeplGlossaryInfo[]>([]);
  const [glossariesLoading, setGlossariesLoading] = useState(false);
  const [glossaryError, setGlossaryError] = useState<string | null>(null);

  const config = { ...DEFAULT_DEEPL_STAGE_OPTIONS, ...value };

  const targetLang = toDeeplCode(targetLanguage);
  const normalizedSourceLang = toDeeplCode(sourceLang);
  const targetInfo = languages.find((l) => l.language === targetLang);
  const supportsFormality = targetInfo?.supportsFormality ?? false;

  useEffect(() => {
    deeplService
      .getLanguages('target')
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, []);

  const reloadGlossaries = useCallback(() => {
    setGlossariesLoading(true);
    deeplService
      .listGlossaries()
      .then(setGlossaries)
      .catch(() => setGlossaries([]))
      .finally(() => setGlossariesLoading(false));
  }, []);

  useEffect(() => {
    reloadGlossaries();
  }, [reloadGlossaries]);

  function update(patch: Partial<DeeplConfig>) {
    onChange({ ...config, ...patch });
  }

  const filteredGlossaries = glossaries.filter(
    (g) =>
      g.sourceLang.toUpperCase() === normalizedSourceLang &&
      g.targetLang.toUpperCase() === targetLang,
  );

  const showGlossarySection = filteredGlossaries.length > 0 || glossariesLoading || glossaryEntries.length > 0;

  const handleDeleteGlossary = async () => {
    if (!config.glossaryId) return;
    const selected = filteredGlossaries.find((g) => g.glossaryId === config.glossaryId);
    const ok = await confirm({
      title: t('pipeline.deepl.confirmDeleteGlossaryTitle'),
      message: t('pipeline.deepl.confirmDeleteGlossaryMessage', { name: selected?.name ?? '' }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    deeplService
      .deleteGlossary(config.glossaryId)
      .then(reloadGlossaries)
      .catch((e: unknown) =>
        setGlossaryError(e instanceof Error ? e.message : 'Eliminazione glossario DeepL fallita'),
      );
  };

  return (
    <div className="space-y-4">
      <div className="divide-y divide-rule border-y border-rule">
        <div className="py-2.5">
          <ToggleRow
            icon={null}
            label={t('pipeline.deepl.preserveFormatting')}
            checked={config.preserveFormatting ?? true}
            onChange={() => update({ preserveFormatting: !(config.preserveFormatting ?? true) })}
          />
        </div>
        <div className="py-2.5">
          <ToggleRow
            icon={null}
            label={t('pipeline.deepl.showBilledCharacters')}
            checked={config.showBilledCharacters ?? true}
            onChange={() => update({ showBilledCharacters: !(config.showBilledCharacters ?? true) })}
          />
        </div>
        <SettingRow label={t('pipeline.deepl.modelType')}>
          <Select
            size="md"
            value={config.modelType ?? 'prefer_quality_optimized'}
            onChange={(next) => update({ modelType: next as DeeplConfig['modelType'] })}
            ariaLabel={t('pipeline.deepl.modelType')}
            options={[
              { value: 'prefer_quality_optimized', label: t('pipeline.deepl.preferQuality') },
              { value: 'quality_optimized', label: t('pipeline.deepl.qualityOnly') },
              { value: 'latency_optimized', label: t('pipeline.deepl.latency') },
            ]}
          />
        </SettingRow>
        {supportsFormality && (
          <SettingRow label={t('pipeline.deepl.formality')}>
            <Select
              size="md"
              value={config.formality ?? 'default'}
              onChange={(next) => update({ formality: next as DeeplConfig['formality'] })}
              ariaLabel={t('pipeline.deepl.formality')}
              options={[
                { value: 'default', label: t('pipeline.deepl.formalityDefault') },
                { value: 'prefer_more', label: t('pipeline.deepl.formalityPreferMore') },
                { value: 'more', label: t('pipeline.deepl.formalityMore') },
                { value: 'prefer_less', label: t('pipeline.deepl.formalityPreferLess') },
                { value: 'less', label: t('pipeline.deepl.formalityLess') },
              ]}
            />
          </SettingRow>
        )}
        {showGlossarySection && (
          <SettingRow label={t('pipeline.deepl.glossary')}>
            <Select
              size="md"
              value={config.glossaryId ?? ''}
              onChange={(next) => update({ glossaryId: next || undefined })}
              ariaLabel={t('pipeline.deepl.glossary')}
              options={[
                { value: '', label: glossariesLoading ? t('common.loading') : t('pipeline.deepl.noGlossary') },
                ...filteredGlossaries.map((g) => ({
                  value: g.glossaryId,
                  label: t('pipeline.deepl.glossaryOption', { name: g.name, count: g.entryCount }),
                })),
              ]}
            />
            {config.glossaryId && (
              <IconButton
                size="sm"
                className="shrink-0"
                onClick={handleDeleteGlossary}
                title={t('pipeline.deepl.deleteGlossary')}
              >
                <Trash2 size={13} />
              </IconButton>
            )}
          </SettingRow>
        )}
      </div>
      {glossaryError && (
        <p role="alert" className="text-xs text-editorial-danger">{glossaryError}</p>
      )}
      <div className="space-y-2">
        <FieldLabel htmlFor="deepl-context" block>{t('pipeline.deepl.context')}</FieldLabel>
        <textarea
          id="deepl-context"
          value={config.context ?? ''}
          onChange={(e) => update({ context: e.target.value || undefined })}
          placeholder={t('pipeline.deepl.contextPlaceholder')}
          rows={3}
          maxLength={512}
          className={`${FIELD_CLASSNAME} resize-none leading-relaxed`}
        />
      </div>
    </div>
  );
}
