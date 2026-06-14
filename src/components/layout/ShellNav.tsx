import type { ReactNode } from 'react';
import { HelpCircle, Settings, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { IconButton, SectionLabel, Tooltip } from '../ui';

/**
 * Multibar shell — superfici di navigazione laterali (home e progetto).
 * Item attivo: barra accent verticale + tint leggero + testo accent.
 * Niente linguetta flottante: la selezione resta contenuta nella colonna.
 */

interface ShellNavSectionProps {
  icon: LucideIcon;
  label: string;
  action?: ReactNode;
  collapsed?: boolean;
  children: ReactNode;
}

export function ShellNavSection({ icon: Icon, label, action, collapsed = false, children }: ShellNavSectionProps) {
  return (
    <div className="px-2.5">
      {!collapsed ? (
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5 pt-3">
          <SectionLabel icon={Icon} label={label} />
          {action}
        </div>
      ) : (
        // Da collassata resta l'icona della sezione (header stabile): niente salto verticale.
        <div className="flex justify-center pb-1.5 pt-3">
          <Tooltip label={label} side="right">
            <Icon size={13} className="text-editorial-muted/70" aria-hidden="true" />
          </Tooltip>
        </div>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** Footer barra: azioni app-level (impostazioni, aiuto) ancorate in basso. */
export function ShellNavFooter({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const setShowSettings = useUiStore((state) => state.setShowSettings);
  const setShowHelp = useUiStore((state) => state.setShowHelp);

  return (
    <div
      className={`mt-auto flex border-t border-editorial-border/50 ${
        collapsed ? 'flex-col items-center gap-1.5 py-2.5' : 'items-center gap-1 px-3 py-2.5'
      }`}
    >
      <IconButton
        size="md"
        tone="muted"
        onClick={() => setShowSettings(true)}
        title={t('header.settings')}
        tooltipSide="right"
      >
        <Settings size={15} />
      </IconButton>
      <IconButton
        size="md"
        tone="muted"
        onClick={() => setShowHelp(true)}
        title={`${t('help.title')} (Ctrl+H)`}
        ariaLabel={t('help.title')}
        tooltipSide="right"
      >
        <HelpCircle size={15} />
      </IconButton>
    </div>
  );
}

interface ShellNavItemProps {
  icon: ReactNode;
  label: string;
  hint?: string;
  labelFont?: 'sans' | 'display';
  active: boolean;
  disabled?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
  ariaCurrent?: 'page';
  role?: 'tab';
  ariaSelected?: boolean;
  ariaControls?: string;
  id?: string;
  trailing?: ReactNode;
}

export function ShellNavItem({
  icon,
  label,
  hint,
  labelFont = 'sans',
  active,
  disabled = false,
  collapsed = false,
  onClick,
  ariaCurrent,
  role,
  ariaSelected,
  ariaControls,
  id,
  trailing,
}: ShellNavItemProps) {
  const labelClassName = labelFont === 'display' ? 'font-display text-sm italic' : 'font-sans text-sm';

  const toneClassName = active
    ? 'bg-editorial-accent/10 text-editorial-accent'
    : disabled
      ? 'text-editorial-muted opacity-50'
      : 'text-editorial-muted hover:bg-editorial-textbox/30 hover:text-editorial-accent';

  const button = (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled}
      aria-current={ariaCurrent}
      role={role}
      aria-selected={role === 'tab' ? ariaSelected : undefined}
      aria-controls={ariaControls}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] py-2 text-left text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
        collapsed ? 'justify-center px-0' : 'px-2.5'
      } ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
      {collapsed ? (
        <span className="sr-only">{hint ? `${label} ${hint}` : label}</span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${labelClassName}`}>{label}</span>
          {hint ? <span className="mt-0.5 block truncate text-[11px] text-editorial-muted">{hint}</span> : null}
        </span>
      )}
    </button>
  );

  return (
    <div className={`group relative flex w-full items-center rounded-[12px] transition-colors duration-150 ${toneClassName}`}>
      {active && !collapsed ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-editorial-accent"
        />
      ) : null}
      {collapsed ? (
        <Tooltip label={hint ? `${label} — ${hint}` : label} side="right" className="w-full">
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {!collapsed && trailing ? (
        <div className="flex shrink-0 items-center gap-0.5 pr-1.5">{trailing}</div>
      ) : null}
    </div>
  );
}
