import { select, execute, runInTransaction } from './dbService';
import { logger } from '../utils/logger';
import type {
  CoherenceResult,
  Footnote,
  FootnoteDefinition,
  GlossaryEntry,
  JudgeResult,
  PipelineConfig,
  PipelineMode,
  PipelineRunStatus,
  PipelineResult,
  PipelineStageConfig,
  ProviderRuntimeConfig,
  TranslationChunk,
  ViewMode,
} from '../types';
import { normalizeQualityRating, qualityDefault } from '../utils';

// ── Types ────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  source_language: string;
  target_language: string;
  view_mode?: ViewMode | null;
  created_at: string;
  updated_at: string;
}

export interface SavedTranslation {
  id: string;
  project_id: string;
  original_text: string;
  final_translation: string;
  source_display_text?: string | null;
  source_processing_text?: string | null;
  translation_display_text?: string | null;
  translation_processing_text?: string | null;
  position?: number | null;
  chunk_status: TranslationChunk['status'];
  stage_results: string; // JSON
  judge_status: JudgeResult['status'];
  judge_rating: JudgeResult['rating'];
  translation_locked?: number | null;
  judge_issues: string; // JSON
  coherence_result?: string | null;
  footnotes?: string | null;
  blob_id?: string | null;
  blob_order?: number | null;
  blob_reference_chunk_ids?: string | null;
  created_at: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T;
function parseJson<T>(value: string | null | undefined): T | undefined;
function parseJson<T>(value: string | null | undefined, fallback?: T): T | undefined {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseStringArray(value: string | null | undefined): string[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

function serializeBlobReferenceChunkIds(chunk: TranslationChunk): string | null {
  return chunk.blobId ? JSON.stringify(chunk.blobReferenceChunkIds ?? []) : null;
}

function restoreJudgeResult(row: SavedTranslation): JudgeResult {
  return {
    content: row.final_translation,
    status: row.judge_status || 'idle',
    rating: normalizeQualityRating(row.judge_rating),
    issues: parseJson<JudgeResult['issues']>(row.judge_issues, []),
  };
}

export function restoreTranslations(rows: SavedTranslation[]): TranslationChunk[] {
  return rows.map((row) => {
    const judgeResult = restoreJudgeResult(row);
    const stageResults = parseJson<Record<string, PipelineResult>>(row.stage_results, {});
    const restoredTranslationDisplay = row.translation_display_text ?? '';
    const restoredTranslationProcessing = row.translation_processing_text ?? '';
    const coherenceResult = parseJson<CoherenceResult>(row.coherence_result);
    const footnotes = row.footnotes
      ? parseJson<Footnote[]>(row.footnotes, [])
      : undefined;
    return {
      id: row.id,
      sourceDisplayText: row.source_display_text ?? '',
      sourceProcessingText: row.source_processing_text ?? '',
      translationDisplayText: restoredTranslationDisplay,
      translationProcessingText: restoredTranslationProcessing,
      originalText: row.source_display_text ?? '',
      status: row.chunk_status || (judgeResult.status === 'completed' ? 'completed' : 'ready'),
      stageResults,
      judgeResult,
      currentDraft: restoredTranslationDisplay,
      translationLocked: row.translation_locked === 1,
      ...(coherenceResult ? { coherenceResult } : {}),
      ...(footnotes?.length ? { footnotes } : {}),
      ...(row.blob_id ? {
        blobId: row.blob_id,
        blobOrder: row.blob_order ?? 0,
        blobReferenceChunkIds: parseStringArray(row.blob_reference_chunk_ids),
      } : {}),
    };
  });
}

// ── Projects CRUD ────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  return select<Project>('SELECT * FROM projects ORDER BY updated_at DESC');
}

export async function getProject(id: string): Promise<Project | null> {
  const rows = await select<Project>('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createProject(name: string, sourceLang: string, targetLang: string): Promise<string> {
  const id = `proj-${Date.now()}`;
  await execute(
    'INSERT INTO projects (id, name, source_language, target_language) VALUES ($1, $2, $3, $4)',
    [id, name, sourceLang, targetLang],
  );
  // Create default pipeline config
  await execute(
    'INSERT INTO pipeline_configs (id, project_id, stages, judge_prompt) VALUES ($1, $2, $3, $4)',
    [`cfg-${id}`, id, '[]', ''],
  );
  return id;
}

export async function updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'source_language' | 'target_language'>>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) { sets.push(`name = $${idx++}`); params.push(updates.name); }
  if (updates.source_language !== undefined) { sets.push(`source_language = $${idx++}`); params.push(updates.source_language); }
  if (updates.target_language !== undefined) { sets.push(`target_language = $${idx++}`); params.push(updates.target_language); }

  if (sets.length === 0) return;
  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id);

