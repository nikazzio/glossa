import { useTranslation } from 'react-i18next';
import { languageNameOf, UNDETERMINED_LANGUAGE } from '../languages/catalog';
import { useLanguageCatalog } from './useLanguageCatalog';

/** Il nome di una lingua dal suo codice, nella lingua dell'interfaccia; il codice stesso se l'elenco non lo conosce. */
export function useLanguageLabel(): (code: string) => string {
  const { t, i18n } = useTranslation();
  const catalog = useLanguageCatalog();
  return (code: string) => {
    const trimmed = code.trim();
    return trimmed && trimmed !== UNDETERMINED_LANGUAGE ? languageNameOf(catalog, trimmed, i18n.language) : t('workLanguages.notSpecified');
  };
}
