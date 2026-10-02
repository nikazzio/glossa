import { useEffect, useState } from 'react';
import { Languages, RotateCcw, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IconButton } from '../ui';
import type { TranslationChunk } from '../../types';
import { useChunksStore } from '../../stores/chunksStore';
import { useTranslationHistoryStore } from '../../stores/translationHistoryStore';
import {
  listTranslationRevisions,
  recordManualRevision,
  type TranslationRevisionRow,
} from '../../services/translationRevisionsService';
import { formatRevisionDate } from '../transcription/formatRevisionDate';
import { logger } from '../../utils/logger';

const AUTHOR_ICONS = { model: Languages, human: User } as const;

interface TranslationHistoryListProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

interface LoadedHistory {
  chunkId: string;
  revisions: TranslationRevisionRow[];
  approvedRevisionId: string | null;
}

/**
 * Le versioni del frammento aperto, dalla più recente: passate della pipeline,
 * salvataggi manuali, verifiche. Il ripristino riporta il testo nel foglio e
 * lo scrive come versione nuova, senza toccare le precedenti: lo storico non
 * si modifica.
 */
export function TranslationHistoryList({ panelId, labelledBy, currentChunk }: TranslationHistoryListProps) {
  const { t, i18n } = useTranslation();
  const revisionTick = useTranslationHistoryStore((s) => s.revisionTick);
  const updateChunkDraft = useChunksStore((s) => s.updateChunkDraft);
  const [history, setHistory] = useState<LoadedHistory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const chunkId = currentChunk?.id ?? null;

  useEffect(() => {
    if (!chunkId) return;
    // Una risposta tardiva di un frammento lasciato non sostituisce quello aperto.
    let stale = false;
    listTranslationRevisions(chunkId)
      .then((loaded) => {
        if (stale) return;
        setHistory({ chunkId, ...loaded });
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (stale) return;
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('translation.history.load_failed', { chunkId, error: message });
        setLoadError(message);
      });
    return () => { stale = true; };
  }, [chunkId, revisionTick]);

  const revisions = history?.chunkId === chunkId ? history.revisions : [];
  const approvedRevisionId = history?.chunkId === chunkId ? history.approvedRevisionId : null;
  const restoreBlockedReason = !currentChunk
    ? null
    : currentChunk.status === 'processing'
      ? t('document.reasonChunkProcessing')
      : currentChunk.translationLocked
        ? t('document.reasonVerified')
        : null;

  const restore = (revision: TranslationRevisionRow) => {
    if (!currentChunk) return;
    updateChunkDraft(currentChunk.id, revision.text);
    recordManualRevision(currentChunk.id, revision.text).catch((error: unknown) => {
      toast.error(t('document.versionSaveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const row = (revision: TranslationRevisionRow, index: number) => {
    const AuthorIcon = AUTHOR_ICONS[revision.created_by];
    const textInPage = revision.text === currentChunk?.translationDisplayText;
    const restoreLabel = t(textInPage ? 'transcription.alreadyCurrent' : 'transcription.restore');
    return (
      <li key={revision.id} className="space-y-2 py-4 first:pt-0">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm italic text-editorial-ink">
              {t('transcription.versionNumber', { number: revision.revision_number })}
            </p>
            <p className="caption-label flex flex-wrap items-center gap-x-1.5">
              <AuthorIcon size={11} className="shrink-0" aria-hidden="true" />
              <span>{t(`document.historyAuthor.${revision.created_by}`)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatRevisionDate(revision.created_at, i18n.language)}</span>
              {index === 0 && <span className="text-editorial-accent">· {t('transcription.currentBadge')}</span>}
              {revision.id === approvedRevisionId && (
                <span className="text-editorial-success">· {t('transcription.verifiedVersionBadge')}</span>
              )}
            </p>
          </div>
          <IconButton
            size="sm"
            onClick={() => restore(revision)}
            title={restoreBlockedReason && !textInPage
              ? t('transcription.commandBlocked', { command: restoreLabel, reason: restoreBlockedReason })
              : restoreLabel}
            disabled={textInPage || restoreBlockedReason !== null}
            tooltipSide="left"
          >
            <RotateCcw size={13} />
          </IconButton>
        </div>
        <p className="line-clamp-3 text-xs text-editorial-ink">{revision.text}</p>
      </li>
    );
  };

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-5 py-3">
      {loadError ? (
        <p className="text-sm text-editorial-danger">{t('document.historyLoadFailed', { message: loadError })}</p>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-editorial-muted">{t('document.historyEmpty')}</p>
      ) : (
        <ul className="divide-y divide-rule" aria-label={t('document.reviewHistory')}>
          {revisions.map(row)}
        </ul>
      )}
    </div>
  );
}
