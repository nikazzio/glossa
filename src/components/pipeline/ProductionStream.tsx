import { Trash2 } from 'lucide-react';
import { usePipelineStore } from '../../stores/pipelineStore';
import { StatusIndicator, ProcessingLine, CopyButton } from '../common';
import { indexPad } from '../../utils';

export function ProductionStream() {
  const { inputText, setInputText, chunks, config, generateChunks, clearChunks, updateChunkDraft } =
    usePipelineStore();

  return (
    <section className="col-span-1 md:col-span-6 bg-white p-8 overflow-y-auto max-h-[calc(100vh-140px)] border-r border-editorial-border custom-scrollbar">
      <div className="flex items-center justify-between border-b border-editorial-ink pb-2 mb-10">
        <h2 className="font-display text-sm uppercase tracking-wider inline-block">Production Stream</h2>
        {chunks.length > 0 && (
          <button
            onClick={clearChunks}
            className="text-[10px] font-bold uppercase tracking-widest text-editorial-muted hover:text-red-500 transition-colors flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear Stream
          </button>
        )}
      </div>

      <div className="space-y-16">
        {!chunks.length && (
          <div className="space-y-8 max-w-2xl mx-auto py-12">
            <div className="space-y-4">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-editorial-muted">
                Input Content
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste source material here..."
                className="w-full bg-editorial-textbox border-none p-8 text-sm font-mono outline-none leading-relaxed resize-none min-h-[400px]"
              />
            </div>
            <button
              onClick={generateChunks}
              className="w-full bg-editorial-ink text-white px-6 py-5 text-[11px] font-bold uppercase tracking-[3px] hover:shadow-xl transition-all"
            >
              Stage Content to Stream
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
                Unit {indexPad(idx + 1)}
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
                Original Source: &quot;{chunk.originalText.slice(0, 150)}
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
                      className="relative border border-editorial-border p-6 bg-editorial-bg/10 animate-in fade-in slide-in-from-left-2 duration-300"
                    >
                      <span className="absolute -top-3 left-6 bg-white border border-editorial-border px-2 font-display italic text-[10px]">
                        {stage.name}
                      </span>
                      <div className="text-sm leading-relaxed overflow-hidden">
                        {result.status === 'processing' ? (
                          <ProcessingLine />
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
                    Candidate Translation
                  </label>
                  <CopyButton text={chunk.currentDraft || ''} />
                </div>
                <textarea
                  value={chunk.currentDraft || ''}
                  onChange={(e) => updateChunkDraft(chunk.id, e.target.value)}
                  className="w-full bg-editorial-bg/50 border border-editorial-border p-4 text-sm font-sans outline-none focus:ring-1 focus:ring-editorial-ink/10 resize-y min-h-[100px] leading-relaxed transition-all"
                  placeholder="Output will appear here. Edit manually before auditing..."
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
