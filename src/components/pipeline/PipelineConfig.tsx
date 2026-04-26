import { Plus, ArrowRightLeft, Play, Loader2, X, AlertTriangle, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ModelProvider } from '../../types';
import { MODEL_OPTIONS, LANGUAGES } from '../../constants';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useChunksStore } from '../../stores/chunksStore';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';
import { StageCard } from './StageCard';

interface PipelineConfigProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
  onCancelPipeline: () => void;
  className?: string;
}

const DEFAULT_PIPELINE_CONFIG_CLASSNAME =
  'col-span-1 md:col-span-3 border-r border-editorial-border p-8 flex flex-col gap-8 bg-editorial-bg/50 overflow-y-auto min-h-0 h-full custom-scrollbar';

function useJudgeModelOptions(provider: ModelProvider): string[] {
  const ollamaModels = useUiStore((s) => s.ollamaModels);
  if (provider === 'ollama') return ollamaModels;
  return MODEL_OPTIONS[provider] || [];
}

export function PipelineConfig({ onRunPipeline, onRunAuditOnly, onCancelPipeline, className }: PipelineConfigProps) {
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

  const cannotRun = isProcessing || chunks.length === 0;
  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const canRerunAll = !isProcessing && completedCount > 0;

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

  // Trimmed-lowercase view for duplicate detection (warn but do not block).
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
      <div className="space-y-10">
        {/* Language Pair */}
        <div>
          <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-8 inline-block">
            {t('pipeline.globalSetup')}
          </h2>
          <div className="space-y-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
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
              <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-muted group-hover:text-editorial-ink transition-colors">
                {t('pipeline.autoSegment')}
              </span>
            </label>
          </div>
        </div>

        {/* Stages */}
        <div>
          <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-8">
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

        {/* Audit Guard */}
        <div>
          <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-8 inline-block">
            {t('pipeline.auditGuard')}
          </h2>
          <div className="space-y-4">
            <div className="flex gap-2">
              <select
                value={config.judgeProvider}
                onChange={(e) => handleJudgeProviderChange(e.target.value as ModelProvider)}
                className="bg-editorial-textbox border-none px-2 py-1 text-[10px] font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {Object.keys(MODEL_OPTIONS).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {judgeModels.length > 0 ? (
                <select
                  value={config.judgeModel}
                  onChange={(e) => setConfig((prev) => ({ ...prev, judgeModel: e.target.value }))}
                  className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none"
                >
                  {judgeModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : config.judgeProvider === 'ollama' ? (
                <input
                  value={config.judgeModel}
                  onChange={(e) => setConfig((prev) => ({ ...prev, judgeModel: e.target.value }))}
                  placeholder={t('ollama.modelPlaceholder')}
                  className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none"
                />
              ) : (
                <select
                  value={config.judgeModel}
                  onChange={(e) => setConfig((prev) => ({ ...prev, judgeModel: e.target.value }))}
                  className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none"
                >
                  {MODEL_OPTIONS[config.judgeProvider]?.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
            {judgeOllamaOffline && (
              <div className="flex items-center gap-2 text-[10px] text-editorial-accent">
                <AlertTriangle size={12} />
                <span>{t('ollama.selectedButOffline')}</span>
              </div>
            )}
            <textarea
              value={config.judgePrompt}
              onChange={(e) => setConfig((prev) => ({ ...prev, judgePrompt: e.target.value }))}
              placeholder={t('pipeline.auditPlaceholder')}
              rows={6}
              className="w-full bg-editorial-textbox border-none p-4 text-xs font-mono outline-none leading-relaxed resize-y focus-visible:ring-2 focus-visible:ring-editorial-accent"
            />
          </div>
        </div>

        {/* Glossary */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
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
          <div className="space-y-2">
            {config.glossary.map((g, i) => {
              const rowKey = g.id ?? `gloss-fallback-${i}`;
              const isDuplicate = g.id ? duplicateTermIds.has(g.id) : false;
              const removeLabel = `${t('pipeline.removeGlossaryEntry')} ${i + 1}`;
              return (
                <div key={rowKey} className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <input
                      value={g.term}
                      onChange={(e) =>
                        g.id
                          ? updateGlossaryEntry(g.id, { term: e.target.value })
                          : undefined
                      }
                      className={`w-full bg-editorial-textbox border-none p-2 text-[10px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                        isDuplicate ? 'ring-1 ring-editorial-warning' : ''
                      }`}
                      placeholder={t('pipeline.source')}
                      aria-label={`${t('pipeline.source')} ${i + 1}`}
                    />
                    <button
                      onClick={() => g.id && removeGlossaryEntry(g.id)}
                      title={removeLabel}
                      className="text-editorial-muted/60 hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent shrink-0 p-1"
                      aria-label={removeLabel}
                    >
                      <X size={12} />
                    </button>
                    <input
                      value={g.translation}
                      onChange={(e) =>
                        g.id
                          ? updateGlossaryEntry(g.id, { translation: e.target.value })
                          : undefined
                      }
                      className="w-full bg-editorial-textbox border-none p-2 text-[10px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      placeholder={t('pipeline.target')}
                      aria-label={`${t('pipeline.target')} ${i + 1}`}
                    />
                  </div>
                  {isDuplicate && (
                    <span className="text-[9px] uppercase tracking-widest text-editorial-warning font-bold pl-1">
                      {t('pipeline.duplicateTerm')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-10 flex flex-col gap-3 shrink-0">
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
    </section>
  );
}
