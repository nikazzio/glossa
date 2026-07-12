import { select, execute } from './dbService';
import type {
  DocumentFormat,
  DocumentRenderProfile,
  ExperimentalImportMode,
  FootnoteDefinition,
  PipelineConfig,
  ViewMode,
} from '../types';

// ── Types ────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  source_language: string;
  target_language: string;
  view_mode?: ViewMode | null;
  created_at: string;
  updated_at: string;
  pipeline_count: number;
  pipeline_names: string | null;
}

export interface ProjectSource {
  sourceDisplayText: string;
  sourceProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  documentFormat: DocumentFormat;
  renderProfile: DocumentRenderProfile;
  markdownAware: boolean;
  experimentalImport: ExperimentalImportMode | null;
  viewMode: ViewMode | null;
}

// Shared type used by pipelineService for raw translation rows.
export interface SavedTranslation {
  id: string;
  project_id?: string | null;
  pipeline_id?: string | null;
  source_display_text: string;
  source_processing_text: string;
  translation_display_text: string;
  translation_processing_text: string;
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
    view_mode: ViewMode | null;
  }>(
    `SELECT source_display_text, source_processing_text, source_footnotes,
            document_format, render_profile, markdown_aware, experimental_import, view_mode
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
    viewMode: row.view_mode ?? null,
  };
}

export async function saveProjectSource(
  projectId: string,
  inputText: string,
  inputProcessingText: string,
  sourceFootnotes: FootnoteDefinition[],
  config: Pick<PipelineConfig, 'documentFormat' | 'renderProfile' | 'markdownAware' | 'experimentalImport' | 'sourceLanguage' | 'targetLanguage'>,
  viewMode: ViewMode,
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
       view_mode              = $10,
       updated_at             = CURRENT_TIMESTAMP
     WHERE id = $11`,
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
      viewMode,
      projectId,
    ],
  );
}
