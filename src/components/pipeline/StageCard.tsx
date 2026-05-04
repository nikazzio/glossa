import { useState, useRef, useEffect } from 'react';
import {
  BookmarkPlus,
  BookOpen,
  ChevronUp,
  ChevronDown,
  Link2,
  Loader2,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PipelineStageConfig, ModelProvider } from '../../types';
import { MODEL_OPTIONS } from '../../constants';
import { getModelStatus } from '../../models/catalog';
import { useUiStore } from '../../stores/uiStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { confirm } from '../../stores/confirmStore';
import { llmService } from '../../services/llmService';

interface StageCardProps {
  stage: PipelineStageConfig;
  index: number;
  onUpdate: (updates: Partial<PipelineStageConfig>) => void;
  onRemove: () => void;
}

function useModelOptions(provider: ModelProvider): string[] {
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  if (provider === 'ollama') return ollamaModels;
  return MODEL_OPTIONS[provider] || [];
}

export function StageCard({ stage, index, onUpdate, onRemove }: StageCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const modelOptions = useModelOptions(stage.provider);
  const ollamaStatus = useUiStore((s) => s.ollamaStatus);
  const showOllamaOfflineWarning =
    stage.provider === 'ollama' && ollamaStatus === 'disconnected';

  const { templates, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();

  useEffect(() => {
    if (isExpanded) loadTemplates();
  }, [isExpanded]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [stage.prompt]);

  const handleProviderChange = (newProvider: ModelProvider) => {
    const models =
      newProvider === 'ollama'
        ? useUiStore.getState().ollamaModels
        : MODEL_OPTIONS[newProvider];
    onUpdate({ provider: newProvider, model: models[0] || '' });
    if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'unknown') {
      toast.message(t('ollama.uncheckedHint'));
    } else if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'disconnected') {
      toast.warning(t('ollama.selectedButOffline'));
    }
  };

  const handleRemove = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmRemoveStageTitle'),
      message: t('pipeline.confirmRemoveStageMessage', { name: stage.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (ok) onRemove();
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate(name, stage.prompt, 'stage');
      toast.success(t('pipeline.templates.saved'));
      setTemplateName('');
      setShowSaveName(false);
    } catch (err: unknown) {
      toast.error(t('pipeline.templates.saved'), {
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

  const handleRefinePrompt = async () => {
    if (!stage.prompt.trim() || !stage.model.trim()) return;
    setIsRefining(true);
    try {
      const refined = await llmService.refinePrompt(stage.prompt, stage.provider, stage.model, 'stage');
      onUpdate({ prompt: refined });
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefining(false);
    }
  };

  const stageTemplates = templates.filter((tmpl) => tmpl.context === 'stage');
  const filteredTemplates = stageTemplates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  return (
    <div
      className={`relative rounded-lg border border-editorial-border bg-editorial-bg p-5 pb-6 transition-all ${
        !stage.enabled ? 'grayscale opacity-40' : 'shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-editorial-textbox/60 px-2 py-0.5 text-[10px] font-display italic text-editorial-accent">
            #{index + 1}
          </span>
          <input
            value={stage.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="bg-transparent border-none p-0 font-display text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent w-32 border-b border-transparent focus:border-editorial-ink/20"
            aria-label={t('pipeline.stageName')}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onUpdate({ enabled: !stage.enabled })}
            title={stage.enabled ? t('pipeline.disableStage') : t('pipeline.enableStage')}
            className="text-editorial-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={stage.enabled ? t('pipeline.disableStage') : t('pipeline.enableStage')}
            aria-pressed={stage.enabled}
          >
            {stage.enabled ? (
              <ShieldCheck size={14} className="text-editorial-ink" />
            ) : (
              <div className="w-3.5 h-3.5 border-2 border-editorial-muted rounded-sm" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? t('pipeline.collapseStage') : t('pipeline.expandStage')}
            className="text-editorial-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? t('pipeline.collapseStage') : t('pipeline.expandStage')}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={handleRemove}
            title={t('pipeline.removeStage')}
            className="text-editorial-muted hover:text-editorial-accent overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            aria-label={t('pipeline.removeStage')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">
          <div className="flex gap-2">
            <select
              value={stage.provider}
              onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
              className="bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {Object.keys(MODEL_OPTIONS).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {modelOptions.length > 0 ? (
              <select
                value={stage.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="flex-1 bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}{getModelStatus(stage.provider, m) === 'preview' ? ' (preview)' : ''}
                  </option>
                ))}
              </select>
            ) : stage.provider === 'ollama' ? (
              <input
                value={stage.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                placeholder={t('ollama.modelPlaceholder')}
                className="flex-1 bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              />
            ) : (
              <select
                value={stage.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="flex-1 bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {MODEL_OPTIONS[stage.provider]?.map((m) => (
                  <option key={m} value={m}>
                    {m}{getModelStatus(stage.provider, m) === 'preview' ? ' (preview)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {showOllamaOfflineWarning && (
            <div className="flex items-center gap-2 text-[10px] text-editorial-accent">
              <AlertTriangle size={12} />
              <span>{t('ollama.selectedButOffline')}</span>
            </div>
          )}

          {/* Rolling context toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={stage.rollingContext !== false}
              onClick={() => onUpdate({ rollingContext: stage.rollingContext !== false ? false : true })}
              title={t('pipeline.rollingContext')}
              aria-label={t('pipeline.rollingContext')}
              className={`shrink-0 rounded-full border p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                stage.rollingContext !== false
                  ? 'border-editorial-ink bg-editorial-ink text-white'
                  : 'border-editorial-border text-editorial-muted hover:bg-editorial-textbox/50 hover:text-editorial-ink'
              }`}
            >
              <Link2 size={13} />
            </button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
              {t('pipeline.rollingContext')}
            </span>
          </div>

          {/* Prompt textarea with template controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                {t('pipeline.prompt')}
              </span>
              <div className="flex items-center gap-1.5">
                {/* Refine prompt */}
                <button
                  type="button"
                  onClick={handleRefinePrompt}
                  disabled={isRefining || !stage.prompt.trim() || !stage.model.trim()}
                  title={t('pipeline.refinePrompt')}
                  aria-label={t('pipeline.refinePrompt')}
                  className="text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
                >
                  {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                </button>
                {/* Save as template */}
                <button
                  type="button"
                  onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                  title={t('pipeline.templates.save')}
                  aria-label={t('pipeline.templates.save')}
                  className="text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookmarkPlus size={14} />
                </button>
                {/* Load template */}
                <button
                  type="button"
                  onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                  title={t('pipeline.templates.load')}
                  aria-label={t('pipeline.templates.load')}
                  className="text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookOpen size={14} />
                </button>
              </div>
            </div>

            {/* Inline save name input */}
            {showSaveName && (
              <div className="flex items-center gap-1.5">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); if (e.key === 'Escape') setShowSaveName(false); }}
                  placeholder={t('pipeline.templates.namePlaceholder')}
                  autoFocus
                  className="flex-1 rounded bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-[11px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim()}
                  className="text-editorial-ink hover:text-editorial-accent transition-colors disabled:opacity-40 focus:outline-none"
                  aria-label={t('common.confirm')}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSaveName(false); setTemplateName(''); }}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
                  aria-label={t('common.cancel')}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Template list popover */}
            {showTemplateList && (
              <div className="rounded-lg border border-editorial-border bg-editorial-bg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-editorial-border/60">
                  <input
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder={t('pipeline.templates.searchPlaceholder')}
                    autoFocus
                    className="w-full rounded bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                  />
                </div>
                <ul className="max-h-48 overflow-y-auto custom-scrollbar">
                  {filteredTemplates.length === 0 ? (
                    <li className="px-3 py-4 text-[10px] text-editorial-muted text-center">
                      {t('pipeline.templates.empty')}
                    </li>
                  ) : (
                    filteredTemplates.map((tmpl) => (
                      <li
                        key={tmpl.id}
                        className="flex items-start gap-2 px-3 py-2 hover:bg-editorial-textbox/40 group"
                      >
                        <button
                          type="button"
                          onClick={() => { onUpdate({ prompt: tmpl.prompt }); setShowTemplateList(false); setTemplateSearch(''); }}
                          className="flex-1 text-left min-w-0 focus:outline-none"
                        >
                          <div className="text-[11px] font-bold text-editorial-ink truncate">{tmpl.name}</div>
                          <div className="text-[10px] text-editorial-muted truncate mt-0.5 font-mono">{tmpl.prompt}</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(tmpl.id)}
                          className="shrink-0 text-editorial-muted/40 hover:text-editorial-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none mt-0.5"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={stage.prompt}
              onChange={(e) => onUpdate({ prompt: e.target.value })}
              placeholder={t('pipeline.stagePromptPlaceholder')}
              rows={8}
              className="w-full rounded-[16px] bg-editorial-textbox/40 border border-editorial-border/60 p-4 text-[12px] font-mono outline-none leading-relaxed resize-y focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}
