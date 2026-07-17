import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, MessageSquare, Network, SlidersHorizontal, Trash2 } from 'lucide-react';
import { deeplService } from '../../services/deeplService';
import type { DeeplConfig, DeeplLanguageInfo, GlossaryEntry } from '../../types';
import type { DeeplGlossaryInfo } from '../../services/deeplService';
import { DEFAULT_DEEPL_STAGE_OPTIONS, toDeeplCode } from '../../constants';
import { IconButton, SectionLabel, ToggleRow } from '../ui';
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
      title: t('pipeline.deepl.confirmDeleteGlossaryTitle', 'Eliminare il glossario DeepL?'),
      message: t(
        'pipeline.deepl.confirmDeleteGlossaryMessage',
        'Il glossario "{{name}}" verrà eliminato definitivamente da DeepL. L\'azione non è reversibile.',
        { name: selected?.name ?? '' },
      ),
      confirmLabel: t('common.delete', 'Elimina'),
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
    <div className="flex flex-col gap-5">
      {/* 1. Opzioni (toggle) */}
      <div className="space-y-3">
        <SectionLabel icon={SlidersHorizontal} label={t('pipeline.deepl.optionsTitle', 'Opzioni')} />
        <div className="space-y-3 border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
          <ToggleRow
            icon={null}
            label={t('pipeline.deepl.preserveFormatting', 'Mantieni formattazione')}
            checked={config.preserveFormatting ?? true}
            onChange={() => update({ preserveFormatting: !(config.preserveFormatting ?? true) })}
          />
          <ToggleRow
            icon={null}
            label={t('pipeline.deepl.showBilledCharacters', 'Mostra caratteri fatturati')}
            checked={config.showBilledCharacters ?? true}
            onChange={() => update({ showBilledCharacters: !(config.showBilledCharacters ?? true) })}
          />
        </div>
      </div>

      {/* 2. Modalità traduzione */}
      <div className="space-y-3">
        <SectionLabel icon={Network} label={t('pipeline.deepl.sectionTranslation', 'Traduzione DeepL')} />
        <div className="space-y-2">
          <label htmlFor="deepl-model-type" className="text-xs font-sans uppercase tracking-[0.1em] text-editorial-muted">
            {t('pipeline.deepl.modelType', 'Modalità traduzione')}
          </label>
          <select
            id="deepl-model-type"
            className="w-full rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5 text-xs font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            value={config.modelType ?? 'prefer_quality_optimized'}
            onChange={(e) => update({ modelType: e.target.value as DeeplConfig['modelType'] })}
          >
            <option value="prefer_quality_optimized">{t('pipeline.deepl.preferQuality', 'Qualità (raccomandato)')}</option>
            <option value="quality_optimized">{t('pipeline.deepl.qualityOnly', 'Solo qualità')}</option>
            <option value="latency_optimized">{t('pipeline.deepl.latency', 'Velocità')}</option>
          </select>
        </div>

        {/* 3. Registro formalità (condizionale) */}
        {supportsFormality && (
          <div className="space-y-2">
            <label htmlFor="deepl-formality" className="text-xs font-sans uppercase tracking-[0.1em] text-editorial-muted">
              {t('pipeline.deepl.formality', 'Registro')}
            </label>
            <select
              id="deepl-formality"
              className="w-full rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5 text-xs font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              value={config.formality ?? 'default'}
              onChange={(e) => update({ formality: e.target.value as DeeplConfig['formality'] })}
            >
              <option value="default">{t('pipeline.deepl.formalityDefault', 'Predefinito')}</option>
              <option value="prefer_more">{t('pipeline.deepl.formalityPreferMore', 'Formale (se supportato)')}</option>
              <option value="more">{t('pipeline.deepl.formalityMore', 'Formale')}</option>
              <option value="prefer_less">{t('pipeline.deepl.formalityPreferLess', 'Informale (se supportato)')}</option>
              <option value="less">{t('pipeline.deepl.formalityLess', 'Informale')}</option>
            </select>
          </div>
        )}
      </div>

      {/* 4. Glossario DeepL */}
      {showGlossarySection && (
        <div className="space-y-3">
          <SectionLabel icon={BookOpen} label={t('pipeline.deepl.glossary', 'Glossario DeepL')} />
          <div className="flex items-center gap-2">
            <select
              className="flex-1 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5 text-xs font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              value={config.glossaryId ?? ''}
              onChange={(e) => update({ glossaryId: e.target.value || undefined })}
              aria-label={t('pipeline.deepl.glossary', 'Glossario DeepL')}
            >
              <option value="">
                {glossariesLoading
                  ? t('common.loading', 'Caricamento…')
                  : t('pipeline.deepl.noGlossary', 'Nessun glossario')}
              </option>
              {filteredGlossaries.map((g) => (
                <option key={g.glossaryId} value={g.glossaryId}>
                  {g.name} ({g.entryCount} termini)
                </option>
              ))}
            </select>
            {config.glossaryId && (
              <IconButton
                size="sm"
                tone="default"
                className="shrink-0"
                onClick={handleDeleteGlossary}
                title={t('pipeline.deepl.deleteGlossary', 'Elimina glossario DeepL')}
              >
                <Trash2 size={12} />
              </IconButton>
            )}
          </div>

          {glossaryError && (
            <p className="text-xs font-sans text-editorial-accent mt-1">{glossaryError}</p>
          )}
        </div>
      )}

      {/* 5. Contesto traduzione */}
      <div className="space-y-3">
        <SectionLabel icon={MessageSquare} label={t('pipeline.deepl.context', 'Contesto traduzione')} />
        <textarea
          value={config.context ?? ''}
          onChange={(e) => update({ context: e.target.value || undefined })}
          placeholder={t('pipeline.deepl.contextPlaceholder', 'Testo opzionale che aiuta DeepL a contestualizzare la traduzione…')}
          rows={3}
          maxLength={512}
          className="w-full rounded-md border-2 border-editorial-border bg-editorial-textbox px-3 py-2 text-sm font-sans text-editorial-ink outline-none resize-none leading-relaxed focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>
    </div>
  );
}
