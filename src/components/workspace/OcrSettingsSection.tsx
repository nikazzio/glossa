import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BookmarkPlus,
  Check,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  ScanText,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { DEFAULT_OCR_PROMPT } from '../../constants';
import { useProviderKeyStatus, canRefineWithProvider, formatProviderModelLabel } from '../../hooks/useProviderKeyStatus';
import { getModelStatus, getVisionCapableModelIds, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { ModelCapabilityHint } from '../models/ModelCapabilityHint';
import { llmService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useConfigStore } from '../../stores/configStore';
import type { ModelProvider, PromptTemplate } from '../../types';
import { FieldLabel, IconButton, Select } from '../ui';

interface OcrSettingsSectionProps {
  /** '' = nessun default a questo livello — la select del provider resta vuota. */
  provider: ModelProvider | '';
  model: string;
  prompt: string;
  onProviderChange: (provider: ModelProvider | '', model: string) => void;
  onModelChange: (model: string) => void;
  onPromptChange: (prompt: string) => void;
}

/** Impostazioni OCR/HTR a livello workspace (#220): stesso trattamento
 *  dell'estrattore di memoria, ma il provider può restare vuoto — un
 *  documento o l'utente lo sceglie al momento della lettura. */
export function OcrSettingsSection({
  provider,
  model,
  prompt,
  onProviderChange,
  onModelChange,
  onPromptChange,
}: OcrSettingsSectionProps) {
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

  const modelOptions = provider ? getVisionCapableModelIds(provider, ollamaModels) : [];
  const ocrTemplates = useMemo(
    () => templates.filter((template) => template.context === 'ocr'),
    [templates],
  );
  const filteredTemplates = ocrTemplates.filter((template) =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );
  const canRefine = provider ? canRefineWithProvider(provider, keyStatuses) : false;
  const refineLabel = provider ? formatProviderModelLabel(provider, model) : '';
  const effectivePrompt = prompt || DEFAULT_OCR_PROMPT;
  const isCustomPrompt = prompt.trim() !== '' && prompt.trim() !== DEFAULT_OCR_PROMPT.trim();

  const handleProviderChange = (nextProvider: ModelProvider | '') => {
    if (!nextProvider) {
      onProviderChange('', '');
      return;
    }
    const nextModels = getVisionCapableModelIds(nextProvider, ollamaModels);
    onProviderChange(nextProvider, nextModels[0] ?? '');
  };

  const handleRefine = async () => {
    if (!provider || !prompt.trim() || !model.trim()) return;
    setIsRefining(true);
    try {
      const refined = await llmService.refinePrompt(prompt, provider, model, 'ocr');
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
      await saveTemplate(name, prompt, 'ocr', 'transcription', model, provider || undefined);
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
      onProviderChange(
        nextProvider,
        template.defaultModel ?? getVisionCapableModelIds(nextProvider, ollamaModels)[0] ?? '',
      );
      return;
    }
    if (template.defaultModel) onModelChange(template.defaultModel);
  };

  const providerOptions = [
    { value: '', label: t('transcription.assist.noProvider') },
    ...LLM_PROVIDER_ORDER.map((entry) => ({
      value: entry,
      label: entry,
      disabled: entry !== 'ollama' && (keyStatuses as Partial<Record<string, boolean>>)[entry] === false,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3 border-y border-editorial-border/70 py-4">
        <FieldLabel icon={<ScanText size={11} className="shrink-0 text-editorial-accent" />}>
          {t('workspace.ocrDefaultModel')}
        </FieldLabel>
        <div className="flex gap-2">
          <Select
            value={provider}
            onChange={(value) => handleProviderChange(value as ModelProvider | '')}
            className="font-bold uppercase"
            ariaLabel={t('models.provider')}
            options={providerOptions}
          />
          {provider && modelOptions.length > 0 ? (
            <div className="flex flex-1 items-center gap-1.5">
              <Select
                value={model}
                onChange={onModelChange}
                className="flex-1 font-mono"
                ariaLabel={t('workspace.ocrDefaultModel')}
                options={modelOptions.map((entry) => ({
                  value: entry,
                  label: `${entry}${getModelStatus(provider, entry) === 'preview' ? ' (preview)' : ''}`,
                }))}
              />
              <ModelCapabilityHint provider={provider} model={model} iconOnly />
            </div>
          ) : provider ? (
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-md border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('workspace.ocrDefaultModel')}
            />
          ) : (
            <p className="flex flex-1 items-center px-2 text-xs text-editorial-muted">
              {t('transcription.assist.noProviderHint')}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 border-y border-editorial-border/70 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <FieldLabel icon={<FileText size={11} className="shrink-0 text-editorial-accent" />}>
              {t('workspace.ocrDefaultPrompt')}
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
                    onClick={() => onPromptChange('')}
                    title={t('workspace.resetOcrPrompt')}
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
          value={isEditingPrompt ? prompt : effectivePrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={8}
          disabled={!isEditingPrompt}
          placeholder={DEFAULT_OCR_PROMPT}
          className={`min-h-[8rem] w-full resize-y rounded-md border p-4 font-mono text-sm leading-relaxed outline-none ${
            isEditingPrompt
              ? 'border-editorial-border/60 bg-editorial-textbox/40 focus-visible:ring-2 focus-visible:ring-editorial-accent'
              : 'cursor-default border-editorial-border/30 bg-editorial-textbox/10 text-editorial-muted/60'
          }`}
          aria-label={t('workspace.ocrDefaultPrompt')}
        />
        {!isEditingPrompt && !prompt.trim() && (
          <p className="px-1 text-xs text-editorial-muted">{t('workspace.ocrDefaultPromptUnsetHint')}</p>
        )}
      </div>
    </div>
  );
}
