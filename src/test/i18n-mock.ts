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
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => EN_TRANSLATIONS[key] ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));
