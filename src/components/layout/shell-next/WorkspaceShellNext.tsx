import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, usePanelCallbackRef } from 'react-resizable-panels';
import { ResizeHandle } from '../../ui';
import { useUiStore } from '../../../stores/uiStore';
import { RAIL_COLLAPSED_WIDTH, RAIL_MIN_WIDTH, WorkspaceRailNext } from './WorkspaceRailNext';
import { PANEL_FLEX_TRANSITION_CLASS } from '../motion';
import { resetStrayResizeCursor } from './resetStrayResizeCursor';
import { useResizeDragging } from './useResizeDragging';

/**
 * Shell dashboard/workspace-home (#294) — mirror a 2 colonne di ShellNext:
 * rail (sx) · contenuto (dx). Nessun ispettore destro, la dashboard non ha
 * un pannello Approfondimenti. Stesse costanti/meccanica di ShellNext per
 * coerenza visiva con la vista progetto.
 */

const SIDEBAR_DEFAULT = RAIL_MIN_WIDTH;
const SIDEBAR_COLLAPSED = RAIL_COLLAPSED_WIDTH;
const SIDEBAR_MIN = RAIL_MIN_WIDTH;
const SIDEBAR_MAX = 420;

function clampPanelWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(width, min), max);
}

interface WorkspaceShellNextProps {
  children: ReactNode;
}

export function WorkspaceShellNext({ children }: WorkspaceShellNextProps) {
  const storeCollapsed = useUiStore((state) => state.dashboardSidebarCollapsed);
  const storeWidth = useUiStore((state) => state.dashboardSidebarWidth);
  const setStoreCollapsed = useUiStore((state) => state.setDashboardSidebarCollapsed);
  const setStoreWidth = useUiStore((state) => state.setDashboardSidebarWidth);

  const [railPanel, setRailPanel] = usePanelCallbackRef();
  const [collapsed, setCollapsed] = useState(storeCollapsed);
  const [dragging, setDragging] = useResizeDragging();
  const initialWidth = useRef(
    clampPanelWidth(storeWidth || SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
  );

  useEffect(() => {
    return () => {
      // Se il Group si smonta mentre il Separator era in hover/drag, la libreria
      // lascia un cursore *, *:hover {cursor: X !important} bloccato su tutta l'app.
      resetStrayResizeCursor();
    };
  }, []);

  useEffect(() => {
    if (!railPanel) return;
    const panelCollapsed = railPanel.isCollapsed();
    if (storeCollapsed && !panelCollapsed) {
      railPanel.collapse();
      setCollapsed(true);
    } else if (!storeCollapsed && panelCollapsed) {
      setCollapsed(false);
      railPanel.expand();
    } else {
      setCollapsed(storeCollapsed);
    }
  }, [storeCollapsed, railPanel]);

  const syncRailFlag = () => {
    setCollapsed(railPanel?.isCollapsed() ?? false);
  };

  const persistLayout = () => {
    if (!railPanel) return;
    const railCollapsed = railPanel.isCollapsed();
    if (railCollapsed !== storeCollapsed) setStoreCollapsed(railCollapsed);
    if (!railCollapsed) {
      const px = Math.round(railPanel.getSize().inPixels);
      if (px !== storeWidth) setStoreWidth(px);
    }
  };

  return (
    <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={persistLayout}>
      <Panel
        id="workspace-rail"
        collapsible
        collapsedSize={SIDEBAR_COLLAPSED}
        minSize={SIDEBAR_MIN}
        maxSize={SIDEBAR_MAX}
        defaultSize={initialWidth.current}
        panelRef={setRailPanel}
        onResize={syncRailFlag}
        className={`overflow-hidden border-r border-editorial-border bg-editorial-page ${
          dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
        }`}
      >
        <WorkspaceRailNext collapsed={collapsed} />
      </Panel>

      <ResizeHandle dragging={dragging} onDragStart={() => setDragging(true)} layer="shell" />

      {/* Anche il contenuto scorre insieme alla barra: con la transizione su un
          solo pannello il bordo dell'altro scattava. */}
      <Panel id="workspace-content" className={`relative flex min-w-0 ${dragging ? '' : PANEL_FLEX_TRANSITION_CLASS}`}>
        {children}
      </Panel>
    </Group>
  );
}
