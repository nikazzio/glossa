import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { ChunkInspectorPanel, InsightDocPanel } from '../document';
import { ResizeHandle, useEdgeResize } from './useEdgeResize';

const FLYOUT_MIN = 300;
const FLYOUT_MAX = 620;
const FLYOUT_DISMISS_AT = 260;

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
  const { dragging, startDrag } = useEdgeResize();

  const open = showDocumentDrawer || showChunkDrawer;
  const close = () => setActiveProjectPanel('document');

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
          transition={dragging ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 280 }}
          className="relative flex h-full shrink-0 overflow-hidden border-r border-editorial-border bg-editorial-bg/95"
        >
          <div className="flex h-full flex-col overflow-hidden" style={{ width }}>
            {showChunkDrawer ? (
              <ChunkInspectorPanel onReauditChunk={onReauditChunk} onClose={close} />
            ) : (
              <InsightDocPanel onRunCoherenceAudit={onRunCoherenceAudit} onClose={close} />
            )}
          </div>
          <ResizeHandle onPointerDown={handleResizeStart} dragging={dragging} label={t('projectShell.resizePanel')} />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
