import { useCallback, useEffect, useRef, useState } from 'react';

type ResizeMode = 'collapse' | 'dismiss';

interface DragConfig {
  startWidth: number;
  min: number;
  max: number;
  /** Sotto questa larghezza: collassa (mode 'collapse') o scompare al rilascio (mode 'dismiss'). */
  threshold: number;
  mode: ResizeMode;
  onWidth: (width: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  onDismiss?: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Resize a trascinamento sul bordo destro di una colonna ancorata a sinistra.
 * - mode 'collapse': sotto soglia collassa a icone in tempo reale (reversibile nel drag).
 * - mode 'dismiss': sotto soglia il pannello scompare al rilascio.
 */
export function useEdgeResize() {
  const [dragging, setDragging] = useState(false);
  const configRef = useRef<DragConfig | null>(null);
  const startXRef = useRef(0);
  const willDismissRef = useRef(false);

  const stopDrag = useCallback(() => {
    const config = configRef.current;
    if (config?.mode === 'dismiss' && willDismissRef.current) {
      config.onDismiss?.();
    }
    configRef.current = null;
    willDismissRef.current = false;
    setDragging(false);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const config = configRef.current;
    if (!config) return;
    const next = config.startWidth + (event.clientX - startXRef.current);

    if (config.mode === 'collapse') {
      if (next < config.threshold) {
        config.onCollapsedChange?.(true);
      } else {
        config.onCollapsedChange?.(false);
        config.onWidth(clamp(next, config.min, config.max));
      }
      return;
    }

    // dismiss
    willDismissRef.current = next < config.threshold;
    config.onWidth(clamp(next, config.min, config.max));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      document.body.style.cursor = previousCursor;
    };
  }, [dragging, onPointerMove, stopDrag]);

  const startDrag = useCallback((event: React.PointerEvent, config: DragConfig) => {
    event.preventDefault();
    configRef.current = config;
    startXRef.current = event.clientX;
    willDismissRef.current = false;
    setDragging(true);
  }, []);

  return { dragging, startDrag };
}

interface ResizeHandleProps {
  onPointerDown: (event: React.PointerEvent) => void;
  dragging: boolean;
  label: string;
}

export function ResizeHandle({ onPointerDown, dragging, label }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      className={`absolute inset-y-0 right-0 z-30 w-1.5 cursor-col-resize touch-none select-none transition-colors ${
        dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
      }`}
    />
  );
}
