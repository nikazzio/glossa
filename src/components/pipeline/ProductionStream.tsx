import { Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { StatusIndicator, ProcessingLine, CopyButton } from '../common';
import { indexPad } from '../../utils';

export function ProductionStream() {
  const { inputText, setInputText, chunks, config, generateChunks, clearChunks, updateChunkDraft } =
    usePipelineStore();
  const { t } = useTranslation();

  return (
    <section className="col-span-1 md:col-span-6 bg-editorial-bg p-8 overflow-y-auto max-h-[calc(100vh-140px)] border-r border-editorial-border custom-scrollbar">
      <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-10">
        <h2 className="font-display text-sm uppercase tracking-wider inline-block">{t('pipeline.productionStream')}</h2>
        {chunks.length > 0 && (
          <button
            onClick={clearChunks}
            className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Trash2 size={12} /> {t('pipeline.clearStream')}
          </button>
        )}
      </div>

      <div className="space-y-16">
        {!chunks.length && (
          <div className="space-y-8 max-w-2xl mx-auto py-12">
            <div className="space-y-4">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                {t('pipeline.inputContent')}
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t('pipeline.inputPlaceholder')}
                className="w-full bg-editorial-textbox border-none p-8 text-sm font-mono outline-none leading-relaxed resize-none min-h-[400px] focus-visible:ring-2 focus-visible:ring-editorial-accent"
              />
            </div>
            <button
              onClick={generateChunks}
              className="w-full bg-editorial-ink text-white px-6 py-5 text-[11px] font-bold uppercase tracking-[3px] hover:shadow-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent focus-visible:ring-offset-2"
            >
              {t('pipeline.stageContent')}
            </button>
          </div>
        )}

        {chunks.map((chunk, idx) => (
          <div
            key={chunk.id}
            className="space-y-8 border-b border-editorial-border pb-16 last:border-0 last:pb-0 group"
          >
            <div className="flex items-center justify-between">
              <span className="font-display italic text-2xl text-editorial-accent tracking-tighter">
                {t('pipeline.unit')} {indexPad(idx + 1)}
              </span>
              <div className="flex gap-4">
                {config.stages
                  .filter((s) => s.enabled)
                  .map((s, si) => (
                    <StatusIndicator
                      key={s.id}
                      status={chunk.stageResults[s.id]?.status || 'idle'}
                      label={indexPad(si + 1)}
                    />
                  ))}
                <StatusIndicator status={chunk.judgeResult.status} label="Audit" />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-editorial-muted font-mono leading-relaxed opacity-50 mb-6 italic">
                {t('pipeline.originalSource')}: &quot;{chunk.originalText.slice(0, 150)}
                {chunk.originalText.length > 150 ? '...' : ''}&quot;
              </p>

              {config.stages
                .filter((s) => s.enabled)
                .map((stage) => {
                  const result = chunk.stageResults[stage.id];
                  if (!result || result.status === 'idle') return null;

                  return (
                    <div
                      key={stage.id}
                      className={`relative border p-6 bg-editorial-bg/10 animate-in fade-in slide-in-from-left-2 duration-300 ${
                        result.status === 'error'
                          ? 'border-editorial-accent/30 bg-editorial-textbox/30'
                          : 'border-editorial-border'
                      }`}
                    >
                      <span className="absolute -top-3 left-6 bg-editorial-bg border border-editorial-border px-2 font-display italic text-[10px]">
                        {stage.name}
                      </span>
                      <div className="text-sm leading-relaxed overflow-hidden">
                        {result.status === 'processing' ? (
                          <ProcessingLine />
                        ) : result.status === 'error' ? (
                          <div className="flex items-start gap-2 text-editorial-accent">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span className="text-xs font-mono">{result.error || t('errors.unknownError')}</span>
                          </div>
                        ) : (
                          <div className="text-editorial-ink">{result.content}</div>
                        )}
                      </div>
                    </div>
                  );
                })}

              {/* Editable Candidate Translation */}
              <div className="space-y-3 mt-8">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                    {t('pipeline.candidateTranslation')}
                  </label>
                  <CopyButton text={chunk.currentDraft || ''} />
                </div>
                <textarea
                  value={chunk.currentDraft || ''}
                  onChange={(e) => updateChunkDraft(chunk.id, e.target.value)}
                  className="w-full bg-editorial-bg/50 border border-editorial-border p-4 text-sm font-sans outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent resize-y min-h-[100px] leading-relaxed transition-all"
                  placeholder={t('pipeline.candidatePlaceholder')}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
