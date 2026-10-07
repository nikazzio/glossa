import { useEffect, useState } from 'react';
import { loadLanguageCatalog, type LanguageCatalog } from '../languages/catalog';
import { logger } from '../utils/logger';

/** The bundled language list, or null while it loads (or if it failed: names fall back to codes). */
export function useLanguageCatalog(): LanguageCatalog | null {
  const [catalog, setCatalog] = useState<LanguageCatalog | null>(null);
  useEffect(() => {
    let active = true;
    loadLanguageCatalog()
      .then((loaded) => { if (active) setCatalog(loaded); })
      .catch((error: unknown) => {
        logger.error('language catalog load failed', { error: error instanceof Error ? error.message : String(error) });
      });
    return () => { active = false; };
  }, []);
  return catalog;
}
