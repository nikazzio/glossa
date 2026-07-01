import { BarChart2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../../stores/uiStore';
import { DocumentInsightTabs } from '../../document/InsightsDrawer';
import { IconButton } from '../../ui';

/**
 * Shell nuova (#291, #296) — ispettore destro.
 * Solo Insight (documento): la tab Frammento è stata spostata nella rail sinistra.
 * Header e collasso rispecchiano la rail sinistra (ProjectRailNext): stesso h-20,
 * stesso pulsante icona per comprimere/espandere.
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
      <div className="flex h-full flex-col items-center">
        <div className="flex h-20 w-full shrink-0 items-center justify-center">
          <IconButton
            size="md"
            tone="muted"
            onClick={() => setShowInsightPanel(true)}
            title={t('sidebar.expand')}
            tooltipSide="left"
          >
            <PanelRightOpen size={14} />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-editorial-border px-3">
        <IconButton
          size="md"
          tone="muted"
          onClick={() => setShowInsightPanel(false)}
          title={t('sidebar.collapse')}
          tooltipSide="bottom"
        >
          <PanelRightClose size={14} />
        </IconButton>
        <span className="flex items-center gap-2 text-sm font-semibold text-editorial-accent">
          <BarChart2 size={15} />
          {t('projectShell.insightTab')}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DocumentInsightTabs onRunCoherenceAudit={onRunCoherenceAudit} />
      </div>
    </div>
  );
}
