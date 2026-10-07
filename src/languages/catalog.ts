import type { LanguageChoice } from '../types';
import { readSavedLanguageLists } from '../services/languageListStorage';
import { logger } from '../utils/logger';
import { parseIsoFile, parseVarietiesFile, type IsoFile, type VarietiesFile } from './build';

/** One ISO 639-3 language, as bundled from the SIL register. */
export interface LanguageEntry {
  code: string;
  /** Official ISO reference name (English). */
  name: string;
  /** Italian name from CLDR, when CLDR has one. */
  itName: string | null;
  historical: boolean;
  /** Gone from the register: still named, no longer offered. */
  retired: boolean;
}

/** One Glottolog variety (dialect level) of an ISO language. */
export interface VarietyEntry {
  code: string;
  name: string;
  languageCode: string;
  retired: boolean;
}

/** Where the list in use comes from, and how big it is. */
export interface LanguageListInfo {
  origin: 'bundled' | 'downloaded';
  languagesRetrievedAt: string;
  varietiesRetrievedAt: string;
  languageCount: number;
  varietyCount: number;
  retiredCount: number;
}

export interface LanguageCatalog {
  languages: ReadonlyMap<string, LanguageEntry>;
  /** Varieties still offered (not retired) for a language. */
  varietiesOf: (languageCode: string) => readonly VarietyEntry[];
  variety: (code: string) => VarietyEntry | undefined;
  info: LanguageListInfo;
}

export interface LanguageSearchGroups {
  used: LanguageEntry[];
  historical: LanguageEntry[];
  other: LanguageEntry[];
}

/** Results per group: enough to find by typing, light enough to render in a popover. */
const MAX_RESULTS_PER_GROUP = 40;

let catalogPromise: Promise<LanguageCatalog> | null = null;

/** The two lists in use: the downloaded ones when present, otherwise the bundled ones. */
export async function loadLanguageFiles(): Promise<{ iso: IsoFile; varieties: VarietiesFile; origin: LanguageListInfo['origin'] }> {
  try {
    const saved = await readSavedLanguageLists();
    if (saved) return { iso: parseIsoFile(saved.iso), varieties: parseVarietiesFile(saved.varieties), origin: 'downloaded' };
  } catch (error: unknown) {
    // Un elenco scaricato illeggibile non blocca l'app: resta quello incluso.
    logger.warn('language.saved_list_unavailable', { error: error instanceof Error ? error.message : String(error) });
  }
  // Testo grezzo, non modulo JSON: il compilatore non deduce tipi da 20.000 voci.
  const [iso, glottolog] = await Promise.all([
    import('./data/iso639-3.json?raw'),
    import('./data/glottolog-varieties.json?raw'),
  ]);
  return { iso: parseIsoFile(iso.default), varieties: parseVarietiesFile(glottolog.default), origin: 'bundled' };
}

