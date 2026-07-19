import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { useUiStore } from '../../../stores/uiStore';
import { WorkspaceRailNext } from './WorkspaceRailNext';
import { PANEL_FLEX_TRANSITION_CLASS } from '../motion';
import { resetStrayResizeCursor } from './resetStrayResizeCursor';
import { useResizeDragging } from './useResizeDragging';

/**
 * Shell dashboard/workspace-home (#294) — mirror a 2 colonne di ShellNext:
 * rail (sx) · contenuto (dx). Nessun ispettore destro, la dashboard non ha
 * un pannello Approfondimenti. Stesse costanti/meccanica di ShellNext per
 * coerenza visiva con la vista progetto.
 */

const SIDEBAR_DEFAULT = 300;
const SIDEBAR_COLLAPSED = 64;
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 520;

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
        className={`border-r border-editorial-border bg-editorial-page ${
          dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
        }`}
      >
        <WorkspaceRailNext collapsed={collapsed} />
      </Panel>

      <Separator
        onPointerDown={() => setDragging(true)}
        className={`group/sep relative z-30 flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none transition-colors focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
          dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-7 w-px rounded-full transition-colors ${
            dragging ? 'bg-editorial-accent' : 'bg-editorial-border group-hover/sep:bg-editorial-accent/60'
          }`}
        />
      </Separator>

      <Panel id="workspace-content" className="relative flex min-w-0">
        {children}
      </Panel>
    </Group>
  );
}
