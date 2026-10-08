import type { ChunkWordsRow, OcrCorrectionRow, QualityRow, UsageRow } from '../services/statsService';
import type { QualityRating } from '../types';
import { costForEntry, type Pricing } from './operationLogStats';
import {
  bootstrapInterval,
  codePointLength,
  levenshtein,
  quantile,
  wilsonInterval,
  type Interval,
} from './statistics';

/** Periodo scelto nelle Statistiche. */
export type StatsPeriod = '30d' | '6m' | 'all';

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'all'>, number> = { '30d': 30, '6m': 182 };
/** Sotto questi giorni passati del mese la proiezione a fine mese non si fa. */
const MIN_PROJECTION_DAYS = 3;
/** Campione minimo per un rapporto o una quota da mostrare. */
export const MIN_SAMPLE = 3;

/** Inizio del periodo in ISO, `null` per tutto lo storico. */
export function periodStart(period: StatsPeriod, now: Date = new Date()): string | null {
  if (period === 'all') return null;
  return new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS).toISOString();
}

/** Le date dello storico sono ISO; quelle di SQLite «AAAA-MM-GG HH:MM:SS» in UTC. */
export function parseStoredDate(value: string): Date {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

export function inPeriod(at: string, since: string | null): boolean {
  return since === null || parseStoredDate(at).getTime() >= new Date(since).getTime();
}

const isCall = (row: UsageRow) => row.input_tokens !== null || row.output_tokens !== null;
const isOcr = (row: UsageRow) => row.scope === 'ocr';
export const modelKey = (row: { provider: string | null; model: string | null }) =>
  `${row.provider ?? '?'}/${row.model ?? '?'}`;

/** Costo di una chiamata: quello fissato alla scrittura, altrimenti dal listino
 *  attuale. `null` se il modello non ha prezzo noto. */
export function rowCost(row: UsageRow, pricing: Pricing): number | null {
  if (row.cost_usd !== null) return row.cost_usd;
  if (row.is_free === 1) return 0;
  return costForEntry({
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
  }, pricing);
}

export function monthOf(at: string): string {
  const date = parseStoredDate(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface MonthSpend {
  month: string;
  translation: number;
  ocr: number;
}

export interface SpendSummary {
  total: number;
  translation: number;
  ocr: number;
  /** Chiamate senza prezzo noto: il totale le esclude e lo deve dire. */
  unpricedCalls: number;
  months: MonthSpend[];
}

export function summarizeSpend(rows: UsageRow[], pricing: Pricing): SpendSummary {
  const months = new Map<string, MonthSpend>();
  let translation = 0;
  let ocr = 0;
  let unpricedCalls = 0;
  for (const row of rows.filter(isCall)) {
    const cost = rowCost(row, pricing);
    if (cost === null) { unpricedCalls += 1; continue; }
    const month = monthOf(row.at);
    const entry = months.get(month) ?? { month, translation: 0, ocr: 0 };
    if (isOcr(row)) { ocr += cost; months.set(month, { ...entry, ocr: entry.ocr + cost }); }
    else { translation += cost; months.set(month, { ...entry, translation: entry.translation + cost }); }
  }
  return {
    total: translation + ocr,
    translation,
    ocr,
    unpricedCalls,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/**
 * Spesa del mese in corso e proiezione lineare a fine mese: spesa fin qui
 * divisa per la frazione di mese trascorsa (misurata in tempo, non in giorni
 * interi). `projected` è `null` nei primi `MIN_PROJECTION_DAYS` giorni, quando
 * pochi giorni moltiplicati per trenta danno numeri senza significato.
 */
export function monthProjection(rows: UsageRow[], pricing: Pricing, now: Date = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const spent = rows.filter((row) => isCall(row) && parseStoredDate(row.at) >= start && parseStoredDate(row.at) < end)
    .reduce((sum, row) => sum + (rowCost(row, pricing) ?? 0), 0);
  const elapsedMs = now.getTime() - start.getTime();
  const fraction = elapsedMs / (end.getTime() - start.getTime());
  return { spent, projected: elapsedMs >= MIN_PROJECTION_DAYS * DAY_MS ? spent / fraction : null };
}

export interface ModelSummary {
  key: string;
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  free: boolean;
  medianSeconds: number | null;
  /** 90° percentile delle durate: nove chiamate su dieci sono più veloci. */
  p90Seconds: number | null;
  /** Tentativi falliti (errori finali e tentativi poi ripetuti) sui tentativi. */
  failures: number;
  attempts: number;
  failureRate: number | null;
  failureInterval: Interval | null;
  ocrCalls: number;
}

/**
 * Modelli per numero di chiamate, con costo, tempi e affidabilità. Una riga
 * «retry» è un tentativo fallito che verrà ripetuto, una riga d'errore un
 * tentativo fallito definitivo, una chiamata con token un tentativo riuscito:
 * la quota di fallimenti è falliti / tentativi, con intervallo di Wilson.
 * Errori e tentativi si attribuiscono solo quando la riga dice il modello.
 */
export function summarizeModels(rows: UsageRow[], pricing: Pricing): ModelSummary[] {
  const groups = new Map<string, UsageRow[]>();
  for (const row of rows) {
    if (!row.model) continue;
    const key = modelKey(row);
    // Raccolta locale: copiare l'elenco a ogni riga sarebbe quadratico su
    // decine di migliaia di righe di storico.
    const group = groups.get(key);
    if (group) group.push(row); else groups.set(key, [row]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const calls = group.filter(isCall);
    const costs = calls.map((row) => rowCost(row, pricing));
    const durations = calls.map((row) => row.duration_ms).filter((ms): ms is number => ms !== null && ms > 0)
      .sort((a, b) => a - b);
    const median = quantile(durations, 0.5);
    const p90 = quantile(durations, 0.9);
    const failures = group.filter((row) => !isCall(row) && (row.level === 'error' || row.phase === 'retry')).length;
    const attempts = calls.length + failures;
    return {
      key,
      provider: group[0].provider ?? '',
      model: group[0].model ?? '',
      calls: calls.length,
      inputTokens: sum(calls.map((row) => row.input_tokens ?? 0)),
      outputTokens: sum(calls.map((row) => row.output_tokens ?? 0)),
      cost: costs.some((cost) => cost === null) ? null : sum(costs.map((cost) => cost ?? 0)),
      free: calls.length > 0 && calls.every((row) => row.is_free === 1 || row.provider === 'ollama'),
      medianSeconds: median === null ? null : median / 1000,
      p90Seconds: p90 === null ? null : p90 / 1000,
      failures,
      attempts,
      failureRate: attempts > 0 ? failures / attempts : null,
      failureInterval: wilsonInterval(failures, attempts),
      ocrCalls: calls.filter(isOcr).length,
    };
  }).filter((model) => model.calls > 0).sort((a, b) => b.calls - a.calls);
}

export interface TokenSummary {
  input: number;
  output: number;
  cached: number;
  /** Quota dell'input letta dalla cache, sulle sole chiamate che la dichiarano. */
  cacheRate: number | null;
}

export function summarizeTokens(rows: UsageRow[]): TokenSummary {
  const calls = rows.filter(isCall);
  const cached = sum(calls.map((row) => row.cached_input_tokens ?? 0));
  const miss = sum(calls.map((row) => row.cache_miss_input_tokens ?? 0));
  return {
    input: sum(calls.map((row) => row.input_tokens ?? 0)),
    output: sum(calls.map((row) => row.output_tokens ?? 0)),
    cached,
    cacheRate: cached + miss > 0 ? cached / (cached + miss) : null,
  };
}

/** Spesa registrata per frammento (fasi di traduzione), solo dove il costo è noto. */
export function chunkCosts(rows: UsageRow[], pricing: Pricing): Map<string, number> {
  const unknown = new Set<string>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.scope !== 'stage' || !isCall(row) || !row.chunk_id) continue;
    const cost = rowCost(row, pricing);
    if (cost === null) { unknown.add(row.chunk_id); continue; }
    totals.set(row.chunk_id, (totals.get(row.chunk_id) ?? 0) + cost);
  }
  for (const id of unknown) totals.delete(id);
  return totals;
}

export interface RatioEstimate {
  value: number;
  interval: Interval | null;
  /** Frammenti con costo registrato su cui è calcolato. */
  sample: number;
}

/**
 * Costo per 1.000 parole tradotte, stimatore a rapporto: somma dei costi dei
 * frammenti con costo registrato divisa per la somma delle loro parole. I
 * frammenti tradotti prima che lo storico registrasse i costi restano fuori da
 * numeratore *e* denominatore. Intervallo bootstrap sui frammenti.
 */
export function costPerThousandWords(costs: Map<string, number>, words: ChunkWordsRow[]): RatioEstimate | null {
  const sample = words.filter((row) => costs.has(row.id) && Number(row.words) > 0)
    .map((row) => ({ cost: costs.get(row.id) ?? 0, words: Number(row.words) }));
  if (sample.length < MIN_SAMPLE) return null;
  const ratio = (items: { cost: number; words: number }[]) =>
    sum(items.map((item) => item.cost)) / sum(items.map((item) => item.words)) * 1000;
  return { value: ratio(sample), interval: bootstrapInterval(sample, ratio, { seed: 7 }), sample: sample.length };
}

export const QUALITY_ORDER: QualityRating[] = ['critical', 'poor', 'fair', 'good', 'excellent'];

export interface ModelQuality {
  key: string;
  model: string;
  counts: Record<QualityRating, number>;
  judged: number;
  /** Quota di frammenti buoni o ottimi, con intervallo di Wilson al 95%. */
  goodShare: number;
  goodInterval: Interval | null;
  /** Spesa per frammento buono, solo sui frammenti giudicati con costo registrato. */
  costPerGood: number | null;
  costSample: number;
}

const isGood = (rating: string) => rating === 'good' || rating === 'excellent';

/**
 * Giudizi per modello (quello dell'ultima fase conclusa sul frammento). Il
 * costo per frammento buono è un rapporto sullo stesso insieme: spesa delle
 * fasi dei frammenti giudicati *con costo registrato*, divisa per quanti di
 * quei frammenti sono buoni o ottimi. Con meno di `MIN_SAMPLE` frammenti
 * misurati non si calcola.
 */
export function summarizeQuality(quality: QualityRow[], costs: Map<string, number>): ModelQuality[] {
  const groups = new Map<string, QualityRow[]>();
  for (const row of quality) {
    if (!row.model) continue;
    const key = modelKey(row);
    const group = groups.get(key);
    if (group) group.push(row); else groups.set(key, [row]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const counts = Object.fromEntries(QUALITY_ORDER.map((rating) =>
      [rating, rows.filter((row) => row.rating === rating).length])) as Record<QualityRating, number>;
    const good = counts.good + counts.excellent;
    const measured = rows.filter((row) => costs.has(row.chunk_id));
    const measuredGood = measured.filter((row) => isGood(row.rating)).length;
    const spent = sum(measured.map((row) => costs.get(row.chunk_id) ?? 0));
    return {
      key,
      model: rows[0].model ?? '',
      counts,
      judged: rows.length,
      goodShare: good / rows.length,
      goodInterval: wilsonInterval(good, rows.length),
      costPerGood: measured.length >= MIN_SAMPLE && measuredGood > 0 ? spent / measuredGood : null,
      costSample: measured.length,
    };
  }).sort((a, b) => b.judged - a.judged);
}

export interface OcrPrecision {
  model: string;
  pages: number;
  /** Character Error Rate: modifiche / caratteri del testo corretto (micro-media). */
  cer: number;
  interval: Interval | null;
}

/**
 * Precisione dell'OCR per modello come Character Error Rate, la misura
 * standard: distanza di Levenshtein fra testo letto e testo corretto a mano,
 * divisa per la lunghezza del testo corretto, sommando su tutte le pagine
 * (le pagine lunghe pesano di più, come devono). Intervallo bootstrap sulle
 * pagine. Il migliore per primo.
 */
export function summarizeOcrPrecision(rows: OcrCorrectionRow[]): OcrPrecision[] {
  const groups = new Map<string, { edits: number; length: number }[]>();
  for (const row of rows) {
    if (!row.model) continue;
    const page = { edits: levenshtein(row.ocr_text, row.final_text), length: codePointLength(row.final_text) };
    const group = groups.get(row.model);
    if (group) group.push(page); else groups.set(row.model, [page]);
  }
  const cer = (pages: { edits: number; length: number }[]) => {
    const length = sum(pages.map((page) => page.length));
    return length > 0 ? sum(pages.map((page) => page.edits)) / length : 0;
  };
  return [...groups.entries()]
    .map(([model, pages]) => ({
      model,
      pages: pages.length,
      cer: cer(pages),
      interval: pages.length >= MIN_SAMPLE ? bootstrapInterval(pages, cer, { seed: 11 }) : null,
    }))
    .sort((a, b) => a.cer - b.cer);
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
