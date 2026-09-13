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
export interface RecentFact { id: string; event_type: string; entity_type: string; entity_id: string; occurred_at: string; outcome: string | null; title: string | null; workspace_id: string | null }
export function recentFacts(workspaceId: string | null): Promise<RecentFact[]> {
  return select<RecentFact>(`SELECT e.id,e.event_type,e.entity_type,e.entity_id,e.occurred_at,e.outcome,e.workspace_id,
      COALESCE(s.title,p.name,j.message) AS title
    FROM provenance_events e
    LEFT JOIN sources s ON e.entity_type='source' AND s.id=e.entity_id
    LEFT JOIN projects p ON e.entity_type='project' AND p.id=e.entity_id
    LEFT JOIN jobs j ON e.entity_type='job' AND j.id=e.entity_id
    WHERE $1 IS NULL OR e.workspace_id=$1
    ORDER BY e.occurred_at DESC,e.id DESC LIMIT 8`, [workspaceId]);
}
