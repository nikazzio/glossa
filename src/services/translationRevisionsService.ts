import { execute, select } from './dbService';
import { contentHash, recordFact } from './provenanceService';
import { logger } from '../utils/logger';

/**
 * Lo storico delle traduzioni (D22), simmetrico a quello che le trascrizioni
 * hanno già.
 *
 * **Non una revisione per salvataggio**: si scriverebbero centinaia di righe
 * per battitura, senza valore. Solo i due momenti che contano:
 *
 * - `model` — quando la pipeline produce la traduzione di un chunk;
 * - `human` — quando l'utente approva una versione diversa da quella che
 *   c'era.
 *
 * **Le revisioni non hanno uno stato di approvazione.** L'approvazione si
 * sposta — si approva, si va avanti, e più tardi si torna indietro a cambiare
 * — e uno storico che si modifica non è uno storico. Approvare e ritirare
 * l'approvazione sono **fatti** che puntano a una revisione; `translations`
 * porta un puntatore a quella approvata adesso, per la lettura veloce.
 *
 * La versione ritirata resta, e vale: «approvata e poi superata» dice che
 * quella traduzione sembrava giusta e non lo era. Per l'addestramento è
 * informazione, non rumore.
 */

export const EVENT_APPROVED = 'translation.approved';
export const EVENT_WITHDRAWN = 'translation.approval_withdrawn';

export interface TranslationRevision {
  id: string;
  translation_id: string;
  revision_number: number;
  text: string;
  created_by: 'model' | 'human';
  derived_from_revision_id: string | null;
  content_hash: string;
}

async function latestRevision(translationId: string): Promise<TranslationRevision | null> {
  const rows = await select<TranslationRevision>(
    `SELECT * FROM translation_revisions WHERE translation_id = $1
     ORDER BY revision_number DESC LIMIT 1`,
    [translationId],
  );
  return rows[0] ?? null;
}

async function insertRevision(
  translationId: string,
  text: string,
  createdBy: 'model' | 'human',
  previous: TranslationRevision | null,
): Promise<TranslationRevision> {
  const revisionNumber = (previous?.revision_number ?? 0) + 1;
  const revision: TranslationRevision = {
    id: `${translationId}:r${revisionNumber}`,
    translation_id: translationId,
    revision_number: revisionNumber,
    text,
    created_by: createdBy,
    // La revisione umana conserva quella da cui deriva: da lì la coppia
    // proposta/approvata è ricostruibile per intero, e il confronto si calcola
    // quando serve invece di conservarlo, così non può disallinearsi.
    derived_from_revision_id: previous?.id ?? null,
    content_hash: contentHash(text),
  };
  // Ogni revisione lascia una riga nel registro: è l'unico modo di sapere,
  // dopo, perché uno storico è vuoto — la scrittura è silenziosa per scelta e
  // senza log un rifiuto del database non si vedrebbe da nessuna parte.
  logger.info('translation.revision.write', {
    translationId,
    revisionNumber,
    createdBy,
    derivedFrom: revision.derived_from_revision_id,
    length: text.length,
  });
  await execute(
    `INSERT INTO translation_revisions
       (id, translation_id, revision_number, text, created_by, derived_from_revision_id, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO NOTHING`,
    [
      revision.id,
      revision.translation_id,
      revision.revision_number,
      revision.text,
      revision.created_by,
      revision.derived_from_revision_id,
      revision.content_hash,
    ],
  );
  return revision;
}

/**
 * La traduzione appena prodotta dalla pipeline.
 *
 * Se il testo è identico all'ultima revisione non se ne scrive una nuova: una
 * riesecuzione che produce lo stesso risultato non è un momento diverso.
 */
export async function recordModelRevision(
  translationId: string,
  text: string,
): Promise<TranslationRevision | null> {
  if (text.trim() === '') {
    logger.info('translation.revision.skipped', { translationId, reason: 'empty' });
    return null;
  }
  const previous = await latestRevision(translationId);
  if (previous?.content_hash === contentHash(text)) {
    logger.info('translation.revision.skipped', { translationId, reason: 'unchanged' });
    return previous;
  }
  return insertRevision(translationId, text, 'model', previous);
}

/**
 * La revisione che contiene **esattamente** questo testo, se esiste.
 *
 * Serve a legare un giudizio alla revisione che ha giudicato (D22) anche
 * quando la revisione non l'ha appena scritta chi giudica: rilanciando solo la
 * revisione, il verdetto arriva su un testo già in archivio.
 */
export async function revisionIdForText(
  translationId: string,
  text: string,
): Promise<string | null> {
  const rows = await select<{ id: string }>(
    `SELECT id FROM translation_revisions
      WHERE translation_id = $1 AND content_hash = $2
      ORDER BY revision_number DESC LIMIT 1`,
    [translationId, contentHash(text)],
  );
  return rows[0]?.id ?? null;
}

/**
 * L'utente approva la traduzione di un chunk.
 *
 * Se il testo approvato è diverso dall'ultima revisione, quella dell'utente
 * diventa una revisione nuova, derivata dalla precedente. Se è identico, non
 * si scrive niente di nuovo: **l'approvazione si registra lo stesso**, perché
 * accettare è un giudizio e per l'addestramento vale quanto una correzione —
 * registrare solo le correzioni produrrebbe un insieme sbilanciato verso gli
 * errori.
 */
export async function approveTranslation(
  translationId: string,
  text: string,
  workspaceId: string | null,
): Promise<void> {
  const previous = await latestRevision(translationId);
  const approved =
    previous && previous.content_hash === contentHash(text)
      ? previous
      : await insertRevision(translationId, text, 'human', previous);

  await execute('UPDATE translations SET approved_revision_id = $2 WHERE id = $1', [
    translationId,
    approved.id,
  ]);
  logger.info('translation.approved', {
    translationId,
    revisionId: approved.id,
    revisionNumber: approved.revision_number,
    createdBy: approved.created_by,
  });
  await recordFact({
    eventType: EVENT_APPROVED,
    entityType: 'translation_chunk',
    entityId: translationId,
    // Ogni revisione approvata è un fatto a sé: senza, approvare la 3 dopo
    // aver approvato la 2 sostituirebbe la storia invece di continuarla.
    keyRef: approved.id,
    actor: 'user',
    workspaceId,
    outputRef: approved.id,
    outputHash: approved.content_hash,
    config: { revisionNumber: approved.revision_number, createdBy: approved.created_by },
  });
}

/**
 * L'utente ritira l'approvazione. La revisione resta dov'è: quello che cambia
 * è il puntatore allo stato corrente, e il ritiro è un fatto in più.
 */
export async function withdrawTranslationApproval(
  translationId: string,
  workspaceId: string | null,
): Promise<void> {
  const rows = await select<{ approved_revision_id: string | null }>(
    'SELECT approved_revision_id FROM translations WHERE id = $1',
    [translationId],
  );
  const approvedRevisionId = rows[0]?.approved_revision_id ?? null;

  await execute('UPDATE translations SET approved_revision_id = NULL WHERE id = $1', [
    translationId,
  ]);
  logger.info('translation.approval.withdrawn', { translationId, revisionId: approvedRevisionId });
  await recordFact({
    eventType: EVENT_WITHDRAWN,
    entityType: 'translation_chunk',
    entityId: translationId,
    keyRef: approvedRevisionId,
    actor: 'user',
    workspaceId,
    inputRef: approvedRevisionId,
  });
}
