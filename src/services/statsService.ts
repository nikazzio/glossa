import { select } from './dbService';

/**
 * Letture per la vista Statistiche della Dashboard. Solo dati già registrati:
 * storico delle operazioni, revisioni di trascrizione, frammenti, memoria delle
 * frasi. Nessun contatore nuovo: i calcoli stanno in `utils/dashboardStats.ts`.
 *
 * Ogni lettura riceve il workspace (o `null` per tutti) e l'inizio del periodo
 * (o `null` per tutto lo storico). Le date dello storico sono ISO con «Z», quelle
 * delle tabelle SQLite `CURRENT_TIMESTAMP`: si confrontano sempre con
 * `datetime()`, che le legge entrambe.
 */

export interface UsageRow {
  at: string;
  scope: string;
  level: string;
  phase: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_miss_input_tokens: number | null;
  duration_ms: number | null;
  cost_usd: number | null;
  is_free: number | null;
  attempt_number: number | null;
  chunk_id: string | null;
  project_id: string | null;
  transcription_document_id: string | null;
}

/** Le chiamate ai modelli (righe con token), più errori e tentativi ripetuti. */
export function loadUsageRows(workspaceId: string | null, since: string | null): Promise<UsageRow[]> {
  return select<UsageRow>(
    `SELECT ol.at, ol.scope, ol.level, ol.phase, ol.provider, ol.model,
            ol.input_tokens, ol.output_tokens, ol.cached_input_tokens, ol.cache_miss_input_tokens,
            ol.duration_ms, ol.cost_usd, ol.is_free, ol.attempt_number,
            ol.chunk_id, ol.project_id, ol.transcription_document_id
       FROM operation_logs ol
       LEFT JOIN projects p ON p.id = ol.project_id
       LEFT JOIN transcription_documents d ON d.id = ol.transcription_document_id
      WHERE (ol.input_tokens IS NOT NULL OR ol.output_tokens IS NOT NULL
             OR ol.level = 'error' OR ol.phase = 'retry')
        AND ($1 IS NULL OR p.workspace_id = $1 OR d.workspace_id = $1)
        AND ($2 IS NULL OR datetime(ol.at) >= datetime($2))
      ORDER BY ol.at ASC`,
    [workspaceId, since],
  );
}

export type ActivityKind = 'transcription' | 'ocr' | 'translation' | 'source';

export interface ActivityRow {
  day: string;
  kind: ActivityKind;
  count: number;
}

/**
 * Lavoro fatto giorno per giorno, nel fuso del computer: pagine trascritte a
 * mano o lette con l'OCR (una pagina conta una volta al giorno), frammenti
 * tradotti (fase conclusa, un frammento una volta al giorno), opere aggiunte.
 */
export function loadActivity(workspaceId: string | null, since: string): Promise<ActivityRow[]> {
  return select<ActivityRow>(
    `SELECT day, kind, COUNT(*) AS count FROM (
       SELECT date(r.created_at, 'localtime') AS day,
              CASE r.created_by WHEN 'ocr' THEN 'ocr' ELSE 'transcription' END AS kind,
              r.segment_id AS item
         FROM transcription_revisions r
         JOIN transcription_segments s ON s.id = r.segment_id
         JOIN transcription_documents d ON d.id = s.document_id
        WHERE r.created_by IN ('user', 'ocr')
          AND ($1 IS NULL OR d.workspace_id = $1)
          AND datetime(r.created_at) >= datetime($2)
        GROUP BY day, kind, item
       UNION ALL
       SELECT date(ol.at, 'localtime') AS day, 'translation' AS kind, ol.chunk_id AS item
         FROM operation_logs ol
         JOIN projects p ON p.id = ol.project_id
        WHERE ol.scope = 'stage' AND ol.phase = 'end' AND ol.level = 'success'
          AND ol.chunk_id IS NOT NULL
          AND ($1 IS NULL OR p.workspace_id = $1)
          AND datetime(ol.at) >= datetime($2)
        GROUP BY day, item
       UNION ALL
       SELECT date(s.created_at, 'localtime') AS day, 'source' AS kind, s.id AS item
         FROM sources s
        WHERE s.status = 'active'
          AND ($1 IS NULL OR EXISTS (SELECT 1 FROM workspace_items wi
                WHERE wi.item_type = 'source' AND wi.item_id = s.id AND wi.workspace_id = $1))
          AND datetime(s.created_at) >= datetime($2)
     )
     GROUP BY day, kind`,
    [workspaceId, since],
  );
}