/** Loads the lists once; they live in their own chunk, outside the main bundle. */
export function loadLanguageCatalog(): Promise<LanguageCatalog> {
  catalogPromise ??= loadLanguageFiles()
    .then(({ iso, varieties, origin }) => buildCatalog(iso, varieties, origin))
    .catch((error: unknown) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

/** Forgets the loaded lists: the next load reads the ones just saved. */
export function resetLanguageCatalog(): void {
  catalogPromise = null;
}

function buildCatalog(iso: IsoFile, varietyFile: VarietiesFile, origin: LanguageListInfo['origin']): LanguageCatalog {
  const languages = new Map(iso.languages.map(([code, name, itName, historical, retired]) =>
    [code, { code, name, itName, historical: historical === 1, retired: retired === 1 }] as const));
  const varieties = new Map(Object.entries(varietyFile.varieties).map(([languageCode, rows]) =>
    [languageCode, rows.map(([code, name, retired]) => ({ code, name, languageCode, retired: retired === 1 }))] as const));
  const allVarieties = [...varieties.values()].flat();
  const byCode = new Map(allVarieties.map((entry) => [entry.code, entry] as const));
  return {
    languages,
    varietiesOf: (languageCode) => (varieties.get(languageCode) ?? []).filter((entry) => !entry.retired),
    variety: (code) => byCode.get(code),
    info: {
      origin,
      languagesRetrievedAt: iso.retrievedAt,
      varietiesRetrievedAt: varietyFile.retrievedAt,
      languageCount: [...languages.values()].filter((entry) => !entry.retired).length,
      varietyCount: allVarieties.filter((entry) => !entry.retired).length,
      retiredCount: [...languages.values()].filter((entry) => entry.retired).length,
    },
  };
}

const isItalianUi = (uiLanguage: string) => uiLanguage.toLowerCase().startsWith('it');

export function languageName(entry: LanguageEntry, uiLanguage: string): string {
  return isItalianUi(uiLanguage) && entry.itName ? entry.itName : entry.name;
}

/** Name of a saved code; an unknown code (retired, or from a newer list) stays readable as itself. */
export function languageNameOf(catalog: LanguageCatalog | null, code: string, uiLanguage: string): string {
  const entry = catalog?.languages.get(code);
  return entry ? languageName(entry, uiLanguage) : code;
}

export function varietyNameOf(catalog: LanguageCatalog | null, code: string): string {
  return catalog?.variety(code)?.name ?? code;
}

/** Short label of one side: «Latino (Medieval Latin)», or null when nothing is chosen. */
export function describeLanguageChoice(catalog: LanguageCatalog | null, choice: LanguageChoice, uiLanguage: string): string | null {
  if (!choice.code) return null;
  const name = languageNameOf(catalog, choice.code, uiLanguage);
  return choice.variety ? `${name} (${varietyNameOf(catalog, choice.variety)})` : name;
}

/**
 * Plain description for a model prompt: name, variety and note, always in
 * English names so the instruction reads the same whatever the interface language.
 */
export function describeLanguageForModel(catalog: LanguageCatalog | null, choice: LanguageChoice): string {
  if (!choice.code) return 'not specified';
  const name = catalog?.languages.get(choice.code)?.name ?? choice.code;
  const variety = choice.variety ? `, ${varietyNameOf(catalog, choice.variety)}` : '';
  const note = choice.note.trim() ? ` — ${choice.note.trim()}` : '';
  return `${name}${variety}${note}`;
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

function matches(entry: LanguageEntry, query: string): boolean {
  if (!query) return true;
  return entry.code === query
    || normalize(entry.name).includes(query)
    || (entry.itName !== null && normalize(entry.itName).includes(query));
}

/** Languages matching the query, grouped: already used in the workspace, historical, all the others. */
export function searchLanguages(
  catalog: LanguageCatalog,
  rawQuery: string,
  uiLanguage: string,
  usedCodes: readonly string[],
): LanguageSearchGroups {
  const query = normalize(rawQuery);
  const used = new Set(usedCodes);
  const byName = (a: LanguageEntry, b: LanguageEntry) =>
    languageName(a, uiLanguage).localeCompare(languageName(b, uiLanguage), uiLanguage);
  // L'elenco intero si mostra solo cercando: senza testo, gruppi «usate» e «storiche».
  const found = [...catalog.languages.values()].filter((entry) => !entry.retired && matches(entry, query));
  const exactFirst = (list: LanguageEntry[]) => [
    ...list.filter((entry) => entry.code === query),
    ...list.filter((entry) => entry.code !== query).sort(byName),
  ].slice(0, MAX_RESULTS_PER_GROUP);
  return {
    used: exactFirst(found.filter((entry) => used.has(entry.code))),
    historical: exactFirst(found.filter((entry) => !used.has(entry.code) && entry.historical)),
    other: query ? exactFirst(found.filter((entry) => !used.has(entry.code) && !entry.historical)) : [],
  };
}

export function searchVarieties(catalog: LanguageCatalog, languageCode: string, rawQuery: string): VarietyEntry[] {
  const query = normalize(rawQuery);
  return catalog.varietiesOf(languageCode)
    .filter((entry) => !query || entry.code === query || normalize(entry.name).includes(query))
    .slice(0, MAX_RESULTS_PER_GROUP);
}

/** Free text from elsewhere (the book's language field) matched to a code, or null when unsure. */
export function matchLanguage(catalog: LanguageCatalog, freeText: string | null | undefined): string | null {
  const query = normalize(freeText ?? '');
  if (!query) return null;
  if (catalog.languages.has(query)) return query;
  const exact = [...catalog.languages.values()].filter((entry) => !entry.retired && (
    normalize(entry.name) === query || (entry.itName !== null && normalize(entry.itName) === query)));
  return exact.length === 1 ? exact[0]!.code : null;
}

/** ISO 639 code for «undetermined»: stored texts not given a language carry this one. */
export const UNDETERMINED_LANGUAGE = 'und';
