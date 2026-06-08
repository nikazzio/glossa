import {
  AlertCircle,
  Brain,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock,
  FlaskConical,
  List,
  Loader2,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import { usePhraseMemoryStore } from '../../../stores/phraseMemoryStore';
import { countWords, indexPad, qualityLabelKey, qualityTone } from '../../../utils';
import type { TranslationChunk } from '../../../types';

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
};

export interface IndexTabProps {
  panelId: string;
  labelledBy: string;
  chunks: TranslationChunk[];
  currentChunkId: string | null;
  stuckChunkIds: Set<string>;
  onSelect: (id: string) => void;
  onCancelStuck: (chunkId: string) => void;
}

export function IndexTab({ panelId, labelledBy, chunks, currentChunkId, stuckChunkIds, onSelect, onCancelStuck }: IndexTabProps) {
  const { t } = useTranslation();
  const matchesByChunk = usePhraseMemoryStore((s) => s.matchesByChunk);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: chunks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  if (chunks.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <List size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('document.indexEmptyTitle')}</p>
        <p className="text-xs leading-relaxed text-editorial-muted/70">{t('document.indexEmptyBody')}</p>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4">
      <ul style={{ height: virtualizer.getTotalSize(), position: 'relative' }} className="w-full">
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const chunk = chunks[virtualRow.index];
          const index = virtualRow.index;
          const isActive = chunk.id === currentChunkId;
          const tone = qualityTone(chunk.judgeResult.status === 'completed' ? chunk.judgeResult.rating : null);
          const wordCount = countWords(chunk.originalText);
          const isStuck = stuckChunkIds.has(chunk.id);

          let statusIcon: React.ReactNode;
          if (chunk.status === 'processing') {
            statusIcon = isStuck
              ? <Clock size={13} className="text-editorial-accent shrink-0" />
              : <Loader2 size={13} className="animate-spin text-editorial-warning shrink-0" />;
          } else if (chunk.status === 'completed') {
            statusIcon = <CheckCircle2 size={13} className="text-editorial-success shrink-0" />;
          } else if (chunk.status === 'preview') {
            statusIcon = <FlaskConical size={13} className="text-editorial-muted shrink-0" />;
          } else if (chunk.status === 'error') {
            statusIcon = <AlertCircle size={13} className="text-editorial-accent shrink-0" />;
          } else {
            statusIcon = <Circle size={13} className="text-editorial-border shrink-0" />;
          }

          return (
            <li
              key={chunk.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: virtualRow.start, left: 0, right: 0 }}
              className="pb-2"
            >
              <div className={`rounded-2xl border transition-colors ${isActive ? 'border-editorial-charcoal bg-editorial-charcoal' : 'border-editorial-border bg-editorial-bg hover:border-editorial-charcoal/40'}`}>
                <button type="button" onClick={() => onSelect(chunk.id)} className="w-full px-4 pt-3 pb-2 text-left">
                  <div className="flex items-center gap-2">
                    {statusIcon}
                    <span className={`font-display text-sm italic ${isActive ? 'text-white' : 'text-editorial-accent'}`}>
                      {indexPad(index + 1)}
                    </span>
                    <span className={`flex-1 line-clamp-2 text-xs leading-snug ${isActive ? 'text-white/80' : 'text-editorial-muted'}`}>
                      {chunk.originalText.replace(/\s+/g, ' ').trim()}
                    </span>
                    <span className={`shrink-0 text-xs font-mono ${isActive ? 'text-white/50' : 'text-editorial-muted/60'}`}>
                      {wordCount}w
                    </span>
                  </div>
                  {chunk.judgeResult.status === 'completed' && (
                    <div className={`mt-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] ${isActive ? 'text-white/70' : QUALITY_TONE_COLOR[tone]}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone === 'strong' ? 'bg-editorial-success' : tone === 'ok' ? 'bg-editorial-warning' : 'bg-editorial-accent'}`} />
                      {t(qualityLabelKey(chunk.judgeResult.rating))}
                    </div>
                  )}
                  {chunk.translationLocked && (
                    <div className={`mt-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] ${isActive ? 'text-white/80' : 'text-editorial-success'}`}>
                      <CheckCheck size={12} />
                      {t('document.translationLockedBadge')}
                    </div>
                  )}
                  {(() => {
                    const matchCount = matchesByChunk.get(chunk.id)?.matches.length ?? 0;
                    if (matchCount === 0) return null;
                    return (
                      <div className={`mt-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] ${isActive ? 'text-white/80' : 'text-editorial-accent'}`}>
                        <Brain size={11} />
                        {t('memory.matchBadge', { count: matchCount })}
                      </div>
                    );
                  })()}
                </button>

                {isStuck && chunk.status === 'processing' && (
                  <div className={`flex items-center justify-between gap-2 border-t px-3 py-2 ${isActive ? 'border-white/10' : 'border-editorial-border/60'}`}>
                    <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] ${isActive ? 'text-orange-200' : 'text-editorial-accent'}`}>
                      <Clock size={11} />
                      {t('document.watchdogStuck')}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCancelStuck(chunk.id); }}
                      aria-label={t('document.watchdogCancel')}
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${isActive ? 'border-orange-300/40 text-orange-200 hover:bg-white/10' : 'border-editorial-accent/40 text-editorial-accent hover:bg-editorial-accent/10'}`}
                    >
                      {t('document.watchdogCancel')}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