export interface WordTotals {
  transcribed_words: number;
  translated_words: number;
}

/**
 * Parole nell'ultima versione di ogni pagina e nei frammenti tradotti. Le
 * parole si contano dagli spazi (`spazi + 1` per testo non vuoto): per testi
 * storici in prosa è una stima onesta, e non richiede di leggere i testi qui.
 */
export async function loadWordTotals(workspaceId: string | null): Promise<WordTotals> {
  const words = (column: string) =>
    `CASE WHEN TRIM(${column}) = '' THEN 0
          ELSE LENGTH(TRIM(${column})) - LENGTH(REPLACE(TRIM(${column}), ' ', '')) + 1 END`;
  const [row] = await select<WordTotals>(
    `SELECT
       (SELECT COALESCE(SUM(${words('r.text')}), 0)
          FROM transcription_segments s
          JOIN transcription_documents d ON d.id = s.document_id
          JOIN transcription_revisions r ON r.id = (
            SELECT id FROM transcription_revisions
             WHERE segment_id = s.id ORDER BY revision_number DESC LIMIT 1)
         WHERE d.status = 'active' AND ($1 IS NULL OR d.workspace_id = $1)) AS transcribed_words,
       (SELECT COALESCE(SUM(${words('t.translation_display_text')}), 0)
          FROM translations t
          JOIN projects p ON p.id = t.project_id
         WHERE t.chunk_status = 'completed' AND ($1 IS NULL OR p.workspace_id = $1)) AS translated_words`,
    [workspaceId],
  );
  return row ?? { transcribed_words: 0, translated_words: 0 };
}

export interface QualityRow {
  chunk_id: string;
  rating: string;
  model: string | null;
  provider: string | null;
}

/**
 * Giudizio di ogni frammento giudicato, con il modello dell'ultima fase di
 * traduzione conclusa su quel frammento: è il modello che ha prodotto il testo
 * giudicato.
 */
export function loadQualityRows(workspaceId: string | null, since: string | null): Promise<QualityRow[]> {
  return select<QualityRow>(
    `SELECT t.id AS chunk_id, t.judge_rating AS rating, last.model, last.provider
       FROM translations t
       JOIN projects p ON p.id = t.project_id
       JOIN operation_logs last ON last.id = (
         SELECT ol.id FROM operation_logs ol
          WHERE ol.chunk_id = t.id AND ol.scope = 'stage' AND ol.phase = 'end'
            AND ol.level = 'success' AND ol.model IS NOT NULL
          ORDER BY ol.at DESC LIMIT 1)
      WHERE t.judge_status = 'completed'
        AND ($1 IS NULL OR p.workspace_id = $1)
        AND ($2 IS NULL OR datetime(last.at) >= datetime($2))`,
    [workspaceId, since],
  );
}

/** Le pagine corrette più recenti bastano a misurare un modello, e il
 *  confronto carattere per carattere costa: oltre questo numero non si va. */
const OCR_SAMPLE_LIMIT = 200;

export interface OcrCorrectionRow {
  ocr_text: string;
  final_text: string;
  model: string | null;
}

/**
 * Pagine lette con l'OCR e poi corrette a mano: il testo dell'ultima lettura
 * OCR e quello dell'ultima versione scritta a mano dopo di essa. Il modello è
 * quello dell'esito di lettura registrato per la stessa pagina subito prima
 * della revisione OCR (la riga di log non porta l'identificativo della
 * revisione, solo la pagina).
 */
