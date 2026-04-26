import { select, execute } from './dbService';
import type {
  GlossaryEntry,
  JudgeResult,
  PipelineConfig,
  PipelineStageConfig,
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
  chunk_status: TranslationChunk['status'];
  stage_results: string; // JSON
  judge_status: JudgeResult['status'];
  judge_rating: JudgeResult['rating'];
  judge_issues: string; // JSON
  created_at: string;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
    return {
      id: row.id,
      originalText: row.original_text,
      status: row.chunk_status || (judgeResult.status === 'completed' ? 'completed' : 'ready'),
      stageResults: parseJson(row.stage_results, {}),
      judgeResult,
      currentDraft: row.final_translation || '',
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
  sourceLanguage: string;
  targetLanguage: string;
  viewMode: ViewMode | null;
  stages: PipelineStageConfig[];
  judgePrompt: string;
  judgeModel: string;
  judgeProvider: string;
  useChunking: boolean;
  targetChunkCount: number;
  glossary: GlossaryEntry[];
} | null> {
  const rows = await select<{
    source_language: string;
    target_language: string;
    view_mode: ViewMode | null;
    stages: string;
    judge_prompt: string;
    judge_model: string;
    judge_provider: string;
    use_chunking: number;
    target_chunk_count?: number;
  }>(
    `SELECT
       p.source_language,
       p.target_language,
       p.view_mode,
       pc.stages,
       pc.judge_prompt,
       pc.judge_model,
       pc.judge_provider,
       pc.use_chunking,
       pc.target_chunk_count
     FROM pipeline_configs pc
     JOIN projects p ON p.id = pc.project_id
     WHERE pc.project_id = $1`,
    [projectId],
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  // Load glossary entries
  const glossaryRows = await select<{ id: string; term: string; translation: string; notes: string }>(
    `SELECT ge.id, ge.term, ge.translation, ge.notes FROM glossary_entries ge
     JOIN project_glossaries pg ON ge.glossary_id = pg.glossary_id
     WHERE pg.project_id = $1`,
    [projectId],
  );

  return {
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    viewMode: row.view_mode ?? null,
    stages: JSON.parse(row.stages),
    judgePrompt: row.judge_prompt,
    judgeModel: row.judge_model,
    judgeProvider: row.judge_provider,
    useChunking: row.use_chunking === 1,
    targetChunkCount: row.target_chunk_count ?? 0,
    glossary: glossaryRows.map((g, i) => ({
      id: g.id || `gloss-loaded-${projectId}-${i}`,
      term: g.term,
      translation: g.translation,
      notes: g.notes,
    })),
  };
}

export async function saveProjectConfig(
  projectId: string,
  config: PipelineConfig,
  viewMode: ViewMode,
): Promise<void> {
  await execute(
    `UPDATE pipeline_configs SET
      stages = $1, judge_prompt = $2, judge_model = $3, judge_provider = $4, use_chunking = $5,
      target_chunk_count = $6
     WHERE project_id = $7`,
    [
      JSON.stringify(config.stages),
      config.judgePrompt,
      config.judgeModel,
      config.judgeProvider,
      config.useChunking !== false ? 1 : 0,
      config.targetChunkCount ?? 0,
      projectId,
    ],
  );
  await execute(
    `UPDATE projects SET
      source_language = $1,
      target_language = $2,
      view_mode = $3,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [config.sourceLanguage, config.targetLanguage, viewMode, projectId],
  );
  await saveProjectGlossary(projectId, config);
}

async function saveProjectGlossary(projectId: string, config: PipelineConfig): Promise<void> {
  const glossaryId = `glossary-${projectId}`;

  await execute(
    `INSERT INTO glossaries (id, name, source_language, target_language)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(id) DO UPDATE SET
       name = $2,
       source_language = $3,
       target_language = $4`,
    [
      glossaryId,
      `Project glossary ${projectId}`,
      config.sourceLanguage,
      config.targetLanguage,
    ],
  );

  await execute(
    'INSERT OR IGNORE INTO project_glossaries (project_id, glossary_id) VALUES ($1, $2)',
    [projectId, glossaryId],
  );

  await execute('DELETE FROM glossary_entries WHERE glossary_id = $1', [glossaryId]);

  const entries = config.glossary.filter(
    (entry) => entry.term.trim() && entry.translation.trim(),
  );

  for (const [index, entry] of entries.entries()) {
    await execute(
      `INSERT INTO glossary_entries (id, glossary_id, term, translation, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        entry.id || `gloss-entry-${projectId}-${index}`,
        glossaryId,
        entry.term.trim(),
        entry.translation.trim(),
        entry.notes?.trim() || '',
      ],
    );
  }
}

// ── Translations persistence ─────────────────────────────────────────

export async function saveTranslations(projectId: string, chunks: TranslationChunk[]): Promise<void> {
  // Clear old translations for this project
  await execute('DELETE FROM translations WHERE project_id = $1', [projectId]);

  for (const chunk of chunks) {
    await execute(
      `INSERT INTO translations (
         id, project_id, original_text, final_translation, chunk_status, stage_results,
         judge_status, judge_rating, judge_issues
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        chunk.id,
        projectId,
        chunk.originalText,
        chunk.currentDraft || '',
        chunk.status,
        JSON.stringify(chunk.stageResults),
        chunk.judgeResult.status,
        chunk.judgeResult.rating || qualityDefault(),
        JSON.stringify(chunk.judgeResult.issues),
      ],
    );
  }
  await execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [projectId]);
}

export async function loadTranslations(projectId: string): Promise<SavedTranslation[]> {
  return select<SavedTranslation>(
    'SELECT * FROM translations WHERE project_id = $1 ORDER BY created_at',
    [projectId],
  );
}
