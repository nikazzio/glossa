import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useTranscriptionStore } from '../../stores/transcriptionStore';
import { useOcrPageActivity, type OcrPageActivity } from '../../hooks/useOcrPageActivity';
import { ensureSegment, updateDocumentOcrSettings, type TranscriptionDocument } from '../../services/transcriptionService';
import { startOcrForPage } from '../../services/ocrService';
import {
  DEFAULT_OCR_IMAGE_PREFERENCES,
  getOcrImagePreferences,
  type OcrImageMode,
  type OcrImagePreferences,
} from '../../services/ocrImageSettingsService';
import { onJobChanged, OCR_JOB_TYPE } from '../../services/jobsService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { ModelProvider, Workspace } from '../../types';
import type { SegmentEditor } from './useSegmentEditor';

interface StudioOcrOptions {
  editor: SegmentEditor;
  documentId: string;
  detail: TranscriptionDocument | null;
  workspace: Workspace | null;
  viewerRef: ViewerVersionRef | null;
}

export interface StudioOcr {
  activity: OcrPageActivity;
  starting: boolean;
  image: OcrImagePreferences;
  changeImageMode: (mode: OcrImageMode) => void;
  changeProvider: (provider: ModelProvider | '', model: string) => void;
  changeModel: (model: string) => void;
  changePrompt: (prompt: string | null) => void;
  start: () => Promise<void>;
}

function errorDescription(err: unknown) {
  return { description: err instanceof Error ? err.message : String(err) };
}

/** Assistenza OCR/HTR (#220): impostazioni del documento, immagine inviata,
 *  avvio della lettura e rilettura della pagina quando il lavoro finisce. */
export function useStudioOcr({ editor, documentId, detail, workspace, viewerRef }: StudioOcrOptions): StudioOcr {
  const { t } = useTranslation();
  const patchDetail = useTranscriptionStore((s) => s.patchDetail);
  const { segment, setSegment, pageIndex, pageLabel, loadSegmentForPage } = editor;
  const [starting, setStarting] = useState(false);
  const promptSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  // Quali pagine di questo documento sono in lettura adesso: viene dai lavori
  // in coda, quindi resta vero anche riaprendo il documento o dopo un riavvio.
  const activity = useOcrPageActivity(detail?.id ?? null);
  // Immagine inviata: la scelta delle impostazioni generali, cambiabile qui
  // per la sessione — non si salva nel documento.
  const [image, setImage] = useState(DEFAULT_OCR_IMAGE_PREFERENCES);
  useEffect(() => {
    getOcrImagePreferences().then(setImage).catch((err: unknown) => {
      toast.error(t('transcription.assist.imageSettingsFailed'), errorDescription(err));
    });
  }, [t]);
  const changeImageMode = (mode: OcrImageMode) => setImage((current) => ({ ...current, mode }));

  // Il lavoro gira in background: quando un lavoro OCR finisce si rilegge la
  // pagina corrente, così la revisione appena scritta compare da sola nello
  // storico, senza che l'utente debba cambiare pagina e tornare indietro.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onJobChanged((job) => {
      if (job.jobType !== OCR_JOB_TYPE || job.status !== 'completed' || !segment) return;
      try {
        const config = JSON.parse(job.config) as { pages?: unknown };
        if (!Array.isArray(config.pages)) return;
        const affectsPage = config.pages.some((page: unknown) =>
          typeof page === 'object' && page !== null &&
          'documentId' in page && page.documentId === documentId &&
          'segmentId' in page && page.segmentId === segment.id,
        );
        if (affectsPage) void loadSegmentForPage(true);
      } catch { /* Un lavoro con configurazione illeggibile non riguarda la pagina aperta. */ }
    }).then((fn) => { if (!cancelled) unlisten = fn; else fn(); });
    return () => { cancelled = true; unlisten?.(); };
  }, [documentId, segment, loadSegmentForPage]);

  const changeProvider = (provider: ModelProvider | '', model: string) => {
    if (!detail) return;
    patchDetail({ ocr_provider: provider || null, ocr_model: model || null });
    void updateDocumentOcrSettings(detail.id, {
      ocrProvider: provider || null,
      ocrModel: model || null,
    }).catch((err: unknown) => {
      toast.error(t('transcription.assist.saveFailed'), errorDescription(err));
    });
  };

  const changeModel = (model: string) => {
    if (!detail) return;
    patchDetail({ ocr_model: model || null });
    void updateDocumentOcrSettings(detail.id, { ocrModel: model || null }).catch((err: unknown) => {
      toast.error(t('transcription.assist.saveFailed'), errorDescription(err));
    });
  };

  // Il prompt appartiene al documento: modificato da una pagina qualsiasi,
  // vale per tutte. `null` torna al prompt di partenza del workspace.
  const changePrompt = (prompt: string | null) => {
    if (!detail) return;
    patchDetail({ ocr_prompt: prompt });
    const targetDocumentId = detail.id;
    // Le digitazioni rapide devono arrivare al database nello stesso ordine.
    promptSaveChainRef.current = promptSaveChainRef.current
      .catch(() => undefined)
      .then(() => updateDocumentOcrSettings(targetDocumentId, { ocrPrompt: prompt }));
    void promptSaveChainRef.current.catch((err: unknown) => {
      toast.error(t('transcription.assist.saveFailed'), errorDescription(err));
    });
  };

  const start = async () => {
    if (!detail || !workspace || !viewerRef) return;
    setStarting(true);
    try {
      // Una pagina mai toccata non ha ancora un segmento: nasce qui, come già
      // fa il primo salvataggio manuale — l'OCR non deve aspettare che
      // qualcuno scriva prima a mano.
      const target = segment ?? (await ensureSegment(detail.id, pageIndex, pageLabel));
      if (!segment) setSegment(target);
      await startOcrForPage({
        document: detail,
        segment: target,
        workspace,
        viewerRef,
        // La posizione nel libro contando dalla copertina, come nel titolo
        // della pagina: la numerazione stampata della biblioteca («3») non
        // corrisponde quasi mai.
        pageLabel: String(pageIndex + 1),
        image,
      });
      toast.success(t('transcription.assist.jobStarted'));
    } catch (err: unknown) {
      toast.error(t('transcription.assist.jobStartFailed'), errorDescription(err));
    } finally {
      setStarting(false);
    }
  };

  return { activity, starting, image, changeImageMode, changeProvider, changeModel, changePrompt, start };
}
