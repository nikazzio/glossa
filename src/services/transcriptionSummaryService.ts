import { select } from './dbService';
import { providerLabel } from '../models/catalog';
import { costForEntry, sentInputTokens, type Pricing } from '../utils/operationLogStats';

/** Letture automatiche di un insieme di righe di esito del log. */
export interface OcrUsage {
  runs: number;
  errors: number;
  pagesRead: number;
  rereads: number;
  /** Token inviati, compresi quelli letti dalla cache, per ogni servizio. */
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** `null` se almeno una lettura usa un modello senza prezzo noto. */
  costUsd: number | null;
  averageDurationMs: number | null;
  lastAt: string | null;
  models: string[];
}

export interface TranscriptionSummary {
  pagesWithText: number;
  verifiedPages: number;
  words: number;
  characters: number;
  ocr: OcrUsage;
  /** Letture della sola pagina aperta; vuote se la pagina non esiste ancora. */
  page: OcrUsage;
}

interface OutcomeRow {
  at: string;
  level: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  transcription_segment_id: string | null;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

function summarizeOutcomes(rows: OutcomeRow[], pricing: Pricing): OcrUsage {
  // `success` è una revisione scritta, `warn` un testo identico al precedente:
  // in entrambi i casi il servizio ha letto la pagina ed è stato pagato.
  const reads = rows.filter((row) => row.level === 'success' || row.level === 'warn');
  const pagesRead = new Set(reads.map((row) => row.transcription_segment_id).filter(Boolean)).size;
  const costs = reads.map((row) => row.cost_usd ?? costForEntry({
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    cachedInputTokens: row.cached_input_tokens ?? undefined,
  }, pricing));
  const durations = reads.map((row) => row.duration_ms).filter((value): value is number => value != null);
  const models = [...new Set(reads
    .filter((row) => row.provider)
    .map((row) => `${providerLabel(row.provider ?? '')}${row.model ? ` ${row.model}` : ''}`))];
  return {
    runs: reads.length,
    errors: rows.filter((row) => row.level === 'error').length,
    pagesRead,
    rereads: Math.max(reads.length - pagesRead, 0),
    inputTokens: sum(reads.map((row) => sentInputTokens({
      provider: row.provider ?? undefined,
      inputTokens: row.input_tokens ?? undefined,
      cachedInputTokens: row.cached_input_tokens ?? undefined,
    }))),
    cachedInputTokens: sum(reads.map((row) => row.cached_input_tokens ?? 0)),
    outputTokens: sum(reads.map((row) => row.output_tokens ?? 0)),
    costUsd: costs.some((cost) => cost === null) ? null : sum(costs.map((cost) => cost ?? 0)),
    averageDurationMs: durations.length > 0 ? sum(durations) / durations.length : null,
    lastAt: reads.reduce<string | null>((last, row) => (last === null || row.at > last ? row.at : last), null),
    models,
  };
}

/** Stato del documento dalle ultime revisioni di ogni pagina, più le letture
 *  automatiche del documento e della pagina aperta dalle righe di esito. */
export async function getTranscriptionSummary(
  documentId: string,
  segmentId: string | null,
  pricing: Pricing,
): Promise<TranscriptionSummary> {
  const pages = await select<{ text: string | null; approved_revision_id: string | null }>(
    `SELECT r.text, s.approved_revision_id
       FROM transcription_segments s
       LEFT JOIN transcription_revisions r ON r.id = (
         SELECT id FROM transcription_revisions
          WHERE segment_id = s.id ORDER BY revision_number DESC LIMIT 1
       )
      WHERE s.document_id = $1`,
    [documentId],
  );
  const outcomes = await select<OutcomeRow>(
    `SELECT at, level, provider, model, input_tokens, cached_input_tokens, output_tokens,
            cost_usd, duration_ms, transcription_segment_id
       FROM operation_logs
      WHERE transcription_document_id = $1 AND phase = 'end'`,
    [documentId],
  );
  const texts = pages.map((page) => page.text?.trim() ?? '').filter((text) => text.length > 0);
  const textPages = pages.filter((page) => Boolean(page.text?.trim()));
  return {
    pagesWithText: textPages.length,
    verifiedPages: textPages.filter((page) => page.approved_revision_id !== null).length,
    words: sum(texts.map((text) => text.match(/\S+/gu)?.length ?? 0)),
    characters: sum(texts.map((text) => [...text].length)),
    ocr: summarizeOutcomes(outcomes, pricing),
    page: summarizeOutcomes(
      segmentId === null ? [] : outcomes.filter((row) => row.transcription_segment_id === segmentId),
      pricing,
    ),
  };
}

/** Le letture automatiche di una pagina: quante, e quanto è costata l'ultima. */
export interface PageReadInfo {
  reads: number;
  /** `null` se non ci sono letture o il prezzo del modello non è noto. */
  lastCostUsd: number | null;
}

export async function getPageReadInfo(segmentId: string, pricing: Pricing): Promise<PageReadInfo> {
  const rows = await select<OutcomeRow>(
    `SELECT at, level, provider, model, input_tokens, cached_input_tokens, output_tokens,
            cost_usd, duration_ms, transcription_segment_id
       FROM operation_logs
      WHERE transcription_segment_id = $1 AND phase = 'end' AND level IN ('success', 'warn')
      ORDER BY at DESC`,
    [segmentId],
  );
  const last = rows[0];
  const lastCostUsd = last
    ? last.cost_usd ?? costForEntry({
      provider: last.provider ?? undefined,
      model: last.model ?? undefined,
      inputTokens: last.input_tokens ?? undefined,
      outputTokens: last.output_tokens ?? undefined,
      cachedInputTokens: last.cached_input_tokens ?? undefined,
    }, pricing)
    : null;
  return { reads: rows.length, lastCostUsd };
}

/** La pagina è già stata letta automaticamente almeno una volta. */
export async function hasAutomaticReading(segmentId: string): Promise<boolean> {
  const rows = await select<{ count: number }>(
    `SELECT COUNT(*) AS count FROM operation_logs
      WHERE transcription_segment_id = $1 AND phase = 'end' AND level IN ('success', 'warn')`,
    [segmentId],
  );
  return (rows[0]?.count ?? 0) > 0;
}
