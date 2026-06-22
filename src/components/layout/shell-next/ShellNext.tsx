import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { useUiStore } from '../../../stores/uiStore';
import { ProjectRailNext, type ProjectRailNextProps } from './ProjectRailNext';
import { ProjectInspectorNext } from './ProjectInspectorNext';

/**
 * Shell nuova (#291) — split principale del progetto in modalità documento.
 * Tre colonne simmetriche: rail operativo (sx) · documento (centro) · ispettore (dx).
 * Rail e ispettore sono Panel collassabili di react-resizable-panels (px nativi);
 * larghezza e collasso sono guidati dai panel e rispecchiati su uiStore per la persistenza.
 */

// Contratto larghezze rail progetto (vedi inventario #291).
const SIDEBAR_DEFAULT = 240;
const SIDEBAR_COLLAPSED = 64;
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 320;

// Ispettore destro (eredita le larghezze del vecchio fly-out).
const INSPECTOR_DEFAULT = 430;
const INSPECTOR_MIN = 300;
const INSPECTOR_MAX = 620;
const INSPECTOR_COLLAPSED = 56;

type RailForwardedProps = Omit<ProjectRailNextProps, 'collapsed' | 'onToggleCollapse'>;

interface ShellNextProps extends RailForwardedProps {
  children: ReactNode;
  onReauditChunk: (chunkId: string) => void;
  onRunCoherenceAudit: () => void;
}

export function ShellNext({
  children,
  onReauditChunk,
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
  const inspectorOpen = useUiStore((state) => state.showDocumentDrawer || state.showChunkDrawer);

  const railRef = usePanelRef();
  const inspectorRef = usePanelRef();
  const [collapsed, setCollapsed] = useState(storeCollapsed);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(!inspectorOpen);
  // Drag attivo su una maniglia: durante il trascinamento niente transizione CSS.
  const [dragging, setDragging] = useState(false);
  const initialWidth = useRef(storeWidth || SIDEBAR_DEFAULT);
  const initialInspectorWidth = useRef(inspectorWidth || INSPECTOR_DEFAULT);

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
    if (storeCollapsed && !panelCollapsed) panel.collapse();
    else if (!storeCollapsed && panelCollapsed) panel.expand();
    setCollapsed(storeCollapsed);
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
    setCollapsed((prev) => (prev === isCollapsed ? prev : isCollapsed));
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

  const toggleRailCollapse = () => {
    const panel = railRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
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
        className={`border-r border-editorial-border bg-editorial-bg/60 ${
          dragging ? '' : 'transition-[flex-grow,flex-basis] duration-200 ease-out'
        }`}
      >
        <ProjectRailNext collapsed={collapsed} onToggleCollapse={toggleRailCollapse} {...railProps} />
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
        className={`border-l border-editorial-border bg-editorial-bg/95 ${
          dragging ? '' : 'transition-[flex-grow,flex-basis] duration-200 ease-out'
        }`}
      >
        <ProjectInspectorNext
          collapsed={inspectorCollapsed}
          onReauditChunk={onReauditChunk}
          onRunCoherenceAudit={onRunCoherenceAudit}
        />
      </Panel>
    </Group>
  );
}
