#!/usr/bin/env -S npx tsx
// Rigenera l'elenco delle lingue incluso nell'app dalle fonti ufficiali, con la
// stessa costruzione del comando «Aggiorna elenco lingue»: i codici spariti dalle
// fonti restano, segnati come ritirati. Uso: npx tsx scripts/update-languages.ts
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLanguageListUpdate,
  cldrItalianNames,
  GLOTTOLOG_SOURCE_URL,
  ISO_SOURCE_URL,
  parseIsoFile,
  parseVarietiesFile,
} from '../src/languages/build';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'languages', 'data');
const ISO_PATH = join(OUT_DIR, 'iso639-3.json');
const VARIETIES_PATH = join(OUT_DIR, 'glottolog-varieties.json');

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

const [isoTab, glottologCsv, currentIso, currentVarieties] = await Promise.all([
  fetchText(ISO_SOURCE_URL),
  fetchText(GLOTTOLOG_SOURCE_URL),
  readFile(ISO_PATH, 'utf8'),
  readFile(VARIETIES_PATH, 'utf8'),
]);
const update = buildLanguageListUpdate(
  { isoTab, glottologCsv },
  { iso: parseIsoFile(currentIso), varieties: parseVarietiesFile(currentVarieties) },
  cldrItalianNames(),
  new Date().toISOString().slice(0, 10),
);
await writeFile(ISO_PATH, JSON.stringify(update.iso));
await writeFile(VARIETIES_PATH, JSON.stringify(update.varieties));
console.log(`${update.iso.languages.length} lingue (${update.added} nuove, ${update.retired} ritirate ora) in ${OUT_DIR}`);
