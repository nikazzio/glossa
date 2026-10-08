import type { GlossaryData } from '../services/statsService';
import { monthOf } from './dashboardStats';
import { wilsonInterval, type Interval } from './statistics';

/** Quanti termini si elencano fra i più disattesi e fra i conflitti. */
export const TOP_TERMS = 5;

/** Confronto senza maiuscole e con le lettere accentate in una sola forma. */
function normalize(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parola intera: né lettere né cifre subito prima o subito dopo (Unicode). */
function wholeWord(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(normalize(term))}(?![\\p{L}\\p{N}])`, 'u');
}

/** Le forme ammesse di una traduzione: alternative separate da «/» o «;». */
function translationForms(translation: string): RegExp[] {
  return translation.split(/[/;]/).map((form) => form.trim()).filter(Boolean).map(wholeWord);
}

export interface TermMisses {
  term: string;
  misses: number;
}

export interface GlossaryReport {
  id: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  entries: number;
  projects: number;
  /** Voci nuove per mese, dal più vecchio. */
  monthlyEntries: number[];
  /** Coppie frammento tradotto–termine presente nell'originale. */
  cases: number;
  respected: number;
  rate: number | null;
  interval: Interval | null;
  mostMissed: TermMisses[];
  /** Voci mai trovate nell'originale delle traduzioni che usano il glossario. */
  neverSeen: string[];
  /** Il glossario è usato da traduzioni con testo: le misure hanno senso. */
  hasTexts: boolean;
}

export interface GlossaryConflict {
  term: string;
  translations: { translation: string; glossaries: string[] }[];
}

export interface GlossaryStats {
  reports: GlossaryReport[];
  conflicts: GlossaryConflict[];
}

/**
 * Rispetto del glossario: per ogni frammento tradotto e ogni termine che
 * compare (parola intera) nel suo originale, si guarda se la traduzione
 * contiene una forma ammessa della traduzione del glossario. Un caso è una
 * coppia frammento–termine, non ogni ripetizione: dieci «bottega» nello stesso
 * frammento sono una sola scelta del traduttore. La quota rispettata ha
 * l'intervallo di Wilson al 95%. Vale la traduzione corretta nel workspace del
 * progetto, se c'è; le voci nascoste lì non contano. Il confronto è sulla forma
 * esatta: un plurale o un'altra flessione conta come non rispettato.
 */
export function summarizeGlossaries(data: GlossaryData): GlossaryStats {
  const overrides = new Map(data.overrides.map((row) => [`${row.workspace_id}:${row.entry_id}`, row]));
  const chunksByProject = new Map<string, GlossaryData['chunks']>();
  for (const chunk of data.chunks) {
    const list = chunksByProject.get(chunk.project_id);
    if (list) list.push(chunk); else chunksByProject.set(chunk.project_id, [chunk]);
  }
  const normalizedChunks = new Map([...chunksByProject.entries()].map(([projectId, chunks]) => [projectId,
    chunks.map((chunk) => ({ completed: chunk.completed === 1, source: normalize(chunk.source_text), target: normalize(chunk.translation_text) }))]));

  const reports = data.glossaries.map((glossary): GlossaryReport => {
    const entries = data.entries.filter((entry) => entry.glossary_id === glossary.id);
    const links = data.links.filter((link) => link.glossary_id === glossary.id);
    const seen = new Set<string>();
    const misses = new Map<string, number>();
    let cases = 0;
    let respected = 0;
    for (const link of links) {
      const chunks = normalizedChunks.get(link.project_id) ?? [];
      for (const entry of entries) {
        const override = overrides.get(`${link.workspace_id}:${entry.id}`);
        if (override?.hidden === 1) continue;
        const pattern = wholeWord(entry.term);
        const forms = translationForms(override?.translation ?? entry.translation);
        for (const chunk of chunks) {
          if (!pattern.test(chunk.source)) continue;
          seen.add(entry.id);
          if (!chunk.completed || forms.length === 0) continue;
          cases += 1;
          if (forms.some((form) => form.test(chunk.target))) respected += 1;
          else misses.set(entry.term, (misses.get(entry.term) ?? 0) + 1);
        }
      }
    }
    const months = new Map<string, number>();
    for (const entry of entries) months.set(monthOf(entry.created_at), (months.get(monthOf(entry.created_at)) ?? 0) + 1);
    const hasTexts = links.some((link) => (normalizedChunks.get(link.project_id) ?? []).length > 0);
    return {
      id: glossary.id,
      name: glossary.name,
      sourceLanguage: glossary.source_language,
      targetLanguage: glossary.target_language,
      entries: entries.length,
      projects: links.length,
      monthlyEntries: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, count]) => count),
      cases,
      respected,
      rate: cases > 0 ? respected / cases : null,
      interval: wilsonInterval(respected, cases),
      mostMissed: [...misses.entries()].map(([term, count]) => ({ term, misses: count }))
        .sort((a, b) => b.misses - a.misses || a.term.localeCompare(b.term)).slice(0, TOP_TERMS),
      neverSeen: hasTexts ? entries.filter((entry) => !seen.has(entry.id)).map((entry) => entry.term).sort() : [],
      hasTexts,
    };
  }).sort((a, b) => b.projects - a.projects || b.entries - a.entries);

  return { reports, conflicts: findConflicts(data) };
}

/** Stesso termine in più glossari con traduzioni diverse (confronto senza maiuscole). */
function findConflicts(data: GlossaryData): GlossaryConflict[] {
  const names = new Map(data.glossaries.map((glossary) => [glossary.id, glossary.name]));
  const byTerm = new Map<string, { term: string; translations: Map<string, { translation: string; glossaries: string[] }> }>();
  for (const entry of data.entries) {
    const key = normalize(entry.term.trim());
    const group = byTerm.get(key) ?? { term: entry.term.trim(), translations: new Map() };
    const translationKey = normalize(entry.translation.trim());
    const current = group.translations.get(translationKey) ?? { translation: entry.translation.trim(), glossaries: [] };
    group.translations.set(translationKey, { ...current, glossaries: [...current.glossaries, names.get(entry.glossary_id) ?? ''] });
    byTerm.set(key, group);
  }
  return [...byTerm.values()]
    .filter((group) => group.translations.size > 1)
    .map((group) => ({ term: group.term, translations: [...group.translations.values()] }))
    .sort((a, b) => a.term.localeCompare(b.term));
}
