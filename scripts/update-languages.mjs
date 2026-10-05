#!/usr/bin/env node
// Rigenera l'elenco delle lingue incluso nell'app dalle fonti ufficiali:
// - ISO 639-3 (registro SIL): lingue individuali e macrolingue;
// - Glottolog (dataset CLDF): varietà (livello «dialect») collegate alla loro lingua ISO.
// I nomi italiani vengono da CLDR tramite Intl.DisplayNames; dove CLDR non ne ha,
// resta il nome ufficiale inglese. Uso: node scripts/update-languages.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ISO_URL = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab';
const GLOTTOLOG_URL = 'https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'languages', 'data');
/** Ambito ISO tenuto: individuale e macrolingua (le voci speciali come «und» restano fuori). */
const KEPT_SCOPES = new Set(['I', 'M']);
/** Tipo ISO: storica o antica. */
const HISTORICAL_TYPES = new Set(['H', 'A']);

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

/** CSV con virgolette doppie (formato CLDF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
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

const capitalize = (value) => (value ? value.charAt(0).toLocaleUpperCase('it') + value.slice(1) : value);

function buildIso(tab) {
  const italian = new Intl.DisplayNames(['it'], { type: 'language', fallback: 'none' });
  const [header, ...rows] = tab.trim().split('\n').map((line) => line.replace(/\r$/, '').split('\t'));
  const col = Object.fromEntries(header.map((name, index) => [name, index]));
  return rows
    .filter((row) => KEPT_SCOPES.has(row[col.Scope]))
    .map((row) => {
      const code = row[col.Id];
      const part1 = row[col.Part1];
      const itName = italian.of(part1 || code) ?? null;
      const historical = HISTORICAL_TYPES.has(row[col.Language_Type]) ? 1 : 0;
      return [code, row[col.Ref_Name], itName ? capitalize(itName) : null, historical];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function buildVarieties(csv, isoCodes) {
  const [header, ...rows] = parseCsv(csv);
  const col = Object.fromEntries(header.map((name, index) => [name, index]));
  const isoByGlottocode = new Map(rows
    .filter((row) => row[col.Level] === 'language' && isoCodes.has(row[col.ISO639P3code]))
    .map((row) => [row[col.Glottocode], row[col.ISO639P3code]]));
  const varieties = {};
  for (const row of rows) {
    if (row[col.Level] !== 'dialect') continue;
    const iso = isoByGlottocode.get(row[col.Language_ID]);
    if (!iso) continue;
    varieties[iso] = [...(varieties[iso] ?? []), [row[col.Glottocode], row[col.Name]]];
  }
  return Object.fromEntries(Object.entries(varieties)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, list]) => [iso, list.sort((a, b) => a[1].localeCompare(b[1]))]));
}

const [tab, csv] = await Promise.all([fetchText(ISO_URL), fetchText(GLOTTOLOG_URL)]);
const languages = buildIso(tab);
const varieties = buildVarieties(csv, new Set(languages.map(([code]) => code)));
const retrievedAt = new Date().toISOString().slice(0, 10);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'iso639-3.json'), JSON.stringify({ source: ISO_URL, retrievedAt, languages }));
await writeFile(join(OUT_DIR, 'glottolog-varieties.json'), JSON.stringify({ source: GLOTTOLOG_URL, retrievedAt, varieties }));
console.log(`${languages.length} lingue, ${Object.values(varieties).flat().length} varietà in ${OUT_DIR}`);
