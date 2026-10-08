import { listTranscriptionCatalog } from './transcriptionCatalogService';
import { listTranslationCatalog } from './translationCatalogService';
import { getPipelineConfig } from './pipelineService';
import { loadDailyOutput, loadRemainingChunks, type DailyOutputRow } from './statsService';
import { totalPagesOf } from '../utils/transcriptionCatalogFilters';
import { parseStoredDate } from '../utils/dashboardStats';
import { estimatePipelineCost } from '../utils/costEstimate';
import { forecastCompletion, seedFrom, type CompletionForecast } from '../utils/statistics';
import type { Pricing } from '../utils/operationLogStats';

/** Quanti lavori in corso si mostrano. */
const PROGRESS_LIMIT = 6;

/** Una trascrizione o una traduzione a metà, con la previsione di fine. */
export interface WorkProgress {
  kind: 'transcription' | 'translation';
  id: string;
  title: string;
  workspaceId: string;
  done: number;
  verified: number;
  total: number;
  /** Giornate di lavoro per finire, `null` se i giorni lavorati sono troppo pochi. */
  forecast: CompletionForecast | null;
  /** Giorni lavorati finora su questo lavoro. */
  workedDays: number;
  /** Stima a listino per i frammenti mancanti (solo traduzioni): come nello Studio. */
  costToFinish: { usd: number | null; free: boolean } | null;
  lastEditedAt: string;
}

function outputOf(rows: DailyOutputRow[], id: string): number[] {
  return rows.filter((row) => row.id === id).map((row) => Number(row.count));
}

/**
 * La stessa stima di costo che lo Studio mostra prima di avviare la pipeline,
 * sui frammenti ancora da tradurre: parole del testo → token stimati, fasi
 * attive, prezzi del listino. Non dipende dallo storico dei costi.
 */
async function estimateToFinish(projectId: string, pricing: Pricing): Promise<WorkProgress['costToFinish']> {
  const remaining = await loadRemainingChunks(projectId);
  if (remaining.length === 0) return null;
  const loaded = await getPipelineConfig(remaining[0].pipeline_id);
  if (!loaded) return null;
  const estimate = estimatePipelineCost(remaining.map((row) => ({ sourceText: row.source_text })), loaded.config, pricing);
  return { usd: estimate.totalUsd, free: estimate.isFree };
}

/**
 * I lavori iniziati e non finiti, dal più recente: pagine scritte di una
 * trascrizione sul totale dell'opera (solo se il totale è noto), frammenti
 * tradotti di una traduzione sul totale della sua prima pipeline. La previsione
 * è `forecastCompletion` sul lavoro fatto in ogni giorno lavorato.
 */
export async function loadWorkProgress(workspaceId: string | null, pricing: Pricing = {}): Promise<WorkProgress[]> {
  const [transcriptions, translations, output] = await Promise.all([
    listTranscriptionCatalog(),
    listTranslationCatalog(),
    loadDailyOutput(),
  ]);
  const inScope = (id: string) => workspaceId === null || id === workspaceId;

  const transcriptionItems = transcriptions.flatMap((entry): WorkProgress[] => {
    const total = totalPagesOf(entry);
    if (entry.document.status !== 'active' || !inScope(entry.document.workspace_id)) return [];
    if (!total || entry.pagesWithText === 0 || entry.pagesWithText >= total) return [];
    const daily = outputOf(output.transcriptions, entry.document.id);
    return [{
      kind: 'transcription',
      id: entry.document.id,
      title: entry.document.title,
      workspaceId: entry.document.workspace_id,
      done: entry.pagesWithText,
      verified: entry.verifiedPages,
      total,
      forecast: forecastCompletion(daily, total - entry.pagesWithText, { seed: seedFrom(entry.document.id) }),
      workedDays: daily.length,
      costToFinish: null,
      lastEditedAt: entry.lastEditedAt,
    }];
  });

  const translationItems = translations.flatMap((entry): WorkProgress[] => {
    if (!inScope(entry.workspaceId)) return [];
    if (entry.chunkCount === 0 || entry.translatedChunks === 0 || entry.translatedChunks >= entry.chunkCount) return [];
    const daily = outputOf(output.translations, entry.id);
    return [{
      kind: 'translation',
      id: entry.id,
      title: entry.name,
      workspaceId: entry.workspaceId,
      done: entry.translatedChunks,
      verified: entry.verifiedChunks,
      total: entry.chunkCount,
      forecast: forecastCompletion(daily, entry.chunkCount - entry.translatedChunks, { seed: seedFrom(entry.id) }),
      workedDays: daily.length,
      costToFinish: null,
      lastEditedAt: entry.updatedAt,
    }];
  });

  const items = [...transcriptionItems, ...translationItems]
    .sort((a, b) => parseStoredDate(b.lastEditedAt).getTime() - parseStoredDate(a.lastEditedAt).getTime())
    .slice(0, PROGRESS_LIMIT);
  return Promise.all(items.map(async (item) => item.kind === 'translation'
    ? { ...item, costToFinish: await estimateToFinish(item.id, pricing) }
    : item));
}
