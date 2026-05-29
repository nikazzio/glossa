import { ArrowRightLeft, Play, Languages, FileText, Layers, Pencil, Scale, RefreshCw, Loader2, X, RotateCcw, Wand2, BookmarkPlus, BookOpen, Check, Trash2, Bot, Settings, Globe, ShieldCheck, Cpu, AlertTriangle, Eye, KeyRound } from 'lucide-react';
import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider, PipelineMode, PromptTemplate, ReasoningEffortLevel } from '../../types';
import { LANGUAGES, defaultPersonaText, DEFAULT_JUDGE_PROMPT, DEFAULT_COHERENCE_PROMPT } from '../../constants';
import { calculateBlobBudget, getContextWindow, getKnownModelIds, getModelStatus, getResolvedModelReasoning, getSelectableModelIds, MODEL_PROVIDER_ORDER } from '../../models/catalog';
import { usePipelineStore } from '../../stores/pipelineStore';
import { StageCard } from './StageCard';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import { CostBadge } from './CostBadge';
import { ProviderRuntimeEditor } from './ProviderRuntimeEditor';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { usePricingStore } from '../../stores/pricingStore';
import { llmService, ollamaService } from '../../services/llmService';
import { usePromptTemplateStore } from '../../stores/promptTemplateStore';
import { useOperationLogStore } from '../../stores/operationLogStore';
import { ReasoningPicker } from '../models/ReasoningPicker';
import { PromptPreviewTab } from './PromptPreviewTab';
import { canRefineWithProvider, formatProviderModelLabel, useProviderKeyStatus } from '../../hooks/useProviderKeyStatus';
import { IconButton } from '../ui';

export type ConfigSection = 'settings' | 'translation' | 'audit' | 'glossary' | 'preview';

