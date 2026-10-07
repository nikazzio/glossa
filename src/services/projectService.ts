import { select, execute, runInTransaction } from './dbService';
import type {
  DocumentFormat,
  DocumentRenderProfile,
  ExperimentalImportMode,
  FootnoteDefinition,
  LanguageChoice,
  PipelineConfig,
  WorkLanguages,
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
  workLanguages: WorkLanguages;
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
  total_input_tokens?: number | null;
  total_output_tokens?: number | null;
  total_usd?: number | null;
  total_duration_ms?: number | null;
}

// ── Projects CRUD ────────────────────────────────────────────────────

interface LanguageColumns {
  source_language: string | null;
  source_language_variety: string | null;
  source_language_note: string | null;
  target_language: string | null;
  target_language_variety: string | null;
  target_language_note: string | null;
}

const LANGUAGE_COLUMNS_SQL = `source_language, source_language_variety, source_language_note,
            target_language, target_language_variety, target_language_note`;

const toChoice = (code: string | null, variety: string | null, note: string | null): LanguageChoice => ({
  code: code?.trim() || null,
  variety: variety?.trim() || null,
  note: note ?? '',
});

function rowToWorkLanguages(row: LanguageColumns): WorkLanguages {
  return {
    source: toChoice(row.source_language, row.source_language_variety, row.source_language_note),
    target: toChoice(row.target_language, row.target_language_variety, row.target_language_note),
  };
}

/** Values for the six language columns, in the order of `LANGUAGE_COLUMNS_SQL`; '' = not specified. */
function workLanguageParams({ source, target }: WorkLanguages): (string | null)[] {
  const side = (choice: LanguageChoice) => [choice.code ?? '', choice.code ? choice.variety : null, choice.note.trim()];
  return [...side(source), ...side(target)];
}

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
export async function listRecentProjectsAllWorkspaces(limit: number, workspaceId: string | null = null): Promise<RecentProject[]> {
  return select<RecentProject>(
    `SELECT
       p.id,
       p.name,
       p.updated_at,
       p.workspace_id,
       w.name AS workspace_name
     FROM projects p
     JOIN workspaces w ON w.id = p.workspace_id
     WHERE $2 IS NULL OR p.workspace_id=$2
     ORDER BY p.updated_at DESC
     LIMIT $1`,
    [limit, workspaceId],
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
export async function listProjectsNeedingAttention(limit: number, workspaceId: string | null = null): Promise<ProjectNeedingAttention[]> {
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
     WHERE ($2 IS NULL OR p.workspace_id=$2) AND (t.judge_rating IN ('critical', 'poor')
        OR (t.judge_issues IS NOT NULL AND t.judge_issues != '[]' AND t.judge_issues != ''))
     GROUP BY p.id
     ORDER BY issue_count DESC
     LIMIT $1`,
    [limit, workspaceId],
  );
}

export interface ProjectSourceVersion {
  id: string;
  title: string;
  label: string;
}

export async function listProjectSourceVersions(): Promise<ProjectSourceVersion[]> {
  return select<ProjectSourceVersion>(`SELECT v.id, s.title, v.label FROM source_versions v
    JOIN sources s ON s.id=v.source_id WHERE s.status='active' ORDER BY s.title,v.label`);
}

export async function createProject(
  name: string,
  languages: WorkLanguages,
  workspaceId: string,
  sourceVersionId?: string,
): Promise<string> {
  const id = `proj-${crypto.randomUUID()}`;
  const pipelineId = `pipeline-${crypto.randomUUID()}`;
  await runInTransaction(async (run) => {
    await run(`INSERT INTO projects (id, name, workspace_id, ${LANGUAGE_COLUMNS_SQL})
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, name, workspaceId, ...workLanguageParams(languages)]);
    await run(`INSERT INTO pipelines (id, project_id, name, stages, judge_prompt, judge_model, judge_provider)
      VALUES ($1, $2, 'Default', '[]', '', '', '')`, [pipelineId, id]);
    if (sourceVersionId) await run(`INSERT INTO translation_origins(project_id,origin_type,source_version_id)
      VALUES($1,'source_level',$2)`, [id, sourceVersionId]);
  });
  return id;
}

