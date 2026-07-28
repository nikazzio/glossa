import type { ComponentType } from 'react';
import { BookOpenText, Compass, LibraryBig } from 'lucide-react';
import { Icon as OfflineIcon } from '@iconify/react/offline';
import archiveResearch from '@iconify-icons/game-icons/archive-research';
import magnifyingGlass from '@iconify-icons/game-icons/magnifying-glass';
import quillInk from '@iconify-icons/game-icons/quill-ink';
import scrollUnfurled from '@iconify-icons/game-icons/scroll-unfurled';
import treasureMap from '@iconify-icons/game-icons/treasure-map';
import waxSeal from '@iconify-icons/game-icons/wax-seal';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../../types';
import { IconButton, Tooltip } from '../ui';
import { DEFAULT_WORKSPACE_ICON, isWorkspaceIconKey, WORKSPACE_ICON_KEYS, type WorkspaceIconKey } from '../../workspaceIdentity';

const GAME_ICONS: Partial<Record<WorkspaceIconKey, typeof archiveResearch>> = {
  manuscript: scrollUnfurled,
  quill: quillInk,
  archive: archiveResearch,
  map: treasureMap,
  lens: magnifyingGlass,
  seal: waxSeal,
};

const LUCIDE_ICONS: Partial<Record<WorkspaceIconKey, ComponentType<{ size?: number; className?: string }>>> = {
  book: BookOpenText,
  library: LibraryBig,
  compass: Compass,
};

export function WorkspaceIcon({ iconKey, size = 16, className }: {
  iconKey: WorkspaceIconKey | string | null | undefined;
  size?: number;
  className?: string;
}) {
  const key = isWorkspaceIconKey(iconKey) ? iconKey : DEFAULT_WORKSPACE_ICON;
  const gameIcon = GAME_ICONS[key];
  if (gameIcon) {
    return <OfflineIcon icon={gameIcon} width={size} height={size} className={className} aria-hidden="true" />;
  }
  const LucideIcon = LUCIDE_ICONS[key] ?? BookOpenText;
  return <LucideIcon size={size} className={className} aria-hidden="true" />;
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
        <span className={className} aria-label={workspace.name}>{icon}</span>
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
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
        {t('workspace.iconLabel')}
      </p>
      <div className="grid grid-cols-5 gap-1 border-y border-editorial-border/70 py-2 sm:grid-cols-9" role="group" aria-label={t('workspace.iconLabel')}>
        {WORKSPACE_ICON_KEYS.map((iconKey) => (
          <IconButton
            key={iconKey}
            size="md"
            tone={value === iconKey ? 'accent' : 'default'}
            onClick={() => onChange(iconKey)}
            title={t(`workspace.icons.${iconKey}`)}
            ariaPressed={value === iconKey}
            ariaLabel={t(`workspace.icons.${iconKey}`)}
          >
            <WorkspaceIcon iconKey={iconKey} size={15} />
          </IconButton>
        ))}
      </div>
    </div>
  );
}