export function loadOcrCorrections(workspaceId: string | null, since: string | null): Promise<OcrCorrectionRow[]> {
  return select<OcrCorrectionRow>(
    `SELECT o.text AS ocr_text, u.text AS final_text,
            (SELECT ol.model FROM operation_logs ol
              WHERE ol.transcription_segment_id = o.segment_id AND ol.scope = 'ocr'
                AND ol.phase = 'end' AND ol.model IS NOT NULL
                AND datetime(ol.at) <= datetime(o.created_at, '+5 minutes')
              ORDER BY ol.at DESC LIMIT 1) AS model
       FROM transcription_revisions o
       JOIN transcription_segments s ON s.id = o.segment_id
       JOIN transcription_documents d ON d.id = s.document_id
       JOIN transcription_revisions u ON u.id = (
         SELECT id FROM transcription_revisions
          WHERE segment_id = o.segment_id AND created_by = 'user'
            AND revision_number > o.revision_number
          ORDER BY revision_number DESC LIMIT 1)
      WHERE o.created_by = 'ocr'
        AND o.revision_number = (
          SELECT MAX(revision_number) FROM transcription_revisions
           WHERE segment_id = o.segment_id AND created_by = 'ocr')
        AND TRIM(o.text) <> '' AND TRIM(u.text) <> ''
        AND ($1 IS NULL OR d.workspace_id = $1)
        AND ($2 IS NULL OR datetime(u.created_at) >= datetime($2))
      ORDER BY u.created_at DESC
      LIMIT ${OCR_SAMPLE_LIMIT}`,
    [workspaceId, since],
  );
}

export interface MemoryMonthRow {
  month: string;
  count: number;
}

export interface MemoryPairRow {
  source_language: string;
  source_variety: string | null;
  target_language: string;
  target_variety: string | null;
  count: number;
}

export interface MemoryStats {
  total: number;
  months: MemoryMonthRow[];
  pairs: MemoryPairRow[];
}

/** Frasi salvate: totale, nuove per mese, coppie di lingue. */
export async function loadMemoryStats(workspaceId: string | null): Promise<MemoryStats> {
  const scope = `($1 IS NULL OR u.workspace_id = $1)`;
  const [months, pairs] = await Promise.all([
    select<MemoryMonthRow>(
      `SELECT strftime('%Y-%m', m.created_at, 'localtime') AS month, COUNT(*) AS count
         FROM phrase_memory m JOIN text_units u ON u.id = m.unit_id
        WHERE ${scope}
        GROUP BY month ORDER BY month ASC`,
      [workspaceId],
    ),
    select<MemoryPairRow>(
      `SELECT sr.language AS source_language, sr.language_variety AS source_variety,
              tr.language AS target_language, tr.language_variety AS target_variety,
              COUNT(*) AS count
         FROM phrase_memory m
         JOIN text_units u ON u.id = m.unit_id
         JOIN text_unit_revisions sr ON sr.id = m.source_revision_id
         JOIN text_unit_revisions tr ON tr.id = m.target_revision_id
        WHERE ${scope}
        GROUP BY sr.language, sr.language_variety, tr.language, tr.language_variety
        ORDER BY count DESC`,
      [workspaceId],
    ),
  ]);
  return { total: months.reduce((sum, row) => sum + row.count, 0), months, pairs };
}

export interface LanguagePairRow {
  source_language: string;
  source_variety: string | null;
  target_language: string;
  target_variety: string | null;
  projects: number;
}

