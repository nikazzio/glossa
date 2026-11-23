import type { TFunction } from 'i18next';
import { countModelNotes } from '../../services/transcriptionNotesService';
import { hasAutomaticReading } from '../../services/transcriptionSummaryService';
import { confirm } from '../../stores/confirmStore';

/**
 * Rileggere una pagina sostituisce le note della lettura precedente: dalla
 * seconda lettura in poi si chiede conferma, dicendo quante note cambiano.
 * La prima lettura parte senza domande.
 */
export async function confirmReread(segmentId: string, t: TFunction): Promise<boolean> {
  if (!(await hasAutomaticReading(segmentId))) return true;
  const notes = await countModelNotes(segmentId);
  return confirm({
    title: t('transcription.reread.title'),
    message: notes > 0
      ? t('transcription.reread.messageNotes', { count: notes })
      : t('transcription.reread.message'),
    confirmLabel: t('transcription.reread.confirm'),
  });
}
