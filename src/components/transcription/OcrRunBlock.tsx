import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { providerLabel } from '../../models/catalog';
import { usePricingStore } from '../../stores/pricingStore';
import { onJobChanged, OCR_JOB_TYPE } from '../../services/jobsService';
import { resolveOcrSettings, type TranscriptionDocument } from '../../services/transcriptionService';
import { getPageReadInfo, type PageReadInfo } from '../../services/transcriptionSummaryService';
import type { ViewerVersionRef } from '../../services/libraryService';
import type { Workspace } from '../../types';
import { formatUsd } from '../../utils/operationLogStats';
import { Tooltip } from '../ui';
import { OcrStartButton } from './OcrStartButton';

interface OcrRunBlockProps {
  document: TranscriptionDocument;
  workspace: Pick<Workspace, 'ocrDefaultProvider' | 'ocrDefaultModel' | 'ocrDefaultPrompt'>;
  viewerRef: ViewerVersionRef | null;
  segmentId: string | null;
  pageLabel: string;
  starting: boolean;
  reading: boolean;
  onStart: () => void;
  /** Apre la scheda dove si scelgono servizio, modello e prompt. */
  onOpenSettings: () => void;
}

/**
 * Il comando di lettura sopra le schede dello Studio, visibile da ognuna:
 * come l'avvio nello Studio di traduzione. Accanto, servizio e modello che
 * leggeranno la pagina e quanto è costata la sua ultima lettura.
 */
export function OcrRunBlock({ document, workspace, viewerRef, segmentId, pageLabel, starting, reading, onStart, onOpenSettings }: OcrRunBlockProps) {
  const { t } = useTranslation();
  const pricing = usePricingStore((state) => state.overrides);
  const [info, setInfo] = useState<PageReadInfo | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const resolved = resolveOcrSettings(document, workspace);

  useEffect(() => {
    if (!segmentId) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    getPageReadInfo(segmentId, pricing)
      .then((value) => { if (!cancelled) setInfo(value); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, [segmentId, pricing, reloadToken]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onJobChanged((job) => {
      if (job.jobType === OCR_JOB_TYPE && job.status === 'completed') setReloadToken((token) => token + 1);
    }).then((fn) => { if (!cancelled) unlisten = fn; else fn(); });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const lastRead = info && info.reads > 0
    ? info.lastCostUsd !== null
      ? t('transcription.run.lastReadCost', { cost: formatUsd(info.lastCostUsd) })
      : t('transcription.run.lastReadNoPrice')
    : t('transcription.run.neverRead');

  return (
    <div className="flex min-w-0 items-center gap-4 px-3 py-3">
      <OcrStartButton
        document={document}
        workspace={workspace}
        viewerRef={viewerRef}
        pageLabel={pageLabel}
        starting={starting}
        reading={reading}
        onStart={onStart}
        tooltipSide="bottom"
        large
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Tooltip label={t('transcription.run.openSettings')} side="bottom" className="min-w-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-w-0 truncate rounded text-left text-sm text-editorial-ink hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            {resolved.provider ? `${providerLabel(resolved.provider)} · ${resolved.model || '—'}` : t('transcription.assist.noProvider')}
          </button>
        </Tooltip>
        <span className="truncate text-xs text-editorial-muted">{lastRead}</span>
      </div>
    </div>
  );
}
