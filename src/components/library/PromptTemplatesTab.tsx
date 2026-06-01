import React, { useEffect, useState } from 'react';
import { Trash2, BookmarkPlus, Check, X, Wand2, Loader2, LayoutGrid, Languages, Scale, Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import type { ModelProvider } from '../../types';
import { llmService } from '../../services/llmService';
import { getSelectableModelIds, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';

const FILTER_OPTIONS = ['all', 'stage', 'audit', 'persona'] as const;
type FilterValue = (typeof FILTER_OPTIONS)[number];

const FILTER_ICONS: Record<FilterValue, React.ReactNode> = {
  all: <LayoutGrid size={14} />,
  stage: <Languages size={14} />,
  audit: <Scale size={14} />,
  persona: <Bot size={14} />,
};

export function PromptTemplatesTab() {
  const { t } = useTranslation();
  const { templates, isLoaded, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  const { config } = usePipelineStore();
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newContext, setNewContext] = useState<'stage' | 'audit' | 'persona'>('stage');
  const [creating, setCreating] = useState(false);
  const [filterContext, setFilterContext] = useState<FilterValue>('all');
  const [isRefining, setIsRefining] = useState(false);
  const { statuses: keyStatuses } = useProviderKeyStatus();
  const getProviderModels = (provider: ModelProvider) => getSelectableModelIds(provider, ollamaModels);

  const firstActiveStage = config.stages.find((s) => s.enabled);
  const stageDefaultProvider: ModelProvider = (firstActiveStage?.provider as ModelProvider) ?? 'gemini';
  const stageDefaultModel = firstActiveStage?.model ?? (getProviderModels(stageDefaultProvider)[0] ?? '');
  const auditDefaultProvider: ModelProvider = config.judgeProvider;
  const auditDefaultModel = config.judgeModel;
  const [refineProvider, setRefineProvider] = useState<ModelProvider>(stageDefaultProvider);
  const [refineModel, setRefineModel] = useState<string>(stageDefaultModel);

  const modelOptions = getProviderModels(refineProvider);
  const canRefine = canRefineWithProvider(refineProvider, keyStatuses);
  const refineLabel = formatProviderModelLabel(refineProvider, refineModel);

  const filterLabel = (value: FilterValue) => {
    if (value === 'all') return t('common.all');
    if (value === 'stage') return t('pipeline.tabStages');
    if (value === 'audit') return t('pipeline.tabAudit');
    return t('pipeline.tabPersona');
  };

  const contextLabel = (context: 'stage' | 'audit' | 'persona') => {
    if (context === 'audit') return t('pipeline.tabAudit');
    if (context === 'persona') return t('pipeline.tabPersona');
    return t('pipeline.tabStages');
  };

  const contextBadgeClass = (context: 'stage' | 'audit' | 'persona') => {
    if (context === 'audit') return 'bg-editorial-warning/20 text-editorial-warning';
    if (context === 'persona') return 'bg-editorial-textbox/60 text-editorial-muted';
    return 'bg-editorial-accent/20 text-editorial-accent';
  };

  const handleRefine = async () => {
    if (!newPrompt.trim() || !refineModel.trim()) return;
    setIsRefining(true);
    try {
      const refined = await llmService.refinePrompt(newPrompt, refineProvider, refineModel, newContext);
      setNewPrompt(refined);
      toast.success(t('pipeline.refined'));
    } catch (err: any) {
      toast.error(t('pipeline.refineFailed'), { description: err?.message });
    } finally {
      setIsRefining(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) loadTemplates();
  }, [isLoaded, loadTemplates]);

  useEffect(() => {
    if (newContext === 'audit') {
      setRefineProvider(auditDefaultProvider);
      setRefineModel(auditDefaultModel);
      return;
    }
    setRefineProvider(stageDefaultProvider);
    setRefineModel(stageDefaultModel);
  }, [newContext, auditDefaultProvider, auditDefaultModel, stageDefaultProvider, stageDefaultModel]);

  const filtered = templates.filter(
    (tmpl) => filterContext === 'all' || tmpl.context === filterContext,
  );

  const handleSave = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      await saveTemplate(newName.trim(), newPrompt.trim(), newContext, refineModel, refineProvider);
      toast.success(t('pipeline.templates.saved'));
      setNewName('');
      setNewPrompt('');
      setCreating(false);
    } catch (err: any) {
      toast.error(t('errors.somethingWentWrong'), { description: err?.message });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('library.templateDeleteTitle'),
      message: t('library.templateDeleteMessage', { name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTemplate(id);
      toast.success(t('pipeline.templates.deleted'));
    } catch (err: any) {
      toast.error(t('errors.somethingWentWrong'), { description: err?.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {FILTER_OPTIONS.map((ctx) => {
            const isActive = filterContext === ctx;
            return (
              <button
                key={ctx}
                onClick={() => setFilterContext(ctx)}
                title={filterLabel(ctx)}
                aria-label={filterLabel(ctx)}
                className={`rounded-full border p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                  isActive
                    ? 'border-editorial-accent bg-editorial-accent text-white'
                    : 'border-editorial-border text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
                }`}
              >
                {FILTER_ICONS[ctx]}
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
          <span className="self-center font-display text-sm italic text-editorial-ink">
            {filterLabel(filterContext)}
          </span>
        </div>
        <button
          onClick={() => setCreating(true)}
          title={t('library.newTemplate')}
          aria-label={t('library.newTemplate')}
          className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <BookmarkPlus size={13} />
        </button>
      </div>

      {creating && (
        <div className="space-y-4 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 p-5">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('library.templateNamePlaceholder')}
              className="rounded-[16px] border border-editorial-border bg-editorial-bg/80 px-4 py-2.5 text-sm font-display italic text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
            <select
              value={newContext}
              onChange={(e) => setNewContext(e.target.value as 'stage' | 'audit' | 'persona')}
              className="rounded-[16px] border border-editorial-border bg-editorial-bg/80 px-3 py-2.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <option value="stage">{t('pipeline.tabStages')}</option>
              <option value="audit">{t('pipeline.tabAudit')}</option>
              <option value="persona">{t('pipeline.tabPersona')}</option>
            </select>
          </div>
          <p className="text-[11px] leading-relaxed text-editorial-muted">
            {newContext === 'audit'
              ? t('library.templateAuditHint')
              : newContext === 'persona'
                ? t('library.templatePersonaHint')
                : t('library.templateStageHint')}
          </p>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-editorial-muted">
                {t('pipeline.prompt')}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={refineProvider}
                  onChange={(e) => {
                    const p = e.target.value as ModelProvider;
                    setRefineProvider(p);
                    setRefineModel(getProviderModels(p)[0] ?? '');
                  }}
                  className="rounded-full border border-editorial-border bg-editorial-bg px-3 py-1.5 text-[10px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  {MODEL_PROVIDER_ORDER.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={refineModel}
                  onChange={(e) => setRefineModel(e.target.value)}
                  className="max-w-[160px] rounded-full border border-editorial-border bg-editorial-bg px-3 py-1.5 text-[10px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={handleRefine}
                  disabled={isRefining || !newPrompt.trim() || !canRefine}
                  title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  aria-label={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isRefining ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                </button>
              </div>
            </div>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder={t('library.templatePromptPlaceholder')}
              rows={6}
              className="w-full resize-y rounded-[16px] border border-editorial-border bg-editorial-bg/70 px-4 py-3 text-[13px] leading-relaxed font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => setCreating(false)}
              className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <X size={13} /> {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!newName.trim() || !newPrompt.trim()}
              className="flex items-center gap-2 rounded-full bg-editorial-accent px-5 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-accent/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={13} /> {t('library.saveTemplate')}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !creating ? (
        <p className="rounded-[20px] border border-dashed border-editorial-border/60 px-4 py-8 text-center text-sm italic text-editorial-muted/70">
          {t('library.noTemplates')}
        </p>
      ) : null}

      <div className="space-y-3">
        {filtered.map((tmpl) => (
          <div
            key={tmpl.id}
            className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-textbox/15 p-5 transition-colors hover:border-editorial-accent/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-display text-base italic text-editorial-ink">{tmpl.name}</span>
                <span className={`rounded-full px-3 py-0.5 text-[9px] font-bold uppercase tracking-[0.25em] ${contextBadgeClass(tmpl.context)}`}>
                  {contextLabel(tmpl.context)}
                </span>
              </div>
              <button
                onClick={() => handleDelete(tmpl.id, tmpl.name)}
                title={t('common.delete')}
                aria-label={`${t('common.delete')}: ${tmpl.name}`}
                className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-[14px] border border-editorial-border/40 bg-editorial-bg/60 px-4 py-3 text-[12px] leading-relaxed font-mono text-editorial-ink/80 custom-scrollbar">
              {tmpl.prompt}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
