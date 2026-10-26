// Costruzione dell'elenco delle lingue dalle fonti ufficiali; la usano lo
// script che rigenera l'elenco incluso e il comando «Aggiorna elenco lingue».
// - ISO 639-3 (registro SIL): lingue individuali e macrolingue;
// - Glottolog (dataset CLDF): varietà (livello «dialect») collegate alla loro lingua ISO.
// I nomi italiani vengono da CLDR tramite Intl.DisplayNames; dove CLDR non ne ha
// resta il nome ufficiale inglese. Un codice sparito dalle fonti resta, segnato
// come ritirato: opere e frasi salvate continuano a leggerlo per nome.

export const ISO_SOURCE_URL = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab';
export const GLOTTOLOG_SOURCE_URL = 'https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv';

/** Ambito ISO tenuto: individuale e macrolingua (le voci speciali come «und» restano fuori). */
const KEPT_SCOPES = new Set(['I', 'M']);
/** Tipo ISO: storica o antica. */
const HISTORICAL_TYPES = new Set(['H', 'A']);

export type IsoRow = [code: string, name: string, itName: string | null, historical: 0 | 1, retired?: 0 | 1];
export type VarietyRow = [code: string, name: string, retired?: 0 | 1];

export interface IsoFile {
  source: string;
  retrievedAt: string;
  languages: IsoRow[];
}

export interface VarietiesFile {
  source: string;
  retrievedAt: string;
  varieties: Record<string, VarietyRow[]>;
}