  await execute(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${idx}`, params);
}

export async function deleteProject(id: string): Promise<void> {
  await execute('DELETE FROM projects WHERE id = $1', [id]);
}

// ── Pipeline Config persistence ──────────────────────────────────────

export async function getProjectConfig(projectId: string): Promise<{
  pipelineId: string;
  sourceLanguage: string;
  targetLanguage: string;
  inputText: string;
  inputProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  viewMode: ViewMode | null;
  stages: PipelineStageConfig[];
  judgePrompt: string;
  judgeModel: string;
  judgeProvider: string;
  useChunking: boolean;
  targetChunkCount: number;
  documentFormat: PipelineConfig['documentFormat'];
  renderProfile: PipelineConfig['renderProfile'];
  markdownAware: boolean;
  experimentalImport: PipelineConfig['experimentalImport'];
  reviewProviderOptions: ProviderRuntimeConfig | undefined;
  glossary: GlossaryEntry[];
  assignedGlossaryId: string | null;
  persona: string | undefined;
  customSourceLanguage: string | undefined;
  customTargetLanguage: string | undefined;
  blobBudgetTokens: number | undefined;
  blobOverlap: number | undefined;
  mode: PipelineMode;
  runStatus: PipelineRunStatus;
  lastRunConfig: string | null;
} | null> {
  const rows = await select<{
    id: string;
    source_language: string;
    target_language: string;
    source_display_text?: string;
    source_processing_text?: string;
    source_footnotes?: string | null;
    view_mode: ViewMode | null;
    stages: string;
    judge_prompt: string;
    judge_model: string;
    judge_provider: string;
    use_chunking: number;
    target_chunk_count?: number;
    document_format?: PipelineConfig['documentFormat'];
    render_profile?: PipelineConfig['renderProfile'];
    markdown_aware?: number;
    experimental_import?: PipelineConfig['experimentalImport'];
    review_provider_options?: string | null;
    persona?: string | null;
    custom_source_language?: string | null;
    custom_target_language?: string | null;
    blob_budget_tokens?: number | null;
    blob_overlap?: number | null;
    run_in_progress?: number | null;
    run_status?: string | null;
    last_run_config?: string | null;
    pipeline_mode?: string | null;
  }>(
    `SELECT
       pc.id,
       p.source_language,
       p.target_language,
       p.view_mode,
       pc.stages,
        pc.source_display_text,
        pc.source_processing_text,
        pc.source_footnotes,
       pc.judge_prompt,
       pc.judge_model,
       pc.judge_provider,
       pc.use_chunking,
       pc.target_chunk_count,
       pc.document_format,
        pc.render_profile,
       pc.markdown_aware,
       pc.experimental_import,
       pc.review_provider_options,
       pc.persona,
       pc.custom_source_language,
       pc.custom_target_language,
       pc.blob_budget_tokens,
       pc.blob_overlap,
       pc.run_in_progress,
       pc.run_status,
       pc.last_run_config,
       pc.pipeline_mode
     FROM pipeline_configs pc
     JOIN projects p ON p.id = pc.project_id
     WHERE pc.project_id = $1`,
    [projectId],
  );

  if (rows.length === 0) return null;
  const row = rows[0];
  const runStatus: PipelineRunStatus =
    row.run_status === 'running'
    || row.run_status === 'completed'
    || row.run_status === 'interrupted'
    || row.run_status === 'idle'
      ? row.run_status
      : (row.run_in_progress === 1 ? 'interrupted' : 'idle');

  // Glossario: prima trova l'ID assegnato, poi carica le voci
  const pgRows = await select<{ glossary_id: string }>(
    'SELECT glossary_id FROM project_glossaries WHERE project_id = $1 LIMIT 1',
    [projectId],
  );
  const assignedGlossaryId = pgRows[0]?.glossary_id ?? null;

  const glossaryRows = await select<{ id: string; term: string; translation: string; notes: string }>(
    `SELECT ge.id, ge.term, ge.translation, ge.notes FROM glossary_entries ge
     JOIN project_glossaries pg ON ge.glossary_id = pg.glossary_id
     WHERE pg.project_id = $1`,
    [projectId],
  );

  return {
    pipelineId: row.id,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    inputText: row.source_display_text ?? '',
    inputProcessingText: row.source_processing_text ?? '',
    sourceFootnotes: parseJson<FootnoteDefinition[]>(row.source_footnotes, []),
    viewMode: row.view_mode ?? null,
    stages: parseJson<PipelineStageConfig[]>(row.stages, []),
    judgePrompt: row.judge_prompt,
    judgeModel: row.judge_model,
    judgeProvider: row.judge_provider,
    useChunking: row.use_chunking === 1,
    targetChunkCount: row.target_chunk_count ?? 0,
    documentFormat: row.document_format ?? 'plain',
    renderProfile: row.render_profile ?? 'plain-text',
    markdownAware: row.markdown_aware === 1,
    experimentalImport: row.experimental_import ?? null,
    reviewProviderOptions: parseJson<ProviderRuntimeConfig>(row.review_provider_options),
    persona: row.persona?.trim() || undefined,
    customSourceLanguage: row.custom_source_language || undefined,
    customTargetLanguage: row.custom_target_language || undefined,
    blobBudgetTokens: row.blob_budget_tokens ?? undefined,
    blobOverlap: row.blob_overlap ?? undefined,
    assignedGlossaryId,
    glossary: glossaryRows.map((g, i) => ({
      id: g.id || `gloss-loaded-${projectId}-${i}`,
      term: g.term,
      translation: g.translation,
      notes: g.notes,
    })),
    mode: (row.pipeline_mode === 'editorial' ? 'editorial' : 'standard') as PipelineMode,
    runStatus,
    lastRunConfig: row.last_run_config ?? null,
  };
}

export async function saveProjectConfig(
  projectId: string,
  config: PipelineConfig,
  viewMode: ViewMode,
): Promise<void> {
  await saveProjectConfigInternal(projectId, undefined, undefined, undefined, config, viewMode, execute);
}

export async function saveChunkCheckpoint(
  projectId: string,
  chunk: TranslationChunk,
  position: number,
): Promise<void> {
  await execute(
    `INSERT INTO translations (
       id, project_id, original_text, final_translation, position, chunk_status, stage_results,
       judge_status, judge_rating, translation_locked, judge_issues, coherence_result, footnotes,
       source_display_text, source_processing_text, translation_display_text, translation_processing_text,
       blob_id, blob_order, blob_reference_chunk_ids
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT(id) DO UPDATE SET
       original_text                = excluded.original_text,
       final_translation            = excluded.final_translation,
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
      projectId,
      chunk.sourceDisplayText,
      chunk.translationDisplayText || chunk.judgeResult.content || lastStageContent(chunk.stageResults) || '',
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
      serializeBlobReferenceChunkIds(chunk),
    ],
  );
}

