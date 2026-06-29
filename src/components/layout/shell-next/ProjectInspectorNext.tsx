import { BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../stores/uiStore';
import { InsightDocPanel } from '../../document/InsightsDrawer';
import { IconButton } from '../../ui';

/**
 * Shell nuova (#291, #296) — ispettore destro.
 * Solo Insight (documento): la tab Frammento è stata spostata nella rail sinistra.
 * Collassato: icona per espandere il pannello.
 */
export interface ProjectInspectorNextProps {
  collapsed: boolean;
  onRunCoherenceAudit: () => void;
}

export function ProjectInspectorNext({
  collapsed,
  onRunCoherenceAudit,
}: ProjectInspectorNextProps) {
  const { t } = useTranslation();
  const setShowInsightPanel = useUiStore((state) => state.setShowInsightPanel);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2 pt-3">
        <IconButton
          size="md"
          tone="muted"
          onClick={() => setShowInsightPanel(true)}
          title={t('projectShell.insightTab')}
          tooltipSide="left"
        >
          <BarChart2 size={15} />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-20 shrink-0 items-center border-b border-editorial-border px-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-editorial-accent">
          <BarChart2 size={15} />
          {t('projectShell.insightTab')}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <InsightDocPanel
          onRunCoherenceAudit={onRunCoherenceAudit}
          onClose={() => setShowInsightPanel(false)}
        />
      </div>
    </div>
  );
}
