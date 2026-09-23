import { Loader2, ScanText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, type TooltipSide } from '../ui';
import { ocrUnavailableReason, type OcrUnavailableReason } from '../../services/ocrService';
import { resolveOcrSettings, type TranscriptionDocument } from '../../services/transcriptionService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { Workspace } from '../../types';

const UNAVAILABLE_REASON_KEYS: Record<OcrUnavailableReason, string> = {
  noDigitization: 'transcription.assist.noDigitization',
  noModelConfigured: 'transcription.assist.noModelConfigured',
};

interface OcrStartButtonProps {
  document: TranscriptionDocument;
  workspace: Pick<Workspace, 'ocrDefaultProvider' | 'ocrDefaultModel' | 'ocrDefaultPrompt'>;
  viewerRef: ViewerVersionRef | null;
  pageLabel: string;
  starting: boolean;
  reading: boolean;
  onStart: () => void;
  tooltipSide?: TooltipSide;
}

/** Il comando «leggi la pagina»: lo stesso nella scheda OCR e sul pannello
 *  chiuso. Il motivo per cui è spento sta nel suo suggerimento. */
export function OcrStartButton({
  document,
  workspace,
  viewerRef,
  pageLabel,
  starting,
  reading,
  onStart,
  tooltipSide,
}: OcrStartButtonProps) {
  const { t } = useTranslation();
  const resolved = resolveOcrSettings(document, workspace);
  const reason = ocrUnavailableReason(viewerRef, resolved.provider, resolved.model);
  const title = reading
    ? t('transcription.assist.readingThisPage', { page: pageLabel })
    : reason
      ? t(UNAVAILABLE_REASON_KEYS[reason])
      : t('transcription.assist.readThisPage', { page: pageLabel });

  return (
    <IconButton
      size="sm"
      tone="accent"
      onClick={onStart}
      disabled={starting || reading || reason !== null}
      title={title}
      tooltipSide={tooltipSide}
    >
      {starting || reading ? <Loader2 size={16} className="animate-spin" /> : <ScanText size={16} />}
    </IconButton>
  );
}
