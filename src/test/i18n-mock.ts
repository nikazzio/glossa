import { vi } from 'vitest';

// Mini EN translation map for statusBar keys used in component tests.
// Imported as a side-effect in tests that assert on human-readable i18n values
// rather than translation keys.
const EN_TRANSLATIONS: Record<string, string> = {
  'workspace.translationsArea.sort.updatedAt': 'Recent',
  'workspace.translationsArea.sort.name': 'Name',
  'statusBar.saved': 'Saved',
  'statusBar.saving': 'Saving…',
  'statusBar.dirty': 'Unsaved changes',
  'statusBar.saveError': 'Save error',
  'statusBar.sourceWords': 'src',
  'statusBar.targetWords': 'tgt',
  'statusBar.coverage': 'coverage',
  'statusBar.chunks': 'chunks',
  'statusBar.running': 'Running…',
  'statusBar.completed': 'Completed',
  'statusBar.areaTranslations': 'Translations',
  'statusBar.areaLibrary': 'Library',
  'statusBar.areaTranscriptions': 'Transcriptions',
  'dashboard.discovery.pagesCount_one': '{{count}} page',
  'dashboard.discovery.pagesCount_other': '{{count}} pages',
};

// Riproduce il minimo di i18next che serve alle asserzioni: scelta della forma
// singolare/plurale col suffisso e sostituzione dei segnaposto. Le chiavi non
// mappate tornano com'erano (nessun segnaposto da sostituire).
function translate(key: string, options?: Record<string, unknown>): string {
  const count = typeof options?.count === 'number' ? options.count : null;
  const pluralKey = count === null ? null : `${key}_${count === 1 ? 'one' : 'other'}`;
  const template = (pluralKey ? EN_TRANSLATIONS[pluralKey] : undefined) ?? EN_TRANSLATIONS[key] ?? key;
  if (!options) return template;
  return template.replace(/{{(\w+)}}/g, (_match, name: string) => String(options[name] ?? ''));
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => translate(key, options),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));