/** Coppie di lingue delle traduzioni, con le varietà. */
export function loadTranslationLanguages(workspaceId: string | null): Promise<LanguagePairRow[]> {
  return select<LanguagePairRow>(
    `SELECT source_language, source_language_variety AS source_variety,
            target_language, target_language_variety AS target_variety, COUNT(*) AS projects
       FROM projects
      WHERE source_language <> '' AND target_language <> ''
        AND ($1 IS NULL OR workspace_id = $1)
      GROUP BY source_language, source_language_variety, target_language, target_language_variety
      ORDER BY projects DESC`,
    [workspaceId],
  );
}

export interface GlossaryRow {
  id: string;
  name: string;
  source_language: string;
  target_language: string;
}

export interface GlossaryEntryRow {
  id: string;
  glossary_id: string;
  term: string;
  translation: string;
  created_at: string;
}

export interface GlossaryLinkRow {
  glossary_id: string;
  project_id: string;
  workspace_id: string;
}

export interface GlossaryOverrideRow {
  workspace_id: string;
  entry_id: string;
  translation: string | null;
  hidden: number;
}

export interface GlossaryChunkRow {
  project_id: string;
  completed: number;
  source_text: string;
  translation_text: string;
}

export interface GlossaryData {
  glossaries: GlossaryRow[];
  entries: GlossaryEntryRow[];
  links: GlossaryLinkRow[];
  overrides: GlossaryOverrideRow[];
  chunks: GlossaryChunkRow[];
}

/**
 * Glossari con voci, traduzioni che li usano, correzioni per workspace e testi
 * dei frammenti di quelle traduzioni (prima pipeline, come il catalogo). I
 * glossari sono dell'applicazione; il workspace restringe solo le traduzioni.
 */
export async function loadGlossaryData(workspaceId: string | null): Promise<GlossaryData> {
  const [glossaries, entries, links, overrides, chunks] = await Promise.all([
    select<GlossaryRow>(`SELECT id, name, COALESCE(source_language, '') AS source_language,
        COALESCE(target_language, '') AS target_language FROM glossaries ORDER BY name`),
    select<GlossaryEntryRow>(`SELECT id, glossary_id, term, translation, created_at FROM glossary_entries`),
    select<GlossaryLinkRow>(
      `SELECT pg.glossary_id, pg.project_id, p.workspace_id
         FROM project_glossaries pg JOIN projects p ON p.id = pg.project_id
        WHERE $1 IS NULL OR p.workspace_id = $1`,
      [workspaceId],
    ),
    select<GlossaryOverrideRow>(`SELECT workspace_id, entry_id, translation, hidden FROM glossary_entry_overrides`),
    select<GlossaryChunkRow>(
      `SELECT t.project_id, CASE WHEN t.chunk_status = 'completed' THEN 1 ELSE 0 END AS completed,
              COALESCE(t.source_display_text, '') AS source_text,
              COALESCE(t.translation_display_text, '') AS translation_text
         FROM translations t
         JOIN projects p ON p.id = t.project_id
        WHERE EXISTS (SELECT 1 FROM project_glossaries pg WHERE pg.project_id = t.project_id)
          AND ($1 IS NULL OR p.workspace_id = $1)
          AND t.pipeline_id = (SELECT pi.id FROM pipelines pi WHERE pi.project_id = t.project_id
                                ORDER BY pi.created_at ASC LIMIT 1)`,
      [workspaceId],
    ),
  ]);
  return { glossaries, entries, links, overrides, chunks };
}

export interface DailyOutputRow {
  id: string;
  day: string;
  count: number;
}

/**
 * Lavoro fatto per giorno su ogni documento e ogni traduzione, su tutto lo
 * storico: una pagina conta nel giorno in cui ha avuto testo per la prima
 * volta, un frammento nel giorno della sua prima fase di traduzione conclusa.
 * Rifare una pagina o un frammento non lo conta due volte. Solo la prima
 * pipeline del progetto, quella su cui il catalogo conta fatti e mancanti.
 */
