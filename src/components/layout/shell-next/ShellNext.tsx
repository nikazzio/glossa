import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { useUiStore } from '../../../stores/uiStore';
import { ProjectRailNext, type ProjectRailNextProps } from './ProjectRailNext';
import { ProjectInspectorNext } from './ProjectInspectorNext';
import { PANEL_FLEX_TRANSITION_CLASS } from '../motion';

/**
 * Shell nuova (#291) — split principale del progetto in modalità documento.
 * Tre colonne simmetriche: rail operativo (sx) · documento (centro) · ispettore (dx).
 * Rail e ispettore sono Panel collassabili di react-resizable-panels (px nativi);
 * larghezza e collasso sono guidati dai panel e rispecchiati su uiStore per la persistenza.
 */

// Contratto larghezze rail progetto (vedi inventario #291).
const SIDEBAR_DEFAULT = 300;
const SIDEBAR_COLLAPSED = 64;
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 420;

// Ispettore destro (eredita le larghezze del vecchio fly-out).
const INSPECTOR_DEFAULT = 430;
const INSPECTOR_MIN = 300;
const INSPECTOR_MAX = 620;
const INSPECTOR_COLLAPSED = 56;
const RAIL_CONTENT_SWAP_DELAY_MS = 220;

function clampPanelWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(width, min), max);
}

type RailForwardedProps = Omit<ProjectRailNextProps, 'collapsed'>;

interface ShellNextProps extends RailForwardedProps {
  children: ReactNode;
  onRunCoherenceAudit: () => void;
}

export function ShellNext({
  children,
  onRunCoherenceAudit,
  ...railProps
}: ShellNextProps) {
  const storeCollapsed = useUiStore((state) => state.projectContextCollapsed);
  const storeWidth = useUiStore((state) => state.projectSidebarWidth);
  const setProjectContextCollapsed = useUiStore((state) => state.setProjectContextCollapsed);
  const setProjectSidebarWidth = useUiStore((state) => state.setProjectSidebarWidth);
  const inspectorWidth = useUiStore((state) => state.projectFlyoutWidth);
  const setInspectorWidth = useUiStore((state) => state.setProjectFlyoutWidth);
  // L'ispettore è "aperto" quando una delle due schede è richiesta.
  const inspectorOpen = useUiStore((state) => state.showInsightPanel);

  const railRef = usePanelRef();
  const inspectorRef = usePanelRef();
  const [collapsed, setCollapsed] = useState(storeCollapsed);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(!inspectorOpen);
  // Drag attivo su una maniglia: durante il trascinamento niente transizione CSS.
  const [dragging, setDragging] = useState(false);
  const initialWidth = useRef(
    clampPanelWidth(storeWidth || SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
  );
  const initialInspectorWidth = useRef(
    clampPanelWidth(inspectorWidth || INSPECTOR_DEFAULT, INSPECTOR_MIN, INSPECTOR_MAX),
  );
  const railContentSwapTimer = useRef<number | null>(null);

  const setRailContentCollapsed = (nextCollapsed: boolean, defer = false) => {
    if (railContentSwapTimer.current !== null) {
      window.clearTimeout(railContentSwapTimer.current);
      railContentSwapTimer.current = null;
    }
    if (defer) {
      railContentSwapTimer.current = window.setTimeout(() => {
        setCollapsed(nextCollapsed);
        railContentSwapTimer.current = null;
      }, RAIL_CONTENT_SWAP_DELAY_MS);
      return;
    }
    setCollapsed(nextCollapsed);
  };

  useEffect(() => {
    return () => {
      if (railContentSwapTimer.current !== null) {
        window.clearTimeout(railContentSwapTimer.current);
      }
    };
  }, []);

  // La libreria non espone uno stato di drag: lo ricaviamo dal pointer sulle maniglie.
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging]);

  // Sync store → rail (collasso comandato da apertura flyout / cambio sezione / persistenza).
  useEffect(() => {
    const panel = railRef.current;
    if (!panel) return;
    const panelCollapsed = panel.isCollapsed();
    if (storeCollapsed && !panelCollapsed) {
      panel.collapse();
      setRailContentCollapsed(true, true);
    } else if (!storeCollapsed && panelCollapsed) {
      setRailContentCollapsed(false);
      panel.expand();
    } else {
      setRailContentCollapsed(storeCollapsed);
    }
  }, [storeCollapsed, railRef]);

  // Sync store → ispettore: aperto quando una scheda è attiva, altrimenti barra di icone.
  useEffect(() => {
    const panel = inspectorRef.current;
    if (!panel) return;
    const panelCollapsed = panel.isCollapsed();
    if (inspectorOpen && panelCollapsed) panel.expand();
    else if (!inspectorOpen && !panelCollapsed) panel.collapse();
    setInspectorCollapsed(!inspectorOpen);
  }, [inspectorOpen, inspectorRef]);

  const syncRailFlag = () => {
    const isCollapsed = railRef.current?.isCollapsed() ?? false;
    if (isCollapsed) {
      setRailContentCollapsed(true, true);
    } else {
      setRailContentCollapsed(false);
    }
  };
  const syncInspectorFlag = () => {
    const isCollapsed = inspectorRef.current?.isCollapsed() ?? false;
    setInspectorCollapsed((prev) => (prev === isCollapsed ? prev : isCollapsed));
  };

  // onLayoutChanged scatta al rilascio del pointer: ideale per persistere le larghezze.
  const persistLayout = () => {
    const rail = railRef.current;
    if (rail) {
      const railCollapsed = rail.isCollapsed();
      if (railCollapsed !== storeCollapsed) setProjectContextCollapsed(railCollapsed);
      if (!railCollapsed) {
        const px = Math.round(rail.getSize().inPixels);
        if (px !== storeWidth) setProjectSidebarWidth(px);
      }
    }
    const inspector = inspectorRef.current;
    if (inspector && !inspector.isCollapsed()) {
      const px = Math.round(inspector.getSize().inPixels);
      if (px !== inspectorWidth) setInspectorWidth(px);
    }
  };

  const railSeparator = (
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
  );

  return (
    <Group orientation="horizontal" className="flex min-h-0 flex-1" onLayoutChanged={persistLayout}>
      <Panel
        id="project-rail"
        collapsible
        collapsedSize={SIDEBAR_COLLAPSED}
        minSize={SIDEBAR_MIN}
        maxSize={SIDEBAR_MAX}
        defaultSize={initialWidth.current}
        panelRef={railRef}
        onResize={syncRailFlag}
        className={`border-r border-editorial-border bg-editorial-page ${
          dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
        }`}
      >
        <ProjectRailNext collapsed={collapsed} {...railProps} />
      </Panel>

      {railSeparator}

      <Panel id="project-content" className="relative flex min-w-0">
        {children}
      </Panel>

      {railSeparator}

      <Panel
        id="project-inspector"
        collapsible
        collapsedSize={INSPECTOR_COLLAPSED}
        minSize={INSPECTOR_MIN}
        maxSize={INSPECTOR_MAX}
        defaultSize={initialInspectorWidth.current}
        panelRef={inspectorRef}
        onResize={syncInspectorFlag}
        className={`border-l border-editorial-border bg-editorial-page ${
          dragging ? '' : PANEL_FLEX_TRANSITION_CLASS
        }`}
      >
        <ProjectInspectorNext
          collapsed={inspectorCollapsed}
          onRunCoherenceAudit={onRunCoherenceAudit}
        />
      </Panel>
    </Group>
  );
}
