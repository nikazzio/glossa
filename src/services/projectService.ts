import { select, execute } from './dbService';
import type {
  DocumentFormat,
  DocumentRenderProfile,
  ExperimentalImportMode,
  FootnoteDefinition,
  PipelineConfig,
} from '../types';

// ── Types ────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  workspace_id: string | null;
  source_language: string;
  target_language: string;
  created_at: string;
  updated_at: string;
  pipeline_count: number;
  pipeline_names: string | null;
}

export interface WorkspaceProject extends Project {
  workspace_id: string;
  workspace_name: string;
}

export interface RecentProject {
  id: string;
  name: string;
  updated_at: string;
  workspace_id: string;
  workspace_name: string;
}

export interface RecentPipelineRun {
  at: string;
  level: string;
  project_id: string;
  project_name: string;
  workspace_id: string;
  workspace_name: string;
}

export interface ProjectSource {
  sourceDisplayText: string;
  sourceProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  documentFormat: DocumentFormat;
  renderProfile: DocumentRenderProfile;
  markdownAware: boolean;
  experimentalImport: ExperimentalImportMode | null;
}

// Shared type used by pipelineService for raw translation rows.
export interface SavedTranslation {
  id: string;
  project_id?: string | null;
  pipeline_id?: string | null;
  source_display_text: string | null;
  source_processing_text: string | null;
  translation_display_text: string | null;
  translation_processing_text: string | null;
  position?: number | null;
  chunk_status: string;
  stage_results: string;
  judge_status: string;
  judge_rating: string;
  translation_locked?: number | null;
  judge_issues: string;
  coherence_result?: string | null;
  footnotes?: string | null;
  blob_id?: string | null;
  blob_order?: number | null;
  blob_reference_chunk_ids?: string | null;
  created_at: string;
}

// ── Projects CRUD ────────────────────────────────────────────────────

export async function listProjects(workspaceId: string): Promise<Project[]> {
  return select<Project>(
    `SELECT
       p.*,
       COUNT(pi.id) AS pipeline_count,
       GROUP_CONCAT(pi.name, ' · ') AS pipeline_names
     FROM projects p
     LEFT JOIN pipelines pi ON pi.project_id = p.id
     WHERE p.workspace_id = $1
     GROUP BY p.id
     ORDER BY p.updated_at DESC`,
    [workspaceId],
  );
}

/** Tutti i progetti di traduzione di TUTTI i workspace — alimenta l'area Traduzioni. */
export async function listAllProjects(): Promise<WorkspaceProject[]> {
  return select<WorkspaceProject>(
    `SELECT
       p.*,
       COUNT(pi.id) AS pipeline_count,
       GROUP_CONCAT(pi.name, ' · ') AS pipeline_names,
       w.name AS workspace_name
     FROM projects p
     LEFT JOIN pipelines pi ON pi.project_id = p.id
     JOIN workspaces w ON w.id = p.workspace_id
     GROUP BY p.id
     ORDER BY p.updated_at DESC`,
  );
}

/** Ultimi progetti toccati in TUTTI i workspace — alimenta il blocco Riprendi della Dashboard. */
export async function listRecentProjectsAllWorkspaces(limit: number): Promise<RecentProject[]> {
  return select<RecentProject>(
    `SELECT
       p.id,
       p.name,
       p.updated_at,
       p.workspace_id,
       w.name AS workspace_name
     FROM projects p
     JOIN workspaces w ON w.id = p.workspace_id
     ORDER BY p.updated_at DESC
     LIMIT $1`,
    [limit],
  );
}

/** Ultime esecuzioni pipeline concluse (scope='pipeline', phase='end') a livello globale. */
export async function listRecentPipelineRuns(limit: number): Promise<RecentPipelineRun[]> {
  return select<RecentPipelineRun>(
    `SELECT
       ol.at,
       ol.level,
       p.id AS project_id,
       p.name AS project_name,
       p.workspace_id,
       w.name AS workspace_name
     FROM operation_logs ol
     JOIN projects p ON p.id = ol.project_id
     JOIN workspaces w ON w.id = p.workspace_id
     WHERE ol.scope = 'pipeline' AND ol.phase = 'end'
     ORDER BY ol.at DESC
     LIMIT $1`,
    [limit],
  );
}

export interface DashboardOverviewStats {
  totalProjects: number;
  totalChunks: number;
  completedChunks: number;
}