interface PersonaEditorProps {
  persona: string | undefined;
  sourceLanguage: string;
  targetLanguage: string;
  templates: PromptTemplate[];
  isRefining: boolean;
  canRefine: boolean;
  refineLabel: string;
  onChange: (value: string | undefined) => void;
  onRefine: () => void;
  onSaveTemplate: (name: string, prompt: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

function PersonaEditor({
  persona,
  sourceLanguage,
  targetLanguage,
  templates,
  isRefining,
  canRefine,
  refineLabel,
  onChange,
  onRefine,
  onSaveTemplate,
  deleteTemplate,
}: PersonaEditorProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  const isCustom = !!persona?.trim();
  const defaultText = defaultPersonaText(sourceLanguage, targetLanguage);

  const filteredTemplates = templates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleStartEdit = () => {
    if (!isCustom) onChange(defaultText);
    setIsEditing(true);
  };
  const handleCloseEdit = () => {
    setIsEditing(false);
    setShowSaveName(false);
    setShowTemplateList(false);
    setTemplateName('');
  };
  const handleReset = () => {
    onChange(undefined);
    setIsEditing(false);
    setShowSaveName(false);
    setShowTemplateList(false);
    setTemplateName('');
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name || !persona) return;
    try {
      await onSaveTemplate(name, persona);
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Bot size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
            {t('pipeline.personaLabel')}
          </p>
          {isCustom && (
            <span className="rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-editorial-accent">
              {t('pipeline.personaCustomBadge')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={onRefine}
                disabled={isRefining || !persona?.trim() || !canRefine}
                title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                aria-label={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
              >
                {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                title={t('pipeline.templates.save')}
                aria-label={t('pipeline.templates.save')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <BookmarkPlus size={14} />
              </button>
              <button
                type="button"
                onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                title={t('pipeline.templates.load')}
                aria-label={t('pipeline.templates.load')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <BookOpen size={14} />
              </button>
              <button
                type="button"
                onClick={handleCloseEdit}
                title={t('common.close')}
                aria-label={t('common.close')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              {isCustom && (
                <button
                  type="button"
                  onClick={handleReset}
                  title={t('pipeline.promptReset')}
                  aria-label={t('pipeline.promptReset')}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <RotateCcw size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={handleStartEdit}
                title={t('pipeline.personaCustomize')}
                aria-label={t('pipeline.personaCustomize')}
                className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
              >
                <Pencil size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing && showSaveName && (
        <div className="flex items-center gap-1.5">
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTemplate();
              if (e.key === 'Escape') { setShowSaveName(false); setTemplateName(''); }
            }}
            placeholder={t('pipeline.templates.namePlaceholder')}
            autoFocus
            className="flex-1 rounded bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
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

      {isEditing && showTemplateList && (
        <div className="rounded-lg border border-editorial-border bg-editorial-bg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-editorial-border/60">
            <input
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              placeholder={t('pipeline.templates.searchPlaceholder')}
              autoFocus
              className="w-full rounded bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            />
          </div>
          <ul className="max-h-40 overflow-y-auto custom-scrollbar">
            {filteredTemplates.length === 0 ? (
              <li className="px-3 py-3 text-xs text-editorial-muted text-center">
                {t('pipeline.templates.empty')}
              </li>
            ) : (
              filteredTemplates.map((tmpl) => (
                <li key={tmpl.id} className="flex items-start gap-2 px-3 py-2 hover:bg-editorial-textbox/40 group">
                  <button
                    type="button"
                    onClick={() => { onChange(tmpl.prompt); setShowTemplateList(false); setTemplateSearch(''); }}
                    className="flex-1 text-left min-w-0 focus:outline-none"
                  >
                    <div className="text-xs font-bold text-editorial-ink truncate">{tmpl.name}</div>
                    <div className="text-[10px] text-editorial-muted truncate mt-0.5 font-mono">{tmpl.prompt}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="shrink-0 text-editorial-muted/40 hover:text-editorial-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none mt-0.5"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <textarea
        value={isCustom ? persona : defaultText}
        disabled={!isEditing}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
        rows={isEditing ? 12 : isCustom ? 4 : 2}
        className={`w-full rounded-[14px] border px-3 py-2 text-xs font-mono outline-none leading-relaxed resize-y ${isEditing ? 'min-h-[10rem] ' : ''}${
          isEditing
            ? 'bg-editorial-textbox/40 border-editorial-border/60 focus-visible:ring-2 focus-visible:ring-editorial-accent'
            : 'bg-editorial-textbox/10 border-editorial-border/30 text-editorial-muted/60 cursor-default'
        }`}
      />
    </div>
  );
}

interface PipelineConfigProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
  className?: string;
  showActions?: boolean;
  showOnlyGlobalDefaults?: boolean;
  visibleSection?: ConfigSection;
  libraryGlossarySection?: ReactNode;
}

const DEFAULT_PIPELINE_CONFIG_CLASSNAME =
  'col-span-1 md:col-span-3 border-r border-editorial-border flex flex-col bg-editorial-bg/50 min-h-0 h-full';

function useJudgeModelOptions(provider: ModelProvider): string[] {
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  return getSelectableModelIds(provider, ollamaModels);
}

interface AuditPromptEditorProps {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  templates: PromptTemplate[];
  isRefining: boolean;
  canRefine: boolean;
  refineLabel: string;
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
  icon?: ReactNode;
  context?: 'stage' | 'audit';
  defaultValue?: string;
  onReset?: () => void;
}

function AuditPromptEditor({
  label,
  hint,
  value,
  placeholder,
  templates,
  isRefining,
  canRefine,
  refineLabel,
  onRefine,
  onChange,
  onApplyTemplate,
  saveTemplate,
  deleteTemplate,
  defaultModel,
  defaultProvider,
  icon,
  context = 'audit',
  defaultValue,
  onReset,
}: AuditPromptEditorProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  const isCustomPrompt = !!defaultValue && value.trim() !== defaultValue.trim();

  const handleCloseEdit = () => {
    setIsEditing(false);
    setShowSaveName(false);
    setShowTemplateList(false);
    setTemplateName('');
  };

  const filteredTemplates = templates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate(name, value, context, defaultModel, defaultProvider);
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
    <div className="rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {icon && <span className="text-editorial-accent shrink-0">{icon}</span>}
            <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">{label}</span>
            {isCustomPrompt && (
              <span className="rounded-full bg-editorial-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-editorial-accent">
                {t('pipeline.promptCustomBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={onRefine}
                  disabled={isRefining || !value.trim() || !canRefine}
                  title={t('pipeline.refinePromptWithModel', { model: refineLabel })}
                  aria-label={`${t('pipeline.refinePromptWithModel', { model: refineLabel })}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
                >
                  {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
                  title={t('pipeline.templates.save')}
                  aria-label={`${t('pipeline.templates.save')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookmarkPlus size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
                  title={t('pipeline.templates.load')}
                  aria-label={`${t('pipeline.templates.load')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <BookOpen size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  title={t('common.close')}
                  aria-label={`${t('common.close')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                {isCustomPrompt && onReset && (
                  <button
                    type="button"
                    onClick={onReset}
                    title={t('pipeline.promptReset')}
                    aria-label={`${t('pipeline.promptReset')}: ${label}`}
                    className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  title={t('pipeline.editPrompt')}
                  aria-label={`${t('pipeline.editPrompt')}: ${label}`}
                  className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <Pencil size={16} />
                </button>
              </>
            )}
          </div>
        </div>
        {hint && (
          <p className="text-xs leading-relaxed text-editorial-muted/70">{hint}</p>
        )}
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
            className="flex-1 rounded bg-editorial-textbox/60 border border-editorial-border/60 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={!templateName.trim()}
            className="text-editorial-ink hover:text-editorial-accent transition-colors disabled:opacity-40 focus:outline-none"
            aria-label={t('common.confirm')}
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={() => { setShowSaveName(false); setTemplateName(''); }}
            className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none"
            aria-label={t('common.cancel')}
          >
            <X size={16} />
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
              className="w-full rounded bg-editorial-textbox/60 border border-editorial-border/40 px-2 py-1 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto custom-scrollbar">
            {filteredTemplates.length === 0 ? (
              <li className="px-3 py-4 text-xs text-editorial-muted text-center">
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
                    <div className="text-sm font-bold text-editorial-ink truncate">{tmpl.name}</div>
                    <div className="text-xs text-editorial-muted truncate mt-0.5 font-mono">{tmpl.prompt}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="shrink-0 text-editorial-muted/40 hover:text-editorial-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none mt-0.5"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={14} />
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
        disabled={!isEditing}
        rows={isEditing ? 12 : 4}
        className={`w-full rounded-[16px] border p-4 text-sm font-mono outline-none leading-relaxed resize-y min-h-[10rem] ${
          isEditing
            ? 'bg-editorial-textbox/40 border-editorial-border/60 focus-visible:ring-2 focus-visible:ring-editorial-accent'
            : 'bg-editorial-textbox/10 border-editorial-border/30 text-editorial-muted/60 cursor-default'
        }`}
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
  showOnlyGlobalDefaults = false,
  visibleSection,
  libraryGlossarySection,
}: PipelineConfigProps) {
  const {
    config,
    setConfig,
    setMode,
    updateStage,
  } = usePipelineStore();
  const { chunks, isProcessing, cancelRequested, resetAllChunks } = useChunksStore();
  const clearLog = useOperationLogStore((s) => s.clear);
  const ollamaStatus = useUiStore((s) => s.ollamaStatus);
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  const { statuses: keyStatuses, isLoading: keyStatusLoading } = useProviderKeyStatus();
  const { t } = useTranslation();
  const judgeModels = useJudgeModelOptions(config.judgeProvider);
  const [isRefreshingOllama, setIsRefreshingOllama] = useState(false);
  const [isRefiningPersona, setIsRefiningPersona] = useState(false);
  const [refiningStageId, setRefiningStageId] = useState<string | null>(null);
  const [isRefiningJudge, setIsRefiningJudge] = useState(false);
  const [isRefiningCoherence, setIsRefiningCoherence] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigSection>(visibleSection ?? 'translation');

  const { templates, loadTemplates, saveTemplate, deleteTemplate } = usePromptTemplateStore();

  const cannotRun = isProcessing || chunks.length === 0;
  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const canRerunAll = !isProcessing && completedCount > 0;
  const translationsExist = completedCount > 0;

  useEffect(() => {
    loadTemplates();
  }, []);

  const auditTemplates = templates.filter((tmpl) => tmpl.context === 'audit');
  const personaTemplates = templates.filter((tmpl) => tmpl.context === 'persona');

  const handleRerunAll = async () => {
    const ok = await confirm({
      title: t('pipeline.confirmRerunAllTitle'),
      message: t('pipeline.confirmRerunAllMessage', { count: completedCount }),
      confirmLabel: t('pipeline.rerunAll'),
      danger: true,
    });
    if (!ok) return;
    resetAllChunks();
    clearLog();
    onRunPipeline();
  };

  const runReason = isProcessing
    ? t('pipeline.runDisabledProcessing')
    : chunks.length === 0
      ? t('pipeline.runDisabledNoChunks')
      : undefined;

  const judgeOllamaOffline =
    config.judgeProvider === 'ollama' && ollamaStatus === 'disconnected';

  const judgeResolvedReasoning = getResolvedModelReasoning(config.judgeProvider, config.judgeModel);
  const currentJudgeReasoningEffort: ReasoningEffortLevel = (() => {
    const judgeDefaultEffort: ReasoningEffortLevel = judgeResolvedReasoning === 'optional' ? 'none' : 'medium';
    if (config.judgeProvider === 'openai') return config.reviewProviderOptions?.openai?.reasoningEffort ?? judgeDefaultEffort;
    if (config.judgeProvider === 'deepseek') return config.reviewProviderOptions?.deepseek?.reasoningEffort ?? judgeDefaultEffort;
    if (config.judgeProvider === 'gemini') {
      const budget = config.reviewProviderOptions?.gemini?.thinkingBudget;
      if (budget === 0) return judgeResolvedReasoning === 'reasoning' ? judgeDefaultEffort : 'none';
      if (budget != null && budget < 0) return 'high';
      if (budget != null && budget <= 1024) return 'low';
      if (budget != null) return 'medium';
    }
    return judgeDefaultEffort;
  })();
  const handleJudgeReasoningChange = (effort: ReasoningEffortLevel) => {
    const opts = config.reviewProviderOptions ?? {};
    if (config.judgeProvider === 'openai') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, openai: { ...opts.openai, reasoningEffort: effort } } }));
    } else if (config.judgeProvider === 'deepseek') {
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, deepseek: { ...opts.deepseek, reasoningEffort: effort } } }));
    } else if (config.judgeProvider === 'gemini') {
      const budget = effort === 'none' ? 0 : effort === 'low' ? 1024 : effort === 'medium' ? 8192 : -1;
      setConfig((prev) => ({ ...prev, reviewProviderOptions: { ...opts, gemini: { ...opts.gemini, thinkingBudget: budget } } }));
    }
  };

  const pricingOverrides = usePricingStore((s) => s.overrides);
  const costEstimate = useMemo(
    () => estimatePipelineCost(chunks, config, pricingOverrides),
    [chunks, config, pricingOverrides],
  );

  const stage0 = config.stages[0];
  const personaRefineLabel = formatProviderModelLabel(stage0?.provider ?? 'gemini', stage0?.model ?? '');
  const canRefinePersona = stage0 ? canRefineWithProvider(stage0.provider, keyStatuses) : false;
  const judgeRefineLabel = formatProviderModelLabel(config.judgeProvider, config.judgeModel);
  const canRefineJudge = canRefineWithProvider(config.judgeProvider, keyStatuses);
  const missingRefineProviders = (Object.entries(keyStatuses) as Array<[string, boolean | undefined]>)
    .filter(([, configured]) => configured === false)
    .map(([provider]) => provider);

  // Min context window across all source-aware stages (translation + refine receive source text)
  const minSourceAwareContextWindow = config.stages
    .filter((s) => s.enabled && s.role !== 'format')
    .reduce<number | undefined>((min, s) => {
      const cw = getContextWindow(s.provider, s.model);
      if (cw === undefined) return min;
      return min === undefined ? cw : Math.min(min, cw);
    }, undefined);
  const contextWindowChanged =
    !translationsExist &&
    chunks.length > 0 &&
    config.chunkedWithContextWindow !== undefined &&
    minSourceAwareContextWindow !== undefined &&
    minSourceAwareContextWindow !== config.chunkedWithContextWindow;

  const handleRefreshOllama = async () => {
    setIsRefreshingOllama(true);
    try {
      const models = await ollamaService.listModels();
      useUiStore.getState().setOllamaModels(models);
      useUiStore.getState().setOllamaStatus('connected');
      toast.success(t('ollama.connected', { count: models.length }));
    } catch (err: unknown) {
      useUiStore.getState().setOllamaModels([]);
      useUiStore.getState().setOllamaStatus('disconnected');
      toast.error(t('ollama.disconnected'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsRefreshingOllama(false);
    }
  };

  const handleRefineStagePrompt = async (stageId: string) => {
    const stage = config.stages.find((s) => s.id === stageId);
    if (!stage?.prompt.trim() || !stage?.model.trim()) return;
    setRefiningStageId(stageId);
    try {
      const refined = await llmService.refinePrompt(stage.prompt, stage.provider, stage.model, 'stage');
      updateStage(stageId, { prompt: refined });
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefiningStageId(null);
    }
  };

  const handleRefinePersona = async () => {
    if (!config.persona?.trim()) return;
    const stage = config.stages[0];
    if (!stage) return;
    setIsRefiningPersona(true);
    try {
      const refined = await llmService.refinePrompt(config.persona, stage.provider, stage.model, 'stage');
      setConfig((prev) => ({ ...prev, persona: refined }));
      toast.success(t('pipeline.refined'));
    } catch (err: unknown) {
      toast.error(t('pipeline.refineFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefiningPersona(false);
    }
  };

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

  const handleJudgeModelChange = (newModel: string) => {
    setConfig((prev) => {
      const opts = prev.reviewProviderOptions ?? {};
      const cleared = { ...opts };
      if (prev.judgeProvider === 'openai') cleared.openai = { ...opts.openai, reasoningEffort: undefined };
      else if (prev.judgeProvider === 'deepseek') cleared.deepseek = { ...opts.deepseek, reasoningEffort: undefined };
      else if (prev.judgeProvider === 'gemini') cleared.gemini = { ...opts.gemini, thinkingBudget: undefined };
      return { ...prev, judgeModel: newModel, reviewProviderOptions: cleared };
    });
  };

  const handleJudgeProviderChange = (newProvider: ModelProvider) => {
    const models = getSelectableModelIds(newProvider, useUiStore.getState().ollamaModels);
    setConfig((prev) => ({
      ...prev,
      judgeProvider: newProvider,
      judgeModel: models[0] || '',
      reviewProviderOptions: {},
    }));
    if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'unknown') {
      toast.message(t('ollama.uncheckedHint'));
    } else if (newProvider === 'ollama' && useUiStore.getState().ollamaStatus === 'disconnected') {
      toast.warning(t('ollama.selectedButOffline'));
    }
  };

  const TAB_TITLE: Record<ConfigSection, string> = {
    settings: t('pipeline.tabSettings'),
    translation: t('pipeline.tabTranslation'),
    audit: t('pipeline.tabAudit'),
    glossary: t('pipeline.tabGlossary'),
    preview: t('pipeline.tabPreview'),
  };


  return (
    <section className={className ?? DEFAULT_PIPELINE_CONFIG_CLASSNAME}>

      {/* ── Empty state (no project open) — settings content ── */}
      {showOnlyGlobalDefaults && (
        <div className="shrink-0 border-b border-editorial-border px-6 py-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Globe size={11} className="text-editorial-accent shrink-0" />
              <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                {t('pipeline.languagePair')}
              </p>
            </div>
            <div className={`flex items-center gap-3 transition-opacity ${!!config.persona ? 'opacity-40 pointer-events-none' : ''}`}>
              <select
                value={config.sourceLanguage}
                onChange={(e) => setConfig((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                aria-label={t('pipeline.sourceLanguage')}
                disabled={!!config.persona}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                ))}
              </select>
              <IconButton
                size="md"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    sourceLanguage: prev.targetLanguage,
                    targetLanguage: prev.sourceLanguage,
                  }))
                }
                disabled={!!config.persona}
                title={t('pipeline.swapLanguages')}
              >
                <ArrowRightLeft size={13} />
              </IconButton>
              <select
                value={config.targetLanguage}
                onChange={(e) => setConfig((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                aria-label={t('pipeline.targetLanguage')}
                disabled={!!config.persona}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                ))}
              </select>
            </div>
            {!!config.persona && (
              <p className="text-xs leading-relaxed text-editorial-muted/60">
                {t('pipeline.languagePairLockedByPersona')}
              </p>
            )}
          </div>
          <PersonaEditor
            persona={config.persona}
            sourceLanguage={config.sourceLanguage}
            targetLanguage={config.targetLanguage}
            templates={personaTemplates}
            isRefining={isRefiningPersona}
            canRefine={canRefinePersona}
            refineLabel={personaRefineLabel}
            onChange={(value) => setConfig((prev) => ({ ...prev, persona: value }))}
            onRefine={handleRefinePersona}
            onSaveTemplate={(name, prompt) => saveTemplate(name, prompt, 'persona')}
            deleteTemplate={deleteTemplate}
          />
        </div>
      )}

      {/* ── Tab navigation + panels ── */}
      {!showOnlyGlobalDefaults && <>
      <div
        role="tablist"
        aria-label={t('pipeline.configSections')}
        className="flex items-center gap-2 shrink-0 border-b border-editorial-border bg-editorial-bg/60 px-5 py-2"
      >
        {/* Settings */}
        <IconButton
          size="lg"
          tone={activeTab === 'settings' ? 'accent' : 'default'}
          onClick={() => setActiveTab('settings')}
          title={t('pipeline.tabSettings')}
          ariaPressed={activeTab === 'settings'}
        >
          <Settings size={16} />
        </IconButton>
        <span className="h-4 w-px bg-editorial-border/70 mx-1" aria-hidden="true" />
        {/* Translation */}
        <IconButton
          size="lg"
          tone={activeTab === 'translation' ? 'accent' : 'default'}
          onClick={() => setActiveTab('translation')}
          title={t('pipeline.tabTranslation')}
          ariaPressed={activeTab === 'translation'}
        >
          <Languages size={16} />
        </IconButton>
        {/* Audit */}
        <IconButton
          size="lg"
          tone={activeTab === 'audit' ? 'accent' : 'default'}
          onClick={() => setActiveTab('audit')}
          title={t('pipeline.tabAudit')}
          ariaPressed={activeTab === 'audit'}
        >
          <ShieldCheck size={16} />
        </IconButton>
        {/* Glossary */}
        <IconButton
          size="lg"
          tone={activeTab === 'glossary' ? 'accent' : 'default'}
          onClick={() => setActiveTab('glossary')}
          title={t('pipeline.tabGlossary')}
          ariaPressed={activeTab === 'glossary'}
        >
          <BookOpen size={16} />
        </IconButton>
        <IconButton
          size="lg"
          tone={activeTab === 'preview' ? 'accent' : 'default'}
          onClick={() => setActiveTab('preview')}
          title={t('pipeline.tabPreview')}
          ariaPressed={activeTab === 'preview'}
        >
          <Eye size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-editorial-border/70" aria-hidden="true" />
        <span className="text-sm font-display italic text-editorial-ink">{TAB_TITLE[activeTab]}</span>
      </div>

      {/* ── Tab panels ── */}
      <div className="relative flex-1 min-h-0">
        {isProcessing && (
          <div className="absolute inset-0 z-10 flex items-start justify-center bg-editorial-bg/70 backdrop-blur-[2px]">
            <div className="mt-10 flex items-center gap-2 rounded-full border border-editorial-border bg-editorial-bg px-4 py-2 text-[11px] font-sans uppercase tracking-widest text-editorial-muted shadow-sm">
              <Loader2 size={12} className="animate-spin" />
              {t('pipeline.settingsLockedWhileRunning')}
            </div>
          </div>
        )}
      <div className="overflow-y-auto custom-scrollbar px-6 py-6 space-y-6 h-full">

        {/* ── SETTINGS ── */}
        {activeTab === 'settings' && (
          <div id="pconfig-panel-settings" role="tabpanel" aria-labelledby="pconfig-tab-settings" className="space-y-6">
            {/* Mode selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Layers size={11} className="text-editorial-accent shrink-0" />
                <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {t('pipeline.modeLabel')}
                </p>
              </div>
              <div className="flex gap-2">
                {([
                  { mode: 'standard' as PipelineMode, Icon: Languages },
                  { mode: 'editorial' as PipelineMode, Icon: Layers },
                ]).map(({ mode: m, Icon }) => {
                  const isActive = (config.mode ?? 'standard') === m;
                  return (
                    <IconButton
                      key={m}
                      size="lg"
                      tone={isActive ? 'accent' : 'default'}
                      onClick={() => setMode(m)}
                      disabled={translationsExist || isProcessing}
                      title={t(`pipeline.mode.${m}`)}
                      ariaPressed={isActive}
                    >
                      <Icon size={16} />
                    </IconButton>
                  );
                })}
              </div>
              <div className="rounded-[14px] border border-editorial-border/40 bg-editorial-textbox/20 px-3 py-3 space-y-2.5">
                {([
                  {
                    mode: 'standard' as PipelineMode,
                    stages: [
                      { role: 'translation', Icon: Languages, labelKey: 'pipeline.stageRole.translation' },
                      { role: 'audit', Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
                    ],
                  },
                  {
                    mode: 'editorial' as PipelineMode,
                    stages: [
                      { role: 'translation', Icon: Languages, labelKey: 'pipeline.stageRole.translation' },
                      { role: 'refine', Icon: Wand2, labelKey: 'pipeline.stageRole.refine' },
                      { role: 'format', Icon: FileText, labelKey: 'pipeline.stageRole.format' },
                      { role: 'audit', Icon: ShieldCheck, labelKey: 'pipeline.tabAudit' },
                    ],
                  },
                ]).map(({ mode: m, stages }) => {
                  const isActive = (config.mode ?? 'standard') === m;
                  return (
                    <div key={m} className={`flex items-center gap-2.5 transition-opacity ${isActive ? '' : 'opacity-25'}`}>
                      <span className={`shrink-0 w-[68px] text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-editorial-accent' : 'text-editorial-muted'}`}>
                        {t(`pipeline.mode.${m}`)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {stages.map(({ role, Icon, labelKey }, i) => (
                          <span key={role} className="flex items-center gap-1.5">
                            {i > 0 && <span className="text-editorial-muted/40 text-xs">›</span>}
                            <span
                              title={t(labelKey)}
                              aria-label={t(labelKey)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${isActive ? 'border-editorial-success/40 bg-editorial-success/12 text-editorial-success' : 'border-editorial-border bg-editorial-bg text-editorial-muted'}`}
                            >
                              <Icon size={14} strokeWidth={1.9} />
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Globe size={11} className="text-editorial-accent shrink-0" />
                <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {t('pipeline.languagePair')}
                </p>
              </div>
              <div className={`flex items-center gap-3 transition-opacity ${!!config.persona ? 'opacity-40 pointer-events-none' : ''}`}>
                <select
                  value={config.sourceLanguage}
                  onChange={(e) => setConfig((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                  className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                  aria-label={t('pipeline.sourceLanguage')}
                  disabled={!!config.persona}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      sourceLanguage: prev.targetLanguage,
                      targetLanguage: prev.sourceLanguage,
                    }))
                  }
                  disabled={!!config.persona}
                  title={t('pipeline.swapLanguages')}
                  aria-label={t('pipeline.swapLanguages')}
                  className="shrink-0 rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                >
                  <ArrowRightLeft size={13} />
                </button>
                <select
                  value={config.targetLanguage}
                  onChange={(e) => setConfig((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                  className="w-full rounded-[14px] border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent appearance-none"
                  aria-label={t('pipeline.targetLanguage')}
                  disabled={!!config.persona}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{t(`languages.${lang}`)}</option>
                  ))}
                </select>
              </div>
              {!!config.persona && (
                <p className="text-xs leading-relaxed text-editorial-muted/60">
                  {t('pipeline.languagePairLockedByPersona')}
                </p>
              )}
            </div>

            <PersonaEditor
              persona={config.persona}
              sourceLanguage={config.sourceLanguage}
              targetLanguage={config.targetLanguage}
              templates={personaTemplates}
              isRefining={isRefiningPersona}
              canRefine={canRefinePersona}
              refineLabel={personaRefineLabel}
              onChange={(value) => setConfig((prev) => ({ ...prev, persona: value }))}
              onRefine={handleRefinePersona}
              onSaveTemplate={(name, prompt) => saveTemplate(name, prompt, 'persona')}
              deleteTemplate={deleteTemplate}
            />

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <KeyRound size={11} className="text-editorial-accent shrink-0" />
                <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {t('pipeline.refineKeyLabel')}
                </p>
              </div>
              {!keyStatusLoading && (
                <p className="text-[11px] leading-relaxed text-editorial-muted">
                  {missingRefineProviders.length > 0
                    ? t('pipeline.refineKeyMissingHint', { providers: missingRefineProviders.join(', ') })
                    : t('pipeline.refineKeyReadyHint')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── TRADUZIONE ── */}
        {activeTab === 'translation' && (
          <div
            id="pconfig-panel-translation"
            role="tabpanel"
            aria-labelledby="pconfig-tab-translation"
            className="space-y-6"
          >
            {/* Context memory card */}
            {(() => {
              const isOverride = (config.blobBudgetTokens ?? 0) > 0;
              const auto = calculateBlobBudget(config.stages);
              return (
                <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOverride}
                    disabled={translationsExist}
                    onClick={() => setConfig((prev) => ({
                      ...prev,
                      blobBudgetTokens: isOverride ? 0 : auto.budget,
                    }))}
                    className={`flex w-full items-center justify-between text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed ${
                      isOverride ? '' : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span className="space-y-0.5">
                      <span className="flex items-center gap-1.5">
                        <FileText size={11} className="text-editorial-accent shrink-0" />
                        <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                          {t('pipeline.blobContext')}
                        </span>
                      </span>
                      {!isOverride && (
                        <span className="block pl-4 text-xs text-editorial-muted/70">
                          {t('pipeline.blobContextAutoDesc', { tokens: auto.budget.toLocaleString(), model: auto.modelId || 'ollama' })}
                        </span>
                      )}
                    </span>
                    <span
                      className={`flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors shrink-0 ${
                        isOverride
                          ? 'border-editorial-ink bg-editorial-ink justify-end'
                          : 'border-editorial-border bg-editorial-textbox/60 justify-start'
                      }`}
                      aria-hidden="true"
                    >
                      <span className="h-3.5 w-3.5 rounded-full bg-white" />
                    </span>
                  </button>

                  {isOverride && (
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                            {t('pipeline.blobBudgetTokens')}
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={config.blobBudgetTokens ?? auto.budget}
                            onChange={(e) => setConfig((prev) => ({
                              ...prev,
                              blobBudgetTokens: Math.max(1, Number(e.target.value) || 1),
                            }))}
                            className="w-24 rounded-[10px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                            aria-label={t('pipeline.blobBudgetTokens')}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                            {t('pipeline.blobOverlap')}
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={config.blobOverlap ?? 1}
                            onChange={(e) => setConfig((prev) => ({
                              ...prev,
                              blobOverlap: Math.max(0, Number(e.target.value) || 0),
                            }))}
                            className="w-16 rounded-[10px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                            aria-label={t('pipeline.blobOverlap')}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfig((prev) => ({ ...prev, blobBudgetTokens: 0 }))}
                          title={t('pipeline.blobContextReset')}
                          aria-label={t('pipeline.blobContextReset')}
                          className="rounded-full border border-editorial-border p-1.5 text-editorial-muted transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                      <p className="text-[10px] text-editorial-muted/70">{t('pipeline.blobOverlapHint')}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Context window warning */}
            {contextWindowChanged && (
              <div className="flex items-center gap-2 text-xs text-editorial-warning">
                <ShieldCheck size={12} className="shrink-0 text-editorial-warning" />
                <span>{t('pipeline.modelContextWindowChangedHint')}</span>
              </div>
            )}

            {/* Stage cards — one per stage in the current mode */}
            {config.stages.map((stage) => {
              const stageModelOptions = getSelectableModelIds(stage.provider, ollamaModels);
              return (
                <div key={stage.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-ink font-bold">
                      {t(`pipeline.stageRole.${stage.role ?? 'translation'}`)}
                    </span>
                    <span className="h-px flex-1 bg-editorial-border/60" aria-hidden="true" />
                  </div>
                  <StageCard
                    stage={stage}
                    templates={templates.filter((tmpl) => tmpl.context === 'stage')}
                    isRefining={refiningStageId === stage.id}
                    translationsExist={translationsExist}
                    isProcessing={isProcessing}
                    ollamaStatus={ollamaStatus}
                    isRefreshingOllama={isRefreshingOllama}
                    modelOptions={stageModelOptions}
                    keyStatuses={keyStatuses}
                    onUpdate={(updates) => updateStage(stage.id, updates)}
                    onRefinePrompt={() => handleRefineStagePrompt(stage.id)}
                    onRefreshOllama={handleRefreshOllama}
                    saveTemplate={saveTemplate}
                    deleteTemplate={deleteTemplate}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* ── AUDIT ── */}
        {activeTab === 'audit' && (
          <div
            id="pconfig-panel-audit"
            role="tabpanel"
            aria-labelledby="pconfig-tab-audit"
            className="space-y-6"
          >
            <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
              <div className="flex items-center gap-1.5">
                <Cpu size={11} className="text-editorial-accent shrink-0" />
                <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
                  {t('pipeline.auditModelLabel')}
                </p>
              </div>
              <div className="flex gap-2">
              <select
                value={config.judgeProvider}
                onChange={(e) => handleJudgeProviderChange(e.target.value as ModelProvider)}
                className="rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                aria-label={t('models.provider')}
              >
                {MODEL_PROVIDER_ORDER.map((p) => (
                  <option key={p} value={p} disabled={p !== 'ollama' && keyStatuses[p] === false}>{p}</option>
                ))}
              </select>
              {judgeModels.length > 0 ? (
                <select
                  value={config.judgeModel}
                  onChange={(e) => handleJudgeModelChange(e.target.value)}
                  className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
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
                  onChange={(e) => handleJudgeModelChange(e.target.value)}
                  placeholder={t('ollama.modelPlaceholder')}
                  className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.auditModelLabel')}
                />
              ) : (
                <select
                  value={config.judgeModel}
                  onChange={(e) => handleJudgeModelChange(e.target.value)}
                  className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  aria-label={t('pipeline.auditModelLabel')}
                >
                  {getKnownModelIds(config.judgeProvider).map((m) => (
                    <option key={m} value={m}>
                      {m}{getModelStatus(config.judgeProvider, m) === 'preview' ? ' (preview)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {judgeResolvedReasoning !== undefined && judgeResolvedReasoning !== 'non_reasoning' && config.judgeProvider !== 'ollama' && (
              <div className="flex items-center gap-2">
                <Wand2 size={11} className="text-editorial-warning shrink-0" />
                <span className="text-[10px] font-sans uppercase tracking-[0.3em] text-editorial-muted">
                  {t('pipeline.reasoningEffort')}
                </span>
                <ReasoningPicker
                  value={currentJudgeReasoningEffort}
                  showNone={judgeResolvedReasoning === 'optional'}
                  onChange={handleJudgeReasoningChange}
                />
              </div>
            )}

            {judgeOllamaOffline && (
              <div className="flex items-center gap-2 text-xs text-editorial-accent">
                <AlertTriangle size={14} />
                <span>{t('ollama.selectedButOffline')}</span>
              </div>
            )}

            <ProviderRuntimeEditor
              provider={config.judgeProvider}
              value={config.reviewProviderOptions}
              onChange={(reviewProviderOptions) => setConfig((prev) => ({ ...prev, reviewProviderOptions }))}
              title={t('pipeline.providerOptions.reviewTitle')}
              hint={t('pipeline.providerOptions.reviewHint')}
            />
            </div>

            <AuditPromptEditor
              label={t('pipeline.judgePromptLabel')}
              hint={t('pipeline.judgePromptHint')}
              value={config.judgePrompt}
              placeholder={t('pipeline.auditPlaceholder')}
              templates={auditTemplates}
              isRefining={isRefiningJudge}
              canRefine={canRefineJudge}
              refineLabel={judgeRefineLabel}
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
              icon={<Scale size={11} />}
              defaultValue={DEFAULT_JUDGE_PROMPT}
              onReset={() => setConfig((prev) => ({ ...prev, judgePrompt: DEFAULT_JUDGE_PROMPT }))}
            />
            <AuditPromptEditor
              label={t('pipeline.coherencePromptLabel')}
              hint={t('pipeline.coherencePromptHint')}
              value={config.coherencePrompt ?? ''}
              placeholder={t('pipeline.coherencePromptPlaceholder')}
              templates={auditTemplates}
              isRefining={isRefiningCoherence}
              canRefine={canRefineJudge}
              refineLabel={judgeRefineLabel}
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
              icon={<RefreshCw size={11} />}
              defaultValue={DEFAULT_COHERENCE_PROMPT}
              onReset={() => setConfig((prev) => ({ ...prev, coherencePrompt: DEFAULT_COHERENCE_PROMPT }))}
            />
          </div>
        )}

        {/* ── GLOSSARIO ── */}
        {activeTab === 'glossary' && (
          <div
            id="pconfig-panel-glossary"
            role="tabpanel"
            aria-labelledby="pconfig-tab-glossary"
            className="space-y-6"
          >
            {libraryGlossarySection ?? (
              <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-editorial-border/60 px-6 py-10 text-center">
                <BookOpen size={20} className="text-editorial-muted/40" />
                <p className="text-sm text-editorial-muted/70">
                  {t('pipeline.glossaryOpenProject')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── PREVIEW ── */}
        {activeTab === 'preview' && (
          <PromptPreviewTab config={config} />
        )}

      </div>
      </div>
      </>}

      {showActions && (
        <div className="shrink-0 border-t border-editorial-border/60 px-8 py-6 flex flex-col gap-3">
          <CostBadge estimate={costEstimate} />
          <button
            type="button"
            onClick={onRunPipeline}
            disabled={cannotRun}
            title={runReason ?? t('pipeline.beginPipeline')}
            className="bg-editorial-ink text-white px-6 py-4 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/90 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
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
              className="bg-transparent border border-editorial-accent text-editorial-accent px-6 py-3 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2 flex items-center justify-center gap-2"
            >
              <RotateCcw size={13} /> {t('pipeline.rerunAll')}
            </button>
          )}
          <button
            type="button"
            onClick={onRunAuditOnly}
            disabled={cannotRun}
            title={runReason ?? t('pipeline.runAuditOnly')}
            className="bg-transparent border border-editorial-ink text-editorial-ink px-6 py-4 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
          >
            {t('pipeline.runAuditOnly')}
          </button>
          {isProcessing && (
            <button
              type="button"
              onClick={onCancelPipeline}
              disabled={cancelRequested}
              title={cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
              className="bg-transparent border border-editorial-accent text-editorial-accent px-6 py-4 text-sm font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-accent/5 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
            >
              {cancelRequested ? t('pipeline.stopping') : t('pipeline.stopPipeline')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
