import { useTranslation } from 'react-i18next';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import type { TranslationChunk } from '../../types';
import { Tooltip } from '../ui';

function buildChunkDotLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  chunk: TranslationChunk,
  index: number,
  total: number,
  isCurrent: boolean,
  annotationCount: number,
  unresolvedIssueCount: number,
): string {
  const parts = [
    `${t('document.chunkLabel')} ${index + 1}/${total}`,
    t(`pipeline.chunkStatus.${chunk.status}`),
  ];
  if (chunk.translationLocked) parts.push(t('document.translationLockedBadge'));
  if (annotationCount > 0) parts.push(t('annotations.badgeCount', { count: annotationCount }));
  if (unresolvedIssueCount > 0) parts.push(t('audit.issuesCount', { count: unresolvedIssueCount }));
  if (chunk.translationStale) parts.push(t('document.translationStaleBadge'));
  if (isCurrent) parts.push(t('document.currentChunkBadge'));
  return parts.join(' · ');
}

function statusMarkClassName(status: TranslationChunk['status']): string {
  if (status === 'completed') return 'h-1.5 w-1.5 rounded-full bg-editorial-success';
  if (status === 'error') return 'h-2 w-2 rounded-xs bg-editorial-danger';
  if (status === 'processing') return 'h-1 w-2.5 rounded-full bg-editorial-running animate-pulse';
  return 'h-2.5 w-2.5 rounded-full border border-editorial-border bg-transparent';
}

/** Segni agli angoli: si staccano dal cerchio con un anello del colore della fila. */
const CORNER_MARK_CLASSNAME = 'absolute h-2 w-2 rounded-full ring-1 ring-surface-panel';

interface ChunkDotProps {
  chunk: TranslationChunk;
  index: number;
  total: number;
  isCurrent: boolean;
  /** Fuori dalla finestra visibile: resta nella fila per lo scorrimento, ma non
   *  si raggiunge col tabulatore e non si annuncia. */
  hidden: boolean;
  onSelect: (chunkId: string) => void;
}

/**
 * Il pallino di un frammento: al centro lo stato (da tradurre, in lavoro,
 * tradotto, errore), agli angoli segnalazioni dell'audit, note, verifica e
 * «da aggiornare». Il suggerimento dice tutto per esteso.
 */
export function ChunkDot({ chunk, index, total, isCurrent, hidden, onSelect }: ChunkDotProps) {
  const { t } = useTranslation();
  const annotations = useAnnotationsStore((s) => s.annotationsByChunkId.get(chunk.id)) ?? [];
  const unresolvedIssueCount = chunk.judgeResult.status === 'completed'
    ? chunk.judgeResult.issues.filter((issue) => !issue.resolved && !issue.rejected).length
    : 0;
  const annotationColor = annotations.some((a) => a.type === 'problem')
    ? 'bg-editorial-danger'
    : annotations.some((a) => a.type === 'doubt')
      ? 'bg-editorial-warning'
      : annotations.length > 0
        ? 'bg-editorial-charcoal'
        : null;
  const label = buildChunkDotLabel(t, chunk, index, total, isCurrent, annotations.length, unresolvedIssueCount);

  const button = (
    <button
      type="button"
      onClick={() => onSelect(chunk.id)}
      aria-label={label}
      aria-current={isCurrent ? 'true' : undefined}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-editorial-border bg-surface-elevated">
        <span aria-hidden="true" className={statusMarkClassName(chunk.status)} />
      </span>
      {unresolvedIssueCount > 0 && <span aria-hidden="true" className={`${CORNER_MARK_CLASSNAME} left-1 top-1 bg-editorial-danger`} />}
      {annotationColor && <span aria-hidden="true" className={`${CORNER_MARK_CLASSNAME} right-1 top-1 ${annotationColor}`} />}
      {chunk.translationLocked && <span aria-hidden="true" className={`${CORNER_MARK_CLASSNAME} bottom-1 left-1 bg-editorial-success`} />}
      {chunk.translationStale && <span aria-hidden="true" className={`${CORNER_MARK_CLASSNAME} bottom-1 right-1 bg-editorial-warning`} />}
    </button>
  );

  return hidden ? button : <Tooltip label={label}>{button}</Tooltip>;
}
