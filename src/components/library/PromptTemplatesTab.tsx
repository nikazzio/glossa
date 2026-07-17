import React, { useEffect, useState } from 'react';
import { Trash2, BookmarkPlus, Check, X, Wand2, Loader2, LayoutGrid, Languages, Scale, Bot, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useConfigStore } from '../../stores/configStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import type { ModelProvider, PromptTemplateContext, PromptTemplateWorkflow } from '../../types';
import { llmService } from '../../services/llmService';
import { getSelectableModelIds, LLM_PROVIDER_ORDER } from '../../models/catalog';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { IconButton } from '../ui';

const WORKFLOW_OPTIONS = ['translation', 'transcription'] as const;

const FILTER_OPTIONS = ['all', 'stage', 'audit', 'persona', 'memory'] as const;
type FilterValue = (typeof FILTER_OPTIONS)[number];

const FILTER_ICONS: Record<FilterValue, React.ReactNode> = {
  all: <LayoutGrid size={14} />,
  stage: <Languages size={14} />,
  audit: <Scale size={14} />,
  persona: <Bot size={14} />,
  memory: <Brain size={14} />,
};

export function PromptTemplatesTab() {
  const { t } = useTranslation();
  const { templates, isLoaded, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();
  const ollamaModels = useConfigStore((s) => s.ollamaModels);
  const { config } = usePipelineStore();
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newContext, setNewContext] = useState<PromptTemplateContext>('stage');
  const [creating, setCreating] = useState(false);
  const [filterContext, setFilterContext] = useState<FilterValue>('all');
  const [newWorkflow, setNewWorkflow] = useState<PromptTemplateWorkflow>('translation');
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
    if (value === 'memory') return t('workspace.settings.memoryTab');
    return t('pipeline.tabPersona');
  };

  const contextLabel = (context: PromptTemplateContext) => {
    if (context === 'audit') return t('pipeline.tabAudit');
    if (context === 'persona') return t('pipeline.tabPersona');
    if (context === 'memory') return t('workspace.settings.memoryTab');
    return t('pipeline.tabStages');
  };

  const contextBadgeClass = (context: PromptTemplateContext) => {
    if (context === 'audit') return 'border-l-editorial-warning bg-editorial-warning/12 text-editorial-warning';
    if (context === 'persona') return 'border-l-editorial-muted bg-editorial-textbox/45 text-editorial-muted';
    if (context === 'memory') return 'border-l-editorial-success bg-editorial-success/10 text-editorial-success';
    return 'border-l-editorial-accent bg-editorial-accent/12 text-editorial-accent';
  };

  const handleRefine = async () => {
    if (!newPrompt.trim() || !refineModel.trim()) return;
    setIsRefining(true);
    try {
      const refined = await llmService.refinePrompt(newPrompt, refineProvider, refineModel, newContext);
      setNewPrompt(refined);
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
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

  const filtered = templates.filter((tmpl) => {
    return filterContext === 'all' || tmpl.context === filterContext;
  });

  const handleSave = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      await saveTemplate(newName.trim(), newPrompt.trim(), newContext, newWorkflow, refineModel, refineProvider);
      toast.success(t('pipeline.templates.saved'));
      setNewName('');
      setNewPrompt('');
      setCreating(false);
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), { description: err instanceof Error ? err.message : String(err) });
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
    } catch (err: unknown) {
      toast.error(t('errors.somethingWentWrong'), { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {FILTER_OPTIONS.map((ctx) => {
            const isActive = filterContext === ctx;
            return (
              <IconButton
                key={ctx}
                size="md"
                tone={isActive ? 'accent' : 'default'}
                title={filterLabel(ctx)}
                onClick={() => setFilterContext(ctx)}
                ariaPressed={isActive}
              >
                {FILTER_ICONS[ctx]}
              </IconButton>
            );
          })}
          <span className="mx-1 h-4 w-px self-center bg-editorial-border/70" aria-hidden="true" />
          <span className="self-center font-display text-sm italic text-editorial-ink">
            {filterLabel(filterContext)}
          </span>
        </div>
        <IconButton
          size="md"
          onClick={() => setCreating(true)}
          title={t('library.newTemplate')}
        >
          <BookmarkPlus size={13} />
        </IconButton>
      </div>

      {creating && (
        <div className="space-y-4 border-l-4 border-l-editorial-accent/35 border-y border-editorial-border/70 bg-editorial-bg/45 px-4 py-5">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (crea nuovo template)
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('library.templateNamePlaceholder')}
              className="rounded-md border border-editorial-border bg-editorial-bg/80 px-4 py-2.5 text-sm font-display italic text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
            <select
              value={newContext}
              onChange={(e) => setNewContext(e.target.value as PromptTemplateContext)}
              className="rounded-md border border-editorial-border bg-editorial-bg/80 px-3 py-2.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('library.templateContextLabel')}
            >
              <option value="stage">{t('pipeline.tabStages')}</option>
              <option value="audit">{t('pipeline.tabAudit')}</option>
              <option value="persona">{t('pipeline.tabPersona')}</option>
              <option value="memory">{t('workspace.settings.memoryTab')}</option>
            </select>
            <select
              value={newWorkflow}
              onChange={(e) => setNewWorkflow(e.target.value as PromptTemplateWorkflow)}
              className="rounded-md border border-editorial-border bg-editorial-bg/80 px-3 py-2.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              aria-label={t('library.templateWorkflowLabel')}
            >
              {WORKFLOW_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w === 'translation' ? t('workflow.translation') : t('workflow.transcription')}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs leading-relaxed text-editorial-muted">
            {newContext === 'audit'
              ? t('library.templateAuditHint')
              : newContext === 'persona'
                ? t('library.templatePersonaHint')
                : newContext === 'memory'
                  ? t('library.templateMemoryHint')
                : t('library.templateStageHint')}
          </p>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-editorial-muted">
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
                  className="rounded-md border border-editorial-border bg-editorial-bg px-3 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('library.templateRefineProviderLabel')}
                >
                  {LLM_PROVIDER_ORDER.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={refineModel}
                  onChange={(e) => setRefineModel(e.target.value)}
                  className="max-w-[160px] rounded-md border border-editorial-border bg-editorial-bg px-3 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.stageModelLabel')}
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <IconButton
                  onClick={handleRefine}
                  disabled={isRefining || !newPrompt.trim() || !canRefine}
                  title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  size="sm"
                >
                  {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </IconButton>
              </div>
            </div>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder={t('library.templatePromptPlaceholder')}
              rows={6}
              className="w-full resize-y rounded-md border border-editorial-border bg-editorial-bg/70 px-4 py-3 text-[13px] leading-relaxed font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={() => setCreating(false)}
              className="flex items-center gap-2 rounded-md border border-editorial-border px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <X size={13} /> {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!newName.trim() || !newPrompt.trim()}
              className="flex items-center gap-2 rounded-md bg-editorial-accent px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-editorial-accent/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={13} /> {t('library.saveTemplate')}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !creating ? (
        <p className="border-y border-dashed border-editorial-border/70 py-8 text-center text-sm italic text-editorial-muted/70">
          {t('library.noTemplates')}
        </p>
      ) : null}

      <div className="space-y-3">
        {filtered.map((tmpl) => (
          <div
            key={tmpl.id}
            className="space-y-3 border-l-4 border-l-editorial-accent/30 border-y border-editorial-border/70 bg-editorial-bg/55 px-4 py-4 transition-colors hover:border-l-editorial-accent"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <span className={`inline-block border-l-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] ${contextBadgeClass(tmpl.context)}`}>
                  {contextLabel(tmpl.context)}
                </span>
                <div className="font-display text-base italic text-editorial-ink">{tmpl.name}</div>
              </div>
              <IconButton
                onClick={() => handleDelete(tmpl.id, tmpl.name)}
                title={t('common.delete')}
                ariaLabel={`${t('common.delete')}: ${tmpl.name}`}
                size="sm"
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap bg-editorial-textbox/20 px-4 py-3 text-[12px] leading-relaxed font-mono text-editorial-ink/80 custom-scrollbar">
              {tmpl.prompt}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
