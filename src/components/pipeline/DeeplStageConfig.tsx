import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deeplService } from '../../services/deeplService';
import type { DeeplConfig, DeeplLanguageInfo, GlossaryEntry } from '../../types';
import type { DeeplGlossaryInfo } from '../../services/deeplService';
import { DEFAULT_DEEPL_STAGE_OPTIONS, toDeeplCode } from '../../constants';

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
  glossaryName,
  onChange,
}: DeeplStageConfigProps) {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState<DeeplLanguageInfo[]>([]);
  const [glossaries, setGlossaries] = useState<DeeplGlossaryInfo[]>([]);
  const [glossariesLoading, setGlossariesLoading] = useState(false);
  const [isCreatingGlossary, setIsCreatingGlossary] = useState(false);
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

  const handleCreateFromGlossa = async () => {
    if (glossaryEntries.length === 0) return;
    setIsCreatingGlossary(true);
    setGlossaryError(null);
    try {
      const created = await deeplService.createGlossary({
        name: glossaryName || 'Glossa',
        sourceLang: normalizedSourceLang,
        targetLang,
        entries: glossaryEntries.map((e) => ({ source: e.term, target: e.translation })),
      });
      update({ glossaryId: created.glossaryId });
      reloadGlossaries();
    } catch (e) {
      setGlossaryError(e instanceof Error ? e.message : 'Creazione glossario DeepL fallita');
    } finally {
      setIsCreatingGlossary(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wide">
          {t('pipeline.deepl.modelType', 'Modalità traduzione')}
        </label>
        <select
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          value={config.modelType ?? 'prefer_quality_optimized'}
          onChange={(e) => update({ modelType: e.target.value as DeeplConfig['modelType'] })}
        >
          <option value="prefer_quality_optimized">{t('pipeline.deepl.preferQuality', 'Qualità (raccomandato)')}</option>
          <option value="quality_optimized">{t('pipeline.deepl.qualityOnly', 'Solo qualità')}</option>
          <option value="latency_optimized">{t('pipeline.deepl.latency', 'Velocità')}</option>
        </select>
      </div>

      {supportsFormality && (
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('pipeline.deepl.formality', 'Registro')}
          </label>
          <select
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
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

      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wide">
          {t('pipeline.deepl.context', 'Contesto')}
        </label>
        <textarea
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          rows={2}
          placeholder={t('pipeline.deepl.contextPlaceholder', 'Testo di contesto (non fatturato, migliora qualità)')}
          value={config.context ?? ''}
          onChange={(e) => update({ context: e.target.value || undefined })}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wide">
          {t('pipeline.deepl.glossary', 'Glossario DeepL')}
        </label>
        <div className="mt-1 flex gap-2">
          <select
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
            value={config.glossaryId ?? ''}
            onChange={(e) => update({ glossaryId: e.target.value || undefined })}
          >
            <option value="">
              {glossariesLoading
                ? t('common.loading', 'Caricamento…')
                : t('pipeline.deepl.noGlossary', 'Nessun glossario')}
            </option>
            {glossaries
              .filter(
                (g) =>
                  g.sourceLang.toUpperCase() === normalizedSourceLang &&
                  g.targetLang.toUpperCase() === targetLang,
              )
              .map((g) => (
                <option key={g.glossaryId} value={g.glossaryId}>
                  {g.name} ({g.entryCount} termini)
                </option>
              ))}
          </select>
          {config.glossaryId && (
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={() =>
                deeplService
                  .deleteGlossary(config.glossaryId!)
                  .then(reloadGlossaries)
                  .catch((e) => setGlossaryError(e instanceof Error ? e.message : 'Eliminazione glossario DeepL fallita'))
              }
              title={t('pipeline.deepl.deleteGlossary', 'Elimina glossario DeepL')}
            >
              ✕
            </button>
          )}
        </div>
        {glossaryEntries.length > 0 && (
          <button
            type="button"
            className="mt-2 text-xs text-accent underline"
            onClick={handleCreateFromGlossa}
            disabled={isCreatingGlossary}
          >
            {isCreatingGlossary
              ? t('pipeline.deepl.creatingGlossary', 'Creazione…')
              : t('pipeline.deepl.createFromGlossa', '+ Crea glossario DeepL dai termini Glossa')}
          </button>
        )}
        {glossaryError && (
          <p className="text-xs text-destructive mt-1">{glossaryError}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={config.preserveFormatting ?? true}
            onChange={(e) => update({ preserveFormatting: e.target.checked })}
          />
          {t('pipeline.deepl.preserveFormatting', 'Mantieni formattazione')}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={config.showBilledCharacters ?? true}
            onChange={(e) => update({ showBilledCharacters: e.target.checked })}
          />
          {t('pipeline.deepl.showBilledCharacters', 'Mostra caratteri fatturati')}
        </label>
      </div>
    </div>
  );
}
