import { useEffect, useState } from 'react';
import { usePanelCallbackRef } from 'react-resizable-panels';
import { useUiStore } from '../../stores/uiStore';
import { useResizeDragging } from '../layout/shell-next/useResizeDragging';
import { clampInspectorWidth } from '../ui';

export const VIEWER_MIN = 280;
export const VIEWER_MAX = 1400;
export const TEXT_MIN = 280;
/** Proporzione al primo apertura, prima che l'utente sposti il divisore: 3/5
 *  visore, 2/5 testo. */
const VIEWER_DEFAULT_RATIO = '60%';

/**
 * Le tre colonne dello Studio: larghezze ricordate fra le sessioni, colonna
 * degli strumenti richiudibile, trascinamento dei divisori.
 */
export function useInspectorLayout() {
  const inspectorWidth = useUiStore((state) => state.transcriptionInspectorWidth);
  const setInspectorWidth = useUiStore((state) => state.setTranscriptionInspectorWidth);
  const viewerWidth = useUiStore((state) => state.transcriptionViewerWidth);
  const setViewerWidth = useUiStore((state) => state.setTranscriptionViewerWidth);
  const [inspectorPanel, setInspectorPanel] = usePanelCallbackRef();
  const [viewerPanel, setViewerPanel] = usePanelCallbackRef();
  const [dragging, setDragging] = useResizeDragging();
  // Chiuso di default a ogni apertura dello Studio: solo la larghezza si
  // ricorda fra le sessioni, non se il pannello era aperto o chiuso.
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  // Misure di partenza lette una volta sola: dopo le decide il trascinamento.
  const [initialInspectorWidth] = useState(() => clampInspectorWidth(inspectorWidth));
  const [initialViewerSize] = useState<number | string>(() =>
    viewerWidth > 0 ? Math.min(Math.max(viewerWidth, VIEWER_MIN), VIEWER_MAX) : VIEWER_DEFAULT_RATIO,
  );

  // Il pannello destro nasce chiuso: l'unica cosa che si ricorda è la sua
  // larghezza, per quando l'utente lo riapre.
  useEffect(() => {
    if (!inspectorPanel || inspectorPanel.isCollapsed()) return;
    inspectorPanel.collapse();
  }, [inspectorPanel]);

  const persistInspectorLayout = () => {
    if (!inspectorPanel || inspectorPanel.isCollapsed()) return;
    const px = Math.round(inspectorPanel.getSize().inPixels);
    if (px !== inspectorWidth) setInspectorWidth(px);
  };
  const persistViewerLayout = () => {
    if (!viewerPanel) return;
    const px = Math.round(viewerPanel.getSize().inPixels);
    if (px !== viewerWidth) setViewerWidth(px);
  };
  const syncInspectorCollapsed = () => {
    setInspectorCollapsed(inspectorPanel?.isCollapsed() ?? false);
  };
  const toggleInspectorCollapsed = (next: boolean) => {
    if (!inspectorPanel) return;
    if (next) inspectorPanel.collapse();
    else inspectorPanel.expand();
    setInspectorCollapsed(next);
  };

  return {
    setInspectorPanel,
    setViewerPanel,
    dragging,
    startDragging: () => setDragging(true),
    inspectorCollapsed,
    initialInspectorWidth,
    initialViewerSize,
    persistInspectorLayout,
    persistViewerLayout,
    syncInspectorCollapsed,
    toggleInspectorCollapsed,
  };
}
