import { Plus, ArrowRightLeft, Play, Loader2, X } from 'lucide-react';
import type { ModelProvider } from '../../types';
import { MODEL_OPTIONS, LANGUAGES } from '../../constants';
import { usePipelineStore } from '../../stores/pipelineStore';
import { StageCard } from './StageCard';

interface PipelineConfigProps {
  onRunPipeline: () => void;
  onRunAuditOnly: () => void;
}

export function PipelineConfig({ onRunPipeline, onRunAuditOnly }: PipelineConfigProps) {
  const {
    config,
    setConfig,
    chunks,
    isProcessing,
    addStage,
    removeStage,
    updateStage,
  } = usePipelineStore();

  return (
    <section className="col-span-1 md:col-span-3 border-r border-editorial-border p-8 flex flex-col gap-8 bg-editorial-bg/50 overflow-y-auto max-h-[calc(100vh-140px)] custom-scrollbar">
      <div className="space-y-10">
        {/* Language Pair */}
        <div>
          <h2 className="font-display text-sm uppercase tracking-wider border-b border-editorial-ink pb-2 mb-8 inline-block">
            Global Setup
          </h2>
          <div className="space-y-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
              Language Pair
            </label>
            <div className="flex items-center gap-3">
              <select
                value={config.sourceLanguage}
                onChange={(e) => setConfig((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                className="w-full bg-editorial-textbox border-none px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-editorial-ink/10 appearance-none"
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
                className="text-editorial-muted hover:text-editorial-ink transition-colors hover:scale-110 shrink-0"
                title="Swap Languages"
              >
                <ArrowRightLeft size={14} />
              </button>
              <select
                value={config.targetLanguage}
                onChange={(e) => setConfig((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                className="w-full bg-editorial-textbox border-none px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-editorial-ink/10 appearance-none"
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
                Auto-Segment (Paragraphs)
              </span>
            </label>
          </div>
        </div>

        {/* Stages */}
        <div>
          <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-8">
            <h2 className="font-display text-sm uppercase tracking-wider">Stages</h2>
            <button onClick={addStage} className="text-editorial-accent hover:scale-110 transition-transform">
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
            Audit Guard
          </h2>
          <div className="space-y-4">
            <div className="flex gap-2">
              <select
                value={config.judgeProvider}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    judgeProvider: e.target.value as ModelProvider,
                    judgeModel: MODEL_OPTIONS[e.target.value as ModelProvider][0],
                  }))
                }
                className="bg-editorial-textbox border-none px-2 py-1 text-[10px] font-bold uppercase outline-none"
              >
                {Object.keys(MODEL_OPTIONS).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={config.judgeModel}
                onChange={(e) => setConfig((prev) => ({ ...prev, judgeModel: e.target.value }))}
                className="flex-1 bg-editorial-textbox border-none px-2 py-1 text-[10px] font-mono outline-none"
              >
                {MODEL_OPTIONS[config.judgeProvider].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <textarea
              value={config.judgePrompt}
              onChange={(e) => setConfig((prev) => ({ ...prev, judgePrompt: e.target.value }))}
              placeholder="Audit instructions..."
              rows={6}
              className="w-full bg-editorial-textbox border-none p-4 text-xs font-mono outline-none leading-relaxed resize-y"
            />
          </div>
        </div>

        {/* Glossary */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
              Keyword Registry
            </label>
            <Plus
              cursor="pointer"
              size={14}
              className="text-editorial-accent"
              onClick={() =>
                setConfig((prev) => ({
                  ...prev,
                  glossary: [...prev.glossary, { term: '', translation: '' }],
                }))
              }
            />
          </div>
          <div className="space-y-2">
            {config.glossary.map((g, i) => (
              <div key={i} className="flex gap-2 items-center group">
                <input
                  value={g.term}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const n = [...prev.glossary];
                      n[i] = { ...n[i], term: e.target.value };
                      return { ...prev, glossary: n };
                    })
                  }
                  className="w-full bg-editorial-textbox border-none p-2 text-[10px] font-mono outline-none"
                  placeholder="Source"
                />
                <X
                  size={10}
                  className="cursor-pointer opacity-0 group-hover:opacity-100 text-red-500"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      glossary: prev.glossary.filter((_, idx) => idx !== i),
                    }))
                  }
                />
                <input
                  value={g.translation}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const n = [...prev.glossary];
                      n[i] = { ...n[i], translation: e.target.value };
                      return { ...prev, glossary: n };
                    })
                  }
                  className="w-full bg-editorial-textbox border-none p-2 text-[10px] font-mono outline-none"
                  placeholder="Target"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-10 flex flex-col gap-3 shrink-0">
        <button
          type="button"
          onClick={onRunPipeline}
          disabled={isProcessing || chunks.length === 0}
          className="bg-editorial-ink text-white px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-black/90 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={14} />
              Executing...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Play size={14} fill="currentColor" /> Begin Pipeline
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onRunAuditOnly}
          disabled={isProcessing || chunks.length === 0}
          className="bg-transparent border border-editorial-ink text-editorial-ink px-6 py-4 text-[11px] font-bold uppercase tracking-[2px] transition-all hover:bg-editorial-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Run Audit Only
        </button>
      </div>
    </section>
  );
}
