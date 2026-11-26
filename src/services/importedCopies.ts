/**
 * Le copie importate dal computer hanno indirizzi con lo schema
 * `glossa-import:`: non sono indirizzi di rete, e nessuno li chiede a una
 * biblioteca.
 */
export const IMPORT_SCHEME = 'glossa-import:';
/** Cartella del deposito delle opere importate senza manifesto. */
export const LOCAL_IMPORT_PROVIDER = 'local_import';
/** Errore di una lettura automatica su una pagina non ancora estratta. */
export const PAGE_NOT_EXTRACTED = 'pageNotExtracted';

export function isImportUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith(IMPORT_SCHEME);
}
