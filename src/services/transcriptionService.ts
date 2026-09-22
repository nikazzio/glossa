import { execute, select } from './dbService';
import { contentHash, recordFact } from './provenanceService';
import { logger } from '../utils/logger';
import { DEFAULT_OCR_PROMPT } from '../constants';
import type { ModelProvider, Workspace } from '../types';

/**
 * Il documento di trascrizione: contenuto per pagina/segmento, stato
 * editoriale e cronologia di salvataggio (#219).
 *
 * Un segmento non ha una colonna di stato propria: `approved_revision_id`
 * nullo è «bozza», valorizzato è «verificato» — lo stesso schema già in uso
 * per l'approvazione delle traduzioni (`translationRevisionsService.ts`), qui
 * duplicato perché le due entità restano indipendenti finché il ponte verso
 * la traduzione (fuori scope, vedi #219) non le collega.
 *
 * Le revisioni sono append-only: «restore» scrive una revisione nuova con il
 * testo di quella vecchia, non riscrive la storia.
 */

export const EVENT_VERIFIED = 'transcription.segment.verified';
export const EVENT_UNVERIFIED = 'transcription.segment.verification_withdrawn';

export type TranscriptionDocumentStatus = 'active' | 'archived' | 'trashed';
export type TranscriptionRevisionAuthor = 'user' | 'ocr' | 'import';

export interface TranscriptionDocument {
  id: string;
  source_version_id: string | null;
  workspace_id: string;
  title: string;
  status: TranscriptionDocumentStatus;
  /** Fornitore, modello e prompt OCR del documento (#220): NULL eredita dal
   *  workspace. Il prompt vale per tutte le pagine del documento. */
  ocr_provider: string | null;
  ocr_model: string | null;
  ocr_prompt: string | null;
}

export interface TranscriptionSegment {
  id: string;
  document_id: string;
  position: number;
  label: string | null;
  source_page_id: string | null;
  approved_revision_id: string | null;
}

