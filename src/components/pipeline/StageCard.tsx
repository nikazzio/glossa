import { useState } from 'react';
import {
  BookmarkPlus,
  BookOpen,
  Check,
  Cpu,
  Loader2,
  RefreshCw,
  Trash2,
  Wand2,
  WifiOff,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider, OllamaStatus, PipelineStageConfig, PromptTemplate } from '../../types';
import { MODEL_OPTIONS } from '../../constants';
import { getModelStatus } from '../../models/catalog';
import { ProviderRuntimeEditor } from './ProviderRuntimeEditor';

interface StageCardProps {
  stage: PipelineStageConfig;
  templates: PromptTemplate[];
  isRefining: boolean;
  translationsExist: boolean;
  isProcessing: boolean;
  ollamaStatus: OllamaStatus;
  isRefreshingOllama: boolean;
  modelOptions: string[];
  onUpdate: (updates: Partial<PipelineStageConfig>) => void;
  onRefinePrompt: () => void;
  onRefreshOllama: () => void;
  saveTemplate: (
    name: string,
    prompt: string,
    context: 'stage' | 'audit',
    defaultModel?: string,
    defaultProvider?: string,
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

export function StageCard({
  stage,
  templates,
  isRefining,
  translationsExist,
  isProcessing,
  ollamaStatus,
  isRefreshingOllama,
  modelOptions,
  onUpdate,
  onRefinePrompt,
  onRefreshOllama,
  saveTemplate,
  deleteTemplate,
}: StageCardProps) {
  const { t } = useTranslation();
  const [showSaveName, setShowSaveName] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateList, setShowTemplateList] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

  const ollamaOffline = stage.provider === 'ollama' && ollamaStatus === 'disconnected';

  const filteredTemplates = templates.filter((tmpl) =>
    tmpl.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  const handleProviderChange = (newProvider: ModelProvider) => {
    const models =
      newProvider === 'ollama' ? [] : (MODEL_OPTIONS[newProvider] ?? []);
    onUpdate({ provider: newProvider, model: models[0] || '' });
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    try {
      await saveTemplate(name, stage.prompt, 'stage', stage.model, stage.provider);
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
    <div className="space-y-4">
      {/* Role hint for non-translation stages */}
      {(stage.role ?? 'translation') !== 'translation' && (
        <p className="text-[10px] leading-relaxed text-editorial-muted/70">
          {t(`pipeline.stageRoleHint.${stage.role ?? 'translation'}`)}
        </p>
      )}

      {/* Model + provider card */}
      <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
        <div className="flex items-center gap-1.5">
          <Cpu size={11} className="text-editorial-accent shrink-0" />
          <p className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
            {t('pipeline.stageModelLabel')}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={stage.provider}
            onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
            disabled={translationsExist || isProcessing}
            className="rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={t('models.provider')}
          >
            {Object.keys(MODEL_OPTIONS).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {modelOptions.length > 0 ? (
            <select
              value={stage.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              disabled={translationsExist || isProcessing}
              className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('pipeline.stageModelLabel')}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}{getModelStatus(stage.provider, m) === 'preview' ? ' (preview)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={stage.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              disabled={translationsExist || isProcessing}
              placeholder={t('ollama.modelPlaceholder')}
              className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-2 py-1.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('pipeline.stageModelLabel')}
            />
          )}
        </div>
        {translationsExist && (
          <div className="flex items-center gap-2 text-xs text-editorial-muted">
            <AlertTriangle size={12} className="shrink-0" />
            <span>{t('pipeline.modelLockedHint')}</span>
          </div>
        )}
        {ollamaOffline && !translationsExist && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-editorial-accent">
              <WifiOff size={13} />
              <span>{t('ollama.selectedButOffline')}</span>
            </div>
            <button
              type="button"
              onClick={onRefreshOllama}
              disabled={isRefreshingOllama}
              className="flex items-center gap-1.5 rounded-full border border-editorial-accent/60 px-3 py-1 text-xs text-editorial-accent transition-colors hover:bg-editorial-accent hover:text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {isRefreshingOllama ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {t('ollama.loadModels')}
            </button>
          </div>
        )}
        <ProviderRuntimeEditor
          provider={stage.provider}
          value={stage.providerOptions}
          onChange={(providerOptions) => onUpdate({ providerOptions })}
          title={t('pipeline.providerOptions.stageTitle')}
          hint={t('pipeline.providerOptions.stageHint')}
        />
      </div>

      {/* Prompt editor */}
      <div className="rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-sans uppercase tracking-[0.35em] text-editorial-muted">
            {t('pipeline.prompt')}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefinePrompt}
              disabled={isRefining || !stage.prompt.trim()}
              title={t('pipeline.refinePrompt')}
              aria-label={t('pipeline.refinePrompt')}
              className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent disabled:opacity-40"
            >
              {isRefining ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            </button>
            <button
              type="button"
              onClick={() => { setShowSaveName(!showSaveName); setShowTemplateList(false); }}
              title={t('pipeline.templates.save')}
              aria-label={t('pipeline.templates.save')}
              className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            >
              <BookmarkPlus size={16} />
            </button>
            <button
              type="button"
              onClick={() => { setShowTemplateList(!showTemplateList); setShowSaveName(false); }}
              title={t('pipeline.templates.load')}
              aria-label={t('pipeline.templates.load')}
              className="text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
            >
              <BookOpen size={16} />
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
                if (e.key === 'Escape') { setShowSaveName(false); setTemplateName(''); }
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
                  <li key={tmpl.id} className="flex items-start gap-2 px-3 py-2 hover:bg-editorial-textbox/40 group">
                    <button
                      type="button"
                      onClick={() => { onUpdate({ prompt: tmpl.prompt }); setShowTemplateList(false); setTemplateSearch(''); }}
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
          value={stage.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          placeholder={t('pipeline.stagePromptPlaceholder')}
          rows={8}
          className="w-full rounded-[16px] bg-editorial-textbox/40 border border-editorial-border/60 p-4 text-sm font-mono outline-none leading-relaxed resize-y focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>
    </div>
  );
}
