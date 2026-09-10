import { type ReactNode } from 'react';
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

/** Icona ed etichetta del comando di scaricamento secondo lo stato del
 *  lavoro — condivise fra il pulsante a sé (scheda opera, riga comandi
 *  per-copia) e la voce di menu della riga del catalogo, che allo stesso
 *  stato deve dire la stessa cosa. */
export function downloadIconAndLabel(
  actions: Pick<SourceActions, 'runningJob' | 'jobState'>,
  iconSize: number,
  t: (key: string) => string,
): { icon: ReactNode; label: string } {
  const { runningJob, jobState } = actions;
  return {
    icon:
      jobState === 'paused' ? (
        <PauseCircle size={iconSize} />
      ) : jobState ? (
        <Clock size={iconSize} />
      ) : runningJob ? (
        <Loader2 size={iconSize} className="motion-safe:animate-spin" />
      ) : (
        <Download size={iconSize} />
      ),
    label:
      jobState === 'paused'
        ? t('areas.library.downloadPaused')
        : jobState === 'libraryLimits'
          ? t('jobs.waitingForLibrary')
          : jobState
            ? t('areas.library.downloadWaiting')
            : runningJob
              ? t('areas.library.downloadRunning')
              : t('areas.library.download'),
  };
}

/**
 * Il comando di scaricamento, con lo stato del lavoro in corso — usato nella
 * scheda opera e nella riga comandi per-copia: mentre il lavoro gira il
 * comando lo dice da sé (icona diversa), niente pulsante spento senza
 * motivo visibile.
 */
export function DownloadButton({ entry, actions, size = 'sm' }: DownloadButtonProps) {
  const { t } = useTranslation();
  const { busy, runningJob, summary } = actions;
  const iconSize = size === 'md' ? 15 : size === 'xs' ? 13 : 14;
  const { icon, label } = downloadIconAndLabel(actions, iconSize, t);

  return (
    <IconButton
      size={size}
      onClick={() => void actions.startDownload()}
      disabled={!entry.manifestUrl || busy || Boolean(runningJob) || summary.availability === 'complete'}
      title={label}
    >
      {icon}
    </IconButton>
  );
}
