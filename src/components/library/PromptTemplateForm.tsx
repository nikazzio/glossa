import { reportUiError } from '../../utils/reportUiError';
import { useEffect, useState } from 'react';
import { FileText, Loader2, Save, Wand2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import type { PromptTemplate, PromptTemplateContext, PromptTemplateWorkflow } from '../../types';
import { useConfigStore } from '../../stores/configStore';
import { getSelectableModelIds, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { canRefineWithProvider, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { llmService } from '../../services/llmService';
import { FieldLabel, IconButton, SectionLabel, Select, SettingRow } from '../ui';
import { FIELD_INLINE_CLASSNAME, FIELD_MONO_CLASSNAME } from '../ui/fieldStyles';

export function templateContextLabel(context: PromptTemplateContext, t: TFunction): string {
  const keys = { stage: 'pipeline.tabStages', audit: 'pipeline.tabAudit', persona: 'pipeline.tabPersona', memory: 'workspace.settings.memoryTab', ocr: 'workspace.settings.ocrTab' };
  return t(keys[context]);
}

export function PromptTemplateForm({ template, busy, onSave, onCancel, onRefiningChange }: {
  template?: PromptTemplate;
  busy: boolean;
  onSave: (input: Omit<PromptTemplate, 'id' | 'createdAt'>) => Promise<void>;
  onCancel: () => void;
  onRefiningChange?: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const ollamaModels = useConfigStore((state) => state.ollamaModels);
  const { statuses } = useProviderKeyStatus();
  const [name, setName] = useState(template?.name ?? '');
  const [context, setContext] = useState<PromptTemplateContext>(template?.context ?? 'stage');
  const [workflow, setWorkflow] = useState<PromptTemplateWorkflow>(template?.workflow ?? 'translation');
  const [provider, setProvider] = useState(template?.defaultProvider ?? '');
  const [model, setModel] = useState(template?.defaultModel ?? '');
  const [prompt, setPrompt] = useState(template?.prompt ?? '');
  const [refining, setRefining] = useState(false);
  useEffect(() => { onRefiningChange?.(refining); return () => onRefiningChange?.(false); }, [refining, onRefiningChange]);
  const validProvider = LLM_PROVIDER_ORDER.find((item) => item === provider);
  const models = validProvider ? getSelectableModelIds(validProvider, ollamaModels) : [];
  const disabled = busy || refining;
  const refineReason = refining ? t('library.workInProgress')
    : !prompt.trim() ? t('library.promptRequired')
      : !validProvider || !model.trim() ? t('library.refineModelRequired')
        : !canRefineWithProvider(provider, statuses) ? t('library.refineKeyRequired', { provider }) : '';
  const saveReason = !name.trim() || !prompt.trim() ? t('library.templateFieldsRequired') : '';
  const contextHints = { stage: 'library.templateStageHint', audit: 'library.templateAuditHint', persona: 'library.templatePersonaHint', memory: 'library.templateMemoryHint', ocr: 'library.templateOcrHint' };

  const handleRefine = async () => {
    if (disabled || refineReason || !validProvider) return;
    setRefining(true);
    try {
      setPrompt(await llmService.refinePrompt(prompt, validProvider, model, context));
      toast.success(t('pipeline.refined'));
    } catch (error: unknown) {
      reportUiError(t('pipeline.refineFailed'), error);
    } finally { setRefining(false); }
  };

  return (
    <fieldset disabled={disabled} className="space-y-4 border-y border-rule py-4">
      <SectionLabel icon={FileText} label={template ? t('library.editTemplate') : t('library.newTemplate')} />
      <div className="divide-y divide-rule border-y border-rule">
        <SettingRow label={t('library.templateNameLabel')}>
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label={t('library.templateNameLabel')} className={`${FIELD_INLINE_CLASSNAME} max-w-64`} />
        </SettingRow>
        <SettingRow label={t('library.templateContextLabel')} hint={t(contextHints[context])}>
          <Select value={context} onChange={(value) => setContext(value as PromptTemplateContext)} size="md" ariaLabel={t('library.templateContextLabel')}
            options={(['stage', 'audit', 'persona', 'memory', 'ocr'] as const).map((value) => ({ value, label: templateContextLabel(value, t) }))} />
        </SettingRow>
        <SettingRow label={t('library.templateWorkflowLabel')} hint={t('library.templateWorkflowHint')}>
          <Select value={workflow} onChange={(value) => setWorkflow(value as PromptTemplateWorkflow)} size="md" ariaLabel={t('library.templateWorkflowLabel')}
            options={(['translation', 'transcription'] as const).map((value) => ({ value, label: t(`workflow.${value}`) }))} />
        </SettingRow>
        <SettingRow label={t('models.provider')} hint={t('library.templateDefaultModelHint')}>
          <Select value={provider} onChange={(value) => { setProvider(value); setModel(''); }} size="md" ariaLabel={t('models.provider')}
            options={[{ value: '', label: t('library.noDefaultModel') }, ...LLM_PROVIDER_ORDER.map((value) => ({ value, label: value }))]} />
        </SettingRow>
        <SettingRow label={t('library.templateDefaultModel')} hint={t('library.templateDefaultModelHint')}>
          {models.length > 0 ? <Select value={model} onChange={setModel} size="md" ariaLabel={t('library.templateDefaultModel')}
            options={[{ value: '', label: t('library.noDefaultModel') }, ...[...new Set([...(model ? [model] : []), ...models])].map((value) => ({ value, label: value }))]} className="max-w-64" />
            : <input value={model} onChange={(event) => setModel(event.target.value)} aria-label={t('library.templateDefaultModel')} className={`${FIELD_INLINE_CLASSNAME} max-w-64 font-mono`} />}
        </SettingRow>
      </div>
      <FieldLabel htmlFor="template-prompt">{t('pipeline.prompt')}</FieldLabel>
      <textarea id="template-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={8} className={`${FIELD_MONO_CLASSNAME} resize-y`} />
      <div className="flex justify-end gap-1">
        <IconButton onClick={() => void handleRefine()} disabled={disabled || !!refineReason}
          title={`${t('pipeline.refinePromptWithModel', { model: `${provider} ${model}`.trim() })}${refineReason ? ` — ${refineReason}` : ''}`}>
          {refining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        </IconButton>
        <IconButton onClick={onCancel} disabled={disabled} title={t('common.cancel')}><X size={14} /></IconButton>
        <IconButton disabled={disabled || !!saveReason} title={`${t('library.saveTemplate')}${saveReason ? ` — ${saveReason}` : ''}`}
          onClick={() => void onSave({ name: name.trim(), prompt: prompt.trim(), context, workflow, defaultModel: model.trim() || undefined, defaultProvider: provider || undefined })}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        </IconButton>
      </div>
    </fieldset>
  );
}
