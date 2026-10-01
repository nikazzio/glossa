import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Vero quando l'elemento è più stretto di `threshold` pixel.
 *
 * Misura in JavaScript e non con una container query perché quello che cambia
 * non sta solo dentro l'elemento: i comandi che escono dalla barra entrano in
 * un menu che si apre in un portale, fuori dal contenitore, dove una query sul
 * contenitore non arriva. Una misura sola decide entrambe le cose, così un
 * comando non è mai in barra e nel menu insieme, né in nessuno dei due.
 */
export function useNarrowWidth<T extends HTMLElement>(threshold: number): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (width: number) => setNarrow(width > 0 && width < threshold);
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(() => measure(element.getBoundingClientRect().width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, narrow];
}