export interface TranscriptionRevision {
  id: string;
  segment_id: string;
  revision_number: number;
  text: string;
  created_by: TranscriptionRevisionAuthor;
  derived_from_revision_id: string | null;
  content_hash: string;
  created_at: string;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function createDocument(
  workspaceId: string,
  title: string,
  sourceVersionId: string | null = null,
): Promise<TranscriptionDocument> {
  const document: TranscriptionDocument = {
    id: newId('td'),
    source_version_id: sourceVersionId,
    workspace_id: workspaceId,
    title,
    status: 'active',
    ocr_provider: null,
    ocr_model: null,
    ocr_prompt: null,
  };
  await execute(
    `INSERT INTO transcription_documents (id, source_version_id, workspace_id, title, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [document.id, document.source_version_id, document.workspace_id, document.title, document.status],
  );
  logger.info('transcription.document.created', { documentId: document.id, workspaceId });
  return document;
}

export async function listDocuments(
  workspaceId: string,
  status: TranscriptionDocumentStatus = 'active',
): Promise<TranscriptionDocument[]> {
  return select<TranscriptionDocument>(
    `SELECT * FROM transcription_documents
      WHERE workspace_id = $1 AND status = $2
      ORDER BY title ASC`,
    [workspaceId, status],
  );
}

export async function getDocument(documentId: string): Promise<TranscriptionDocument | null> {
  const rows = await select<TranscriptionDocument>(
    'SELECT * FROM transcription_documents WHERE id = $1',
    [documentId],
  );
  return rows[0] ?? null;
}

/** Fornitore, modello e prompt OCR del documento (#220): `null`/`''` per un
 *  campo significa «torna a ereditare dal workspace». */
export async function updateDocumentOcrSettings(
  documentId: string,
  updates: Partial<{ ocrProvider: string | null; ocrModel: string | null; ocrPrompt: string | null }>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  if (updates.ocrProvider !== undefined) {
    sets.push(`ocr_provider = $${index++}`);
    params.push(updates.ocrProvider || null);
  }
  if (updates.ocrModel !== undefined) {
    sets.push(`ocr_model = $${index++}`);
    params.push(updates.ocrModel || null);
  }
  if (updates.ocrPrompt !== undefined) {
    sets.push(`ocr_prompt = $${index++}`);
    params.push(updates.ocrPrompt || null);
  }
  if (sets.length === 0) return;
  params.push(documentId);
  await execute(`UPDATE transcription_documents SET ${sets.join(', ')} WHERE id = $${index}`, params);
}

export async function setDocumentStatus(
  documentId: string,
  status: TranscriptionDocumentStatus,
): Promise<void> {
  await execute(
    `UPDATE transcription_documents
        SET status = $2, trashed_at = CASE WHEN $2 = 'trashed' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = $1`,
    [documentId, status],
  );
  logger.info('transcription.document.status_changed', { documentId, status });
}

export async function addSegment(
  documentId: string,
  position: number,
  label: string | null = null,
  sourcePageId: string | null = null,
): Promise<TranscriptionSegment> {
  const segment: TranscriptionSegment = {
    id: newId('ts'),
    document_id: documentId,
    position,
    label,
    source_page_id: sourcePageId,
    approved_revision_id: null,
  };
  await execute(
    `INSERT INTO transcription_segments (id, document_id, position, label, source_page_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [segment.id, segment.document_id, segment.position, segment.label, segment.source_page_id],
  );
  return segment;
}

export async function listSegments(documentId: string): Promise<TranscriptionSegment[]> {
  return select<TranscriptionSegment>(
    'SELECT * FROM transcription_segments WHERE document_id = $1 ORDER BY position ASC',
    [documentId],
  );
}

/** Il segmento di quella pagina, se qualcuno l'ha già toccata. Non ne crea
 *  uno: sfogliare pagine mai trascritte non deve lasciare righe vuote. */
export async function getSegmentByPosition(
  documentId: string,
  position: number,
): Promise<TranscriptionSegment | null> {
  const rows = await select<TranscriptionSegment>(
    'SELECT * FROM transcription_segments WHERE document_id = $1 AND position = $2',
    [documentId, position],
  );
  return rows[0] ?? null;
}

/** Da posizione di una pagina nello Studio (da 0: la copertina è 0) a
 *  indice della stessa pagina nel manifesto (da 1), la numerazione usata dal
 *  deposito, dalla cache e da `source_pages`. **Unico punto** della
 *  conversione: chi confronta le due numerazioni senza passare da qui prende
 *  la pagina precedente. */
export function manifestIndexOf(position: number): number {
  return position + 1;
}

/** L'id della pagina logica corrispondente, se il documento ha una copia
 *  collegata e quella pagina è già passata da un lavoro di scaricamento
 *  (`source_pages` si popola lì, non alla sola apertura del manifesto). */
async function resolveSourcePageId(documentId: string, position: number): Promise<string | null> {
  const document = await getDocument(documentId);
  if (!document?.source_version_id) return null;
  const rows = await select<{ id: string }>(
    'SELECT id FROM source_pages WHERE source_version_id = $1 AND position = $2',
    [document.source_version_id, manifestIndexOf(position)],
  );
  return rows[0]?.id ?? null;
}

/** Il segmento di quella pagina, creandolo al primo tocco davvero — non alla
 *  sola apertura. L'etichetta segue quella che il visore dichiara adesso, se
 *  cambiata (una rilettura del manifesto può rinumerare le pagine). Un
 *  segmento nato prima che la copia fosse scaricata riceve `source_page_id`
 *  al primo tocco successivo allo scaricamento — non è un backfill una
 *  tantum, è la stessa risoluzione applicata a ogni chiamata. */
export async function ensureSegment(
  documentId: string,
  position: number,
  label: string | null = null,
): Promise<TranscriptionSegment> {
  const existing = await getSegmentByPosition(documentId, position);
  if (!existing) {
    const sourcePageId = await resolveSourcePageId(documentId, position);
    return addSegment(documentId, position, label, sourcePageId);
  }
  const labelChanged = Boolean(label) && label !== existing.label;
  // Ricalcolato a ogni tocco, non solo quando manca: un collegamento
  // sbagliato (per esempio scritto prima di una correzione) si rimette a
  // posto da solo invece di restare lì per sempre. Una pagina logica non
  // ancora nota (copia mai scaricata) non cancella quello che c'è.
  const found = await resolveSourcePageId(documentId, position);
  const resolvedSourcePageId = found ?? existing.source_page_id;
  const sourcePageIdChanged = resolvedSourcePageId !== existing.source_page_id;
  if (!labelChanged && !sourcePageIdChanged) return existing;
  const nextLabel = labelChanged ? label : existing.label;
  await execute(
    'UPDATE transcription_segments SET label = $2, source_page_id = $3 WHERE id = $1',
    [existing.id, nextLabel, resolvedSourcePageId],
  );
  return { ...existing, label: nextLabel, source_page_id: resolvedSourcePageId };
}

async function latestRevision(segmentId: string): Promise<TranscriptionRevision | null> {
  const rows = await select<TranscriptionRevision>(
    `SELECT * FROM transcription_revisions WHERE segment_id = $1
     ORDER BY revision_number DESC LIMIT 1`,
    [segmentId],
  );
  return rows[0] ?? null;
}

export async function listRevisions(segmentId: string): Promise<TranscriptionRevision[]> {
  return select<TranscriptionRevision>(
    `SELECT * FROM transcription_revisions WHERE segment_id = $1 ORDER BY revision_number DESC`,
    [segmentId],
  );
}

async function insertRevision(
  segmentId: string,
  text: string,
  createdBy: TranscriptionRevisionAuthor,
  previous: TranscriptionRevision | null,
): Promise<TranscriptionRevision> {
  const hash = contentHash(text);
  let parent = previous;

  // Due scritture possono aver letto la stessa ultima revisione. Chi perde
  // il vincolo di unicità riparte dalla revisione che ha vinto: nessun testo
  // viene scartato e la catena append-only resta lineare.
  for (;;) {
    if (parent?.content_hash === hash) return parent;
    const revisionNumber = (parent?.revision_number ?? 0) + 1;
    const revision: TranscriptionRevision = {
      id: `${segmentId}:r${revisionNumber}`,
      segment_id: segmentId,
      revision_number: revisionNumber,
      text,
      created_by: createdBy,
      derived_from_revision_id: parent?.id ?? null,
      content_hash: hash,
      // Valore locale, sostituito dal vero timestamp del database alla
      // successiva lettura: qui serve solo per il valore restituito subito.
      created_at: new Date().toISOString(),
    };
    logger.info('transcription.revision.write', {
      segmentId,
      revisionNumber,
      createdBy,
      derivedFrom: revision.derived_from_revision_id,
      length: text.length,
    });
    try {
      await execute(
        `INSERT INTO transcription_revisions
           (id, segment_id, revision_number, text, created_by, derived_from_revision_id, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          revision.id,
          revision.segment_id,
          revision.revision_number,
          revision.text,
          revision.created_by,
          revision.derived_from_revision_id,
          revision.content_hash,
        ],
      );
      return revision;
    } catch (error: unknown) {
      const latest = await latestRevision(segmentId);
      // Una revisione nuova dimostra la collisione attesa. Senza avanzamento
      // è un vero errore di scrittura e va propagato, non ritentato per sempre.
      if (!latest || latest.id === parent?.id) throw error;
      parent = latest;
    }
  }
}

/**
 * Salvataggio manuale (o OCR/import): scrive una revisione nuova solo se il
 * testo è cambiato rispetto all'ultima. Non tocca lo stato verificato — solo
 * `verifySegment` lo fa.
 */
export async function saveSegmentText(
  segmentId: string,
  text: string,
  createdBy: TranscriptionRevisionAuthor = 'user',
): Promise<TranscriptionRevision | null> {
  const previous = await latestRevision(segmentId);
  if (previous?.content_hash === contentHash(text)) {
    return previous;
  }
  return insertRevision(segmentId, text, createdBy, previous);
}

/**
 * Riporta in cima alla storia il testo di una revisione passata, scrivendone
 * una nuova: la storia non si riscrive, si allunga.
 */
export async function restoreRevision(
  segmentId: string,
  revisionId: string,
): Promise<TranscriptionRevision> {
  const rows = await select<TranscriptionRevision>(
    'SELECT * FROM transcription_revisions WHERE id = $1 AND segment_id = $2',
    [revisionId, segmentId],
  );
  const target = rows[0];
  if (!target) {
    throw new Error('transcription.revisionNotFound');
  }
  const previous = await latestRevision(segmentId);
  if (previous?.content_hash === target.content_hash) {
    return previous;
  }
  return insertRevision(segmentId, target.text, 'user', previous);
}

/** Marca l'ultima revisione come verificata dall'utente. */
export async function verifySegment(
  segmentId: string,
  workspaceId: string,
): Promise<TranscriptionRevision> {
  const latest = await latestRevision(segmentId);
  if (!latest) {
    throw new Error('transcription.noRevisionToVerify');
  }
  await execute('UPDATE transcription_segments SET approved_revision_id = $2 WHERE id = $1', [
    segmentId,
    latest.id,
  ]);
  logger.info('transcription.segment.verified', {
    segmentId,
    revisionId: latest.id,
    revisionNumber: latest.revision_number,
  });
  await recordFact({
    eventType: EVENT_VERIFIED,
    entityType: 'transcription_segment',
    entityId: segmentId,
    keyRef: latest.id,
    actor: 'user',
    workspaceId,
    outputRef: latest.id,
    outputHash: latest.content_hash,
    config: { revisionNumber: latest.revision_number },
  });
  return latest;
}

/** Riporta il segmento in bozza: la revisione verificata resta nella storia. */
export async function unverifySegment(segmentId: string, workspaceId: string): Promise<void> {
  const rows = await select<{ approved_revision_id: string | null }>(
    'SELECT approved_revision_id FROM transcription_segments WHERE id = $1',
    [segmentId],
  );
  const approvedRevisionId = rows[0]?.approved_revision_id ?? null;
  await execute('UPDATE transcription_segments SET approved_revision_id = NULL WHERE id = $1', [
    segmentId,
  ]);
  logger.info('transcription.segment.unverified', { segmentId, revisionId: approvedRevisionId });
  await recordFact({
    eventType: EVENT_UNVERIFIED,
    entityType: 'transcription_segment',
    entityId: segmentId,
    keyRef: approvedRevisionId,
    actor: 'user',
    workspaceId,
    inputRef: approvedRevisionId,
  });
}

/** Impostazioni OCR risolte per una chiamata: da congelare nella
 *  configurazione del lavoro alla messa in coda (#220) — modificare il
 *  prompt dopo non deve alterare un lavoro già accodato. */
export interface ResolvedOcrSettings {
  prompt: string;
  provider: ModelProvider | '';
  model: string;
}

/** Tutto per documento, con il workspace come punto di partenza: il prompt
 *  modificato da una pagina qualsiasi vale per tutte le pagine di quel
 *  documento e per nessun altro. Per riusarlo altrove si salva nella libreria
 *  dei prompt (scelta di Niki, 22 settembre 2026). */
export function resolveOcrSettings(
  document: Pick<TranscriptionDocument, 'ocr_provider' | 'ocr_model' | 'ocr_prompt'>,
  workspace: Pick<Workspace, 'ocrDefaultPrompt' | 'ocrDefaultProvider' | 'ocrDefaultModel'>,
): ResolvedOcrSettings {
  const prompt = document.ocr_prompt || workspace.ocrDefaultPrompt || DEFAULT_OCR_PROMPT;
  const provider = (document.ocr_provider || workspace.ocrDefaultProvider || '') as ModelProvider | '';
  const model = document.ocr_model || workspace.ocrDefaultModel || '';
  return { prompt, provider, model };
}
