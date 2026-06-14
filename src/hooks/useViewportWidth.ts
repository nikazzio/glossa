import { useEffect, useState } from 'react';

/**
 * Larghezza corrente del viewport, aggiornata sul resize della finestra.
 * Usata per decidere quando i pannelli fly-out passano da push a overlay su finestre strette.
 */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}

/** Sotto questa larghezza di viewport i fly-out del progetto si sovrappongono al documento invece di spingerlo. */
export const FLYOUT_OVERLAY_BELOW = 1100;
