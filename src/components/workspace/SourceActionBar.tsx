import type { ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  Eraser,
  Minimize2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CommandBar, Tooltip, type RowCommand } from '../ui';
import { downloadIconAndLabel } from './DownloadButton';
import type { SourceActions } from './useSourceActions';
import type { LibraryCatalogEntry } from '../../types';

interface SourceActionBarProps {
  entry: LibraryCatalogEntry;
  actions: SourceActions;
  size?: 'sm' | 'md';
  /**
   * `menu` raccoglie i comandi in un menu, per la tabella dove lo spazio è
   * poco; `inline` li mette in fila come icone, divisi in gruppi.
   */
  variant?: 'menu' | 'inline';
  /** Primo gruppo della fila, prima dei comandi sulle immagini (`inline`). */
  leading?: ReactNode;
}

/**
 * I comandi di un'opera nel catalogo: immagini (scarica, verifica, riduci,
 * libera spazio) e conservazione (archivia, elimina). Lo stato di uno
 * scaricamento in corso resta leggibile a colpo d'occhio.
 */
export function SourceActionBar({ entry, actions, size = 'sm', variant = 'menu', leading }: SourceActionBarProps) {
  const { t } = useTranslation();
  const { busy, runningJob, archived, summary } = actions;
  const hasLocalPages = entry.localPages > 0;
  const { icon: downloadIcon, label: downloadLabel } = downloadIconAndLabel(actions, 14, t);

  const imageCommands: RowCommand[] = [
    {
      key: 'download',
      icon: downloadIcon,
      label: downloadLabel,
      onClick: () => void actions.startDownload(),
      disabled: !entry.manifestUrl || busy || Boolean(runningJob) || summary.availability === 'complete',
    },
    {
      key: 'verify',
      icon: <ShieldCheck size={14} />,
      label: t('areas.library.verify'),
      onClick: () => void actions.verify(),
      disabled: busy || !hasLocalPages,
    },
    {
      key: 'optimise',
      icon: <Minimize2 size={14} />,
      label: t('areas.library.optimizeAction'),
      onClick: () => void actions.optimise(),
      disabled: busy || !hasLocalPages,
    },
    {
      key: 'freeSpace',
      icon: <Eraser size={14} />,
      label: t('areas.library.freeSpace'),
      onClick: () => void actions.freeSpace(),
      disabled: busy || !hasLocalPages,
    },
  ];
  const keepingCommands: RowCommand[] = [
    {
      key: 'archive',
      icon: archived ? <ArchiveRestore size={14} /> : <Archive size={14} />,
      label: archived ? t('areas.library.restore') : t('areas.library.archive'),
      onClick: () => void actions.toggleArchived(),
      disabled: busy,
    },
    {
      key: 'remove',
      icon: <Trash2 size={14} />,
      label: t('areas.library.remove'),
      onClick: () => void actions.askRemoval(),
      tone: 'danger',
    },
  ];

  // Solo l'avanzamento di uno scaricamento in corso: che le immagini siano sul
  // computer lo dice già la riga sotto il titolo.
  const progress = (
    <span className="mr-1 flex h-6 w-6 items-center justify-center text-xs text-editorial-muted">
      {runningJob && (
        <Tooltip label={t('areas.library.downloadRunning')} side="top">
          <span className="text-editorial-accent">{Math.round(runningJob.progress * 100)}%</span>
        </Tooltip>
      )}
    </span>
  );

  return (
    <CommandBar
      groups={[imageCommands, keepingCommands]}
      variant={variant}
      size={size}
      leading={leading}
      status={progress}
    />
  );
}
