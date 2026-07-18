import { select, execute } from './dbService';
import { logger } from '../utils/logger';
import { generateId, normalizeQualityRating, qualityDefault } from '../utils';
import type {
  CoherenceResult,
  Footnote,
  FootnoteDefinition,
  GlossaryEntry,
  JudgeResult,
  Pipeline,
  PipelineConfig,
  PipelineMode,
  PipelineResult,
  PipelineRunStatus,
  PipelineStageConfig,
  ProviderRuntimeConfig,
  TranslationChunk,
} from '../types';
import type { SavedTranslation } from './projectService';

// ── DB row types ─────────────────────────────────────────────────────

interface DbPipeline {
  id: string;
  project_id: string;
  name: string;
  source_language: string;
  target_language: string;
  pipeline_mode: string | null;
  stages: string;
  judge_prompt: string;
  judge_model: string;
  judge_provider: string;
  use_chunking: number;
  words_per_chunk: number;
  source_display_text: string | null;
  source_processing_text: string | null;
  source_footnotes: string | null;
  review_provider_options: string | null;
  persona: string | null;
  custom_source_language: string | null;
  custom_target_language: string | null;
  blob_budget_tokens: number | null;
  blob_overlap: number | null;
  coherence_prompt: string | null;
  use_phrase_memory: number;
  auto_search_phrase_memory: number | null;
  phrase_memory_similarity_threshold: number | null;
  phrase_memory_max_results: number | null;
  run_status: string | null;
  last_run_config: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(value: string | null | undefined): T | undefined;
function parseJson<T>(value: string | null | undefined, fallback: T): T;
function parseJson<T>(value: string | null | undefined, fallback?: T): T | undefined {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function toPipelineRunStatus(raw: string | null): PipelineRunStatus {
  if (raw === 'running' || raw === 'completed' || raw === 'interrupted') return raw;
  return 'idle';
}

function toPipelineMode(raw: string | null): PipelineMode {
  if (raw === 'standard' || raw === 'editorial' || raw === 'deepl-hybrid') return raw;
  return 'standard';
}

function rowToPipeline(row: DbPipeline): Pipeline {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    mode: toPipelineMode(row.pipeline_mode),
    runStatus: toPipelineRunStatus(row.run_status),
    lastRunConfig: row.last_run_config ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPipelineConfig(row: DbPipeline, glossary: GlossaryEntry[], assignedGlossaryId: string | null): PipelineConfig {
  return {
    pipelineId: row.id,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    mode: toPipelineMode(row.pipeline_mode),
    stages: parseJson<PipelineStageConfig[]>(row.stages, []),
    judgePrompt: row.judge_prompt,
    judgeModel: row.judge_model,
    judgeProvider: row.judge_provider as PipelineConfig['judgeProvider'],
    useChunking: row.use_chunking === 1,
    wordsPerChunk: row.words_per_chunk ?? 0,
    reviewProviderOptions: parseJson<ProviderRuntimeConfig>(row.review_provider_options),
    persona: row.persona?.trim() || undefined,
    customSourceLanguage: row.custom_source_language || undefined,
    customTargetLanguage: row.custom_target_language || undefined,
    blobBudgetTokens: row.blob_budget_tokens ?? undefined,
    blobOverlap: row.blob_overlap ?? undefined,
    coherencePrompt: row.coherence_prompt?.trim() || undefined,
    usePhraseMemory: row.use_phrase_memory === 1,
    autoSearchPhraseMemory: row.auto_search_phrase_memory !== 0,
    phraseMemorySimilarityThreshold: row.phrase_memory_similarity_threshold ?? 0.75,
    phraseMemoryMaxResults: row.phrase_memory_max_results ?? 10,
    glossary,
    assignedGlossaryId,
    documentFormat: 'plain',
    renderProfile: 'plain-text',
    markdownAware: false,
    experimentalImport: null,
  };
}

// ── Pipeline CRUD ────────────────────────────────────────────────────

export async function listPipelines(projectId: string): Promise<Pipeline[]> {
  const rows = await select<DbPipeline>(
    'SELECT * FROM pipelines WHERE project_id = $1 ORDER BY created_at ASC',
    [projectId],
  );
  return rows.map(rowToPipeline);
}

export async function getPipelineConfig(pipelineId: string): Promise<{
  pipeline: Pipeline;
  config: PipelineConfig;
  sourceFootnotes: FootnoteDefinition[];
} | null> {
  const rows = await select<DbPipeline>('SELECT * FROM pipelines WHERE id = $1', [pipelineId]);
  if (rows.length === 0) return null;
  const row = rows[0];

  const pgRows = await select<{ glossary_id: string }>(
    'SELECT glossary_id FROM project_glossaries WHERE project_id = $1 LIMIT 1',
    [row.project_id],
  );
  const assignedGlossaryId = pgRows[0]?.glossary_id ?? null;

  const glossaryRows = await select<{ id: string; term: string; translation: string; notes: string }>(
    `SELECT ge.id, ge.term, ge.translation, ge.notes
     FROM glossary_entries ge
     JOIN project_glossaries pg ON ge.glossary_id = pg.glossary_id
     WHERE pg.project_id = $1`,
    [row.project_id],
  );

  const glossary: GlossaryEntry[] = glossaryRows.map((g, i) => ({
    id: g.id || `gloss-loaded-${row.project_id}-${i}`,
    term: g.term,
    translation: g.translation,
    notes: g.notes,
  }));

  return {
    pipeline: rowToPipeline(row),
    config: rowToPipelineConfig(row, glossary, assignedGlossaryId),
    sourceFootnotes: parseJson<FootnoteDefinition[]>(row.source_footnotes, []),
  };
}

export async function createPipeline(
  projectId: string,
  name: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  const id = generateId('pipeline');
  await execute(
    `INSERT INTO pipelines (id, project_id, name, source_language, target_language) VALUES ($1, $2, $3, $4, $5)`,
    [id, projectId, name, sourceLanguage, targetLanguage],
  );
  return id;
}

export async function renamePipeline(pipelineId: string, name: string): Promise<void> {
  await execute(
    'UPDATE pipelines SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [name, pipelineId],
  );
}

export async function duplicatePipeline(sourcePipelineId: string, newName: string): Promise<string> {
  const rows = await select<DbPipeline>('SELECT * FROM pipelines WHERE id = $1', [sourcePipelineId]);
  if (rows.length === 0) throw new Error(`Pipeline not found: ${sourcePipelineId}`);
  const source = rows[0];
  const newId = generateId('pipeline');

  await execute(
    `INSERT INTO pipelines (
       id, project_id, name, source_language, target_language, pipeline_mode,
       stages, judge_prompt, judge_model, judge_provider,
       use_chunking, words_per_chunk,
       review_provider_options, persona, custom_source_language, custom_target_language,
       blob_budget_tokens, blob_overlap,
       use_phrase_memory, auto_search_phrase_memory, phrase_memory_similarity_threshold, phrase_memory_max_results
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
    [
      newId, source.project_id, newName,
      source.source_language, source.target_language,
      source.pipeline_mode ?? 'standard',
      source.stages, source.judge_prompt, source.judge_model, source.judge_provider,
      source.use_chunking, source.words_per_chunk,
      source.review_provider_options, source.persona,
      source.custom_source_language, source.custom_target_language,
      source.blob_budget_tokens ?? 0, source.blob_overlap ?? 1,
      source.use_phrase_memory ?? 0,
      source.auto_search_phrase_memory ?? 1,
      source.phrase_memory_similarity_threshold ?? 0.75,
      source.phrase_memory_max_results ?? 10,
    ],
  );
  return newId;
}

export async function deletePipeline(pipelineId: string): Promise<void> {
  await execute('DELETE FROM translations WHERE pipeline_id = $1', [pipelineId]);
  await execute('DELETE FROM operation_logs WHERE pipeline_id = $1', [pipelineId]);
  await execute('DELETE FROM pipelines WHERE id = $1', [pipelineId]);
}

function buildPipelineConfigUpdate(
  pipelineId: string,
  config: PipelineConfig,
): { query: string; params: unknown[] } {
  return {
    query: `UPDATE pipelines SET
       source_language          = $1,
       target_language          = $2,
       pipeline_mode            = $3,
       stages                   = $4,
       judge_prompt             = $5,
       judge_model              = $6,
       judge_provider           = $7,
       use_chunking             = $8,
       words_per_chunk       = $9,
       review_provider_options  = $10,
       persona                  = $11,
       custom_source_language   = $12,
       custom_target_language   = $13,
       blob_budget_tokens       = $14,
       blob_overlap             = $15,
       coherence_prompt         = $16,
       use_phrase_memory        = $17,
       auto_search_phrase_memory = $18,
       phrase_memory_similarity_threshold = $19,
       phrase_memory_max_results = $20,
       updated_at               = CURRENT_TIMESTAMP
     WHERE id = $21`,
    params: [
      config.sourceLanguage,
      config.targetLanguage,
      config.mode ?? 'standard',
      JSON.stringify(config.stages),
      config.judgePrompt,
      config.judgeModel,
      config.judgeProvider,
      config.useChunking !== false ? 1 : 0,
      config.wordsPerChunk ?? 0,
      config.reviewProviderOptions ? JSON.stringify(config.reviewProviderOptions) : null,
      config.persona?.trim() || null,
      config.customSourceLanguage || null,
      config.customTargetLanguage || null,
      config.blobBudgetTokens ?? 0,
      config.blobOverlap ?? 1,
      config.coherencePrompt?.trim() || null,
      config.usePhraseMemory ? 1 : 0,
      config.autoSearchPhraseMemory === false ? 0 : 1,
      config.phraseMemorySimilarityThreshold ?? 0.75,
      config.phraseMemoryMaxResults ?? 10,
      pipelineId,
    ],
  };
}

export async function savePipelineConfig(
  pipelineId: string,
  config: PipelineConfig,
): Promise<void> {
  const { query, params } = buildPipelineConfigUpdate(pipelineId, config);
  await execute(query, params);
}

export async function setPipelineRunState(
  pipelineId: string,
  runStatus: PipelineRunStatus,
  configFingerprint?: string,
): Promise<void> {
  await execute(
    `UPDATE pipelines
     SET run_status      = $1,
         last_run_config = CASE WHEN $2 IS NULL THEN last_run_config ELSE $2 END,
         updated_at      = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [runStatus, configFingerprint ?? null, pipelineId],
  );
}

// ── Translations ─────────────────────────────────────────────────────

export async function loadTranslations(pipelineId: string): Promise<SavedTranslation[]> {
  return select<SavedTranslation>(
    `SELECT * FROM translations WHERE pipeline_id = $1
     ORDER BY CASE WHEN position IS NULL THEN 1 ELSE 0 END, position ASC, created_at ASC`,
    [pipelineId],
  );
}

export async function saveChunkCheckpoint(
  projectId: string,
  pipelineId: string,
  chunk: TranslationChunk,
  position: number,
): Promise<void> {
  await execute(
    `INSERT INTO translations (
       id, pipeline_id, project_id, position, chunk_status, stage_results,
       judge_status, judge_rating, translation_locked, judge_issues, coherence_result, footnotes,
       source_display_text, source_processing_text, translation_display_text, translation_processing_text,
       blob_id, blob_order, blob_reference_chunk_ids
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT(pipeline_id, id) WHERE pipeline_id IS NOT NULL DO UPDATE SET
       position                     = excluded.position,
       chunk_status                 = excluded.chunk_status,
       stage_results                = excluded.stage_results,
       judge_status                 = excluded.judge_status,
       judge_rating                 = excluded.judge_rating,
       translation_locked           = excluded.translation_locked,
       judge_issues                 = excluded.judge_issues,
       translation_display_text     = excluded.translation_display_text,
       translation_processing_text  = excluded.translation_processing_text,
       source_display_text          = excluded.source_display_text,
       source_processing_text       = excluded.source_processing_text,
       coherence_result             = excluded.coherence_result,
       footnotes                    = excluded.footnotes,
       blob_id                      = excluded.blob_id,
       blob_order                   = excluded.blob_order,
       blob_reference_chunk_ids     = excluded.blob_reference_chunk_ids`,
    [
      chunk.id,
      pipelineId,
      projectId,
      position,
      chunk.status,
      JSON.stringify(chunk.stageResults),
      chunk.judgeResult.status,
      chunk.judgeResult.rating,
      chunk.translationLocked ? 1 : 0,
      JSON.stringify(chunk.judgeResult.issues),
      chunk.coherenceResult ? JSON.stringify(chunk.coherenceResult) : null,
      chunk.footnotes?.length ? JSON.stringify(chunk.footnotes) : null,
      chunk.sourceDisplayText,
      chunk.sourceProcessingText,
      chunk.translationDisplayText,
      chunk.translationProcessingText,
      chunk.blobId ?? null,
      chunk.blobOrder ?? 0,
      chunk.blobId ? JSON.stringify(chunk.blobReferenceChunkIds ?? []) : null,
    ],
  );
}

type ExecuteQuery = (query: string, params?: unknown[]) => Promise<void>;

async function saveTranslationsInternal(
  projectId: string,
  pipelineId: string,
  chunks: TranslationChunk[],
  run: ExecuteQuery,
): Promise<void> {
  logger.info('saveTranslations', { pipelineId, chunksCount: chunks.length });
  if (chunks.length === 0) {
    logger.info('saveTranslations: chunks empty, preserving existing', { pipelineId });
    return;
  }
  for (const [position, chunk] of chunks.entries()) {
    await run(
      `INSERT INTO translations (
         id, pipeline_id, project_id, position, chunk_status, stage_results,
         judge_status, judge_rating, translation_locked, judge_issues, coherence_result, footnotes,
         source_display_text, source_processing_text, translation_display_text, translation_processing_text,
         blob_id, blob_order, blob_reference_chunk_ids
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT(pipeline_id, id) WHERE pipeline_id IS NOT NULL DO UPDATE SET
         position                     = excluded.position,
         chunk_status                 = excluded.chunk_status,
         stage_results                = excluded.stage_results,
         judge_status                 = excluded.judge_status,
         judge_rating                 = excluded.judge_rating,
         translation_locked           = excluded.translation_locked,
         judge_issues                 = excluded.judge_issues,
         coherence_result             = excluded.coherence_result,
         footnotes                    = excluded.footnotes,
         source_display_text          = excluded.source_display_text,
         source_processing_text       = excluded.source_processing_text,
         translation_display_text     = excluded.translation_display_text,
         translation_processing_text  = excluded.translation_processing_text,
         blob_id                      = excluded.blob_id,
         blob_order                   = excluded.blob_order,
         blob_reference_chunk_ids     = excluded.blob_reference_chunk_ids`,
      [
        chunk.id,
        pipelineId,
        projectId,
        position,
        chunk.status,
        JSON.stringify(chunk.stageResults),
        chunk.judgeResult.status,
        chunk.judgeResult.rating || qualityDefault(),
        chunk.translationLocked ? 1 : 0,
        JSON.stringify(chunk.judgeResult.issues),
        chunk.coherenceResult ? JSON.stringify(chunk.coherenceResult) : null,
        chunk.footnotes?.length ? JSON.stringify(chunk.footnotes) : null,
        chunk.sourceDisplayText,
        chunk.sourceProcessingText,
        chunk.translationDisplayText,
        chunk.translationProcessingText,
        chunk.blobId ?? null,
        chunk.blobOrder ?? 0,
        chunk.blobId ? JSON.stringify(chunk.blobReferenceChunkIds ?? []) : null,
      ],
    );
  }

  const placeholders = chunks.map((_, i) => `$${i + 2}`).join(', ');
  await run(
    `DELETE FROM translations WHERE pipeline_id = $1 AND id NOT IN (${placeholders})`,
    [pipelineId, ...chunks.map((c) => c.id)],
  );
}

export async function saveFullState(
  projectId: string,
  pipelineId: string,
  config: PipelineConfig,
  chunks: TranslationChunk[],
  run: ExecuteQuery,
): Promise<void> {
  const { query, params } = buildPipelineConfigUpdate(pipelineId, config);
  await run(query, params);
  await saveTranslationsInternal(projectId, pipelineId, chunks, run);
}

// ── Helpers ──────────────────────────────────────────────────────────

export function restoreTranslations(rows: SavedTranslation[]): TranslationChunk[] {
  return rows.map((row) => {
    const stageResults = parseJson<Record<string, PipelineResult>>(row.stage_results, {});
    const coherenceResult = parseJson<CoherenceResult>(row.coherence_result);
    const footnotes = row.footnotes ? parseJson<Footnote[]>(row.footnotes, []) : undefined;
    const sourceDisplayText = row.source_display_text ?? '';
    const sourceProcessingText = row.source_processing_text ?? '';
    const translationDisplayText = row.translation_display_text ?? '';
    const translationProcessingText = row.translation_processing_text ?? '';
    const judgeResult = restoreJudgeResult(row, translationDisplayText);
    const blobReferenceChunkIds = (() => {
      if (!row.blob_reference_chunk_ids) return undefined;
      const parsed = parseJson<unknown>(row.blob_reference_chunk_ids);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    })();

    return {
      id: row.id,
      sourceDisplayText,
      sourceProcessingText,
      translationDisplayText,
      translationProcessingText,
      status: (row.chunk_status || (judgeResult.status === 'completed' ? 'completed' : 'ready')) as TranslationChunk['status'],
      stageResults,
      judgeResult,
      translationLocked: row.translation_locked === 1,
      ...(coherenceResult ? { coherenceResult } : {}),
      ...(footnotes?.length ? { footnotes } : {}),
      ...(row.blob_id ? {
        blobId: row.blob_id,
        blobOrder: row.blob_order ?? 0,
        blobReferenceChunkIds: blobReferenceChunkIds ?? [],
      } : {}),
    };
  });
}

function restoreJudgeResult(row: SavedTranslation, content: string): JudgeResult {
  return {
    content,
    status: (row.judge_status || 'idle') as JudgeResult['status'],
    rating: normalizeQualityRating(row.judge_rating),
    issues: parseJson<JudgeResult['issues']>(row.judge_issues, []),
  };
}
