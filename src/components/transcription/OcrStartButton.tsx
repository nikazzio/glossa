import { Loader2, ScanText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, type TooltipSide } from '../ui';
import { ocrUnavailableReason, type OcrUnavailableReason } from '../../services/ocrService';
import { resolveOcrSettings, type TranscriptionDocument } from '../../services/transcriptionService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { Workspace } from '../../types';

const UNAVAILABLE_REASON_KEYS: Record<OcrUnavailableReason, string> = {
  noDigitization: 'transcription.assist.noDigitization',
  needsExtractedPages: 'transcription.assist.needsExtractedPages',
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
  /** Il comando principale sopra le schede, grande come quello della traduzione. */
  large?: boolean;
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
  large = false,
}: OcrStartButtonProps) {
  const { t } = useTranslation();
  const resolved = resolveOcrSettings(document, workspace);
  const reason = ocrUnavailableReason(viewerRef, resolved.provider, resolved.model);
  const busy = starting || reading;
  const title = busy
    ? t('transcription.assist.readingThisPage', { page: pageLabel })
    : reason
      ? t(UNAVAILABLE_REASON_KEYS[reason])
      : t('transcription.assist.readThisPage', { page: pageLabel });

  return (
    <IconButton
      size={large ? 'md' : 'sm'}
      tone={busy ? 'running' : large ? 'charcoal' : 'default'}
      onClick={onStart}
      disabled={busy || reason !== null}
      title={title}
      ariaLabel={title}
      tooltipSide={tooltipSide}
      className={large ? 'h-14 w-14' : undefined}
    >
      {busy ? <Loader2 size={large ? 22 : 16} className="animate-spin" /> : <ScanText size={large ? 22 : 16} />}
    </IconButton>
  );
}
