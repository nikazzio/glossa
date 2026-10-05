import { useEffect, useState } from 'react';
import { getWorkBookLanguage, listWorkspaceLanguageCodes } from '../services/projectService';
import { matchLanguage, type LanguageCatalog } from '../languages/catalog';
import { logger } from '../utils/logger';

interface WorkLanguageSuggestions {
  /** Codes already used in the workspace, listed first in the language search. */
  usedCodes: string[];
  /** The book's language matched to a code, to prefill an empty source; null when unknown or ambiguous. */
  bookLanguageCode: string | null;
}

export function useWorkLanguageSuggestions(
  catalog: LanguageCatalog | null,
  workspaceId: string | null,
  projectId: string | null,
): WorkLanguageSuggestions {
  const [usedCodes, setUsedCodes] = useState<string[]>([]);
  const [bookLanguage, setBookLanguage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!workspaceId) { setUsedCodes([]); return () => { active = false; }; }
    listWorkspaceLanguageCodes(workspaceId)
      .then((codes) => { if (active) setUsedCodes(codes); })
      .catch((error: unknown) => logger.warn('workspace language codes unavailable', { error: error instanceof Error ? error.message : String(error) }));
    return () => { active = false; };
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    if (!projectId) { setBookLanguage(null); return () => { active = false; }; }
    getWorkBookLanguage(projectId)
      .then((language) => { if (active) setBookLanguage(language); })
      .catch((error: unknown) => logger.warn('book language unavailable', { error: error instanceof Error ? error.message : String(error) }));
    return () => { active = false; };
  }, [projectId]);

  return { usedCodes, bookLanguageCode: catalog ? matchLanguage(catalog, bookLanguage) : null };
}
