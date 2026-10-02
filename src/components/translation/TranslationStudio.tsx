import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, usePanelCallbackRef } from 'react-resizable-panels';
import { INSPECTOR_WIDTH, ResizeHandle, clampInspectorWidth } from '../ui';
import { PANEL_FLEX_TRANSITION_CLASS } from '../layout/motion';
import { PipelineSidebarExportDialogHost } from '../layout/PipelineSidebarSections';
import { resetStrayResizeCursor } from '../layout/shell-next/resetStrayResizeCursor';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { useUiStore } from '../../stores/uiStore';
import { TranslationInspector } from './TranslationInspector';
import { TranslationStudioHeader } from './TranslationStudioHeader';

interface TranslationStudioProps {
  children: ReactNode;
  onBack: () => void;
  onImportDocument: () => void;
  onRunPipeline: () => void;
  onCancelPipeline: () => void;
  onRetranslateChunk: (chunkId: string) => void;
  onReauditChunk: (chunkId: string) => void;
  onRunCoherenceAudit: () => void;
}

/**
 * Studio di traduzione, sul modello dello Studio di trascrizione: riga
 * d'intestazione, i due fogli al centro, gli strumenti in una sola colonna a
 * destra. Apertura e larghezza della colonna si ricordano fra le sessioni.
 */
export function TranslationStudio({
  children,
  onBack,
  onImportDocument,
  onRunPipeline,
  onCancelPipeline,
  onRetranslateChunk,
  onReauditChunk,
  onRunCoherenceAudit,
}: TranslationStudioProps) {
  const inspectorOpen = useUiStore((s) => s.showInsightPanel);
  const setInspectorOpen = useUiStore((s) => s.setShowInsightPanel);
  const inspectorWidth = useUiStore((s) => s.projectFlyoutWidth);
  const setInspectorWidth = useUiStore((s) => s.setProjectFlyoutWidth);
  const showExportDialog = useUiStore((s) => s.showExportDialog);
  const setShowExportDialog = useUiStore((s) => s.setShowExportDialog);

  // Ref a callback: il pannello è disponibile solo dopo essersi registrato nel
  // gruppo, e l'API imperativa usata prima fallisce.
  const [inspectorPanel, setInspectorPanel] = usePanelCallbackRef();
  const [collapsed, setCollapsed] = useState(!inspectorOpen);
  const [dragging, setDragging] = useResizeDragging();
  const initialWidth = useRef(clampInspectorWidth(inspectorWidth));

  // Smontare il gruppo durante un trascinamento lascia bloccato il cursore di
  // ridimensionamento su tutta l'app.
  useEffect(() => resetStrayResizeCursor, []);

  useEffect(() => {
    if (!inspectorPanel) return;
    const panelCollapsed = inspectorPanel.isCollapsed();
    if (inspectorOpen && panelCollapsed) inspectorPanel.expand();
    else if (!inspectorOpen && !panelCollapsed) inspectorPanel.collapse();
    setCollapsed(!inspectorOpen);
  }, [inspectorOpen, inspectorPanel]);

  const syncCollapsed = () => {
    const isCollapsed = inspectorPanel?.isCollapsed() ?? false;
    setCollapsed((prev) => (prev === isCollapsed ? prev : isCollapsed));
  };

  const persistLayout = () => {
    if (!inspectorPanel) return;
    const isCollapsed = inspectorPanel.isCollapsed();
    if (isCollapsed === inspectorOpen) setInspectorOpen(!isCollapsed);
    if (isCollapsed) return;
    const px = Math.round(inspectorPanel.getSize().inPixels);
    if (px !== inspectorWidth) setInspectorWidth(px);
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-surface-panel">
      <TranslationStudioHeader onBack={onBack} onImportDocument={onImportDocument} />
      <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={persistLayout}>
        <Panel id="translation-content" className="relative flex min-w-0">
          {children}
        </Panel>

        <ResizeHandle dragging={dragging} onDragStart={() => setDragging(true)} />

        <Panel
          id="translation-inspector"
          collapsible
          collapsedSize={INSPECTOR_WIDTH.collapsed}
          minSize={INSPECTOR_WIDTH.min}
          maxSize={INSPECTOR_WIDTH.max}
          defaultSize={initialWidth.current}
          panelRef={setInspectorPanel}
          onResize={syncCollapsed}
          className={`flex min-w-0 flex-col border-l border-editorial-border bg-surface-panel ${
            dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
          }`}
        >
          <TranslationInspector
            collapsed={collapsed}
            onCollapsedChange={(next) => setInspectorOpen(!next)}
            onRunPipeline={onRunPipeline}
            onCancelPipeline={onCancelPipeline}
            onRetranslateChunk={onRetranslateChunk}
            onReauditChunk={onReauditChunk}
            onRunCoherenceAudit={onRunCoherenceAudit}
          />
        </Panel>
      </Group>
      <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
    </div>
  );
}
