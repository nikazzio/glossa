import { Archive, ArchiveRestore, Download, Link2, Tags, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../ui';
import { ListPicker } from './ListPicker';
import type { SourceCollection, Workspace } from '../../types';

/**
 * I comandi che valgono per tutte le opere scelte: raccolta, workspace,
 * scaricamento, archivio. Compare sopra l'elenco finché la scelta non è vuota;
 * Esc o la croce la svuotano.
 */
export function LibrarySelectionBar({
  count,
  allArchived,
  collections,
  workspaces,
  onAddToCollection,
  onCreateCollection,
  onLinkWorkspace,
  onDownload,
  onSetArchived,
  onClear,
}: {
  count: number;
  allArchived: boolean;
  collections: SourceCollection[];
  workspaces: Workspace[];
  onAddToCollection: (collectionId: string) => void;
  onCreateCollection: (name: string) => void;
  onLinkWorkspace: (workspaceId: string) => void;
  onDownload: () => void;
  onSetArchived: (archived: boolean) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div role="toolbar" aria-label={t('areas.library.selection.label')}
      className="flex items-center gap-1 border-b border-editorial-accent/40 bg-editorial-accent/5 px-5 py-1.5 md:px-6">
      <span className="mr-2 text-xs font-semibold text-editorial-accent">
        {t('areas.library.selection.count', { count })}
      </span>
      <ListPicker size="sm" icon={<Tags size={14} />} title={t('areas.library.selection.addToCollection')}
        items={collections.map((collection) => ({ id: collection.id, label: collection.name }))}
        onPick={onAddToCollection}
        create={{ placeholder: t('areas.library.shelves.newCollection'), onCreate: onCreateCollection }} />
      <ListPicker size="sm" icon={<Link2 size={14} />} title={t('areas.library.selection.linkToWorkspace')}
        items={workspaces.map((workspace) => ({ id: workspace.id, label: workspace.name }))}
        onPick={onLinkWorkspace} />
      <IconButton size="sm" title={t('areas.library.selection.download')} onClick={onDownload}>
        <Download size={14} />
      </IconButton>
      <IconButton size="sm" title={allArchived ? t('areas.library.selection.restore') : t('areas.library.selection.archive')}
        onClick={() => onSetArchived(!allArchived)}>
        {allArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
      </IconButton>
      <span className="flex-1" />
      <IconButton size="sm" title={t('areas.library.selection.clear')} onClick={onClear}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