export async function setPipelineRunState(
  projectId: string,
  runStatus: PipelineRunStatus,
  configFingerprint?: string,
): Promise<void> {
  await execute(
    `UPDATE pipeline_configs
     SET run_in_progress = $1,
         run_status = $2,
         last_run_config = CASE
           WHEN $3 IS NULL THEN last_run_config
           ELSE $3
         END
     WHERE project_id = $4`,
    [runStatus === 'running' ? 1 : 0, runStatus, configFingerprint ?? null, projectId],
  );
}

type ExecuteQuery = (query: string, params?: unknown[]) => Promise<void>;

async function saveProjectConfigInternal(
  projectId: string,
  inputText: string | undefined,
  inputProcessingText: string | undefined,
  sourceFootnotes: FootnoteDefinition[] | undefined,
  config: PipelineConfig,
  viewMode: ViewMode,
  run: ExecuteQuery,
): Promise<void> {
  await run(
    `INSERT INTO pipeline_configs (
       id, project_id, stages, judge_prompt, judge_model, judge_provider, use_chunking,
       target_chunk_count, source_text, source_display_text, source_processing_text, source_footnotes,
       document_format, render_profile, markdown_aware, experimental_import, review_provider_options,
       persona, custom_source_language, custom_target_language, blob_budget_tokens, blob_overlap,
       pipeline_mode
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, ''), COALESCE($10, ''), COALESCE($11, ''), $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     ON CONFLICT(project_id) DO UPDATE SET
       id = excluded.id,
       stages = excluded.stages,
       judge_prompt = excluded.judge_prompt,
       judge_model = excluded.judge_model,
       judge_provider = excluded.judge_provider,
       use_chunking = excluded.use_chunking,
       target_chunk_count = excluded.target_chunk_count,
       source_display_text = CASE
         WHEN $10 IS NULL THEN pipeline_configs.source_display_text
         ELSE $10
       END,
       source_processing_text = CASE
         WHEN $11 IS NULL THEN pipeline_configs.source_processing_text
         ELSE $11
       END,
       source_footnotes = CASE
         WHEN $12 IS NULL THEN pipeline_configs.source_footnotes
         ELSE $12
       END,
       document_format = excluded.document_format,
       render_profile = excluded.render_profile,
       markdown_aware = excluded.markdown_aware,
       experimental_import = excluded.experimental_import,
       review_provider_options = excluded.review_provider_options,
       persona = excluded.persona,
       custom_source_language = excluded.custom_source_language,
       custom_target_language = excluded.custom_target_language,
       blob_budget_tokens = excluded.blob_budget_tokens,
       blob_overlap = excluded.blob_overlap,
       pipeline_mode = excluded.pipeline_mode,
       source_text = CASE
         WHEN $9 IS NULL THEN pipeline_configs.source_text
         ELSE $9
       END`,
    [
      `cfg-${projectId}`,
      projectId,
      JSON.stringify(config.stages),
      config.judgePrompt,
      config.judgeModel,
      config.judgeProvider,
      config.useChunking !== false ? 1 : 0,
      config.targetChunkCount ?? 0,
      inputText ?? null,
      inputText ?? null,
      inputProcessingText ?? inputText ?? null,
      sourceFootnotes !== undefined ? JSON.stringify(sourceFootnotes) : null,
      config.documentFormat ?? 'plain',
      config.renderProfile ?? 'plain-text',
      config.markdownAware ? 1 : 0,
      config.experimentalImport ?? null,
      config.reviewProviderOptions ? JSON.stringify(config.reviewProviderOptions) : null,
      config.persona?.trim() || null,
      config.customSourceLanguage || null,
      config.customTargetLanguage || null,
      config.blobBudgetTokens ?? 0,
      config.blobOverlap ?? 1,
      config.mode ?? 'standard',
    ],
  );
  await run(
    `UPDATE projects SET
      source_language = $1,
      target_language = $2,
      view_mode = $3,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [config.sourceLanguage, config.targetLanguage, viewMode, projectId],
  );
}

// ── Translations persistence ─────────────────────────────────────────

export async function saveTranslations(projectId: string, chunks: TranslationChunk[]): Promise<void> {
  await saveTranslationsInternal(projectId, chunks, execute);
  await execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [projectId]);
}

async function saveTranslationsInternal(
  projectId: string,
  chunks: TranslationChunk[],
  run: ExecuteQuery,
): Promise<void> {
  logger.info('saveTranslationsInternal', { projectId, chunksCount: chunks.length });
  if (chunks.length === 0) {
    logger.info('saveTranslationsInternal: chunks empty, preserving existing translations', { projectId });
    return;
  }
  for (const [position, chunk] of chunks.entries()) {
    await run(
      `INSERT INTO translations (
         id, project_id, original_text, final_translation, position, chunk_status, stage_results,
         judge_status, judge_rating, translation_locked, judge_issues, coherence_result, footnotes,
         source_display_text, source_processing_text, translation_display_text, translation_processing_text,
         blob_id, blob_order, blob_reference_chunk_ids
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT(id) DO UPDATE SET
         original_text    = excluded.original_text,
         final_translation = excluded.final_translation,
         position         = excluded.position,
         chunk_status     = excluded.chunk_status,
         stage_results    = excluded.stage_results,
         judge_status     = excluded.judge_status,
         judge_rating     = excluded.judge_rating,
         translation_locked = excluded.translation_locked,
         judge_issues     = excluded.judge_issues,
         coherence_result = excluded.coherence_result,
         footnotes        = excluded.footnotes,
         source_display_text = excluded.source_display_text,
         source_processing_text = excluded.source_processing_text,
         translation_display_text = excluded.translation_display_text,
         translation_processing_text = excluded.translation_processing_text,
         blob_id          = excluded.blob_id,
         blob_order       = excluded.blob_order,
         blob_reference_chunk_ids = excluded.blob_reference_chunk_ids`,
      [
        chunk.id,
        projectId,
        chunk.sourceDisplayText,
        chunk.translationDisplayText || chunk.judgeResult.content || lastStageContent(chunk.stageResults) || '',
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
        serializeBlobReferenceChunkIds(chunk),
      ],
    );
  }

  // Rimuovi i chunk che non fanno più parte del progetto.
  const placeholders = chunks.map((_, i) => `$${i + 2}`).join(', ');
  await run(
    `DELETE FROM translations WHERE project_id = $1 AND id NOT IN (${placeholders})`,
    [projectId, ...chunks.map((c) => c.id)],
  );
}

function lastStageContent(stageResults: Record<string, PipelineResult>): string {
  const entries = Object.values(stageResults);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const content = entries[index]?.content?.trim();
    if (content) return content;
  }
  return '';
}

export async function saveProjectState(input: {
  projectId: string;
  inputText: string;
  inputProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  config: PipelineConfig;
  viewMode: ViewMode;
  chunks: TranslationChunk[];
}): Promise<void> {
  await runInTransaction(async (run) => {
    await saveProjectConfigInternal(
      input.projectId,
      input.inputText,
      input.inputProcessingText,
      input.sourceFootnotes,
      input.config,
      input.viewMode,
      run,
    );
    await saveTranslationsInternal(input.projectId, input.chunks, run);
  });
}

export async function loadTranslations(projectId: string): Promise<SavedTranslation[]> {
  return select<SavedTranslation>(
    'SELECT * FROM translations WHERE project_id = $1 ORDER BY CASE WHEN position IS NULL THEN 1 ELSE 0 END, position ASC, created_at ASC',
    [projectId],
  );
}
