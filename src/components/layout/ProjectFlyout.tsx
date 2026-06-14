import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { ChunkInspectorPanel, InsightDocPanel } from '../document';
import { ResizeHandle, useEdgeResize } from './useEdgeResize';
import { SPRING_PANEL } from './motion';
import { useViewportWidth, FLYOUT_OVERLAY_BELOW } from '../../hooks/useViewportWidth';

const FLYOUT_MIN = 300;
const FLYOUT_MAX = 620;
const FLYOUT_DISMISS_AT = 260;
const FLYOUT_DEFAULT = 430;
/** Larghezza del rail collassato: offset sinistro dell'overlay su finestre strette. */
const RAIL_COLLAPSED = 64;

interface ProjectFlyoutProps {
  onReauditChunk: (chunkId: string) => void;
  onRunCoherenceAudit: () => void;
}

/**
 * Seconda barra del progetto: esce dal bordo destro della barra primaria
 * solo per i pannelli ricchi (Insight, Chunk). Spinge il documento, niente overlay.
 * Ridimensionabile dal bordo destro; sotto soglia scompare (non collassa a icona).
 */
export function ProjectFlyout({ onReauditChunk, onRunCoherenceAudit }: ProjectFlyoutProps) {
  const { t } = useTranslation();
  const showDocumentDrawer = useUiStore((state) => state.showDocumentDrawer);
  const showChunkDrawer = useUiStore((state) => state.showChunkDrawer);
  const width = useUiStore((state) => state.projectFlyoutWidth);
  const setWidth = useUiStore((state) => state.setProjectFlyoutWidth);
  const setActiveProjectPanel = useUiStore((state) => state.setActiveProjectPanel);
  const projectContextCollapsed = useUiStore((state) => state.projectContextCollapsed);
  const projectSidebarWidth = useUiStore((state) => state.projectSidebarWidth);
  const { dragging, startDrag } = useEdgeResize();
  const viewportWidth = useViewportWidth();

  const open = showDocumentDrawer || showChunkDrawer;
  const close = () => setActiveProjectPanel('document');

  // Su finestre strette il fly-out si sovrappone al documento (overlay) invece di spingerlo,
  // così il testo resta leggibile. L'offset sinistro segue la larghezza del rail.
  const overlay = viewportWidth > 0 && viewportWidth < FLYOUT_OVERLAY_BELOW;
  const railWidth = projectContextCollapsed ? RAIL_COLLAPSED : projectSidebarWidth;

  const handleResizeStart = (event: React.PointerEvent) => {
    startDrag(event, {
      startWidth: width,
      min: FLYOUT_MIN,
      max: FLYOUT_MAX,
      threshold: FLYOUT_DISMISS_AT,
      mode: 'dismiss',
      onWidth: setWidth,
      onDismiss: close,
    });
  };

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          key="project-flyout"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={dragging ? { duration: 0 } : SPRING_PANEL}
          style={overlay ? { left: railWidth } : undefined}
          className={`flex h-full overflow-hidden border-r border-editorial-border bg-editorial-bg/95 ${
            overlay ? 'absolute inset-y-0 z-40 shadow-2xl shadow-black/25' : 'relative shrink-0'
          }`}
        >
          <div className="flex h-full flex-col overflow-hidden" style={{ width }}>
            {showChunkDrawer ? (
              <ChunkInspectorPanel onReauditChunk={onReauditChunk} onClose={close} />
            ) : (
              <InsightDocPanel onRunCoherenceAudit={onRunCoherenceAudit} onClose={close} />
            )}
          </div>
          <ResizeHandle
            onPointerDown={handleResizeStart}
            dragging={dragging}
            label={t('projectShell.resizePanel')}
            width={width}
            min={FLYOUT_MIN}
            max={FLYOUT_MAX}
            onResize={setWidth}
            onReset={() => setWidth(FLYOUT_DEFAULT)}
          />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
