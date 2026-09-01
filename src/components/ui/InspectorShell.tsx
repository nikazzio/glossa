import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { IconButton } from './IconButton';
import { TabButton } from './TabButton';

export interface InspectorTab {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}

interface InspectorShellProps {
  ariaLabel: string;
  tabs: InspectorTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Lato destro della barra tab: azioni proprie del pannello (comandi,
   *  etichetta della tab attiva) — ognuno dei due usi ci mette la sua. */
  actions?: ReactNode;
  /**
   * Falso solo quando `children` porta già, da sé, un wrapper con `id`/
   * `role="tabpanel"` per tab (un contenuto con più tab proprie, come i tab
   * del documento) — evita un id duplicato. Di norma resta vero: senza,
   * `aria-controls` dei bottoni tab punterebbe a un id che non esiste.
   */
  ownsPanelSemantics?: boolean;
  /** Icona ed etichetta del pannello, mostrate sopra la barra tab (es.
   *  "Insight", "Informazioni sull'opera"). Assenti, l'intestazione con
   *  collassa/espandi non compare: non tutti gli usi la vogliono. */
  panelIcon?: ReactNode;
  panelLabel?: string;
  /** Il pannello è compresso a una striscia sottile, solo il comando per
   *  riaprirlo. La larghezza fisica del riquadro (react-resizable-panels)
   *  resta a carico di chi monta questo componente. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Altri comandi nell'intestazione, accanto a collassa/espandi (es. chiudi
   *  la scheda) — solo quando c'è un'intestazione (`panelLabel` presente). */
  headerActions?: ReactNode;
  children: ReactNode;
}

/**
 * Guscio comune per una colonna a tab: intestazione con tablist a roving
 * tabindex più un'area comandi a destra, corpo scorrevole sotto. Nato per
 * essere condiviso fra il pannello Insight della traduzione e la scheda
 * opera in Biblioteca, così restano visivamente uguali e un domani si può
 * aggiungere una tab senza reinventare la barra.
 */
export function InspectorShell({
  ariaLabel,
  tabs,
  activeTab,
  onTabChange,
  actions,
  ownsPanelSemantics = true,
  panelIcon,
  panelLabel,
  collapsed = false,
  onCollapsedChange,
  headerActions,
  children,
}: InspectorShellProps) {
  const { t } = useTranslation();
  const tabButtonRefs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const hasHeader = panelLabel !== undefined;

  if (hasHeader && collapsed) {
    return (
      <div className="flex h-full flex-col items-center">
        <div className="flex h-20 w-full shrink-0 items-center justify-center">
          <IconButton
            size="md"
            tone="muted"
            onClick={() => onCollapsedChange?.(false)}
            title={t('sidebar.expand')}
            tooltipSide="left"
          >
            <PanelRightOpen size={14} />
          </IconButton>
        </div>
      </div>
    );
  }

  const activate = (id: string) => {
    onTabChange(id);
    tabButtonRefs.current[id]?.focus();
  };

  // Le freccie/Home/End saltano le tab disattivate: possono ricevere il
  // focus (si sa che esistono) ma non diventare mai quella selezionata.
  const nextEnabledTab = (start: number, step: number): InspectorTab => {
    const total = tabs.length;
    for (let offset = 1; offset <= total; offset += 1) {
      const candidate = tabs[(start + step * offset + total) % total];
      if (!candidate.disabled) return candidate;
    }
    return tabs[start];
  };

  const handleKeyDown = (id: string, event: KeyboardEvent<HTMLButtonElement>) => {
    const idx = tabs.findIndex((tab) => tab.id === id);
    let next: InspectorTab | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = nextEnabledTab(idx, -1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = nextEnabledTab(idx, 1);
    else if (event.key === 'Home') next = tabs[0].disabled ? nextEnabledTab(-1, 1) : tabs[0];
    else if (event.key === 'End') {
      const lastIdx = tabs.length - 1;
      next = tabs[lastIdx].disabled ? nextEnabledTab(lastIdx, -1) : tabs[lastIdx];
    }
    if (next) {
      event.preventDefault();
      activate(next.id);
    }
  };

  return (
    <div className="flex h-full flex-col" role="region" aria-label={ariaLabel}>
      {hasHeader && (
        <div className="flex h-20 shrink-0 items-center gap-3 border-b border-editorial-border px-3">
          <IconButton
            size="md"
            tone="muted"
            onClick={() => onCollapsedChange?.(true)}
            title={t('sidebar.collapse')}
            tooltipSide="bottom"
          >
            <PanelRightClose size={14} />
          </IconButton>
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-editorial-accent">
            {panelIcon}
            <span className="truncate">{panelLabel}</span>
          </span>
          {headerActions && <div className="ml-auto flex shrink-0 items-center gap-1">{headerActions}</div>}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 border-b border-editorial-border bg-editorial-bg/60 px-3 py-2">
        <div role="tablist" aria-orientation="horizontal" aria-label={ariaLabel} className="flex flex-1 items-center gap-1">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              buttonId={`inspector-tab-button-${tab.id}`}
              active={activeTab === tab.id}
              disabled={tab.disabled}
              onClick={() => activate(tab.id)}
              onKeyDown={(event) => handleKeyDown(tab.id, event)}
              label={tab.label}
              icon={tab.icon}
              controls={`inspector-tab-panel-${tab.id}`}
              buttonRef={(el) => { tabButtonRefs.current[tab.id] = el; }}
            />
          ))}
        </div>
        {actions}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar">
        {ownsPanelSemantics ? (
          <div
            id={`inspector-tab-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`inspector-tab-button-${activeTab}`}
            className="flex min-h-0 flex-1 flex-col"
          >
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
