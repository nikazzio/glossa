import { buildLanguageListUpdate, cldrItalianNames } from '../languages/build';
import { loadLanguageFiles, resetLanguageCatalog } from '../languages/catalog';
import { fetchLanguageSources, saveLanguageLists } from './languageListStorage';

export interface LanguageListUpdateResult {
  added: number;
  retired: number;
}

/**
 * Scarica ISO 639-3 e Glottolog, li unisce all'elenco in uso (i codici spariti
 * restano, ritirati) e salva il risultato, che da qui in poi prevale su quello
 * incluso. Se un passo fallisce, l'elenco in uso resta quello di prima.
 */
export async function updateLanguageLists(): Promise<LanguageListUpdateResult> {
  const [sources, current] = await Promise.all([fetchLanguageSources(), loadLanguageFiles()]);
  const update = buildLanguageListUpdate(sources, current, cldrItalianNames(), new Date().toISOString().slice(0, 10));
  await saveLanguageLists({ iso: JSON.stringify(update.iso), varieties: JSON.stringify(update.varieties) });
  resetLanguageCatalog();
  return { added: update.added, retired: update.retired };
}
