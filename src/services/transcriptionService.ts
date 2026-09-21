import { execute, select } from './dbService';
import { contentHash, recordFact } from './provenanceService';
import { logger } from '../utils/logger';

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

/** Il segmento di quella pagina, creandolo al primo tocco davvero — non alla
 *  sola apertura. L'etichetta segue quella che il visore dichiara adesso, se
 *  cambiata (una rilettura del manifesto può rinumerare le pagine). */
export async function ensureSegment(
  documentId: string,
  position: number,
  label: string | null = null,
): Promise<TranscriptionSegment> {
  const existing = await getSegmentByPosition(documentId, position);
  if (!existing) return addSegment(documentId, position, label);
  if (label && label !== existing.label) {
    await execute('UPDATE transcription_segments SET label = $2 WHERE id = $1', [existing.id, label]);
    return { ...existing, label };
  }
  return existing;
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
  const revisionNumber = (previous?.revision_number ?? 0) + 1;
  const revision: TranscriptionRevision = {
    id: `${segmentId}:r${revisionNumber}`,
    segment_id: segmentId,
    revision_number: revisionNumber,
    text,
    created_by: createdBy,
    derived_from_revision_id: previous?.id ?? null,
    content_hash: contentHash(text),
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
  await execute(
    `INSERT INTO transcription_revisions
       (id, segment_id, revision_number, text, created_by, derived_from_revision_id, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO NOTHING`,
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
  // `ON CONFLICT DO NOTHING` scarta in silenzio un ID già scritto da un
  // autosave concorrente che aveva letto la stessa revisione precedente:
  // rileggere invece di fidarsi dell'oggetto locale evita di dichiarare
  // "salvato" un testo che in realtà ha perso il confronto.
  const persisted = await select<TranscriptionRevision>(
    'SELECT * FROM transcription_revisions WHERE id = $1',
    [revision.id],
  );
  return persisted[0] ?? revision;
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
  workspaceId: string | null,
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
export async function unverifySegment(segmentId: string, workspaceId: string | null): Promise<void> {
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
