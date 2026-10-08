import { useCallback, useMemo } from 'react';
import {
  loadActivity,
  loadChunkWords,
  loadGlossaryData,
  loadMemoryStats,
  loadOcrCorrections,
  loadQualityRows,
  loadTranslationLanguages,
  loadUsageRows,
  loadWordTotals,
} from '../services/statsService';
import { loadWorkProgress } from '../services/workProgressService';
import { activityStart, localDay } from '../utils/dashboardActivity';
import { periodStart, type StatsPeriod } from '../utils/dashboardStats';
import type { Pricing } from '../utils/operationLogStats';
import { useDashboardResource } from './useDashboardResource';

/**
 * Tutte le letture delle Statistiche, ognuna per conto suo: una che non riesce
 * lo dice nella sua sezione e non spegne le altre. Lo storico delle chiamate si
 * legge intero una volta e si filtra per periodo nei calcoli: serve anche alle
 * previsioni, che guardano sempre a tutto lo storico.
 */
export function useDashboardStats(workspaceId: string | null, period: StatsPeriod, revision: number, pricing: Pricing) {
  // Fissato per periodo e aggiornamento: ricalcolato a ogni disegno
  // cambierebbe a ogni millisecondo e farebbe rileggere tutto di continuo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const since = useMemo(() => periodStart(period), [period, revision]);
  const usageLoader = useCallback((id: string | null) => loadUsageRows(id, null), []);
  const activityLoader = useCallback((id: string | null) => loadActivity(id, `${localDay(activityStart())} 00:00:00`), []);
  const qualityLoader = useCallback((id: string | null) => loadQualityRows(id, since), [since]);
  const ocrLoader = useCallback((id: string | null) => loadOcrCorrections(id, since), [since]);
  const progressLoader = useCallback((id: string | null) => loadWorkProgress(id, pricing), [pricing]);
  return {
    since,
    usage: useDashboardResource(usageLoader, workspaceId, revision),
    activity: useDashboardResource(activityLoader, workspaceId, revision),
    words: useDashboardResource(loadWordTotals, workspaceId, revision),
    quality: useDashboardResource(qualityLoader, workspaceId, revision),
    ocr: useDashboardResource(ocrLoader, workspaceId, revision),
    memory: useDashboardResource(loadMemoryStats, workspaceId, revision),
    languages: useDashboardResource(loadTranslationLanguages, workspaceId, revision),
    glossaries: useDashboardResource(loadGlossaryData, workspaceId, revision),
    progress: useDashboardResource(progressLoader, workspaceId, revision),
    chunkWords: useDashboardResource(loadChunkWords, workspaceId, revision),
  };
}

