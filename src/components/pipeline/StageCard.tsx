import { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PipelineStageConfig, ModelProvider } from '../../types';
import { MODEL_OPTIONS } from '../../constants';

interface StageCardProps {
  stage: PipelineStageConfig;
  index: number;
  onUpdate: (updates: Partial<PipelineStageConfig>) => void;
  onRemove: () => void;
}

export function StageCard({ stage, index, onUpdate, onRemove }: StageCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

  return (
    <div
      className={`relative border border-editorial-border p-5 bg-white transition-all ${
        !stage.enabled ? 'grayscale opacity-40' : 'shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="font-display italic text-lg text-editorial-accent">#{index + 1}</span>
          <input
            value={stage.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="bg-transparent border-none p-0 font-display text-sm focus:outline-none w-32 border-b border-transparent focus:border-editorial-ink/20"
          />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => onUpdate({ enabled: !stage.enabled })} className="text-editorial-muted">
            {stage.enabled ? (
              <ShieldCheck size={14} className="text-editorial-ink" />
            ) : (
              <div className="w-3.5 h-3.5 border-2 border-editorial-muted rounded-sm" />
            )}
          </button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="text-editorial-muted">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button onClick={onRemove} className="text-editorial-muted hover:text-red-500 overflow-hidden">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 animate-in slide-in-from-top-1 duration-200">
          <div className="flex gap-2">
            <select
              value={stage.provider}
              onChange={(e) =>
                onUpdate({
                  provider: e.target.value as ModelProvider,
                  model: MODEL_OPTIONS[e.target.value as ModelProvider][0],
                })
              }
              className="bg-editorial-textbox border-none px-2 py-1 text-[10px] font-bold uppercase outline-none"
            >
              {Object.keys(MODEL_OPTIONS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={stage.model}
              onChange={(e) => onUpdate({ model: e.target.value })}
              className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none"
            >
              {MODEL_OPTIONS[stage.provider].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={stage.prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            placeholder={t('pipeline.stagePromptPlaceholder')}
            rows={6}
            className="w-full bg-editorial-textbox border-none p-3 text-[11px] font-mono outline-none leading-relaxed resize-y"
          />
        </div>
      )}
    </div>
  );
}
