import { useTranslation } from 'react-i18next';
import { languageNameOf, UNDETERMINED_LANGUAGE, varietyNameOf } from '../languages/catalog';
import { useLanguageCatalog } from './useLanguageCatalog';

/** Il nome di una lingua dal suo codice, nella lingua dell'interfaccia; il codice stesso se l'elenco non lo conosce. */
export function useLanguageLabel(): (code: string) => string {
  return useLanguageNames().language;
}

/** Nomi di lingua e varietà dai codici salvati; una varietà sconosciuta resta leggibile come codice. */
export function useLanguageNames() {
  const { t, i18n } = useTranslation();
  const catalog = useLanguageCatalog();
  const language = (code: string) => {
    const trimmed = code.trim();
    return trimmed && trimmed !== UNDETERMINED_LANGUAGE ? languageNameOf(catalog, trimmed, i18n.language) : t('workLanguages.notSpecified');
  };
  const variety = (code: string | null | undefined) => (code?.trim() ? varietyNameOf(catalog, code.trim()) : null);
  /** «Italiano (Old Italian)», per i suggerimenti. */
  const describe = (code: string, varietyCode?: string | null) => {
    const name = variety(varietyCode);
    return name ? `${language(code)} (${name})` : language(code);
  };
  return { language, variety, describe };
}
