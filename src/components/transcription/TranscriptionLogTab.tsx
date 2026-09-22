import { useCallback, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadTranscriptionOperationLogs, type PersistedLogEntry } from '../../services/dbService';
import { onJobChanged, OCR_JOB_TYPE } from '../../services/jobsService';
import { Tooltip } from '../ui';
import { ConsoleChrome } from '../console/ConsoleChrome';
import { formatDurationMs } from '../../utils/operationLogStats';

const LEVEL_COLOR: Record<string, string> = {
  error: 'text-terminal-error',
  warn: 'text-terminal-warn',
  success: 'text-terminal-success',
  info: 'text-terminal-info',
};

/** Log trascrizione (#220), speculare al "Log traduzione": una console
 *  minima sopra `operation_logs`, filtrata sul documento aperto. Riuso solo
 *  di `ConsoleChrome` — non di `OperationsTab.tsx`, legato ai frammenti di
 *  traduzione. */
export function TranscriptionLogTab({
  documentId,
  panelId,
  labelledBy,
}: {
  documentId: string;
  panelId: string;
  labelledBy: string;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<PersistedLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadTranscriptionOperationLogs(documentId);
      setEntries([...rows].reverse());
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onJobChanged((job) => {
      if (job.jobType === OCR_JOB_TYPE && (job.status === 'completed' || job.status === 'error')) {
        void load();
      }
    }).then((fn) => { if (!cancelled) unlisten = fn; else fn(); });
    return () => { cancelled = true; unlisten?.(); };
  }, [load]);

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex h-full flex-col bg-terminal-bg">
      <ConsoleChrome
        title={t('transcription.log.title')}
        rowCount={entries.length}
        status={
          <Tooltip label={t('systemLog.reload')} side="top">
            <button
              type="button"
              onClick={() => void load()}
              aria-label={t('systemLog.reload')}
              disabled={loading}
              className="shrink-0 text-terminal-secondary transition-colors hover:text-terminal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent disabled:text-terminal-dim"
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : undefined} />
            </button>
          </Tooltip>
        }
      />
      <div className="terminal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
        {entries.length === 0 && !loading && (
          <p className="py-6 text-center text-terminal-secondary">{t('transcription.log.empty')}</p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="py-1">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="select-none text-terminal-dim">$</span>
              <span className="tabular-nums text-terminal-secondary">{entry.at.slice(11, 19)}</span>
              {entry.provider && (
                <span className="text-terminal-secondary">{entry.provider}{entry.model ? `:${entry.model}` : ''}</span>
              )}
              {entry.durationMs != null && (
                <span className="text-terminal-muted">{formatDurationMs(entry.durationMs)}</span>
              )}
              {entry.costUsd != null && (
                <span className="text-terminal-muted">${entry.costUsd.toFixed(4)}</span>
              )}
              {entry.cachedInputTokens != null && entry.cachedInputTokens > 0 && (
                <span className="text-terminal-muted">
                  {t('transcription.log.cachedTokens', { count: entry.cachedInputTokens })}
                </span>
              )}
            </div>
            <p className={`mt-0.5 pl-4 leading-relaxed ${LEVEL_COLOR[entry.level] ?? 'text-terminal-ink'}`}>
              {entry.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
