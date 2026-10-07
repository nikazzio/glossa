import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { useState } from 'react';
import { HelpCircle, Library, Save, Settings, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useChunksStore } from '../../stores/chunksStore';
import { IconButton, SectionLabel, Tooltip } from '../ui';

/**
 * Multibar shell — superfici di navigazione laterali (home e progetto).
 * Item attivo: velatura appena percepibile, nome in accento e cerchietto
 * bordato in accento; niente barretta verticale.
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
    // Un filetto apre ogni gruppo. Da chiusa resta solo quello: il titolo a
    // icona sembrava una voce e non portava da nessuna parte.
    <div role="group" aria-label={label} className="mt-2 px-2.5">
      <div className="border-t border-rule" />
      {!collapsed ? (
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-2">
          <SectionLabel icon={Icon} label={label} />
          {action}
        </div>
      ) : (
        <div className="pt-2" />
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * Menu generale in fondo alla barra di sinistra: salva, risorse linguistiche,
 * impostazioni, guida e lingua dell'interfaccia. Sempre raggiungibile, anche
 * senza workspace; a barra chiusa i comandi si mettono in colonna.
 */
export function ShellNavFooter({ collapsed = false }: { collapsed?: boolean }) {
  const { t, i18n } = useTranslation();
  const setShowSettings = useUiStore((state) => state.setShowSettings);
  const setShowHelp = useUiStore((state) => state.setShowHelp);
  const { currentProjectId, saveCurrentProject } = useProjectStore(
    useShallow((s) => ({ currentProjectId: s.currentProjectId, saveCurrentProject: s.saveCurrentProject })),
  );
  const { dirtyIdsLength, saveAllDirty, setShowLibraryPanel } = useLibraryStore(
    useShallow((s) => ({ dirtyIdsLength: s.dirtyIds.length, saveAllDirty: s.saveAllDirty, setShowLibraryPanel: s.setShowLibraryPanel })),
  );
  const isProcessing = useChunksStore((s) => s.isProcessing);
  const [savingAll, setSavingAll] = useState(false);

  const handleSave = async () => {
    if (savingAll) return;
    const shouldSaveProject = Boolean(currentProjectId) && !isProcessing;
    const shouldSaveLibrary = dirtyIdsLength > 0;
    const projectDeferred = Boolean(currentProjectId) && isProcessing;
    if (!shouldSaveProject && !shouldSaveLibrary) {
      toast[projectDeferred ? 'warning' : 'success'](
        t(projectDeferred ? 'header.projectSaveDeferred' : 'header.nothingToSave'),
      );
      return;
    }
    setSavingAll(true);
    const errors: unknown[] = [];
    try {
      if (shouldSaveProject) {
        try { await saveCurrentProject(); } catch (err) { errors.push(err); }
      }
      if (shouldSaveLibrary) {
        try { await saveAllDirty(); } catch (err) { errors.push(err); }
      }
      if (errors.length > 0) throw errors[0];
      toast[projectDeferred ? 'warning' : 'success'](
        t(projectDeferred ? 'header.savedLibraryProjectDeferred' : 'header.savedAll'),
      );
    } catch (err) {
      toast.error(t('header.globalSaveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingAll(false);
    }
  };

  const toggleLang = () => i18n.changeLanguage(i18n.language === 'en' ? 'it' : 'en');

  // Aperta i comandi stanno in fila: un suggerimento laterale coprirebbe i
  // vicini, quindi sta sopra. Chiusa sono in colonna, e il lato giusto è destra.
  const tooltipSide = collapsed ? ('right' as const) : ('top' as const);

  return (
    <nav
      aria-label={t('sidebar.generalMenu')}
      className={`flex shrink-0 border-t border-rule ${
        collapsed ? 'flex-col items-center gap-1 py-2.5' : 'items-center gap-0.5 px-3 py-2.5'
      }`}
    >
      <IconButton
        size="md"
        tone={savingAll ? 'running' : 'muted'}
        onClick={() => void handleSave()}
        title={`${t('header.saveAll')} (Ctrl+S)`}
        ariaLabel={t('header.saveAll')}
        tooltipSide={tooltipSide}
        aria-busy={savingAll}
      >
        <Save size={15} />
      </IconButton>
      <IconButton
        size="md"
        tone="muted"
        onClick={() => setShowLibraryPanel(true, undefined, 'global')}
        title={t('library.openLibraryGlobal')}
        tooltipSide={tooltipSide}
      >
        <Library size={15} />
      </IconButton>
      <IconButton
        size="md"
        tone="muted"
        onClick={() => setShowSettings(true)}
        title={t('header.settings')}
        tooltipSide={tooltipSide}
      >
        <Settings size={15} />
      </IconButton>
      <IconButton
        size="md"
        tone="muted"
        onClick={() => setShowHelp(true)}
        title={`${t('help.title')} (Ctrl+H)`}
        ariaLabel={t('help.title')}
        tooltipSide={tooltipSide}
      >
        <HelpCircle size={15} />
      </IconButton>
      <IconButton
        size="md"
        tone="muted"
        onClick={() => void toggleLang()}
        title={`${t('language.label')} (${i18n.language === 'it' ? 'IT → EN' : 'EN → IT'})`}
        ariaLabel={t('language.label')}
        tooltipSide={tooltipSide}
      >
        {/* Quadrato come le icone accanto: il pulsante resta un cerchio. */}
        <span className="inline-flex h-[15px] w-[15px] select-none items-center justify-center font-sans text-caption font-semibold leading-none">
          {i18n.language.toUpperCase()}
        </span>
      </IconButton>
    </nav>
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
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  ariaCurrent?: 'page';
  role?: 'tab';
  ariaSelected?: boolean;
  ariaControls?: string;
  id?: string;
  /** Roving tabindex per i pattern tablist: 0 sull'item attivo, -1 sugli altri. */
  tabIndex?: number;
  buttonRef?: Ref<HTMLButtonElement>;
  trailing?: ReactNode;
  /** Perché la voce è spenta: nel suggerimento, come per i comandi a icona. */
  disabledReason?: string | null;
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
  onKeyDown,
  ariaCurrent,
  role,
  ariaSelected,
  ariaControls,
  id,
  tabIndex,
  buttonRef,
  trailing,
  disabledReason = null,
}: ShellNavItemProps) {
  const shownReason = disabled ? disabledReason : null;
  // La spiegazione della voce sta nel suggerimento, come in tutta l'app; da
  // chiusa il suggerimento porta anche il nome.
  const tooltip = [collapsed ? label : null, hint, shownReason].filter(Boolean).join(' — ');
  const labelClassName = labelFont === 'display' ? 'font-display text-sm italic' : 'font-sans text-sm';

  // Scelta sobria: una velatura appena percepibile e il nome in accento; il
  // cerchietto dell'icona, bordato in accento, dice il resto.
  const toneClassName = active
    ? collapsed ? 'text-editorial-accent' : 'bg-editorial-accent/6 text-editorial-accent'
    : disabled
      ? 'text-editorial-muted opacity-50'
      : 'text-editorial-muted hover:bg-editorial-textbox/30 hover:text-editorial-accent';

  const button = (
    <button
      type="button"
      id={id}
      ref={buttonRef}
      onClick={onClick}
      onKeyDown={onKeyDown}
      disabled={disabled}
      aria-current={ariaCurrent}
      role={role}
      aria-selected={role === 'tab' ? ariaSelected : undefined}
      aria-controls={ariaControls}
      tabIndex={tabIndex}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] py-2 text-left text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
        collapsed ? 'justify-center px-0' : 'px-2.5'
      } ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
      {collapsed ? (
        <span className="sr-only">{[label, hint, shownReason].filter(Boolean).join(' — ')}</span>
      ) : (
        <span className={`min-w-0 flex-1 truncate ${labelClassName}`}>{label}</span>
      )}
    </button>
  );

  return (
    <div className={`group relative flex w-full items-center rounded-[12px] transition-colors duration-150 ${toneClassName}`}>
      {tooltip ? (
        <Tooltip label={tooltip} side="right" className="w-full">
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
