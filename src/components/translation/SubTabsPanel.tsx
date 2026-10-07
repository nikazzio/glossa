import type { ReactNode } from 'react';
import { TabStrip, type TabStripItem } from '../ui';

interface SubTabsPanelProps {
  /** Identità della linguetta della colonna che contiene queste sottolinguette. */
  panelId: string;
  labelledBy: string;
  tabs: TabStripItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  idPrefix: string;
  /** Nome della sottolinguetta aperta, mostrato accanto alle icone. */
  activeName: string;
  /** Falso quando il contenuto scorre da sé (barra fissa sopra un elenco):
   *  un'area che scorre sola per colonna. */
  bodyScrolls?: boolean;
  children: ReactNode;
}

/**
 * Una linguetta della colonna che ne raccoglie altre: fila di sottolinguette a
 * icona ferma in cima, con il nome di quella aperta accanto, e sotto un solo
 * elenco che scorre. Il contenuto porta `role="tabpanel"` con
 * `<idPrefix>-panel-<id>`.
 */
export function SubTabsPanel({
  panelId,
  labelledBy,
  tabs,
  activeId,
  onChange,
  ariaLabel,
  idPrefix,
  activeName,
  bodyScrolls = true,
  children,
}: SubTabsPanelProps) {
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-rule px-3 py-2">
        <TabStrip tabs={tabs} activeId={activeId} onChange={onChange} ariaLabel={ariaLabel} idPrefix={idPrefix} />
        <span className="min-w-0 flex-1 truncate text-right font-display text-sm italic text-editorial-ink">
          {activeName}
        </span>
      </div>
      <div className={`flex min-h-0 flex-1 flex-col ${bodyScrolls ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}>
        {children}
      </div>
    </div>
  );
}

/** Identificativi della sottolinguetta e del suo contenuto. */
export function subTabIds(idPrefix: string, id: string): { tabId: string; panelId: string } {
  return { tabId: `${idPrefix}-tab-${id}`, panelId: `${idPrefix}-panel-${id}` };
}