export async function deleteProject(id: string): Promise<void> {
  await runInTransaction(async (run) => {
    await run('DELETE FROM operation_logs WHERE project_id = $1', [id]);
    await run('DELETE FROM project_glossaries WHERE project_id = $1', [id]);
    await run('UPDATE phrase_memory SET project_id = NULL, chunk_id = NULL WHERE project_id = $1', [id]);
    await run('DELETE FROM translations WHERE project_id = $1', [id]);
    await run('DELETE FROM pipelines WHERE project_id = $1', [id]);
    await run('DELETE FROM projects WHERE id = $1', [id]);
  });
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
  } & LanguageColumns>(
    `SELECT source_display_text, source_processing_text, source_footnotes,
            document_format, render_profile, markdown_aware, experimental_import,
            ${LANGUAGE_COLUMNS_SQL}
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
    workLanguages: rowToWorkLanguages(row),
  };
}

/** Saves the work's languages alone (the Studio panel), without touching its source text. */
export async function saveWorkLanguages(projectId: string, languages: WorkLanguages): Promise<void> {
  await execute(
    `UPDATE projects SET
       source_language = $1, source_language_variety = $2, source_language_note = $3,
       target_language = $4, target_language_variety = $5, target_language_note = $6,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $7`,
    [...workLanguageParams(languages), projectId],
  );
}

/** Rinomina un progetto. Il nome è l'unico dato del progetto che l'utente
 *  scrive a mano, e finora si poteva dare solo alla creazione. */
export async function renameProject(projectId: string, name: string): Promise<void> {
  await execute('UPDATE projects SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
    name,
    projectId,
  ]);
}

export async function saveProjectSource(
  projectId: string,
  inputText: string,
  inputProcessingText: string,
  sourceFootnotes: FootnoteDefinition[],
  config: Pick<PipelineConfig, 'documentFormat' | 'renderProfile' | 'markdownAware' | 'experimentalImport'>,
  languages: WorkLanguages,
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
       source_language_variety = $9,
       source_language_note   = $10,
       target_language        = $11,
       target_language_variety = $12,
       target_language_note   = $13,
       updated_at             = CURRENT_TIMESTAMP
     WHERE id = $14`,
    [
      inputText,
      inputProcessingText,
      JSON.stringify(sourceFootnotes),
      config.documentFormat ?? 'plain',
      config.renderProfile ?? 'plain-text',
      config.markdownAware ? 1 : 0,
      config.experimentalImport ?? null,
      ...workLanguageParams(languages),
      projectId,
    ],
  );
}

/** Language codes already given to the works of a workspace, to list them first when choosing. */
export async function listWorkspaceLanguageCodes(workspaceId: string): Promise<string[]> {
  const rows = await select<{ code: string | null }>(
    `SELECT source_language AS code FROM projects WHERE workspace_id = $1 AND status = 'active'
     UNION SELECT target_language AS code FROM projects WHERE workspace_id = $1 AND status = 'active'`,
    [workspaceId],
  );
  return rows.map((row) => row.code?.trim() ?? '').filter(Boolean);
}

/** The free-text language of the book a work comes from, when the work records one. */
export async function getWorkBookLanguage(projectId: string): Promise<string | null> {
  const rows = await select<{ primary_language: string | null }>(
    `SELECT s.primary_language
     FROM translation_origins o
     LEFT JOIN transcription_documents d ON d.id = o.transcription_document_id
     JOIN source_versions sv ON sv.id = COALESCE(o.source_version_id, d.source_version_id)
     JOIN sources s ON s.id = sv.source_id
     WHERE o.project_id = $1
     LIMIT 1`,
    [projectId],
  );
  return rows[0]?.primary_language?.trim() || null;
}
