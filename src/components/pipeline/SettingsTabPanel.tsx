import { ArrowRightLeft, FileText, Globe, KeyRound, Languages, Layers, Network, ShieldCheck, Wand2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { PipelineConfig, PipelineMode, PromptTemplate } from '../../types';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { LANGUAGES } from '../../constants';
import { IconButton, SectionLabel, Tooltip } from '../ui';
import { PersonaEditor } from './PersonaEditor';
import { PhraseMemoryConfig } from './PhraseMemoryConfig';

interface SettingsTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  setMode: (mode: PipelineMode) => void;
  translationsExist: boolean;
  isProcessing: boolean;
  personaTemplates: PromptTemplate[];
  isRefiningPersona: boolean;
  canRefinePersona: boolean;
  personaRefineLabel: string;
  handleRefinePersona: () => void;
  saveTemplate: SaveTemplateFn;
  deleteTemplate: (id: string) => Promise<void>;
  keyStatusLoading: boolean;
  missingRefineProviders: string[];
  usePhraseMemory: boolean;
  autoSearchPhraseMemory: boolean;
  phraseMemoryMaxResults: number;
  onPhraseMemoryChange: (value: {
    usePhraseMemory: boolean;
    autoSearchPhraseMemory: boolean;
    phraseMemoryMaxResults: number;
  }) => void;
}

