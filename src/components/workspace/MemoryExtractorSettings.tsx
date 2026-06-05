import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, Brain, Check, Cpu, Loader2, RotateCcw, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DEFAULT_MEMORY_EXTRACTOR_MODEL, DEFAULT_MEMORY_EXTRACTOR_PROMPT, DEFAULT_MEMORY_EXTRACTOR_PROVIDER } from '../../constants';
import { useProviderKeyStatus, canRefineWithProvider, formatProviderModelLabel } from '../../hooks/useProviderKeyStatus';
import { getModelStatus, getSelectableModelIds, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { llmService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useUiStore } from '../../stores/uiStore';
import type { ModelProvider, PromptTemplate } from '../../types';
import { IconButton, PillButton, SectionLabel } from '../ui';

interface MemoryExtractorSettingsProps {
  provider: ModelProvider;
  model: string;
  prompt: string;
  onProviderChange: (provider: ModelProvider, model: string) => void;
  onModelChange: (model: string) => void;
  onPromptChange: (prompt: string) => void;
}

export function MemoryExtractorSettings({
  provider,
  model,
  prompt,
  onProviderChange,
  onModelChange,
  onPromptChange,
}: MemoryExtractorSettingsProps) {
  const { t } = useTranslation();
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  const { templates, isLoaded, loadTemplates, saveTemplate } = usePromptTemplateStore();
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const [isRefining, setIsRefining] = useState(false);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (!isLoaded) void loadTemplates();
  }, [isLoaded, loadTemplates]);

  const modelOptions = getSelectableModelIds(provider, ollamaModels);
  const memoryTemplates = useMemo(
    () => templates.filter((template) => template.context === 'memory'),
    [templates],
  );
  const canRefine = canRefineWithProvider(provider, keyStatuses);
  const refineLabel = formatProviderModelLabel(provider, model);

  const handleProviderChange = (nextProvider: ModelProvider) => {
    const nextModels = getSelectableModelIds(nextProvider, ollamaModels);
    onProviderChange(nextProvider, nextModels[0] ?? '');
  };

  const handleRefine = async () => {
    if (!prompt.trim() || !model.trim()) return;
    setIsRefining(true);
    try {
      const refined = await llmService.refinePrompt(prompt, provider, model, 'memory');
      onPromptChange(refined);
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name || !prompt.trim()) return;
    try {
      await saveTemplate(name, prompt, 'memory', model, provider);
      setTemplateName('');
      toast.success(t('pipeline.templates.saved'));
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleApplyTemplate = (template: PromptTemplate) => {
    onPromptChange(template.prompt);
    if (template.defaultProvider) {
      const nextProvider = template.defaultProvider as ModelProvider;
      onProviderChange(nextProvider, template.defaultModel ?? getSelectableModelIds(nextProvider, ollamaModels)[0] ?? '');
      return;
    }
    if (template.defaultModel) onModelChange(template.defaultModel);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-[18px] border border-editorial-border bg-editorial-bg/60 px-4 py-4">
        <SectionLabel icon={Cpu} label={t('workspace.memoryExtractorModel')} />
        <div className="grid gap-2 sm:grid-cols-[0.7fr_1fr]">
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
            className="rounded-[12px] border border-editorial-border bg-editorial-textbox/50 px-3 py-2 text-xs font-bold uppercase text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('models.provider')}
          >
            {MODEL_PROVIDER_ORDER.map((entry) => (
              <option key={entry} value={entry} disabled={entry !== 'ollama' && keyStatuses[entry] === false}>
                {entry}
              </option>
            ))}
          </select>
          {modelOptions.length > 0 ? (
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              className="rounded-[12px] border border-editorial-border bg-editorial-textbox/50 px-3 py-2 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('workspace.memoryExtractorModel')}
            >
              {modelOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}{getModelStatus(provider, entry) === 'preview' ? ' (preview)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={t('ollama.modelPlaceholder')}
              className="rounded-[12px] border border-editorial-border bg-editorial-textbox/50 px-3 py-2 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('workspace.memoryExtractorModel')}
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel icon={Brain} label={t('workspace.memoryExtractorPrompt')} />
          <div className="flex items-center gap-1">
            <IconButton
              size="md"
              title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
              onClick={() => void handleRefine()}
              disabled={isRefining || !prompt.trim() || !canRefine}
            >
              {isRefining ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            </IconButton>
            <IconButton
              size="md"
              title={t('workspace.resetMemoryExtractorPrompt')}
              onClick={() => {
                onProviderChange(DEFAULT_MEMORY_EXTRACTOR_PROVIDER, DEFAULT_MEMORY_EXTRACTOR_MODEL);
                onPromptChange(DEFAULT_MEMORY_EXTRACTOR_PROMPT);
              }}
            >
              <RotateCcw size={13} />
            </IconButton>
          </div>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={11}
          className="w-full resize-y rounded-[16px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 font-mono text-xs leading-relaxed text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          aria-label={t('workspace.memoryExtractorPrompt')}
        />
      </div>

      <div className="space-y-3 rounded-[18px] border border-editorial-border bg-editorial-bg/60 px-4 py-4">
        <SectionLabel icon={BookmarkPlus} label={t('workspace.memoryExtractorTemplates')} />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder={t('library.templateNamePlaceholder')}
            className="rounded-[12px] border border-editorial-border bg-editorial-textbox/50 px-3 py-2 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
          <PillButton
            onClick={() => void handleSaveTemplate()}
            disabled={!templateName.trim() || !prompt.trim()}
            variant="secondary"
            className="inline-flex items-center justify-center gap-2"
          >
            <Check size={13} />
            {t('library.saveTemplate')}
          </PillButton>
        </div>

        {memoryTemplates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {memoryTemplates.map((template) => (
              <PillButton
                key={template.id}
                onClick={() => handleApplyTemplate(template)}
                variant="ghost"
              >
                {template.name}
              </PillButton>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-editorial-muted">
            {t('workspace.noMemoryExtractorTemplates')}
          </p>
        )}
      </div>
    </div>
  );
}
