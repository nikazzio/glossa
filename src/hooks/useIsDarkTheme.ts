import { useEffect, useState } from 'react';
import { useUiStore } from '../stores/uiStore';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Vero quando l'app è in tema scuro: per scelta, o perché segue il sistema e il
 * sistema è scuro. Segue anche il cambio di tema del sistema mentre l'app è
 * aperta, così chi colora a runtime (accento, evidenziazioni) non resta indietro.
 */
export function useIsDarkTheme(): boolean {
  const colorScheme = useUiStore((s) => s.colorScheme);
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return colorScheme === 'dark' || (colorScheme === 'system' && prefersDark);
}
