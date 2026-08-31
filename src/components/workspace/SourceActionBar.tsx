import { Archive, ArchiveRestore, Check, Eraser, Minimize2, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip } from '../ui';
import { DownloadButton } from './DownloadButton';
import type { SourceActions } from './useSourceActions';
import type { LibraryCatalogEntry } from '../../types';

interface SourceActionBarProps {
  entry: LibraryCatalogEntry;
  actions: SourceActions;
  size?: 'sm' | 'md';
}

/** I comandi di un'opera, identici nella riga del catalogo e nella sua scheda. */
export function SourceActionBar({ entry, actions, size = 'sm' }: SourceActionBarProps) {
  const { t } = useTranslation();
  const { busy, runningJob, archived, summary } = actions;
  const icon = size === 'sm' ? 13 : 15;

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="mr-1 flex h-6 w-6 items-center justify-center text-[11px] text-editorial-muted">
        {runningJob ? (
          <Tooltip label={t('areas.library.downloadRunning')} side="top">
            <span className="text-editorial-accent">{Math.round(runningJob.progress * 100)}%</span>
          </Tooltip>
        ) : summary.availability === 'complete' ? (
          <Tooltip label={t('areas.library.availabilityComplete')} side="top">
            <span aria-label={t('areas.library.availabilityComplete')}>
              <Check size={icon} />
            </span>
          </Tooltip>
        ) : null}
      </span>

      <DownloadButton entry={entry} actions={actions} size={size} />
      <IconButton
        size={size}
        onClick={() => void actions.verify()}
        disabled={busy || entry.localPages === 0}
        title={t('areas.library.verify')}
      >
        <ShieldCheck size={icon} />
      </IconButton>
      <IconButton
        size={size}
        onClick={() => void actions.optimise()}
        disabled={busy || entry.localPages === 0}
        title={t('areas.library.optimizeAction')}
      >
        <Minimize2 size={icon} />
      </IconButton>
      <IconButton
        size={size}
        onClick={() => void actions.freeSpace()}
        disabled={busy || entry.localPages === 0}
        title={t('areas.library.freeSpace')}
      >
        <Eraser size={icon} />
      </IconButton>
      <IconButton
        size={size}
        tone={archived ? 'accent' : 'default'}
        ariaPressed={archived}
        disabled={busy}
        onClick={() => void actions.toggleArchived()}
        title={archived ? t('areas.library.restore') : t('areas.library.archive')}
      >
        {archived ? <ArchiveRestore size={icon} /> : <Archive size={icon} />}
      </IconButton>
      <IconButton
        size={size}
        tone="danger"
        onClick={() => void actions.askRemoval()}
        title={t('areas.library.remove')}
      >
        <Trash2 size={icon} />
      </IconButton>
    </div>
  );
}
