import { select } from './dbService';
import { listLibraryCatalog } from './libraryService';
import type { TranscriptionDocument } from './transcriptionService';
import type { LibraryCatalogEntry } from '../types';

/** Una trascrizione come la vede il suo catalogo: il documento, l'opera a cui è
 *  legata (se c'è) e a che punto è il lavoro. */
export interface TranscriptionCatalogEntry {
  document: TranscriptionDocument;
  /** L'opera della Biblioteca da cui viene la copia trascritta; `null` per una
   *  trascrizione nata da zero o la cui copia è stata tolta. */
  work: LibraryCatalogEntry | null;
  /** Pagine la cui ultima versione ha del testo. */
  pagesWithText: number;
  verifiedPages: number;
  createdAt: string;
  /** L'ultima versione scritta in una pagina qualsiasi, o la creazione. */
  lastEditedAt: string;
}

interface CatalogRow extends TranscriptionDocument {
  source_id: string | null;
  created_at: string;
  pages_with_text: number;
  verified_pages: number;
  last_revision_at: string | null;
}

/**
 * Tutte le trascrizioni non eliminate, di tutti i workspace, con le pagine
 * scritte e verificate contate dall'ultima versione di ogni pagina. L'opera si
 * prende dal catalogo della Biblioteca, così autore, anno, copertina e pagine
 * sono quelli corretti a mano, non quelli della biblioteca d'origine.
 */
export async function listTranscriptionCatalog(): Promise<TranscriptionCatalogEntry[]> {
  const [rows, library] = await Promise.all([
    select<CatalogRow>(
      `SELECT d.*, v.source_id,
              (SELECT COUNT(*)
                 FROM transcription_segments s
                 JOIN transcription_revisions r ON r.id = (
                   SELECT id FROM transcription_revisions
                    WHERE segment_id = s.id ORDER BY revision_number DESC LIMIT 1
                 )
                WHERE s.document_id = d.id AND TRIM(r.text) <> '') AS pages_with_text,
              (SELECT COUNT(*) FROM transcription_segments s
                WHERE s.document_id = d.id AND s.approved_revision_id IS NOT NULL) AS verified_pages,
              (SELECT MAX(r.created_at)
                 FROM transcription_revisions r
                 JOIN transcription_segments s ON s.id = r.segment_id
                WHERE s.document_id = d.id) AS last_revision_at
         FROM transcription_documents d
         LEFT JOIN source_versions v ON v.id = d.source_version_id
        WHERE d.status IN ('active', 'archived')
        ORDER BY d.title ASC`,
    ),
    listLibraryCatalog(),
  ]);
  const works = new Map(library.map((entry) => [entry.source.id, entry]));
  return rows.map((row) => ({
    document: {
      id: row.id,
      source_version_id: row.source_version_id,
      workspace_id: row.workspace_id,
      title: row.title,
      status: row.status,
      ocr_provider: row.ocr_provider,
      ocr_model: row.ocr_model,
      ocr_prompt: row.ocr_prompt,
    },
    work: row.source_id ? works.get(row.source_id) ?? null : null,
    pagesWithText: Number(row.pages_with_text),
    verifiedPages: Number(row.verified_pages),
    createdAt: row.created_at,
    lastEditedAt: row.last_revision_at ?? row.created_at,
  }));
}
