import { invoke } from '@tauri-apps/api/core';
import type { IIIFDiscoveryResult } from '../types';
import type { Job } from './jobsService';
import { logger } from '../utils/logger';

/** Ogni comando di ricerca lascia una riga: comando, durata ed esito, senza
 *  criteri né indirizzi. È la stessa forma che il pannello dei log userà. */
async function command<T>(name: string, context: Record<string, unknown>, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    const result = await work();
    logger.debug('federation.command.done', { command: name, ...context, durationMs: Math.round(performance.now()-started) });
    return result;
  } catch (failure: unknown) {
    logger.warn('federation.command.failed', { command: name, ...context, durationMs: Math.round(performance.now()-started) });
    throw failure;
  }
}

export interface SearchCriteria {
  query: string; title: string; author: string; publisher: string;
  institution: string; language: string; material: string;
  yearFrom: number | null; yearTo: number | null;
}
export const EMPTY_SEARCH: SearchCriteria = {
  query: '', title: '', author: '', publisher: '', institution: '', language: '',
  material: '', yearFrom: null, yearTo: null,
};
export interface SearchExecution {
  providerKey: string; generation: number; resultSetId: string;
  page: number; mode: string; job: Job; hasMore: boolean; received: number;
}
export interface SearchRun {
  id: string; criteria: SearchCriteria; providers: string[]; groupId: string;
  derivedFromId: string | null; createdAt: string; archived: boolean;
  executions: SearchExecution[];
}
export interface SearchResultPage {
  providerKey: string; executionId: string; receivedAt: string;
  page: number; results: IIIFDiscoveryResult[];
}
export const listSearches = (offset = 0): Promise<SearchRun[]> =>
  command('list_searches', { offset }, () => invoke<SearchRun[]>('list_searches', { offset }));
export const getSearch = (id: string): Promise<{run: SearchRun; pages: SearchResultPage[]}> =>
  command('get_search_snapshot', { searchId: id }, () => invoke<{run: SearchRun; pages: SearchResultPage[]}>('get_search_snapshot', { id }));
export const searchResults = (id: string, executionId: string): Promise<SearchResultPage[]> =>
  command('list_search_results', { searchId: id, executionId }, () => invoke<SearchResultPage[]>('list_search_results', { id, executionId }));
export const createSearch = (request: {
  id: string; criteria: SearchCriteria; providers: string[]; derivedFromId: string | null;
}): Promise<SearchRun> =>
  command('create_search', { searchId: request.id, providers: request.providers.length }, () => invoke<SearchRun>('create_search', { request }));
export const relaunchSearch = (id: string, executionId: string, mode: 'retry' | 'restart' | 'continue'): Promise<SearchRun> =>
  command('relaunch_provider_search', { searchId: id, executionId, mode }, () => invoke<SearchRun>('relaunch_provider_search', { id, executionId, mode }));

export function currentExecutions(run: SearchRun): SearchExecution[] {
  return run.providers.flatMap((key) => {
    const found = run.executions.filter((e) => e.providerKey === key)
      .sort((a,b) => b.generation-a.generation)[0];
    return found ? [found] : [];
  });
}
export function searchStatus(run: SearchRun): Job['status'] {
  const states = currentExecutions(run).map((e) => e.job.status);
  for (const state of ['running','pausing','cancelling','queued','paused','error','cancelled'] as const) {
    if (states.includes(state)) return state;
  }
  return 'completed';
}

export type Match = 'match' | 'unknown' | 'excluded';
export function matchesCriteria(card: IIIFDiscoveryResult, criteria: SearchCriteria): Match {
  let unknown = false;
  const pairs = [
    [criteria.title,card.title], [criteria.author,card.creator],
    [criteria.publisher,card.publisher], [criteria.institution,card.holdingInstitution],
    [criteria.language,card.language],
  ];
  for (const [wanted, actual] of pairs) {
    if (!wanted?.trim()) continue;
    if (!actual?.trim()) unknown = true;
    else if (!actual.toLocaleLowerCase().includes(wanted.trim().toLocaleLowerCase())) return 'excluded';
  }
  if (criteria.material) {
    const material = card.mediaType?.toLowerCase() ?? '';
    const declared = /manuscri|handschrift/.test(material) ? 'manuscript'
      : /print|imprim|stampa|druck/.test(material) ? 'printed' : null;
    if (!declared) unknown = true;
    else if (declared !== criteria.material) return 'excluded';
  }
  if (criteria.yearFrom !== null || criteria.yearTo !== null) {
    const date = card.date?.trim() ?? '';
    const range = /^(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?$/.exec(date);
    if (!range) unknown = true;
    else {
      const from = Number(range[1]); const to = Number(range[2] ?? range[1]);
      if (from > to || from === 0) unknown = true;
      else if (to < (criteria.yearFrom ?? 1) || from > (criteria.yearTo ?? 9999)) return 'excluded';
    }
  }
  return unknown ? 'unknown' : 'match';
}

export interface SearchResultGroup {
  id: string; card: IIIFDiscoveryResult; providerKey: string;
  origins: string[]; match: Match;
  occurrences: Array<{card: IIIFDiscoveryResult; providerKey: string; match: Match}>;
}
/** Exact manifest identity only. Occurrences survive grouping and retries. */
export function groupResults(pages: SearchResultPage[], criteria: SearchCriteria): SearchResultGroup[] {
  const groups = new Map<string, SearchResultGroup>();
  const seen = new Set<string>();
  for (const page of pages) for (const card of page.results) {
    const occurrence = JSON.stringify([page.providerKey,card.id]);
    if (seen.has(occurrence)) continue;
    seen.add(occurrence);
    const id = card.manifestUrl || occurrence;
    const match = matchesCriteria(card,criteria);
    const previous = groups.get(id);
    if (!previous) groups.set(id,{id,card,providerKey:page.providerKey,origins:[page.providerKey],match,occurrences:[{card,providerKey:page.providerKey,match}]});
    else {
      const best = previous.match === 'match' || match === 'match' ? 'match'
        : previous.match === 'unknown' || match === 'unknown' ? 'unknown' : 'excluded';
      groups.set(id,{...previous,
        ...(best !== previous.match ? {card,providerKey:page.providerKey} : {}),
        match:best,origins:[...new Set([...previous.origins,page.providerKey])],
        occurrences:[...previous.occurrences,{card,providerKey:page.providerKey,match}]});
    }
  }
  return [...groups.values()];
}
