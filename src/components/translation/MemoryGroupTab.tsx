import { Database, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TranslationChunk } from '../../types';
import type { TabStripItem } from '../ui';
import { MemoryTab } from '../document/tabs/MemoryTab';
import { ReferencesTab } from '../document/tabs/ReferencesTab';
import { SubTabsPanel, subTabIds } from './SubTabsPanel';

export type MemoryView = 'references' | 'memory';

const MEMORY_ID_PREFIX = 'phrase-memory';

interface MemoryGroupTabProps {
  panelId: string;
  labelledBy: string;
  view: MemoryView;
  onViewChange: (view: MemoryView) => void;
  currentChunk: TranslationChunk | null;
}

/**
 * La memoria di frasi del frammento: le frasi simili già in memoria, da usare
 * traducendo, e l'estrazione delle frasi del frammento per salvarle. Due
 * sottolinguette; l'estrazione si accende a traduzione verificata: in memoria
 * vanno solo frasi controllate.
 */
export function MemoryGroupTab({ panelId, labelledBy, view, onViewChange, currentChunk }: MemoryGroupTabProps) {
  const { t } = useTranslation();
  const extractOff = currentChunk?.translationLocked !== true;
  const shownView: MemoryView = view === 'memory' && extractOff ? 'references' : view;

  const names: Record<MemoryView, string> = {
    references: t('memory.referencesMemorySectionTitle'),
    memory: t('memory.extractButton'),
  };
  const tabs: TabStripItem[] = [
    { id: 'references', label: names.references, icon: <Layers size={16} /> },
    {
      id: 'memory',
      label: extractOff ? `${names.memory} — ${t('memory.reasonNotVerified')}` : names.memory,
      icon: <Database size={16} />,
      disabled: extractOff,
    },
  ];
  const ids = subTabIds(MEMORY_ID_PREFIX, shownView);

  return (
    <SubTabsPanel
      panelId={panelId}
      labelledBy={labelledBy}
      tabs={tabs}
      activeId={shownView}
      onChange={(id) => onViewChange(id as MemoryView)}
      ariaLabel={t('document.insightsTabMemory')}
      idPrefix={MEMORY_ID_PREFIX}
      activeName={names[shownView]}
      bodyScrolls={false}
    >
      {shownView === 'memory' ? (
        <MemoryTab panelId={ids.panelId} labelledBy={ids.tabId} currentChunk={currentChunk} />
      ) : (
        <ReferencesTab panelId={ids.panelId} labelledBy={ids.tabId} currentChunk={currentChunk} />
      )}
    </SubTabsPanel>
  );
}
