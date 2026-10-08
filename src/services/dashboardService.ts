import { select } from './dbService';

export interface DashboardCounts { sources: number; transcriptions: number; projects: number; workspaces: number }
export async function dashboardCounts(workspaceId: string | null): Promise<DashboardCounts> {
  const [row] = await select<DashboardCounts>(`SELECT
    (SELECT COUNT(*) FROM sources s WHERE s.status='active' AND ($1 IS NULL OR EXISTS
      (SELECT 1 FROM workspace_items wi WHERE wi.item_type='source' AND wi.item_id=s.id AND wi.workspace_id=$1))) AS sources,
    (SELECT COUNT(*) FROM transcription_documents WHERE status='active' AND ($1 IS NULL OR workspace_id=$1)) AS transcriptions,
    (SELECT COUNT(*) FROM projects WHERE $1 IS NULL OR workspace_id=$1) AS projects,
    (SELECT COUNT(*) FROM workspaces WHERE archived_at IS NULL AND ($1 IS NULL OR id=$1)) AS workspaces`, [workspaceId]);
  if (!row) throw new Error('dashboard.countsUnavailable');
  return row;
}
export interface RecentSource { id: string; title: string; updated_at: string }
export function recentSources(workspaceId: string | null): Promise<RecentSource[]> {
  return select<RecentSource>(`SELECT s.id,s.title,s.updated_at FROM sources s
    WHERE s.status='active' AND ($1 IS NULL OR EXISTS (SELECT 1 FROM workspace_items wi
      WHERE wi.item_type='source' AND wi.item_id=s.id AND wi.workspace_id=$1))
    ORDER BY s.updated_at DESC,s.id LIMIT 5`, [workspaceId]);
}
export interface RecentTranscription { id: string; title: string; workspace_id: string; edited_at: string }
/** Trascrizioni toccate di recente: l'ultima versione scritta in una pagina
 *  qualsiasi, o la creazione del documento se non ne ha ancora. */
export function recentTranscriptions(workspaceId: string | null): Promise<RecentTranscription[]> {
  return select<RecentTranscription>(`SELECT d.id, d.title, d.workspace_id,
      COALESCE((SELECT MAX(r.created_at) FROM transcription_revisions r
        JOIN transcription_segments s ON s.id = r.segment_id WHERE s.document_id = d.id), d.created_at) AS edited_at
    FROM transcription_documents d
    WHERE d.status = 'active' AND ($1 IS NULL OR d.workspace_id = $1)
    ORDER BY edited_at DESC, d.id LIMIT 5`, [workspaceId]);
}
