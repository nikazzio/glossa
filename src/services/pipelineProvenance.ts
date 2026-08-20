import { contentHash, recordFact } from './provenanceService';
import { actualCost } from '../utils/costEstimate';
import { usePricingStore } from '../stores/pricingStore';
import type { JudgeResult, TokenUsage } from '../types';

/**
 * Quello che resta scritto di una chiamata a un modello (#378).
 *
 * Token, costo e durata **esistono solo mentre la chiamata avviene**: sono
 * l'unica parte del lavoro che non si può ricostruire dopo guardando i testi.
 * Da qui vengono i confronti fra modelli, il costo per lingua e per periodo, e
 * la risposta alla domanda «perché questo documento è costato tanto».
 *
 * L'identità del fatto è **frammento più stadio**: rieseguire la
 * pipeline sostituisce il fatto di quello stadio invece di accumularne uno per
 * tentativo. Quante volte si è rieseguito lo dicono le revisioni prodotte.
 */

export const EVENT_MODEL_CALL = 'model.call';
export const EVENT_JUDGED = 'translation.judged';

export interface ModelCall {
  chunkId: string;
  /** Lo stadio della pipeline, oppure `judge` e `coherence`. */
  stageId: string;
  stageName: string;
  provider: string;
  model: string;
  usage?: TokenUsage;
  durationMs: number;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  promptVersion?: string | null;
  /** Il testo mandato e quello ricevuto: se ne conserva l'impronta, non il testo. */
  input?: string;
  output?: string;
  /** I caratteri fatturati, per i servizi che contano quelli invece dei token. */
  billedCharacters?: number;
  workspaceId?: string | null;
}

/** Una chiamata riuscita. */
export async function recordModelCall(call: ModelCall): Promise<void> {
  await write(call, 'completed', null);
}

/** Una chiamata fallita: vale quanto una riuscita, e spesso di più. */
export async function recordFailedModelCall(call: ModelCall, error: string): Promise<void> {
  await write(call, 'error', classify(error));
}

/**
 * Il **tipo** di errore, non il suo testo.
 *
 * La colonna serve a raggruppare: «quante chiamate sono cadute per i
 * limiti del provider questo mese» è una domanda con risposta, «quante volte è
 * comparso questo messaggio» non lo è, perché il messaggio cambia con il
 * provider e con la giornata. Il testo intero resta nel registro tecnico.
 */
export function classify(error: string): string {
  const message = error.toLowerCase();
  if (/429|rate limit|too many requests|quota/.test(message)) return 'rateLimited';
  if (/401|403|api key|unauthor|forbidden/.test(message)) return 'auth';
  if (/timeout|timed out|network|fetch|connection|econn|dns/.test(message)) return 'transport';
  if (/json|parse|schema|malformed|unexpected token/.test(message)) return 'format';
  if (/cancel|abort/.test(message)) return 'cancelled';
  if (/5\d\d|server error|unavailable|overload/.test(message)) return 'providerDown';
  return 'unknown';
}

async function write(call: ModelCall, outcome: string, errorKind: string | null): Promise<void> {
  const inputTokens = call.usage?.inputTokens ?? 0;
  const outputTokens = call.usage?.outputTokens ?? 0;
  const cachedTokens = call.usage?.cachedInputTokens ?? 0;
  // Quanti token si pagano per intero. I provider non lo dicono allo stesso
  // modo — Anthropic tiene quelli da cache fuori dal totale d'ingresso, gli
  // altri dentro — e il conto giusto lo fa già il backend, che conosce la
  // risposta che ha letto.
  const fullPriceInputTokens = call.usage?.cacheMissInputTokens ?? inputTokens;
  await recordFact({
    eventType: EVENT_MODEL_CALL,
    entityType: 'translation_chunk',
    entityId: call.chunkId,
    keyRef: call.stageId,
    actor: 'model',
    workspaceId: call.workspaceId ?? null,
    outcome,
    errorKind,
    durationMs: call.durationMs,
    provider: call.provider,
    model: call.model,
    promptVersion: call.promptVersion ?? null,
    inputTokens: call.usage ? inputTokens : null,
    outputTokens: call.usage ? outputTokens : null,
    cachedTokens: call.usage?.cachedInputTokens ?? null,
    estimatedCost: call.usage
      ? actualCost(
          call.provider,
          call.model,
          fullPriceInputTokens,
          outputTokens,
          usePricingStore.getState().overrides,
          cachedTokens,
        )
      : null,
    sourceLanguage: call.sourceLanguage ?? null,
    targetLanguage: call.targetLanguage ?? null,
    // Le impronte, non i testi: il registro dice **cosa ha visto** la chiamata,
    // e i testi stanno già nelle revisioni.
    inputHash: call.input ? contentHash(call.input) : null,
    outputHash: call.output ? contentHash(call.output) : null,
    config: {
      stage: call.stageName,
      // DeepL fattura **caratteri**, non token, e il listino a token non lo
      // copre: senza questo numero, di uno stadio DeepL il registro non direbbe
      // né quanto è costato né quanto ha fatturato.
      ...(call.billedCharacters !== undefined ? { billedCharacters: call.billedCharacters } : {}),
    },
  });
}

export const EVENT_EMBEDDINGS = 'embeddings.regenerated';

/**
 * La rigenerazione degli embedding della memoria di frasi.
 *
 * Non è una chiamata per frammento ma per workspace, e su un provider a
 * pagamento **si paga**: senza questa riga sparirebbe dal conto insieme al suo
 * costo. Quante frasi sono state rifatte è l'unica misura che il comando
 * restituisce; i token non li dichiara, e non si inventano.
 */
export async function recordEmbeddingRun(run: {
  workspaceId: string;
  model: string;
  entries: number;
  durationMs: number;
  outcome: 'completed' | 'error';
  error?: string;
}): Promise<void> {
  await recordFact({
    eventType: EVENT_EMBEDDINGS,
    entityType: 'workspace',
    entityId: run.workspaceId,
    keyRef: run.model,
    actor: 'model',
    workspaceId: run.workspaceId,
    outcome: run.outcome,
    errorKind: run.error ? classify(run.error) : null,
    durationMs: run.durationMs,
    model: run.model,
    config: { entries: run.entries },
  });
}

/**
 * Il verdetto del giudice, **legato alla revisione che ha giudicato**.
 *
 * Le colonne del frammento restano dove sono per la lettura veloce, ma vengono
 * sovrascritte a ogni riesecuzione: senza questo fatto, «il modello aveva
 * proposto X, il giudice l'aveva dato per mediocre, l'umano ha approvato Y»
 * non è ricostruibile.
 */
export async function recordJudgement(
  chunkId: string,
  revisionId: string,
  judge: JudgeResult,
  workspaceId: string | null,
): Promise<void> {
  await recordFact({
    eventType: EVENT_JUDGED,
    entityType: 'translation_chunk',
    entityId: chunkId,
    // Una revisione, un giudizio: rigiudicare la stessa revisione sostituisce,
    // rieseguire la pipeline ne produce una nuova e quindi un fatto nuovo.
    keyRef: revisionId,
    actor: 'model',
    workspaceId,
    outcome: judge.rating,
    inputRef: revisionId,
    config: {
      rating: judge.rating,
      issues: judge.issues.length,
      // I tipi di problema, non il testo: serve a raggruppare, non a rileggere.
      issueTypes: [...new Set(judge.issues.map((issue) => issue.type))],
    },
  });
}
