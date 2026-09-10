import { useState } from 'react';
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
}

/**
 * I comandi di un'opera nella riga del catalogo. Restano raccolti in un solo
 * menu: archiviare o rimuovere non sono azioni da ripetere visivamente su ogni
 * riga, mentre lo stato dello scaricamento resta leggibile a colpo d'occhio.
 */
export function SourceActionBar({ entry, actions, size = 'sm' }: SourceActionBarProps) {
  const { t } = useTranslation();
  const { busy, runningJob, archived, summary } = actions;
  const icon = size === 'sm' ? 13 : 15;
  const [menuOpen, setMenuOpen] = useState(false);
  const hasLocalPages = entry.localPages > 0;
  const { icon: downloadIcon, label: downloadLabel } = downloadIconAndLabel(actions, 14, t);

  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* Solo l'avanzamento di uno scaricamento in corso: che le immagini
          siano sul computer lo dice già la riga sotto il titolo, e dirlo due
          volte sulla stessa riga non aggiunge niente. */}
      <span className="mr-1 flex h-6 w-6 items-center justify-center text-[11px] text-editorial-muted">
        {runningJob && (
          <Tooltip label={t('areas.library.downloadRunning')} side="top">
            <span className="text-editorial-accent">{Math.round(runningJob.progress * 100)}%</span>
          </Tooltip>
        )}
      </span>

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
          <MenuActionRow
            icon={downloadIcon}
            label={downloadLabel}
            onClick={() => { setMenuOpen(false); void actions.startDownload(); }}
            disabled={!entry.manifestUrl || busy || Boolean(runningJob) || summary.availability === 'complete'}
          />
          <MenuActionRow
            icon={<ShieldCheck size={14} />}
            label={t('areas.library.verify')}
            onClick={() => { setMenuOpen(false); void actions.verify(); }}
            disabled={busy || !hasLocalPages}
          />
          <MenuActionRow
            icon={<Minimize2 size={14} />}
            label={t('areas.library.optimizeAction')}
            onClick={() => { setMenuOpen(false); void actions.optimise(); }}
            disabled={busy || !hasLocalPages}
          />
          <MenuActionRow
            icon={<Eraser size={14} />}
            label={t('areas.library.freeSpace')}
            onClick={() => { setMenuOpen(false); void actions.freeSpace(); }}
            disabled={busy || !hasLocalPages}
          />
          <div className="my-1 border-t border-editorial-border/70" />
          <MenuActionRow
            icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            label={archived ? t('areas.library.restore') : t('areas.library.archive')}
            onClick={() => {
              setMenuOpen(false);
              void actions.toggleArchived();
            }}
            disabled={busy}
          />
          <MenuActionRow
            icon={<Trash2 size={14} />}
            label={t('areas.library.remove')}
            onClick={() => {
              setMenuOpen(false);
              void actions.askRemoval();
            }}
            tone="danger"
          />
        </div>
      </ClickPopover>
    </div>
  );
}