export async function loadDailyOutput(): Promise<{ transcriptions: DailyOutputRow[]; translations: DailyOutputRow[] }> {
  const [transcriptions, translations] = await Promise.all([
    select<DailyOutputRow>(
      `SELECT s.document_id AS id, date(first.created_at, 'localtime') AS day, COUNT(*) AS count
         FROM transcription_segments s
         JOIN transcription_revisions first ON first.id = (
           SELECT id FROM transcription_revisions
            WHERE segment_id = s.id AND TRIM(text) <> ''
            ORDER BY revision_number ASC LIMIT 1)
        GROUP BY s.document_id, day
        ORDER BY day ASC`,
    ),
    select<DailyOutputRow>(
      `SELECT project_id AS id, day, COUNT(*) AS count FROM (
         SELECT t.project_id, date(MIN(ol.at), 'localtime') AS day
           FROM operation_logs ol
           JOIN translations t ON t.id = ol.chunk_id
          WHERE ol.scope = 'stage' AND ol.phase = 'end' AND ol.level = 'success'
            AND t.pipeline_id = (SELECT pi.id FROM pipelines pi WHERE pi.project_id = t.project_id
                                  ORDER BY pi.created_at ASC LIMIT 1)
          GROUP BY t.id)
        GROUP BY project_id, day
        ORDER BY day ASC`,
    ),
  ]);
  return { transcriptions, translations };
}

export interface ChunkWordsRow {
  id: string;
  words: number;
}

/** Parole tradotte per frammento completato, per i rapporti costo/parole. */
export function loadChunkWords(workspaceId: string | null): Promise<ChunkWordsRow[]> {
  return select<ChunkWordsRow>(
    `SELECT t.id,
            CASE WHEN TRIM(t.translation_display_text) = '' THEN 0
                 ELSE LENGTH(TRIM(t.translation_display_text))
                      - LENGTH(REPLACE(TRIM(t.translation_display_text), ' ', '')) + 1 END AS words
       FROM translations t
       JOIN projects p ON p.id = t.project_id
      WHERE t.chunk_status = 'completed' AND ($1 IS NULL OR p.workspace_id = $1)`,
    [workspaceId],
  );
}

export interface RemainingChunksRow {
  pipeline_id: string;
  source_text: string;
}

/** Testo dei frammenti ancora da tradurre nella prima pipeline del progetto. */
export function loadRemainingChunks(projectId: string): Promise<RemainingChunksRow[]> {
  return select<RemainingChunksRow>(
    `SELECT t.pipeline_id, t.source_display_text AS source_text
       FROM translations t
      WHERE t.pipeline_id = (SELECT pi.id FROM pipelines pi WHERE pi.project_id = $1
                              ORDER BY pi.created_at ASC LIMIT 1)
        AND t.chunk_status <> 'completed'
      ORDER BY t.position ASC`,
    [projectId],
  );
}

export interface MonthSummary {
  pages: number;
  fragments: number;
  phrases: number;
  usage: UsageRow[];
}

/** Il mese in corso in una riga: pagine scritte o lette, frammenti tradotti,
 *  frasi salvate e le chiamate ai modelli da cui si calcola la spesa. */
export async function loadMonthSummary(workspaceId: string | null, now: Date = new Date()): Promise<MonthSummary> {
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
  const [activity, usage, [phrases]] = await Promise.all([
    loadActivity(workspaceId, monthStart),
    loadUsageRows(workspaceId, monthStart),
    select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM phrase_memory m JOIN text_units u ON u.id = m.unit_id
        WHERE ($1 IS NULL OR u.workspace_id = $1) AND datetime(m.created_at) >= datetime($2)`,
      [workspaceId, monthStart],
    ),
  ]);
  const total = (kinds: ActivityKind[]) => activity.filter((row) => kinds.includes(row.kind))
    .reduce((sum, row) => sum + Number(row.count), 0);
  return { pages: total(['transcription', 'ocr']), fragments: total(['translation']), phrases: phrases?.count ?? 0, usage };
}
