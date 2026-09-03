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
 * I comandi di un'opera nella riga del catalogo. Solo archivia e rimuovi
 * restano icone dirette — sono i due che si usano scorrendo l'elenco;
 * scarica/verifica/ottimizza/libera spazio vivono già, uguali, nella tab
 * Copie digitali della scheda, quindi qui stanno in un menu invece di
 * affollare la riga con comandi che servono solo quando si è aperto il
 * libro.
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
          siano sul computer lo dice già l'icona sotto il titolo, e dirlo due
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
        </div>
      </ClickPopover>

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
