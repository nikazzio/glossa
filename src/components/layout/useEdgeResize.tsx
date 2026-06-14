import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

type ResizeMode = 'collapse' | 'dismiss';

/** Passo di ridimensionamento da tastiera (←/→) sul separator. */
const KEYBOARD_RESIZE_STEP = 16;

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
  /** Larghezza corrente, min e max: alimentano gli attributi ARIA e il clamp da tastiera. */
  width: number;
  min: number;
  max: number;
  /** Ridimensionamento da tastiera (←/→ a step). */
  onResize: (width: number) => void;
  /** Reset alla larghezza di default (doppio click). */
  onReset: () => void;
}

/**
 * Maniglia di resize accessibile sul bordo destro di una colonna.
 * - Pointer: trascinamento (delegato a useEdgeResize via onPointerDown).
 * - Tastiera: ←/→ ridimensionano a step di 16px (tabbabile, role separator con aria-value*).
 * - Doppio click: reset alla larghezza di default.
 * Grip sottile sempre visibile per scopribilità, accentuato in hover/drag.
 */
export function ResizeHandle({ onPointerDown, dragging, label, width, min, max, onResize, onReset }: ResizeHandleProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Separator sul bordo destro di colonna ancorata a sinistra: → allarga, ← restringe.
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onResize(clamp(width + KEYBOARD_RESIZE_STEP, min, max));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onResize(clamp(width - KEYBOARD_RESIZE_STEP, min, max));
    } else if (event.key === 'Home') {
      event.preventDefault();
      onResize(min);
    } else if (event.key === 'End') {
      event.preventDefault();
      onResize(max);
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      className={`group absolute inset-y-0 right-0 z-30 flex w-1.5 cursor-col-resize touch-none select-none items-center justify-center transition-colors focus:outline-none focus-visible:bg-editorial-accent/30 focus-visible:ring-1 focus-visible:ring-editorial-accent ${
        dragging ? 'bg-editorial-accent/40' : 'hover:bg-editorial-accent/25'
      }`}
    >
      {/* Grip sempre visibile (linea sottile) che si accentua in hover/drag. */}
      <span
        aria-hidden="true"
        className={`h-7 w-px rounded-full transition-colors ${
          dragging ? 'bg-editorial-accent' : 'bg-editorial-border group-hover:bg-editorial-accent/60'
        }`}
      />
    </div>
  );
}
