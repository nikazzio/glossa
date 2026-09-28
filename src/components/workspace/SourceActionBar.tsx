import { Fragment, useState, type ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  Eraser,
  Minimize2,
  MoreVertical,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClickPopover, IconButton, MenuActionRow, Tooltip } from '../ui';
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

interface SourceCommand {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}

/**
 * I comandi di un'opera nel catalogo: immagini (scarica, verifica, riduci,
 * libera spazio) e conservazione (archivia, elimina). Lo stato di uno
 * scaricamento in corso resta leggibile a colpo d'occhio.
 */
export function SourceActionBar({ entry, actions, size = 'sm', variant = 'menu', leading }: SourceActionBarProps) {
  const { t } = useTranslation();
  const { busy, runningJob, archived, summary } = actions;
  const icon = size === 'sm' ? 13 : 15;
  const [menuOpen, setMenuOpen] = useState(false);
  const hasLocalPages = entry.localPages > 0;
  const { icon: downloadIcon, label: downloadLabel } = downloadIconAndLabel(actions, 14, t);

  const imageCommands: SourceCommand[] = [
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
  const keepingCommands: SourceCommand[] = [
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

  if (variant === 'inline') {
    const groups = [
      ...(leading ? [leading] : []),
      imageCommands.map((command) => <CommandButton key={command.key} command={command} size={size} />),
      keepingCommands.map((command) => <CommandButton key={command.key} command={command} size={size} />),
    ];
    return (
      <div className="flex shrink-0 items-center gap-1">
        {progress}
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 && <span className="mx-1 h-4 w-px bg-editorial-border" aria-hidden="true" />}
            {group}
          </Fragment>
        ))}
      </div>
    );
  }

  const menuRow = (command: SourceCommand) => (
    <MenuActionRow
      key={command.key}
      icon={command.icon}
      label={command.label}
      onClick={() => {
        setMenuOpen(false);
        command.onClick();
      }}
      disabled={command.disabled}
      tone={command.tone}
    />
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      {progress}
      <ClickPopover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        trigger={
          <IconButton size={size} title={t('areas.library.moreActions')} ariaPressed={menuOpen}>
            <MoreVertical size={icon} />
          </IconButton>
        }
      >
        <div className="min-w-44 py-1">
          {imageCommands.map(menuRow)}
          <div className="my-1 border-t border-editorial-border/70" />
          {keepingCommands.map(menuRow)}
        </div>
      </ClickPopover>
    </div>
  );
}

/** Neutro anche per eliminare: la conferma arriva dopo, e una fila di icone
 *  con una rossa in fondo attirerebbe l'occhio sul comando più raro. */
function CommandButton({ command, size }: { command: SourceCommand; size: 'sm' | 'md' }) {
  return (
    <IconButton
      size={size === 'sm' ? 'xs' : 'sm'}
      title={command.label}
      onClick={command.onClick}
      disabled={command.disabled}
    >
      {command.icon}
    </IconButton>
  );
}