export function SettingsTabPanel({
  config,
  setConfig,
  setMode,
  translationsExist,
  isProcessing,
  personaTemplates,
  isRefiningPersona,
  canRefinePersona,
  personaRefineLabel,
  handleRefinePersona,
  saveTemplate,
  deleteTemplate,
  keyStatusLoading,
  missingRefineProviders,
  usePhraseMemory,
  autoSearchPhraseMemory,
  phraseMemoryMaxResults,
  onPhraseMemoryChange,
}: SettingsTabPanelProps) {
  const { t } = useTranslation();

  const [deeplKeyConfigured, setDeeplKeyConfigured] = useState(false);
  useEffect(() => {
    invoke<boolean>('get_api_key_status', { provider: 'deepl' })
      .then(setDeeplKeyConfigured)
      .catch(() => setDeeplKeyConfigured(false));
  }, []);

  return (
    <div id="pconfig-panel-settings" role="tabpanel" aria-labelledby="pconfig-tab-settings" className="space-y-6">
      {/* Mode selector */}
      <div className="space-y-2">
        <SectionLabel icon={Layers} label={t('pipeline.modeLabel')} />
        <div role="radiogroup" aria-label={t('pipeline.modeLabel')} className="flex gap-2">
          {([
            { mode: 'standard' as PipelineMode, Icon: Languages },
            { mode: 'editorial' as PipelineMode, Icon: Layers },
          ]).map(({ mode: m, Icon }) => {
            const isActive = (config.mode ?? 'standard') === m;
            return (
              <IconButton
                key={m}
                size="lg"
                tone={isActive ? 'accent' : 'default'}
                onClick={() => setMode(m)}
                disabled={translationsExist || isProcessing}
                title={t(`pipeline.mode.${m}`)}
                role="radio"
                aria-checked={isActive}
              >
                <Icon size={16} />
              </IconButton>
            );
          })}
          {(() => {
            const isActive = config.mode === 'deepl-hybrid';
            return (
              <IconButton
                size="lg"
                tone={isActive ? 'accent' : 'default'}
                onClick={() => deeplKeyConfigured && setMode('deepl-hybrid')}
                disabled={!deeplKeyConfigured || translationsExist || isProcessing}
                title={
                  !deeplKeyConfigured
                    ? t('pipeline.deepl.keyRequired', 'Richiede API key DeepL (Impostazioni)')
                    : t('pipeline.mode.deepl-hybrid', 'DeepL Hybrid')
                }
                role="radio"
                aria-checked={isActive}
                className={!deeplKeyConfigured ? 'opacity-40 cursor-not-allowed' : undefined}
              >
                <Network size={16} />
              </IconButton>
            );
          })()}
        </div>
        <div className="border-l-4 border-l-editorial-charcoal/30 border-y border-editorial-border/60 bg-editorial-bg/65 px-4 py-4 space-y-2.5">
          {([
            {
              mode: 'standard' as PipelineMode,
              stages: [
                { role: 'translation', Icon: Languages, labelKey: 'pipeline.stageRole.translation' },
                { role: 'audit', Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
              ],
            },
            {
              mode: 'editorial' as PipelineMode,
              stages: [
                { role: 'translation', Icon: Languages, labelKey: 'pipeline.stageRole.translation' },
                { role: 'refine', Icon: Wand2, labelKey: 'pipeline.stageRole.refine' },
                { role: 'format', Icon: FileText, labelKey: 'pipeline.stageRole.format' },
                { role: 'audit', Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
              ],
            },
            {
              mode: 'deepl-hybrid' as PipelineMode,
              stages: [
                { role: 'deepl', Icon: Network, labelKey: 'pipeline.stageRole.deepl-translation' },
                { role: 'refine', Icon: Wand2, labelKey: 'pipeline.stageRole.refine' },
                { role: 'audit', Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
              ],
            },
          ]).map(({ mode: m, stages }) => {
            const isActive = (config.mode ?? 'standard') === m;
            return (
              <div key={m} className={`flex items-center gap-2.5 transition-opacity ${isActive ? '' : 'opacity-25'}`}>
                <span className={`shrink-0 w-[68px] text-[11px] font-bold uppercase tracking-widest ${isActive ? 'text-editorial-accent' : 'text-editorial-muted'}`}>
                  {t(`pipeline.mode.${m}`)}
                </span>
                <div className="flex items-center gap-1.5">
                  {stages.map(({ role, Icon, labelKey }, i) => (
                    <span key={role} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-editorial-muted/40 text-xs">›</span>}
                      <Tooltip label={t(labelKey)}>
                        <span
                          aria-label={t(labelKey)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${isActive ? 'border-editorial-success/40 bg-editorial-success/12 text-editorial-success' : 'border-editorial-border bg-editorial-bg text-editorial-muted'}`}
                        >
                          <Icon size={14} strokeWidth={1.9} />
                        </span>
                      </Tooltip>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Language pair */}
      <div className="space-y-2">
        <SectionLabel icon={Globe} label={t('pipeline.languagePair')} />
        <div className={`flex items-center gap-3 transition-opacity ${config.persona ? 'opacity-40 pointer-events-none' : ''}`}>
          <select
            value={config.sourceLanguage}
            onChange={(e) => setConfig((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
            className="w-full rounded-md border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
            aria-label={t('pipeline.sourceLanguage')}
            disabled={!!config.persona}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
            ))}
          </select>
          <IconButton
            size="md"
            className="shrink-0"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                sourceLanguage: prev.targetLanguage,
                targetLanguage: prev.sourceLanguage,
              }))
            }
            disabled={!!config.persona}
            title={t('pipeline.swapLanguages')}
          >
            <ArrowRightLeft size={13} />
          </IconButton>
          <select
            value={config.targetLanguage}
            onChange={(e) => setConfig((prev) => ({ ...prev, targetLanguage: e.target.value }))}
            className="w-full rounded-md border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
            aria-label={t('pipeline.targetLanguage')}
            disabled={!!config.persona}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
            ))}
          </select>
        </div>
        {!!config.persona && (
          <p className="text-xs leading-relaxed text-editorial-muted/60">
            {t('pipeline.languagePairLockedByPersona')}
          </p>
        )}
      </div>

      <PersonaEditor
        persona={config.persona}
        sourceLanguage={config.sourceLanguage}
        targetLanguage={config.targetLanguage}
        templates={personaTemplates}
        isRefining={isRefiningPersona}
        canRefine={canRefinePersona}
        refineLabel={personaRefineLabel}
        onChange={(value) => setConfig((prev) => ({ ...prev, persona: value }))}
        onRefine={handleRefinePersona}
        onSaveTemplate={(name, prompt) => saveTemplate(name, prompt, 'persona', 'translation')}
        onDeleteTemplate={deleteTemplate}
      />

      {/* Refine keys status */}
      <div className="space-y-2">
        <SectionLabel icon={KeyRound} label={t('pipeline.refineKeyLabel')} />
        {!keyStatusLoading && (
          <p className="text-[11px] leading-relaxed text-editorial-muted">
            {missingRefineProviders.length > 0
              ? t('pipeline.refineKeyMissingHint', { providers: missingRefineProviders.join(', ') })
              : t('pipeline.refineKeyReadyHint')}
          </p>
        )}
      </div>
      {config.mode !== 'deepl-hybrid' && (
        <PhraseMemoryConfig
          usePhraseMemory={usePhraseMemory ?? false}
          autoSearchPhraseMemory={autoSearchPhraseMemory}
          phraseMemoryMaxResults={phraseMemoryMaxResults}
          onChange={onPhraseMemoryChange}
          disabled={isProcessing}
        />
      )}
    </div>
  );
}
