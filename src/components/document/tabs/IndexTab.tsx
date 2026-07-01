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
import { useAnnotationsStore } from '../../../stores/annotationsStore';
import { countWords, indexPad, qualityLabelKey, qualityTone } from '../../../utils';
import { ANNOTATION_META } from './NotesTab';
import { Tooltip } from '../../ui';
import type { TranslationChunk, AnnotationType } from '../../../types';

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-danger',
};

// Ordine di gravità decrescente: determina l'ordine di visualizzazione dei pallini nota per tipo.
const ANNOTATION_PRIORITY: AnnotationType[] = ['problem', 'doubt', 'comment', 'approved'];

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
  const annotationsByChunkId = useAnnotationsStore((s) => s.annotationsByChunkId);
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
        <p className="text-xs leading-relaxed text-editorial-muted">{t('document.indexEmptyBody')}</p>
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

          const annotationCountsByType = (annotationsByChunkId.get(chunk.id) ?? []).reduce(
            (acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; return acc; },
            {} as Partial<Record<AnnotationType, number>>,
          );
          const notePills = ANNOTATION_PRIORITY
            .filter((type) => annotationCountsByType[type])
            .map((type) => ({ type, count: annotationCountsByType[type]! }));
          const matchCount = matchesByChunk.get(chunk.id)?.matches.length ?? 0;
          const hasMetaRow = chunk.judgeResult.status === 'completed' || chunk.translationLocked || matchCount > 0 || notePills.length > 0;

          let statusIcon: React.ReactNode;
          if (chunk.status === 'processing') {
            statusIcon = isStuck
              ? <Clock size={15} className="text-editorial-accent shrink-0" />
              : <Loader2 size={15} className="animate-spin text-editorial-warning shrink-0" />;
          } else if (chunk.status === 'completed') {
            statusIcon = <CheckCircle2 size={15} className="text-editorial-success shrink-0" />;
          } else if (chunk.status === 'preview') {
            statusIcon = <FlaskConical size={15} className="text-editorial-muted shrink-0" />;
          } else if (chunk.status === 'error') {
            statusIcon = <AlertCircle size={15} className="text-editorial-danger shrink-0" />;
          } else {
            statusIcon = <Circle size={15} className="text-editorial-border shrink-0" />;
          }

          return (
            <li
              key={chunk.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: virtualRow.start, left: 0, right: 0 }}
              className={`relative border-b border-editorial-border/55 ${isActive ? 'bg-editorial-charcoal/10' : ''}`}
            >
              {isActive && <span className="absolute left-0 top-0 h-full w-[3px] bg-editorial-charcoal" aria-hidden="true" />}
              <button type="button" onClick={() => onSelect(chunk.id)} className="w-full px-4 pt-3 pb-2 text-left">
                <div className="flex items-center gap-2">
                  {statusIcon}
                  <span className={`font-display text-sm italic ${isActive ? 'text-editorial-charcoal' : 'text-editorial-accent'}`}>
                    {indexPad(index + 1)}
                  </span>
                  <span className="flex-1 line-clamp-2 text-xs leading-snug text-editorial-muted">
                    {chunk.originalText.replace(/\s+/g, ' ').trim()}
                  </span>
                  <span className="shrink-0 text-xs font-mono text-editorial-muted">
                    {wordCount}w
                  </span>
                </div>
                {hasMetaRow && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {notePills.map(({ type, count }) => (
                        <Tooltip key={type} label={`${count} × ${t(ANNOTATION_META[type].labelKey)}`} side="top">
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${ANNOTATION_META[type].bgClass}`}
                            aria-label={`${count} × ${t(ANNOTATION_META[type].labelKey)}`}
                          >
                            {count}
                          </span>
                        </Tooltip>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {chunk.judgeResult.status === 'completed' && (
                        <span className={`text-xs font-bold uppercase tracking-[0.1em] ${QUALITY_TONE_COLOR[tone]}`}>
                          {t(qualityLabelKey(chunk.judgeResult.rating))}
                        </span>
                      )}
                      {chunk.translationLocked && (
                        <Tooltip label={t('document.translationLockedBadge')} side="top">
                          <CheckCheck size={13} className="text-editorial-success" aria-label={t('document.translationLockedBadge')} />
                        </Tooltip>
                      )}
                      {matchCount > 0 && (
                        <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-editorial-accent">
                          <Brain size={11} />
                          {t('memory.matchBadge', { count: matchCount })}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </button>

              {isStuck && chunk.status === 'processing' && (
                <div className="flex items-center justify-between gap-2 border-t border-editorial-border/60 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-editorial-warning">
                    <Clock size={11} />
                    {t('document.watchdogStuck')}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCancelStuck(chunk.id); }}
                    aria-label={t('document.watchdogCancel')}
                    className="rounded-full border border-editorial-danger/40 px-2 py-0.5 text-xs font-medium text-editorial-danger transition-colors hover:bg-editorial-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    {t('document.watchdogCancel')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
