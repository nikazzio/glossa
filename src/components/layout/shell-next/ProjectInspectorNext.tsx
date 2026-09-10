import { useUiStore } from '../../../stores/uiStore';
import { DocumentInsightTabs } from '../../document/InsightsDrawer';

/**
 * Shell nuova (#291, #296) — ispettore destro.
 * Solo Insight (documento): la tab Frammento è stata spostata nella rail sinistra.
 * Header, collasso e barra tab vivono in `InspectorShell` (condiviso con la
 * scheda opera in Biblioteca): questo componente resta solo il ponte fra lo
 * stato di collasso della shell e il contenuto vero, `DocumentInsightTabs`.
 */
export interface ProjectInspectorNextProps {
  collapsed: boolean;
  onRunCoherenceAudit: () => void;
}

export function ProjectInspectorNext({ collapsed, onRunCoherenceAudit }: ProjectInspectorNextProps) {
  const setShowInsightPanel = useUiStore((state) => state.setShowInsightPanel);

  return (
    <DocumentInsightTabs
      collapsed={collapsed}
      onCollapsedChange={(next) => setShowInsightPanel(!next)}
      onRunCoherenceAudit={onRunCoherenceAudit}
    />
  );
}
