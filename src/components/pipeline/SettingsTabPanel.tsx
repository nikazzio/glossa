import { FileText, Languages, Layers, Network, ShieldCheck, Wand2, type LucideIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { PipelineConfig, PipelineMode, PromptTemplate, ModelProvider } from '../../types';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { DEFAULT_DEEPL_STAGE_OPTIONS } from '../../constants';
import { ChoiceDots, Hint, PanelSection, type ChoiceDotsOption } from '../ui';
import { PipelinePromptEditor } from './PipelinePromptEditor';
import { DeeplLanguagePair } from './DeeplLanguagePair';

const MODE_ICON: Record<PipelineMode, LucideIcon> = {
  standard: Languages,
  editorial: Layers,
  'deepl-hybrid': Network,
};

/** Le fasi che ogni modalità esegue, nell'ordine. */
const MODE_PHASES: Record<PipelineMode, Array<{ Icon: LucideIcon; labelKey: string }>> = {
  standard: [
    { Icon: Languages, labelKey: 'pipeline.stageRole.translation' },
    { Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
  ],
  editorial: [
    { Icon: Languages, labelKey: 'pipeline.stageRole.translation' },
    { Icon: Wand2, labelKey: 'pipeline.stageRole.refine' },
    { Icon: FileText, labelKey: 'pipeline.stageRole.format' },
    { Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
  ],
  'deepl-hybrid': [
    { Icon: Network, labelKey: 'pipeline.stageRole.deepl-translation' },
    { Icon: Wand2, labelKey: 'pipeline.stageRole.refine' },
    { Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
  ],
};

const MODES: PipelineMode[] = ['standard', 'editorial', 'deepl-hybrid'];

interface SettingsTabPanelProps {
  config: PipelineConfig;
  setConfig: Dispatch<SetStateAction<PipelineConfig>>;
  setMode: (mode: PipelineMode) => void;
  translationsExist: boolean;
  isProcessing: boolean;
  briefTemplates: PromptTemplate[];
  canRefineBrief: boolean;
  briefRefineLabel: string;
  briefRefineProvider: ModelProvider;
  briefRefineModel: string;
  saveTemplate: SaveTemplateFn;
}

/** Modalità, lingue DeepL e descrizione comune del lavoro. */
export function SettingsTabPanel({
  config,
  setConfig,
  setMode,
  translationsExist,
  isProcessing,
  briefTemplates,
  canRefineBrief,
  briefRefineLabel,
  briefRefineProvider,
  briefRefineModel,
  saveTemplate,
}: SettingsTabPanelProps) {
  const { t } = useTranslation();
  const [deeplKeyConfigured, setDeeplKeyConfigured] = useState(false);
  useEffect(() => {
    invoke<boolean>('get_api_key_status', { provider: 'deepl' })
      .then(setDeeplKeyConfigured)
      .catch(() => setDeeplKeyConfigured(false));
  }, []);

  const mode = config.mode ?? 'standard';
  const blocked = (command: string, reason: string) => t('transcription.commandBlocked', { command, reason });
  const modeOptions: ChoiceDotsOption<PipelineMode>[] = MODES.map((entry) => {
    const Icon = MODE_ICON[entry];
    const label = t(`pipeline.mode.${entry}`);
    const keyMissing = entry === 'deepl-hybrid' && !deeplKeyConfigured;
    return {
      value: entry,
      label: keyMissing ? blocked(label, t('pipeline.deepl.keyRequired')) : label,
      content: <Icon size={11} />,
      disabled: keyMissing,
    };
  });
  const modeLockedReason = isProcessing
    ? t('document.operationsRunning')
    : translationsExist
      ? t('pipeline.reasonTranslationsExist')
      : undefined;

  const deeplStage = config.stages.find((stage) => stage.role === 'deepl-translation');
  const deeplActive = mode === 'deepl-hybrid';
  const deeplOptions = { ...DEFAULT_DEEPL_STAGE_OPTIONS, ...deeplStage?.providerOptions?.deepl };
  const pairDisabledReason = !deeplActive ? t('pipeline.deepl.onlyInDeeplMode') : modeLockedReason;

  return (
    <div id="pconfig-panel-settings" role="tabpanel" aria-labelledby="pconfig-tab-settings" className="space-y-8">
      <PanelSection icon={Layers} label={t('pipeline.modeLabel')} hint={modeLockedReason}>
        <div className="flex items-center gap-4">
          <ChoiceDots
            options={modeOptions}
            value={mode}
            onChange={setMode}
            disabled={Boolean(modeLockedReason)}
            ariaLabel={t('pipeline.modeLabel')}
          />
          <span className="font-display italic text-editorial-ink">{t(`pipeline.modeShort.${mode}`)}</span>
          <span className="flex items-center gap-1.5 text-editorial-muted">
            {MODE_PHASES[mode].map(({ Icon, labelKey }, index) => (
              <Fragment key={labelKey}>
                {index > 0 && <span className="text-xs text-editorial-muted/50" aria-hidden="true">›</span>}
                <Hint label={t(labelKey)}>
                  <Icon size={13} aria-hidden="true" />
                </Hint>
              </Fragment>
            ))}
          </span>
        </div>
      </PanelSection>

      <DeeplLanguagePair value={deeplOptions} active={deeplActive} disabledReason={pairDisabledReason}
        onChange={(deepl) => setConfig((prev) => ({ ...prev, stages: prev.stages.map((stage) =>
          stage.role === 'deepl-translation' ? { ...stage, providerOptions: { ...stage.providerOptions, deepl } } : stage) }))} />

      <PipelinePromptEditor
        label={t('pipeline.workBriefLabel')} hint={t('pipeline.workBriefHint')}
        value={config.workBrief ?? ''} placeholder={t('pipeline.workBriefPlaceholder')}
        templates={briefTemplates} templateContext="brief" saveTemplate={saveTemplate}
        onConfirm={(workBrief) => setConfig((prev) => ({ ...prev, workBrief }))}
        disabledReason={isProcessing ? t('document.operationsRunning') : undefined}
        provider={briefRefineProvider} model={briefRefineModel} canRefine={canRefineBrief}
        refineLabel={briefRefineLabel} refineDisabledReason={t('pipeline.reasonMissingKey', { provider: briefRefineProvider })}
      />
    </div>
  );
}
