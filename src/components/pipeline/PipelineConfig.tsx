import { Plus, ArrowRightLeft, Play, Loader2, X, AlertTriangle, RotateCcw, Wand2, BookmarkPlus, BookOpen, Check, Trash2 } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider, PromptTemplate } from '../../types';
import { MODEL_OPTIONS, LANGUAGES } from '../../constants';
import { getModelStatus } from '../../models/catalog';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import { StageCard } from './StageCard';
import { CostBadge } from './CostBadge';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { usePricingStore } from '../../stores/pricingStore';
import { llmService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';

export type ConfigSection = 'stages' | 'audit' | 'glossary';

interface PipelineConfigProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
  className?: string;
  showActions?: boolean;
  visibleSection?: ConfigSection;
}

const DEFAULT_PIPELINE_CONFIG_CLASSNAME =
  'col-span-1 md:col-span-3 border-r border-editorial-border p-8 flex flex-col gap-8 bg-editorial-bg/50 overflow-y-auto min-h-0 h-full custom-scrollbar';

function useJudgeModelOptions(provider: ModelProvider): string[] {
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  if (provider === 'ollama') return ollamaModels;
  return MODEL_OPTIONS[provider] || [];
}

interface AuditPromptEditorProps {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  templates: PromptTemplate[];
  isRefining: boolean;
  onRefine: () => void;
  onChange: (value: string) => void;
  onApplyTemplate: (template: PromptTemplate) => void;
  saveTemplate: (
    name: string,
    prompt: string,
    context: 'stage' | 'audit',
    defaultModel?: string,
    defaultProvider?: string,
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  defaultModel?: string;
  defaultProvider?: string;
}

function AuditPromptEditor({
  label,
  hint,
  value,
  placeholder,
  templates,
  isRefining,
  onRefine,
  onChange,
  onApplyTemplate,
  saveTemplate,
  deleteTemplate,
  defaultModel,
  defaultProvider,
}: AuditPromptEditorProps) {
  const { t } = useTranslation();
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  const filteredTemplates = templates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate(name, value, 'audit', defaultModel, defaultProvider);
      toast.success(t('pipeline.templates.saved'));
      setTemplateName('');
      setShowSaveName(false);
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

  return (
    <div className="rounded-[20px] border border-editorial-border bg-editorial-bg/70 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
            {label}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-editorial-muted/70">
            {hint}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefine}
            disabled={isRefining || !value.trim()}
            title={t('pipeline.refinePrompt')}
            aria-label={`${t('pipeline.refinePrompt')}: ${label}`}
            className="text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
          >
            {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          </button>
          <button
            type="button"
            onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
            title={t('pipeline.templates.save')}
            aria-label={`${t('pipeline.templates.save')}: ${label}`}
            className="text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
          >
            <BookmarkPlus size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
            title={t('pipeline.templates.load')}
            aria-label={`${t('pipeline.templates.load')}: ${label}`}
            className="text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
          >
            <BookOpen size={14} />
          </button>
        </div>
      </div>

      {showSaveName && (
        <div className="flex items-center gap-1.5">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTemplate();
              if (e.key === 'Escape') setShowSaveName(false);
            }}
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
                    onClick={() => {
                      onApplyTemplate(tmpl);
                      setShowTemplateList(false);
                      setTemplateSearch('');
                    }}
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className="w-full rounded-lg bg-editorial-textbox/40 border border-editorial-border/60 p-3 text-[12px] font-mono outline-none leading-relaxed resize-y focus-visible:ring-2 focus-visible:ring-editorial-accent"
      />
    </div>
  );
}

export function PipelineConfig({
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  className,
  showActions = true,
  visibleSection,
}: PipelineConfigProps) {
  const {
    config,
    setConfig,
    addStage,
    removeStage,
    updateStage,
    addGlossaryEntry,
    updateGlossaryEntry,
    removeGlossaryEntry,
  } = usePipelineStore();
  const { chunks, isProcessing, cancelRequested, resetCompletedChunks } = useChunksStore();
  const ollamaStatus = useUiStore((state) => state.ollamaStatus);
  const { t } = useTranslation();
  const judgeModels = useJudgeModelOptions(config.judgeProvider);
  const [isRefiningJudge, setIsRefiningJudge] = useState(false);
  const [isRefiningCoherence, setIsRefiningCoherence] = useState(false);

  const { templates, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();

  const cannotRun = isProcessing || chunks.length === 0;
  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const canRerunAll = !isProcessing && completedCount > 0;

  const showStages = !visibleSection || visibleSection === 'stages';
  const showAudit = !visibleSection || visibleSection === 'audit';
  const showGlossary = !visibleSection || visibleSection === 'glossary';

  useEffect(() => {
    if (showAudit) loadTemplates();
  }, [showAudit]);

  const auditTemplates = templates.filter((tmpl) => tmpl.context === 'audit');

  const handleRerunAll = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmRerunAllTitle'),
      message: t('pipeline.confirmRerunAllMessage', { count: completedCount }),
      confirmLabel: t('pipeline.rerunAll'),
      danger: true,
    });
    if (!ok) return;
    resetCompletedChunks();
    onRunPipeline();
  };

  const runReason = isProcessing
    ? t('pipeline.runDisabledProcessing')
    : chunks.length === 0
      ? t('pipeline.runDisabledNoChunks')
      : undefined;

  const judgeOllamaOffline =
    config.judgeProvider === 'ollama' && ollamaStatus === 'disconnected';

  const pricingOverrides = usePricingStore((s) => s.overrides);
  const costEstimate = useMemo(
    () => estimatePipelineCost(chunks, config, pricingOverrides),
    [chunks, config, pricingOverrides],
  );

  const duplicateTermIds = useMemo(() => {
    const seen = new Map<string, string>();
    const dupes = new Set<string>();
    for (const entry of config.glossary) {
      const key = entry.term.trim().toLowerCase();
      if (!key) continue;
      const existing = seen.get(key);
      if (existing) {
        dupes.add(existing);
        if (entry.id) dupes.add(entry.id);
      } else if (entry.id) {
        seen.set(key, entry.id);
      }
    }
    return dupes;
  }, [config.glossary]);

  const handleRefineJudgePrompt = async () => {
    if (!config.judgePrompt.trim()) return;
    setIsRefiningJudge(true);
    try {
      const refined = await llmService.refinePrompt(config.judgePrompt, config.judgeProvider, config.judgeModel, 'audit');
      setConfig((prev) => ({ ...prev, judgePrompt: refined }));
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefiningJudge(false);
    }
  };

  const handleRefineCoherencePrompt = async () => {
    if (!config.coherencePrompt?.trim()) return;
    setIsRefiningCoherence(true);
    try {
      const refined = await llmService.refinePrompt(config.coherencePrompt, config.judgeProvider, config.judgeModel, 'audit');
      setConfig((prev) => ({ ...prev, coherencePrompt: refined }));
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefiningCoherence(false);
    }
  };

  const handleJudgeProviderChange = (newProvider: ModelProvider) => {
    const models =
      newProvider === 'ollama'
        ? useUiStore.getState().ollamaModels
        : MODEL_OPTIONS[newProvider];
    setConfig((prev) => ({
      ...prev,
      judgeProvider: newProvider,
      judgeModel: models[0] || '',
    }));
    if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'unknown') {
      toast.message(t('ollama.uncheckedHint'));
    } else if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'disconnected') {
      toast.warning(t('ollama.selectedButOffline'));
    }
  };

  return (
    <section className={className ?? DEFAULT_PIPELINE_CONFIG_CLASSNAME}>
      <div className="space-y-8">

        {/* ── Fasi: coppia linguistica + stages ── */}
        {showStages && (
          <>
            <div>
              <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-6 inline-block">
                {t('pipeline.globalSetup')}
              </h2>
              <div className="space-y-4">
                <label className="block text-[11px] font-bold uppercase tracking-widest text-editorial-muted">
                  {t('pipeline.languagePair')}
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={config.sourceLanguage}
                    onChange={(e) => setConfig((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                    className="w-full bg-editorial-textbox border-none px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                    aria-label={t('pipeline.sourceLanguage')}
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        sourceLanguage: prev.targetLanguage,
                        targetLanguage: prev.sourceLanguage,
                      }))
                    }
                    title={t('pipeline.swapLanguages')}
                    className="text-editorial-muted hover:text-editorial-ink transition-colors hover:scale-110 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    aria-label={t('pipeline.swapLanguages')}
                  >
                    <ArrowRightLeft size={14} />
                  </button>
                  <select
                    value={config.targetLanguage}
                    onChange={(e) => setConfig((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                    className="w-full bg-editorial-textbox border-none px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                    aria-label={t('pipeline.targetLanguage')}
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 mt-4 cursor-pointer w-max group">
                  <input
                    type="checkbox"
                    checked={config.useChunking !== false}
                    onChange={(e) => setConfig((prev) => ({ ...prev, useChunking: e.target.checked }))}
                    className="accent-editorial-ink w-3 h-3"
                  />
                  <span className="text-[11px] uppercase font-bold tracking-widest text-editorial-muted group-hover:text-editorial-ink transition-colors">
                    {t('pipeline.autoSegment')}
                  </span>
                </label>
                <label className="flex items-center gap-2 mt-4 cursor-pointer w-max group">
                  <input
                    type="checkbox"
                    checked={config.rollingContext === true}
                    onChange={(e) => setConfig((prev) => ({ ...prev, rollingContext: e.target.checked }))}
                    className="accent-editorial-ink w-3 h-3"
                  />
                  <span className="text-[11px] uppercase font-bold tracking-widest text-editorial-muted group-hover:text-editorial-ink transition-colors">
                    {t('pipeline.rollingContext')}
                  </span>
                </label>
              </div>
            </div>

            <hr className="border-editorial-border/60" />

            <div>
              <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-6">
                <h2 className="font-display text-sm uppercase tracking-wider">{t('pipeline.stages')}</h2>
                <button
                  onClick={addStage}
                  title={t('pipeline.addStage')}
                  className="text-editorial-accent hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.addStage')}
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="space-y-6">
                {config.stages.map((stage, idx) => (
                  <StageCard
                    key={stage.id}
                    stage={stage}
                    index={idx}
                    onUpdate={(u) => updateStage(stage.id, u)}
                    onRemove={() => removeStage(stage.id)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Audit Guard ── */}
        {showAudit && showStages && <hr className="border-editorial-border/60" />}
        {showAudit && (
          <div>
            <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-6">
              <h2 className="font-display text-sm uppercase tracking-wider">
                {t('pipeline.auditGuard')}
              </h2>
            </div>
            <div className="space-y-4">
              <div className="rounded-[20px] border border-editorial-border bg-editorial-bg/70 p-4">
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted">
                    {t('pipeline.auditModelLabel')}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-editorial-muted/70">
                    {t('pipeline.auditModelHint')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <select
                    value={config.judgeProvider}
                    onChange={(e) => handleJudgeProviderChange(e.target.value as ModelProvider)}
                    className="bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    aria-label={t('models.provider')}
                  >
                    {Object.keys(MODEL_OPTIONS).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {judgeModels.length > 0 ? (
                    <select
                      value={config.judgeModel}
                      onChange={(e) => setConfig((prev) => ({ ...prev, judgeModel: e.target.value }))}
                      className="flex-1 bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-mono outline-none"
                      aria-label={t('pipeline.auditModelLabel')}
                    >
                      {judgeModels.map((m) => (
                        <option key={m} value={m}>
                          {m}{getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : config.judgeProvider === 'ollama' ? (
                    <input
                      value={config.judgeModel}
                      onChange={(e) => setConfig((prev) => ({ ...prev, judgeModel: e.target.value }))}
                      placeholder={t('ollama.modelPlaceholder')}
                      className="flex-1 bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-mono outline-none"
                      aria-label={t('pipeline.auditModelLabel')}
                    />
                  ) : (
                    <select
                      value={config.judgeModel}
                      onChange={(e) => setConfig((prev) => ({ ...prev, judgeModel: e.target.value }))}
                      className="flex-1 bg-editorial-textbox/60 rounded border border-editorial-border/60 px-2 py-1.5 text-[11px] font-mono outline-none"
                      aria-label={t('pipeline.auditModelLabel')}
                    >
                      {MODEL_OPTIONS[config.judgeProvider]?.map((m) => (
                        <option key={m} value={m}>
                          {m}{getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              {judgeOllamaOffline && (
                <div className="flex items-center gap-2 text-[10px] text-editorial-accent">
                  <AlertTriangle size={12} />
                  <span>{t('ollama.selectedButOffline')}</span>
                </div>
              )}
              <AuditPromptEditor
                label={t('pipeline.judgePromptLabel')}
                hint={t('pipeline.judgePromptHint')}
                value={config.judgePrompt}
                placeholder={t('pipeline.auditPlaceholder')}
                templates={auditTemplates}
                isRefining={isRefiningJudge}
                onRefine={handleRefineJudgePrompt}
                onChange={(value) => setConfig((prev) => ({ ...prev, judgePrompt: value }))}
                onApplyTemplate={(template) => {
                  setConfig((prev) => ({
                    ...prev,
                    judgePrompt: template.prompt,
                    judgeModel: template.defaultModel || prev.judgeModel,
                    judgeProvider: (template.defaultProvider as ModelProvider | undefined) || prev.judgeProvider,
                  }));
                }}
                saveTemplate={saveTemplate}
                deleteTemplate={deleteTemplate}
                defaultModel={config.judgeModel}
                defaultProvider={config.judgeProvider}
              />
              <AuditPromptEditor
                label={t('pipeline.coherencePromptLabel')}
                hint={t('pipeline.coherencePromptHint')}
                value={config.coherencePrompt ?? ''}
                placeholder={t('pipeline.coherencePromptPlaceholder')}
                templates={auditTemplates}
                isRefining={isRefiningCoherence}
                onRefine={handleRefineCoherencePrompt}
                onChange={(value) => setConfig((prev) => ({ ...prev, coherencePrompt: value }))}
                onApplyTemplate={(template) => {
                  setConfig((prev) => ({
                    ...prev,
                    coherencePrompt: template.prompt,
                    judgeModel: template.defaultModel || prev.judgeModel,
                    judgeProvider: (template.defaultProvider as ModelProvider | undefined) || prev.judgeProvider,
                  }));
                }}
                saveTemplate={saveTemplate}
                deleteTemplate={deleteTemplate}
                defaultModel={config.judgeModel}
                defaultProvider={config.judgeProvider}
              />
            </div>
          </div>
        )}

        {/* ── Glossary ── */}
        {showGlossary && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-editorial-muted">
                {t('pipeline.keywordRegistry')}
                {config.glossary.length > 0 && (
                  <span className="ml-2 text-editorial-muted/70 normal-case font-mono tracking-normal">
                    ({config.glossary.length})
                  </span>
                )}
              </label>
              <button
                onClick={addGlossaryEntry}
                title={t('pipeline.addGlossaryEntry')}
                className="text-editorial-accent hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                aria-label={t('pipeline.addGlossaryEntry')}
              >
                <Plus size={14} />
              </button>
            </div>

            {config.glossary.length === 0 ? (
              <p className="text-[11px] text-editorial-muted/60 text-center py-4 border border-dashed border-editorial-border/60 rounded-lg">
                {t('pipeline.glossaryEmpty')}
              </p>
            ) : (
              <div className="space-y-2">
                {config.glossary.map((g, i) => {
                  const rowKey = g.id ?? `gloss-fallback-${i}`;
                  const isDuplicate = g.id ? duplicateTermIds.has(g.id) : false;
                  const removeLabel = `${t('pipeline.removeGlossaryEntry')} ${i + 1}`;
                  return (
                    <div
                      key={rowKey}
                      className={`rounded-lg border p-2 space-y-1.5 ${
                        isDuplicate
                          ? 'border-editorial-warning/60 bg-editorial-textbox/20'
                          : 'border-editorial-border/40 bg-editorial-textbox/20'
                      }`}
                    >
                      <div className="flex gap-2 items-center">
                        <input
                          value={g.term}
                          onChange={(e) =>
                            g.id ? updateGlossaryEntry(g.id, { term: e.target.value }) : undefined
                          }
                          className="w-full bg-transparent rounded py-2 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 focus:border-editorial-accent/60"
                          placeholder={t('pipeline.source')}
                          aria-label={`${t('pipeline.source')} ${i + 1}`}
                        />
                        <input
                          value={g.translation}
                          onChange={(e) =>
                            g.id
                              ? updateGlossaryEntry(g.id, { translation: e.target.value })
                              : undefined
                          }
                          className="w-full bg-transparent rounded py-2 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/40 focus:border-editorial-accent/60"
                          placeholder={t('pipeline.target')}
                          aria-label={`${t('pipeline.target')} ${i + 1}`}
                        />
                        <button
                          onClick={() => g.id && removeGlossaryEntry(g.id)}
                          title={removeLabel}
                          className="ml-auto text-editorial-muted/60 hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent shrink-0 p-1"
                          aria-label={removeLabel}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <input
                        value={g.notes ?? ''}
                        onChange={(e) =>
                          g.id ? updateGlossaryEntry(g.id, { notes: e.target.value }) : undefined
                        }
                        className="w-full bg-transparent rounded py-1.5 px-2 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/30 focus:border-editorial-accent/60 text-editorial-muted placeholder:text-editorial-muted/40"
                        placeholder={t('pipeline.glossaryNotes')}
                        aria-label={`${t('pipeline.glossaryNotes')} ${i + 1}`}
                      />
                      {isDuplicate && (
                        <span className="text-[9px] uppercase tracking-widest text-editorial-warning font-bold pl-1">
                          {t('pipeline.duplicateTerm')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {showActions && (
        <div className="mt-10 flex flex-col gap-3 shrink-0">
          <CostBadge estimate={costEstimate} />
          <button
            type="button"
            onClick={onRunPipeline}
            disabled={cannotRun}
            title={runReason ?? t('pipeline.beginPipeline')}
            className="bg-editorial-ink text-white px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={14} />
                {t('pipeline.executing')}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play size={14} fill="currentColor" /> {t('pipeline.beginPipeline')}
              </span>
            )}
          </button>
          {canRerunAll && (
            <button
              type="button"
              onClick={handleRerunAll}
              title={t('pipeline.rerunAllHint', { count: completedCount })}
              className="bg-transparent border border-editorial-accent text-editorial-accent px-6 py-3 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2 flex items-center justify-center gap-2"
            >
              <RotateCcw size={13} /> {t('pipeline.rerunAll')}
            </button>
          )}
          <button
            type="button"
            onClick={onRunAuditOnly}
            disabled={cannotRun}
            title={runReason ?? t('pipeline.runAuditOnly')}
            className="bg-transparent border border-editorial-ink text-editorial-ink px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
          >
            {t('pipeline.runAuditOnly')}
          </button>
          {isProcessing && (
            <button
              type="button"
              onClick={onCancelPipeline}
              disabled={cancelRequested}
              title={cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
              className="bg-transparent border border-editorial-accent text-editorial-accent px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-accent/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
            >
              {cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
