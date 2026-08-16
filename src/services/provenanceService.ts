import { execute } from './dbService';
import { logger } from '../utils/logger';

/**
 * Il registro dei fatti (#378, decisioni D23-D29).
 *
 * Qui si scrive **cosa è successo**, non cosa c'è adesso: lo stato corrente
 * vive nelle tabelle di dominio, la provenienza in un registro append-only che
 * non si modifica e non si cancella automaticamente (D28).
 *
 * Cosa entra e cosa no (D26): chiamate ai modelli con il loro esito, decisioni
 * umane su una proposta, ciclo di vita dei lavori, import, scaricamenti,
 * esportazioni. **Non** navigazione, clic, scorrimento, battiture, tempo
 * passato su una schermata. E **niente lascia la macchina**: nessuna
 * telemetria esterna, nemmeno anonima.
 *
 * Il ciclo di vita dei lavori lo registra il backend da sé (`provenance.rs`):
 * è parte del contratto del motore, non di chi scrive un gestore.
 */

/** I valori che la colonna `entity_type` ammette. */
export type FactEntity =
  | 'source'
  | 'source_version'
  | 'transcription_document'
  | 'transcription_segment'
  | 'transcription_revision'
  | 'project'
  | 'translation_chunk'
  | 'artifact'
  | 'job';

export type FactActor = 'user' | 'system' | 'model';

export interface Fact {
  eventType: string;
  entityType: FactEntity;
  entityId: string;
  actor: FactActor;
  /**
   * Cosa rende **distinto** questo fatto dagli altri dello stesso tipo sulla
   * stessa entità, quando il tipo da solo non basta: la revisione approvata,
   * per esempio. Entra nell'identità, quindi decide cosa sostituisce cosa.
   */
  keyRef?: string | null;
  workspaceId?: string | null;
  jobId?: string | null;
  outcome?: string | null;
  durationMs?: number | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  estimatedCost?: number | null;
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  errorKind?: string | null;
  inputRef?: string | null;
  outputRef?: string | null;
  inputHash?: string | null;
  outputHash?: string | null;
  /** Il resto, in JSON: i dettagli propri di quel tipo di evento (D24). */
  config?: Record<string, unknown> | null;
}

/**
 * Impronta stabile del contenuto (D25): il riferimento dice cosa c'è
 * **adesso**, l'impronta cosa c'era **allora**.
 *
 * FNV-1a a 64 bit, la stessa del backend: non è crittografica e non deve
 * esserlo. Serve a riconoscere che qualcosa è cambiato.
 */
export function contentHash(text: string): string {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * L'identificativo di un fatto, **derivato in modo deterministico** (D27):
 * riscrivere lo stesso fatto non duplica, sostituisce.
 *
 * Stessa formula del backend, perché i due scrivono nella stessa tabella e due
 * regole diverse produrrebbero due registri sovrapposti.
 */
export function factId(fact: Fact): string {
  const key = [
    fact.jobId ?? '',
    fact.entityType,
    fact.entityId,
    fact.eventType,
    fact.keyRef ?? '',
  ].join('|');
  return `pev:${contentHash(key)}`;
}

/** Scrive un fatto. Riscriverlo non duplica: sostituisce (D27). */
export async function recordFact(fact: Fact): Promise<void> {
  // Il registro dei fatti è invisibile per definizione: senza una riga qui,
  // «non ha registrato niente» e «non è mai successo» si confondono.
  logger.info('provenance.fact', {
    eventType: fact.eventType,
    entityType: fact.entityType,
    entityId: fact.entityId,
    actor: fact.actor,
    outcome: fact.outcome ?? null,
  });
  await execute(
    `INSERT INTO provenance_events (
       id, event_type, entity_type, entity_id, workspace_id, actor, job_id,
       input_ref, output_ref, config, outcome, duration_ms, provider, model,
       prompt_version, input_tokens, output_tokens, cached_tokens, estimated_cost,
       source_language, target_language, error_kind, input_hash, output_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22, $23, $24)
     ON CONFLICT(id) DO UPDATE SET
       occurred_at    = CURRENT_TIMESTAMP,
       outcome        = excluded.outcome,
       duration_ms    = excluded.duration_ms,
       config         = excluded.config,
       input_hash     = excluded.input_hash,
       output_hash    = excluded.output_hash`,
    [
      factId(fact),
      fact.eventType,
      fact.entityType,
      fact.entityId,
      fact.workspaceId ?? null,
      fact.actor,
      fact.jobId ?? null,
      fact.inputRef ?? null,
      fact.outputRef ?? null,
      fact.config ? JSON.stringify(fact.config) : null,
      fact.outcome ?? null,
      fact.durationMs ?? null,
      fact.provider ?? null,
      fact.model ?? null,
      fact.promptVersion ?? null,
      fact.inputTokens ?? null,
      fact.outputTokens ?? null,
      fact.cachedTokens ?? null,
      fact.estimatedCost ?? null,
      fact.sourceLanguage ?? null,
      fact.targetLanguage ?? null,
      fact.errorKind ?? null,
      fact.inputHash ?? null,
      fact.outputHash ?? null,
    ],
  );
}
