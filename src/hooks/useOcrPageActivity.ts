import { useMemo } from 'react';
import { useJobsStore } from '../stores/jobsStore';
import { ocrPendingPagesOf, type OcrJobPage } from '../services/jobsService';

/** Le pagine del documento che un lavoro OCR sta leggendo adesso (#220).
 *
 *  Si ricava dai lavori in coda, non da uno stato locale: chi apre il
 *  documento dopo un riavvio, o da un'altra schermata, vede comunque quale
 *  pagina è in lavorazione. Una pagina «in lettura» è una pagina dentro un
 *  lavoro non ancora finito e non ancora segnata come fatta nel segnalibro di
 *  ripresa. */
export interface OcrPageActivity {
  /** Le pagine in lavorazione, nell'ordine in cui sono state accodate. */
  pages: OcrJobPage[];
  /** Vero se quella pagina è dentro un lavoro in corso. */
  isReading: (segmentId: string | null | undefined) => boolean;
}

const ACTIVE_STATUSES = new Set(['queued', 'running', 'pausing']);

export function useOcrPageActivity(documentId: string | null): OcrPageActivity {
  const jobs = useJobsStore((state) => state.jobs);

  return useMemo(() => {
    const pages = documentId
      ? jobs
          .filter((job) => ACTIVE_STATUSES.has(job.status))
          .flatMap(ocrPendingPagesOf)
          .filter((page) => page.documentId === documentId)
      : [];
    const ids = new Set(pages.map((page) => page.segmentId));
    return {
      pages,
      isReading: (segmentId) => Boolean(segmentId && ids.has(segmentId)),
    };
  }, [jobs, documentId]);
}
