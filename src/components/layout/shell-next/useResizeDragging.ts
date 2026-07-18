import { useEffect, useState } from 'react';

/**
 * Stato di drag su una maniglia Separator di react-resizable-panels: la libreria
 * non lo espone, va ricavato dal pointer (nessuna transizione CSS durante il trascinamento).
 */
export function useResizeDragging(): [boolean, (dragging: boolean) => void] {
  const [dragging, setDragging] = useState(false);

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

  return [dragging, setDragging];
}
