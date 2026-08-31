import { Clock, Download, Loader2, PauseCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, type IconButtonSize } from '../ui';
import type { SourceActions } from './useSourceActions';
import type { LibraryCatalogEntry } from '../../types';

interface DownloadButtonProps {
  entry: LibraryCatalogEntry;
  actions: SourceActions;
  size?: IconButtonSize;
}

/**
 * Il comando di scaricamento, con lo stato del lavoro in corso — condiviso fra
 * la barra del catalogo, l'intestazione della scheda opera e la riga comandi
 * per-copia: mentre il lavoro gira il comando lo dice da sé (icona diversa),
 * niente pulsante spento senza motivo visibile.
 */
export function DownloadButton({ entry, actions, size = 'sm' }: DownloadButtonProps) {
  const { t } = useTranslation();
  const { busy, runningJob, jobState, summary } = actions;
  const icon = size === 'md' ? 15 : size === 'xs' ? 13 : 14;

  return (
    <IconButton
      size={size}
      onClick={() => void actions.startDownload()}
      disabled={!entry.manifestUrl || busy || Boolean(runningJob) || summary.availability === 'complete'}
      title={
        jobState === 'paused'
          ? t('areas.library.downloadPaused')
          : jobState === 'libraryLimits'
            ? t('jobs.waitingForLibrary')
            : jobState
              ? t('areas.library.downloadWaiting')
              : runningJob
                ? t('areas.library.downloadRunning')
                : t('areas.library.download')
      }
    >
      {jobState === 'paused' ? (
        <PauseCircle size={icon} />
      ) : jobState ? (
        <Clock size={icon} />
      ) : runningJob ? (
        <Loader2 size={icon} className="motion-safe:animate-spin" />
      ) : (
        <Download size={icon} />
      )}
    </IconButton>
  );
}
