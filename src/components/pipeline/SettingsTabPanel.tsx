import { ArrowRightLeft, FileText, Globe, Languages, Layers, Network, ShieldCheck, Wand2, type LucideIcon } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { PipelineConfig, PipelineMode, PromptTemplate } from '../../types';
import type { SaveTemplateFn } from '../../stores/promptTemplateStore';
import { defaultPersonaText, LANGUAGES } from '../../constants';
import { ChoiceDots, Hint, IconButton, PanelSection, Select, type ChoiceDotsOption } from '../ui';
import { AuditPromptEditor } from './AuditPromptEditor';

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
  personaTemplates: PromptTemplate[];
  isRefiningPersona: boolean;
  canRefinePersona: boolean;
  personaRefineLabel: string;
  personaRefineProvider: string;
  handleRefinePersona: () => void;
  saveTemplate: SaveTemplateFn;
}

/** Generale: modalità, coppia di lingue, persona. */
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
  personaRefineProvider,
  handleRefinePersona,
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

  // Una persona personalizzata è scritta per una coppia: le lingue restano
  // ferme finché non la si ripristina.
  const languagesLocked = Boolean(config.persona);
  const languageOptions = LANGUAGES.map((lang) => ({ value: lang, label: t(`languages.${lang}`) }));
  const swapLabel = t('pipeline.swapLanguages');

  const defaultPersona = defaultPersonaText(config.sourceLanguage, config.targetLanguage);
  const handlePersonaChange = (value: string) => {
    const isDefault = !value.trim() || value.trim() === defaultPersona.trim();
    setConfig((prev) => ({ ...prev, persona: isDefault ? undefined : value }));
  };

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
          <span className="h-4 w-px bg-rule" aria-hidden="true" />
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

      <PanelSection
        icon={Globe}
        label={t('pipeline.languagePair')}
        hint={languagesLocked ? t('pipeline.languagePairLockedByPersona') : undefined}
      >
        <div className="flex items-center gap-3">
          <Select
            value={config.sourceLanguage}
            onChange={(value) => setConfig((prev) => ({ ...prev, sourceLanguage: value }))}
            options={languageOptions}
            size="md"
            className="w-full"
            ariaLabel={t('pipeline.sourceLanguage')}
            disabled={languagesLocked}
          />
          <IconButton
            size="md"
            className="shrink-0"
            onClick={() =>
              setConfig((prev) => ({ ...prev, sourceLanguage: prev.targetLanguage, targetLanguage: prev.sourceLanguage }))
            }
            disabled={languagesLocked}
            title={languagesLocked ? blocked(swapLabel, t('pipeline.languagePairLockedByPersona')) : swapLabel}
          >
            <ArrowRightLeft size={13} />
          </IconButton>
          <Select
            value={config.targetLanguage}
            onChange={(value) => setConfig((prev) => ({ ...prev, targetLanguage: value }))}
            options={languageOptions}
            size="md"
            className="w-full"
            ariaLabel={t('pipeline.targetLanguage')}
            disabled={languagesLocked}
          />
        </div>
      </PanelSection>

      <AuditPromptEditor
        variant="stage"
        label={t('pipeline.personaLabel')}
        hint=""
        customLabel={t('pipeline.personaCustomBadge')}
        value={config.persona ?? defaultPersona}
        placeholder={defaultPersona}
        templates={personaTemplates}
        isRefining={isRefiningPersona}
        canRefine={canRefinePersona}
        refineLabel={personaRefineLabel}
        refineDisabledReason={t('pipeline.reasonMissingKey', { provider: personaRefineProvider })}
        onRefine={handleRefinePersona}
        onChange={handlePersonaChange}
        onApplyTemplate={(template) => handlePersonaChange(template.prompt)}
        saveTemplate={saveTemplate}
        defaultValue={defaultPersona}
        onReset={() => setConfig((prev) => ({ ...prev, persona: undefined }))}
        templateContext="persona"
        templateWorkflow="translation"
        editDisabledReason={isProcessing ? t('document.operationsRunning') : undefined}
      />
    </div>
  );
}
