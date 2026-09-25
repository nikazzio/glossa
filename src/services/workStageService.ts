import { select } from './dbService';
import type { WorkStage } from '../types';

interface StageRow {
  source_id: string;
  transcriptions: number;
  verified: number;
  translated: number;
}

/**
 * A che punto è il lavoro su ogni opera, in **una lettura sola** per tutto il
 * catalogo: una query per riga sarebbe una query per libro.
 *
 * Una trascrizione è verificata quando ha pagine e tutte hanno una versione
 * approvata. Una traduzione conta se nasce dall'opera o da una sua
 * trascrizione. Le cose nel cestino non contano.
 */
export async function workStagesOfMany(): Promise<Map<string, WorkStage>> {
  const rows = await select<StageRow>(
    `WITH documents AS (
       SELECT v.source_id,
              d.id,
              (SELECT COUNT(*) FROM transcription_segments s WHERE s.document_id = d.id) AS pages,
              (SELECT COUNT(*) FROM transcription_segments s
                WHERE s.document_id = d.id AND s.approved_revision_id IS NOT NULL) AS approved
         FROM transcription_documents d
         JOIN source_versions v ON v.id = d.source_version_id
        WHERE d.status <> 'trashed'
     ),
     translations AS (
       SELECT DISTINCT v.source_id
         FROM translation_origins o
         JOIN projects p ON p.id = o.project_id AND p.status = 'active'
         LEFT JOIN transcription_documents d ON d.id = o.transcription_document_id
         JOIN source_versions v ON v.id = COALESCE(o.source_version_id, d.source_version_id)
     )
     SELECT s.id AS source_id,
            (SELECT COUNT(*) FROM documents d WHERE d.source_id = s.id) AS transcriptions,
            (SELECT COUNT(*) FROM documents d
              WHERE d.source_id = s.id AND d.pages > 0 AND d.approved = d.pages) AS verified,
            EXISTS (SELECT 1 FROM translations t WHERE t.source_id = s.id) AS translated
       FROM sources s`,
  );
  return new Map(rows.map((row) => [row.source_id, stageOf(row)]));
}

export function stageOf(row: Omit<StageRow, 'source_id'>): WorkStage {
  if (row.translated) return 'translated';
  if (row.verified > 0) return 'transcribed';
  if (row.transcriptions > 0) return 'transcribing';
  return 'none';
}
