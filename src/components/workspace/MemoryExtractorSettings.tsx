import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BookmarkPlus,
  Check,
  Cpu,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DEFAULT_MEMORY_EXTRACTOR_MODEL, DEFAULT_MEMORY_EXTRACTOR_PROMPT, DEFAULT_MEMORY_EXTRACTOR_PROVIDER } from '../../constants';
import { useProviderKeyStatus, canRefineWithProvider, formatProviderModelLabel } from '../../hooks/useProviderKeyStatus';
import { getModelStatus, getSelectableModelIds, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { llmService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useConfigStore } from '../../stores/configStore';
import type { ModelProvider, PromptTemplate } from '../../types';
import { FieldLabel, IconButton, Select } from '../ui';

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
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const { templates, isLoaded, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const [isRefining, setIsRefining] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [showSaveName, setShowSaveName] = useState(false);
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    if (!isLoaded) void loadTemplates();
  }, [isLoaded, loadTemplates]);

  const modelOptions = getSelectableModelIds(provider, ollamaModels);
  const memoryTemplates = useMemo(
    () => templates.filter((template) => template.context === 'memory'),
    [templates],
  );
  const filteredTemplates = memoryTemplates.filter((template) =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );
  const canRefine = canRefineWithProvider(provider, keyStatuses);
  const refineLabel = formatProviderModelLabel(provider, model);
  const isCustomPrompt = prompt.trim() !== DEFAULT_MEMORY_EXTRACTOR_PROMPT.trim();

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
      await saveTemplate(name, prompt, 'memory', 'translation', model, provider);
      setTemplateName('');
      setShowSaveName(false);
      toast.success(t('pipeline.templates.saved'));
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate(id);
      toast.success(t('pipeline.templates.deleted'));
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
    <div className="space-y-4">
      <div className="space-y-3 border-y border-editorial-border/70 py-4">
        <FieldLabel icon={<Cpu size={11} className="shrink-0 text-editorial-accent" />}>
          {t('workspace.memoryExtractorModel')}
        </FieldLabel>
        <div className="flex gap-2">
          <Select
            value={provider}
            onChange={(value) => handleProviderChange(value as ModelProvider)}
            className="font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={LLM_PROVIDER_ORDER.map((entry) => ({
              value: entry,
              label: entry,
              disabled: entry !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[entry] === false,
            }))}
          />
          {modelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={model}
                onChange={onModelChange}
                className="flex-1 font-mono"
                ariaLabel={t('workspace.memoryExtractorModel')}
                options={modelOptions.map((entry) => ({
                  value: entry,
                  label: `${entry}${getModelStatus(provider, entry) === 'preview' ? ' (preview)' : ''}`,
                }))}
              />
              <ModelCapabilityHint provider={provider} model={model} iconOnly />
            </div>
          ) : (
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('workspace.memoryExtractorModel')}
            />
          )}
        </div>
      </div>

      <div className="space-y-3 border-y border-editorial-border/70 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <FieldLabel icon={<FileText size={11} className="shrink-0 text-editorial-accent" />}>
              {t('workspace.memoryExtractorPrompt')}
            </FieldLabel>
            {isCustomPrompt && !isEditingPrompt && (
              <span className="rounded-full bg-editorial-accent/15 px-2 py-0.5 text-xs font-bold uppercase tracking-[0.14em] text-editorial-accent">
                {t('pipeline.promptCustomBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditingPrompt ? (
              <>
                <IconButton
                  size="sm"
                  onClick={() => void handleRefine()}
                  disabled={isRefining || !prompt.trim() || !canRefine}
                  title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                >
                  {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                  title={t('pipeline.templates.save')}
                >
                  <BookmarkPlus size={16} />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                  title={t('pipeline.templates.load')}
                >
                  <BookOpen size={16} />
                </IconButton>
                <IconButton
                  size="sm"
                  onClick={() => { setIsEditingPrompt(false); setShowSaveName(false); setShowTemplateList(false); }}
                  title={t('common.close')}
                >
                  <X size={16} />
                </IconButton>
              </>
            ) : (
              <>
                {isCustomPrompt && (
                  <IconButton
                    size="sm"
                    onClick={() => {
                      onProviderChange(DEFAULT_MEMORY_EXTRACTOR_PROVIDER, DEFAULT_MEMORY_EXTRACTOR_MODEL);
                      onPromptChange(DEFAULT_MEMORY_EXTRACTOR_PROMPT);
                    }}
                    title={t('workspace.resetMemoryExtractorPrompt')}
                  >
                    <RotateCcw size={16} />
                  </IconButton>
                )}
                <IconButton size="sm" onClick={() => setIsEditingPrompt(true)} title={t('pipeline.editPrompt')}>
                  <Pencil size={16} />
                </IconButton>
              </>
            )}
          </div>
        </div>

        {isEditingPrompt && showSaveName && (
          <div className="flex items-center gap-1.5">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveTemplate();
                if (e.key === 'Escape') { setShowSaveName(false); setTemplateName(''); }
              }}
              placeholder={t('pipeline.templates.namePlaceholder')}
              aria-label={t('pipeline.templates.namePlaceholder')}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (salva template)
              autoFocus
              className="flex-1 rounded border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
            <IconButton
              size="sm"
              onClick={() => void handleSaveTemplate()}
              disabled={!templateName.trim()}
              title={t('common.confirm')}
            >
              <Check size={16} />
            </IconButton>
            <IconButton
              size="sm"
              onClick={() => { setShowSaveName(false); setTemplateName(''); }}
              title={t('common.cancel')}
            >
              <X size={16} />
            </IconButton>
          </div>
        )}

        {isEditingPrompt && showTemplateList && (
          <div className="overflow-hidden border-y border-editorial-border bg-editorial-bg">
            <div className="border-b border-editorial-border/60 p-2">
              <input
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder={t('pipeline.templates.searchPlaceholder')}
                aria-label={t('pipeline.templates.searchPlaceholder')}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- casella di ricerca che compare aprendo l'elenco template
                autoFocus
                className="w-full rounded border border-editorial-border/40 bg-editorial-textbox/60 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto custom-scrollbar">
              {filteredTemplates.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-editorial-muted">
                  {t('pipeline.templates.empty')}
                </li>
              ) : (
                filteredTemplates.map((template) => (
                  <li key={template.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-editorial-textbox/40">
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyTemplate(template);
                        setShowTemplateList(false);
                        setTemplateSearch('');
                      }}
                      className="min-w-0 flex-1 text-left focus:outline-none"
                    >
                      <div className="truncate text-sm font-bold text-editorial-ink">{template.name}</div>
                      <div className="mt-0.5 truncate font-mono text-xs text-editorial-muted">{template.prompt}</div>
                    </button>
                    <IconButton
                      size="sm"
                      onClick={() => void handleDeleteTemplate(template.id)}
                      title={t('common.delete')}
                      className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={12}
          disabled={!isEditingPrompt}
          className={`min-h-[10rem] w-full resize-y rounded-md border p-4 font-mono text-sm leading-relaxed outline-none ${
            isEditingPrompt
              ? 'border-editorial-border/60 bg-editorial-textbox/40 focus-visible:ring-2 focus-visible:ring-editorial-accent'
              : 'cursor-default border-editorial-border/30 bg-editorial-textbox/10 text-editorial-muted/60'
          }`}
          aria-label={t('workspace.memoryExtractorPrompt')}
        />
      </div>
    </div>
  );
}
