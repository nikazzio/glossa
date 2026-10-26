import type { ReactNode } from 'react';
import { TabStrip, type TabStripItem } from '../ui';

/**
 * Una scheda delle impostazioni divisa in sotto-linguette: fila icona con il
 * nome della linguetta aperta accanto, filetto sotto, pannello collegato.
 * La stessa forma in Aspetto, Biblioteca, Modelli e Dati.
 */
export function SettingsSubTabs({
  tabId,
  ariaLabel,
  tabs,
  activeId,
  onChange,
  children,
}: {
  /** Linguetta della finestra che contiene queste: dà gli identificativi. */
  tabId: string;
  ariaLabel: string;
  tabs: TabStripItem[];
  activeId: string;
  onChange: (id: string) => void;
  children: ReactNode;
}) {
  const idPrefix = `settings-${tabId}`;
  return (
    <div id={`settings-panel-${tabId}`} role="tabpanel" aria-labelledby={`settings-tab-${tabId}`} className="space-y-6">
      <div className="flex items-center gap-3">
        <TabStrip tabs={tabs} activeId={activeId} onChange={onChange} ariaLabel={ariaLabel} idPrefix={idPrefix} />
        <span className="font-display text-sm italic text-editorial-ink">
          {tabs.find((tab) => tab.id === activeId)?.label}
        </span>
      </div>
      <div id={`${idPrefix}-panel-${activeId}`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${activeId}`} className="space-y-10">
        {children}
      </div>
    </div>
  );
}