/** Numeri complessivi su tutti i workspace — alimenta i riquadri della Dashboard. */
export async function getDashboardOverviewStats(): Promise<DashboardOverviewStats> {
  const [[projectRow], [chunkRow]] = await Promise.all([
    select<{ count: number }>('SELECT COUNT(*) AS count FROM projects'),
    select<{ total: number; completed: number | null }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN chunk_status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM translations`,
    ),
  ]);
  return {
    totalProjects: projectRow?.count ?? 0,
    totalChunks: chunkRow?.total ?? 0,
    completedChunks: chunkRow?.completed ?? 0,
  };
}

export interface ProjectNeedingAttention {
  project_id: string;
  project_name: string;
  workspace_id: string;
  workspace_name: string;
  issue_count: number;
}

/** Progetti con frammenti da rivedere (giudizio scarso/critico o problemi aperti) — alimenta la Dashboard. */
export async function listProjectsNeedingAttention(limit: number): Promise<ProjectNeedingAttention[]> {
  return select<ProjectNeedingAttention>(
    `SELECT
       p.id AS project_id,
       p.name AS project_name,
       w.id AS workspace_id,
       w.name AS workspace_name,
       COUNT(*) AS issue_count
     FROM translations t
     JOIN pipelines pi ON pi.id = t.pipeline_id
     JOIN projects p ON p.id = pi.project_id
     JOIN workspaces w ON w.id = p.workspace_id
     WHERE t.judge_rating IN ('critical', 'poor')
        OR (t.judge_issues IS NOT NULL AND t.judge_issues != '[]' AND t.judge_issues != '')
     GROUP BY p.id
     ORDER BY issue_count DESC
     LIMIT $1`,
    [limit],
  );
}

export async function createProject(
  name: string,
  sourceLang: string,
  targetLang: string,
  workspaceId: string,
): Promise<string> {
  const id = `proj-${Date.now()}`;
  await execute(
    `INSERT INTO projects (id, name, source_language, target_language, workspace_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, name, sourceLang, targetLang, workspaceId],
  );
  // Create default pipeline for this project.
  const pipelineId = `pipeline-${Date.now()}`;
  await execute(
    `INSERT INTO pipelines (id, project_id, name, source_language, target_language, stages, judge_prompt, judge_model, judge_provider)
     VALUES ($1, $2, 'Default', $3, $4, '[]', '', '', '')`,
    [pipelineId, id, sourceLang, targetLang],
  );
  return id;
}

export async function deleteProject(id: string): Promise<void> {
  await execute('DELETE FROM operation_logs WHERE project_id = $1', [id]);
  await execute('DELETE FROM project_glossaries WHERE project_id = $1', [id]);
  await execute('DELETE FROM source_phrase_embeddings WHERE project_id = $1', [id]);
  await execute('UPDATE phrase_memory SET project_id = NULL, chunk_id = NULL WHERE project_id = $1', [id]);
  await execute('DELETE FROM translations WHERE project_id = $1', [id]);
  await execute('DELETE FROM pipelines WHERE project_id = $1', [id]);
  await execute('DELETE FROM projects WHERE id = $1', [id]);
}

// ── Source text ──────────────────────────────────────────────────────

export async function getProjectSource(projectId: string): Promise<ProjectSource | null> {
  const rows = await select<{
    source_display_text: string | null;
    source_processing_text: string | null;
    source_footnotes: string | null;
    document_format: DocumentFormat | null;
    render_profile: DocumentRenderProfile | null;
    markdown_aware: number | null;
    experimental_import: ExperimentalImportMode | null;
  }>(
    `SELECT source_display_text, source_processing_text, source_footnotes,
            document_format, render_profile, markdown_aware, experimental_import
     FROM projects WHERE id = $1`,
    [projectId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  let sourceFootnotes: FootnoteDefinition[] = [];
  if (row.source_footnotes) {
    try { sourceFootnotes = JSON.parse(row.source_footnotes) as FootnoteDefinition[]; } catch { /* keep empty */ }
  }

  return {
    sourceDisplayText: row.source_display_text ?? '',
    sourceProcessingText: row.source_processing_text ?? '',
    sourceFootnotes,
    documentFormat: row.document_format ?? 'plain',
    renderProfile: row.render_profile ?? 'plain-text',
    markdownAware: row.markdown_aware === 1,
    experimentalImport: row.experimental_import ?? null,
  };
}

export async function saveProjectSource(
  projectId: string,
  inputText: string,
  inputProcessingText: string,
  sourceFootnotes: FootnoteDefinition[],
  config: Pick<PipelineConfig, 'documentFormat' | 'renderProfile' | 'markdownAware' | 'experimentalImport' | 'sourceLanguage' | 'targetLanguage'>,
): Promise<void> {
  await execute(
    `UPDATE projects SET
       source_display_text    = $1,
       source_processing_text = $2,
       source_footnotes       = $3,
       document_format        = $4,
       render_profile         = $5,
       markdown_aware         = $6,
       experimental_import    = $7,
       source_language        = $8,
       target_language        = $9,
       updated_at             = CURRENT_TIMESTAMP
     WHERE id = $10`,
    [
      inputText,
      inputProcessingText,
      JSON.stringify(sourceFootnotes),
      config.documentFormat ?? 'plain',
      config.renderProfile ?? 'plain-text',
      config.markdownAware ? 1 : 0,
      config.experimentalImport ?? null,
      config.sourceLanguage,
      config.targetLanguage,
      projectId,
    ],
  );
}
