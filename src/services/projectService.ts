import { select, execute } from './dbService';
import type { PipelineConfig, PipelineStageConfig, GlossaryEntry, TranslationChunk } from '../types';

// ── Types ────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  source_language: string;
  target_language: string;
  created_at: string;
  updated_at: string;
}

export interface SavedTranslation {
  id: string;
  project_id: string;
  original_text: string;
  final_translation: string;
  stage_results: string; // JSON
  judge_score: number;
  judge_issues: string; // JSON
  created_at: string;
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
  stages: PipelineStageConfig[];
  judgePrompt: string;
  judgeModel: string;
  judgeProvider: string;
  useChunking: boolean;
  glossary: GlossaryEntry[];
} | null> {
  const rows = await select<{
    stages: string;
    judge_prompt: string;
    judge_model: string;
    judge_provider: string;
    use_chunking: number;
  }>('SELECT * FROM pipeline_configs WHERE project_id = $1', [projectId]);

  if (rows.length === 0) return null;
  const row = rows[0];

  // Load glossary entries
  const glossaryRows = await select<{ term: string; translation: string; notes: string }>(
    `SELECT ge.term, ge.translation, ge.notes FROM glossary_entries ge
     JOIN project_glossaries pg ON ge.glossary_id = pg.glossary_id
     WHERE pg.project_id = $1`,
    [projectId],
  );

  return {
    stages: JSON.parse(row.stages),
    judgePrompt: row.judge_prompt,
    judgeModel: row.judge_model,
    judgeProvider: row.judge_provider,
    useChunking: row.use_chunking === 1,
    glossary: glossaryRows.map((g) => ({ term: g.term, translation: g.translation, notes: g.notes })),
  };
}

export async function saveProjectConfig(projectId: string, config: PipelineConfig): Promise<void> {
  await execute(
    `UPDATE pipeline_configs SET
      stages = $1, judge_prompt = $2, judge_model = $3, judge_provider = $4, use_chunking = $5
     WHERE project_id = $6`,
    [
      JSON.stringify(config.stages),
      config.judgePrompt,
      config.judgeModel,
      config.judgeProvider,
      config.useChunking !== false ? 1 : 0,
      projectId,
    ],
  );
  // Touch project timestamp
  await execute('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [projectId]);
}

// ── Translations persistence ─────────────────────────────────────────

export async function saveTranslations(projectId: string, chunks: TranslationChunk[]): Promise<void> {
  // Clear old translations for this project
  await execute('DELETE FROM translations WHERE project_id = $1', [projectId]);

  for (const chunk of chunks) {
    await execute(
      `INSERT INTO translations (id, project_id, original_text, final_translation, stage_results, judge_score, judge_issues)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        chunk.id,
        projectId,
        chunk.originalText,
        chunk.currentDraft || '',
        JSON.stringify(chunk.stageResults),
        chunk.judgeResult.score,
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