export interface LanguageListUpdate {
  iso: IsoFile;
  varieties: VarietiesFile;
  /** Lingue che l'elenco precedente non aveva. */
  added: number;
  /** Lingue ritirate da questo aggiornamento. */
  retired: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFlag = (value: unknown) => value === undefined || value === 0 || value === 1;

const isIsoRow = (row: unknown): row is IsoRow => Array.isArray(row)
  && typeof row[0] === 'string' && typeof row[1] === 'string'
  && (row[2] === null || typeof row[2] === 'string') && (row[3] === 0 || row[3] === 1) && isFlag(row[4]);

const isVarietyRow = (row: unknown): row is VarietyRow => Array.isArray(row)
  && typeof row[0] === 'string' && typeof row[1] === 'string' && isFlag(row[2]);

const stringField = (data: Record<string, unknown>, key: string) => (typeof data[key] === 'string' ? data[key] : '');

/** Elenco ISO salvato (incluso o scaricato), validato. */
export function parseIsoFile(text: string): IsoFile {
  const data: unknown = JSON.parse(text);
  const rows = isRecord(data) ? data.languages : null;
  if (!isRecord(data) || !Array.isArray(rows) || !rows.every(isIsoRow)) throw new Error('Invalid ISO 639-3 language list');
  return { source: stringField(data, 'source'), retrievedAt: stringField(data, 'retrievedAt'), languages: rows };
}

export function parseVarietiesFile(text: string): VarietiesFile {
  const data: unknown = JSON.parse(text);
  const varieties = isRecord(data) ? data.varieties : null;
  if (!isRecord(data) || !isRecord(varieties)) throw new Error('Invalid Glottolog variety list');
  const rows = Object.fromEntries(Object.entries(varieties).map(([code, list]) => {
    if (!Array.isArray(list) || !list.every(isVarietyRow)) throw new Error(`Invalid Glottolog varieties for ${code}`);
    return [code, list];
  }));
  return { source: stringField(data, 'source'), retrievedAt: stringField(data, 'retrievedAt'), varieties: rows };
}

/** CSV con virgolette doppie (formato CLDF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('it') + value.slice(1);

function columns(header: string[] | undefined, required: string[]): Record<string, number> {
  const index = Object.fromEntries((header ?? []).map((name, position) => [name, position]));
  const missing = required.filter((name) => index[name] === undefined);
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
  return index;
}

export function buildIsoRows(tab: string, italianName: (code: string) => string | null): IsoRow[] {
  const [header, ...rows] = tab.trim().split('\n').map((line) => line.replace(/\r$/, '').split('\t'));
  const col = columns(header, ['Id', 'Part1', 'Scope', 'Language_Type', 'Ref_Name']);
  const built = rows
    .filter((row) => KEPT_SCOPES.has(row[col.Scope]))
    .map((row): IsoRow => {
      const code = row[col.Id];
      const itName = italianName(row[col.Part1] || code);
      return [code, row[col.Ref_Name], itName ? capitalize(itName) : null, HISTORICAL_TYPES.has(row[col.Language_Type]) ? 1 : 0];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (built.length === 0) throw new Error('Empty ISO 639-3 list');
  return built;
}

export function buildVarietyRows(csv: string, isoCodes: ReadonlySet<string>): Record<string, VarietyRow[]> {
  const [header, ...rows] = parseCsv(csv);
  const col = columns(header, ['Glottocode', 'Name', 'Level', 'ISO639P3code', 'Language_ID']);
  const isoByGlottocode = new Map(rows
    .filter((row) => row[col.Level] === 'language' && isoCodes.has(row[col.ISO639P3code]))
    .map((row) => [row[col.Glottocode], row[col.ISO639P3code]] as const));
  const grouped = rows
    .filter((row) => row[col.Level] === 'dialect')
    .reduce<Record<string, VarietyRow[]>>((acc, row) => {
      const iso = isoByGlottocode.get(row[col.Language_ID]);
      return iso ? { ...acc, [iso]: [...(acc[iso] ?? []), [row[col.Glottocode], row[col.Name]]] } : acc;
    }, {});
  return sortVarieties(grouped);
}

function sortVarieties(varieties: Record<string, VarietyRow[]>): Record<string, VarietyRow[]> {
  return Object.fromEntries(Object.entries(varieties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, list]) => [iso, [...list].sort((a, b) => a[1].localeCompare(b[1]))]));
}

const retiredCopy = <T extends IsoRow | VarietyRow>(row: T, index: number): T =>
  [...row.slice(0, index), 1] as unknown as T;

/** Le righe nuove, più quelle del vecchio elenco che le fonti non hanno più, segnate ritirate. */
export function mergeIsoRows(previous: readonly IsoRow[], next: readonly IsoRow[]) {
  const nextCodes = new Set(next.map(([code]) => code));
  const previousCodes = new Set(previous.map(([code]) => code));
  const kept = previous.filter(([code]) => !nextCodes.has(code));
  return {
    rows: [...next, ...kept.map((row) => retiredCopy(row, 4))].sort((a, b) => a[0].localeCompare(b[0])),
    added: next.filter(([code]) => !previousCodes.has(code)).length,
    retired: kept.filter((row) => row[4] !== 1).length,
  };
}

export function mergeVarietyRows(previous: Record<string, VarietyRow[]>, next: Record<string, VarietyRow[]>): Record<string, VarietyRow[]> {
  const nextCodes = new Set(Object.values(next).flat().map(([code]) => code));
  const kept = Object.entries(previous).reduce<Record<string, VarietyRow[]>>((acc, [iso, list]) => {
    const gone = list.filter(([code]) => !nextCodes.has(code)).map((row) => retiredCopy(row, 2));
    return gone.length ? { ...acc, [iso]: [...(next[iso] ?? []), ...gone] } : acc;
  }, {});
  return sortVarieties({ ...next, ...kept });
}

export interface LanguageSourceTexts {
  isoTab: string;
  glottologCsv: string;
}

/** L'elenco nuovo dalle fonti scaricate, unito a quello in uso. */
export function buildLanguageListUpdate(
  sources: LanguageSourceTexts,
  current: { iso: IsoFile; varieties: VarietiesFile },
  italianName: (code: string) => string | null,
  retrievedAt: string,
): LanguageListUpdate {
  const isoRows = buildIsoRows(sources.isoTab, italianName);
  const iso = mergeIsoRows(current.iso.languages, isoRows);
  const varieties = mergeVarietyRows(current.varieties.varieties, buildVarietyRows(sources.glottologCsv, new Set(isoRows.map(([code]) => code))));
  return {
    iso: { source: ISO_SOURCE_URL, retrievedAt, languages: iso.rows },
    varieties: { source: GLOTTOLOG_SOURCE_URL, retrievedAt, varieties },
    added: iso.added,
    retired: iso.retired,
  };
}

/** Nomi italiani da CLDR; null dove CLDR non ne ha uno. */
export function cldrItalianNames(): (code: string) => string | null {
  const italian = new Intl.DisplayNames(['it'], { type: 'language', fallback: 'none' });
  return (code) => {
    try {
      return italian.of(code) ?? null;
    } catch {
      // Un codice che Intl non accetta come tag di lingua non ha nome CLDR.
      return null;
    }
  };
}
