import { useEffect, useState } from 'react';
import { Trash2, BookmarkPlus, Check, X, Wand2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useUiStore } from '../../stores/uiStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { MODEL_OPTIONS } from '../../constants';
import type { ModelProvider } from '../../types';
import { llmService } from '../../services/llmService';

export function PromptTemplatesTab() {
  const { t } = useTranslation();
  const { templates, isLoaded, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();
  const { ollamaModels } = useUiStore();
  const { config } = usePipelineStore();
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newContext, setNewContext] = useState<'stage' | 'audit'>('stage');
  const [creating, setCreating] = useState(false);
  const [filterContext, setFilterContext] = useState<'all' | 'stage' | 'audit'>('all');
  const [isRefining, setIsRefining] = useState(false);

  const firstActiveStage = config.stages.find((s) => s.enabled);
  const defaultProvider: ModelProvider = (firstActiveStage?.provider as ModelProvider) ?? 'gemini';
  const defaultModel = firstActiveStage?.model ?? (MODEL_OPTIONS[defaultProvider]?.[0] ?? '');
  const [refineProvider, setRefineProvider] = useState<ModelProvider>(defaultProvider);
  const [refineModel, setRefineModel] = useState<string>(defaultModel);

  const modelOptions = refineProvider === 'ollama' ? ollamaModels : (MODEL_OPTIONS[refineProvider] ?? []);

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

  const filtered = templates.filter(
    (t) => filterContext === 'all' || t.context === filterContext,
  );

  const handleSave = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      await saveTemplate(newName.trim(), newPrompt.trim(), newContext);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(['all', 'stage', 'audit'] as const).map((ctx) => (
            <button
              key={ctx}
              onClick={() => setFilterContext(ctx)}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                filterContext === ctx
                  ? 'bg-editorial-ink text-white'
                  : 'text-editorial-muted hover:text-editorial-ink border border-editorial-border/60'
              }`}
            >
              {ctx === 'all' ? t('common.all') : t(`pipeline.tab${ctx.charAt(0).toUpperCase()}${ctx.slice(1)}`)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreating(true)}
          title={t('library.newTemplate')}
          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-editorial-accent hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <BookmarkPlus size={13} /> {t('library.newTemplate')}
        </button>
      </div>

      {creating && (
        <div className="space-y-2 rounded-lg border border-editorial-border/40 bg-editorial-textbox/10 p-3">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('library.templateNamePlaceholder')}
              className="flex-1 bg-transparent rounded py-1.5 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40"
            />
            <select
              value={newContext}
              onChange={(e) => setNewContext(e.target.value as 'stage' | 'audit')}
              className="bg-editorial-bg rounded py-1.5 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 text-editorial-ink"
            >
              <option value="stage">{t('pipeline.tabStages')}</option>
              <option value="audit">{t('pipeline.tabAudit')}</option>
            </select>
          </div>
          {/* Prompt + refine tools */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted">{t('pipeline.prompt')}</span>
              <div className="flex items-center gap-1 ml-auto">
                <select
                  value={refineProvider}
                  onChange={(e) => {
                    const p = e.target.value as ModelProvider;
                    setRefineProvider(p);
                    setRefineModel((MODEL_OPTIONS[p]?.[0]) ?? '');
                  }}
                  className="bg-editorial-bg rounded py-0.5 px-1.5 text-[10px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 text-editorial-ink"
                >
                  {(Object.keys(MODEL_OPTIONS) as ModelProvider[]).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  <option value="ollama">ollama</option>
                </select>
                <select
                  value={refineModel}
                  onChange={(e) => setRefineModel(e.target.value)}
                  className="bg-editorial-bg rounded py-0.5 px-1.5 text-[10px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 text-editorial-ink max-w-[120px]"
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={handleRefine}
                  disabled={isRefining || !newPrompt.trim()}
                  title={t('pipeline.refinePrompt')}
                  aria-label={t('pipeline.refinePrompt')}
                  className="p-1 text-editorial-muted hover:text-editorial-accent disabled:opacity-40 focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent transition-colors"
                >
                  {isRefining ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                </button>
              </div>
            </div>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder={t('library.templatePromptPlaceholder')}
              rows={4}
              className="w-full bg-transparent rounded py-1.5 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="p-1 text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent">
              <X size={14} />
            </button>
            <button onClick={handleSave} className="p-1 text-editorial-accent hover:text-editorial-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent">
              <Check size={14} />
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !creating && (
        <p className="text-[11px] text-editorial-muted/60 text-center py-6 border border-dashed border-editorial-border/60 rounded-lg">
          {t('library.noTemplates')}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((tmpl) => (
          <div
            key={tmpl.id}
            className="rounded-lg border border-editorial-border/40 bg-editorial-textbox/10 p-3 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono font-bold text-editorial-ink">{tmpl.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                  tmpl.context === 'audit'
                    ? 'bg-editorial-warning/20 text-editorial-warning'
                    : 'bg-editorial-accent/20 text-editorial-accent'
                }`}>
                  {tmpl.context === 'audit' ? t('pipeline.tabAudit') : t('pipeline.tabStages')}
                </span>
              </div>
              <button
                onClick={() => handleDelete(tmpl.id, tmpl.name)}
                title={t('common.delete')}
                className="p-1 text-editorial-muted/60 hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <p className="text-[10px] font-mono text-editorial-muted/70 line-clamp-3 leading-relaxed">
              {tmpl.prompt}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
