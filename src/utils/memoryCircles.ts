import type { PhraseMemoryMatch } from '../stores/phraseMemoryStore';

/** Da dove viene un riferimento, dal più vicino al più lontano: guida l'ordine e l'etichetta. */
export type MemoryCircle = 'document' | 'workspace' | 'elsewhere';

const CIRCLE_ORDER: Record<MemoryCircle, number> = { document: 0, workspace: 1, elsewhere: 2 };

export function memoryCircle(
  match: Pick<PhraseMemoryMatch, 'projectId' | 'workspaceId'>,
  currentProjectId: string | null,
  currentWorkspaceId: string | null,
): MemoryCircle {
  if (currentProjectId && match.projectId === currentProjectId) return 'document';
  if (currentWorkspaceId && match.workspaceId === currentWorkspaceId) return 'workspace';
  return 'elsewhere';
}

/** Prima il documento, poi il workspace, poi il resto; dentro ogni cerchio la somiglianza più alta. */
export function orderByCircle<T extends Pick<PhraseMemoryMatch, 'projectId' | 'workspaceId' | 'score'>>(
  matches: readonly T[],
  currentProjectId: string | null,
  currentWorkspaceId: string | null,
): T[] {
  const rank = (match: T) => CIRCLE_ORDER[memoryCircle(match, currentProjectId, currentWorkspaceId)];
  return [...matches].sort((a, b) => rank(a) - rank(b) || b.score - a.score);
}
