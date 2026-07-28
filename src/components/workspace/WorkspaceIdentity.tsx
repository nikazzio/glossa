import { Icon as OfflineIcon } from '@iconify/react/offline';
import anchor from '@iconify-icons/game-icons/anchor';
import archiveResearch from '@iconify-icons/game-icons/archive-research';
import bookmark from '@iconify-icons/game-icons/bookmark';
import curledLeaf from '@iconify-icons/game-icons/curled-leaf';
import feather from '@iconify-icons/game-icons/feather';
import hourglass from '@iconify-icons/game-icons/hourglass';
import magnifyingGlass from '@iconify-icons/game-icons/magnifying-glass';
import mermaid from '@iconify-icons/game-icons/mermaid';
import openBook from '@iconify-icons/game-icons/open-book';
import quillInk from '@iconify-icons/game-icons/quill-ink';
import scrollQuill from '@iconify-icons/game-icons/scroll-quill';
import scrollUnfurled from '@iconify-icons/game-icons/scroll-unfurled';
import tiedScroll from '@iconify-icons/game-icons/tied-scroll';
import waxSeal from '@iconify-icons/game-icons/wax-seal';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../../types';
import { FieldLabel, IconButton, Tooltip } from '../ui';
import { DEFAULT_WORKSPACE_ICON, isWorkspaceIconKey, WORKSPACE_ICON_KEYS, type WorkspaceIconKey } from '../../workspaceIdentity';

const GAME_ICONS: Partial<Record<WorkspaceIconKey, typeof archiveResearch>> = {
  manuscript: scrollUnfurled,
  book: openBook,
  quill: quillInk,
  archive: archiveResearch,
  library: tiedScroll,
  lens: magnifyingGlass,
  seal: waxSeal,
  bookmark,
  feather,
  hourglass,
  leaf: curledLeaf,
  anchor,
  siren: mermaid,
  scrollQuill,
};

export function WorkspaceIcon({ iconKey, size = 16, className }: {
  iconKey: WorkspaceIconKey | string | null | undefined;
  size?: number;
  className?: string;
}) {
  const key = isWorkspaceIconKey(iconKey) ? iconKey : DEFAULT_WORKSPACE_ICON;
  return <OfflineIcon icon={GAME_ICONS[key] ?? openBook} width={size} height={size} className={className} aria-hidden="true" />;
}

export { DEFAULT_WORKSPACE_ICON, isWorkspaceIconKey, WORKSPACE_ICON_KEYS, type WorkspaceIconKey } from '../../workspaceIdentity';

type WorkspaceIdentityProps = {
  workspace: Pick<Workspace, 'name' | 'iconKey'>;
  iconSize?: number;
  className?: string;
  iconOnly?: boolean;
};

/** Segno persistente del workspace. Nelle liste dove il nome è già vicino resta solo l'icona con tooltip. */
export function WorkspaceIdentity({ workspace, iconSize = 15, className, iconOnly = false }: WorkspaceIdentityProps) {
  const icon = <WorkspaceIcon iconKey={workspace.iconKey} size={iconSize} className="shrink-0" />;
  if (iconOnly) {
    return (
      <Tooltip label={workspace.name} side="top">
        <span className={className} aria-label={workspace.name}>
          {icon}
          <span className="sr-only">{workspace.name}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <span className={className}>
      {icon}
      <span className="truncate">{workspace.name}</span>
    </span>
  );
}

export function WorkspaceIconPicker({ value, onChange }: {
  value: WorkspaceIconKey;
  onChange: (iconKey: WorkspaceIconKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <FieldLabel icon={<WorkspaceIcon iconKey={value} size={12} className="shrink-0 text-editorial-accent" />}>
        {t('workspace.iconLabel')}
      </FieldLabel>
      <div className="grid grid-cols-4 gap-1.5 border-y border-editorial-border/70 py-3 sm:grid-cols-7" role="group" aria-label={t('workspace.iconLabel')}>
        {WORKSPACE_ICON_KEYS.map((iconKey) => (
          <IconButton
            key={iconKey}
            size="lg"
            tone={value === iconKey ? 'accent' : 'default'}
            onClick={() => onChange(iconKey)}
            title={t(`workspace.icons.${iconKey}`)}
            ariaPressed={value === iconKey}
            ariaLabel={t(`workspace.icons.${iconKey}`)}
          >
            <WorkspaceIcon iconKey={iconKey} size={20} />
          </IconButton>
        ))}
      </div>
    </div>
  );
}
