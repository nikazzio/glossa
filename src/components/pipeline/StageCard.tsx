import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PipelineStageConfig, ModelProvider } from '../../types';
import { MODEL_OPTIONS } from '../../constants';
import { useUiStore } from '../../stores/uiStore';
import { confirm } from '../../stores/confirmStore';

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
  const { t } = useTranslation();
  const modelOptions = useModelOptions(stage.provider);
  const ollamaStatus = useUiStore((s) => s.ollamaStatus);
  const showOllamaOfflineWarning =
    stage.provider === 'ollama' && ollamaStatus === 'disconnected';

  const handleProviderChange = (newProvider: ModelProvider) => {
    const models =
      newProvider === 'ollama'
        ? useUiStore.getState().ollamaModels
        : MODEL_OPTIONS[newProvider];
    onUpdate({
      provider: newProvider,
      model: models[0] || '',
    });
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

  return (
    <div
      className={`relative border border-editorial-border p-5 bg-editorial-bg transition-all ${
        !stage.enabled ? 'grayscale opacity-40' : 'shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="font-display italic text-lg text-editorial-accent">#{index + 1}</span>
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
              className="bg-editorial-textbox border-none px-2 py-1 text-[10px] font-bold uppercase outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {Object.keys(MODEL_OPTIONS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {modelOptions.length > 0 ? (
              <select
                value={stage.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : stage.provider === 'ollama' ? (
              <input
                value={stage.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                placeholder={t('ollama.modelPlaceholder')}
                className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              />
            ) : (
              <select
                value={stage.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                {MODEL_OPTIONS[stage.provider]?.map((m) => (
                  <option key={m} value={m}>
                    {m}
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
          <textarea
            value={stage.prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            placeholder={t('pipeline.stagePromptPlaceholder')}
            rows={6}
            className="w-full bg-editorial-textbox border-none p-3 text-[11px] font-mono outline-none leading-relaxed resize-y focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </div>
      )}
    </div>
  );
}
