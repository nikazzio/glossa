import { useCallback, useRef, useState } from 'react';

/**
 * Vero da quando un elemento è entrato nello schermo la prima volta.
 *
 * Serve ai lavori che hanno senso solo per quello che si sta guardando —
 * controllare se un risultato si apre, per esempio. Una volta visto resta
 * visto: uscire dallo schermo non annulla quello che si è già saputo, e non
 * deve far ripartire niente.
 */
export function useSeenOnce<T extends Element>(): {
  ref: (element: T | null) => void;
  seen: boolean;
} {
  const [seen, setSeen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (element: T | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!element || seen) return;
      // Ambienti senza `IntersectionObserver` — le prove, per esempio — non
      // restano a guardare per sempre: si considera visto e si va avanti.
      if (typeof IntersectionObserver === 'undefined') {
        setSeen(true);
        return;
      }
      observer.current = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.current?.disconnect();
          observer.current = null;
        }
      });
      observer.current.observe(element);
    },
    [seen],
  );

  return { ref, seen };
}
