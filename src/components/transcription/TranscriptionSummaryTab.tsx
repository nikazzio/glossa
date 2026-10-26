import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart2, BookOpen, Cpu, FileText, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CompletionBar,
  EmptyState,
  IconButton,
  PANEL_BODY_CLASSNAME,
  PanelSection,
  Spinner,
  STAT_LIST_CLASSNAME,
  StatRow,
} from '../ui';
import { getTranscriptionSummary, type TranscriptionSummary } from '../../services/transcriptionService';
import { formatUsd } from '../../utils/operationLogStats';
import { usePricingStore } from '../../stores/pricingStore';

interface Props {
  documentId: string | null;
  displayIndex: number;
  pageLabel: string | null;
  pageTotal: number | null;
  verified: boolean;
  revisionCount: number;
}

export function TranscriptionSummaryTab({ documentId, displayIndex, pageLabel, pageTotal, verified, revisionCount }: Props) {
  const { t } = useTranslation();
  const pricing = usePricingStore((state) => state.overrides);
  const [summary, setSummary] = useState<TranscriptionSummary | null>(null);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    getTranscriptionSummary(documentId, pricing).then((value) => {
      if (!cancelled) { setSummary(value); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [documentId, revisionCount, pricing, reloadToken]);

  const retry = () => {
    setError(false);
    setReloadToken((token) => token + 1);
  };

  const pageNumber = pageTotal ? `${displayIndex + 1} / ${pageTotal}` : String(displayIndex + 1);

  return (
    <div className={PANEL_BODY_CLASSNAME}>
      <PanelSection icon={BookOpen} label={t('transcription.summary.pageSection')}>
        <dl className={STAT_LIST_CLASSNAME}>
          <StatRow label={t('transcription.meta.page')} value={pageNumber} />
          {pageLabel && <StatRow label={t('transcription.meta.pageLabel')} value={pageLabel} />}
          <StatRow
            label={t('transcription.meta.status')}
            value={t(verified ? 'transcription.verifiedBadge' : 'transcription.draftBadge')}
          />
          <StatRow label={t('transcription.summary.pageVersions')} value={revisionCount.toLocaleString()} />
        </dl>
      </PanelSection>

      {error ? (
        <div className="flex flex-col items-center gap-2">
          <EmptyState
            icon={<AlertTriangle size={20} aria-hidden="true" />}
            message={t('transcription.summary.loadFailed')}
            className="flex flex-col items-center gap-3 text-center"
          />
          <IconButton size="sm" onClick={retry} title={t('transcription.summary.retry')}>
            <RotateCcw size={13} />
          </IconButton>
        </div>
      ) : !summary ? (
        <Spinner label={t('common.loading')} />
      ) : (
        <DocumentSummary summary={summary} pageTotal={pageTotal} />
      )}
    </div>
  );
}

function DocumentSummary({ summary, pageTotal }: { summary: TranscriptionSummary; pageTotal: number | null }) {
  const { t } = useTranslation();
  const total = pageTotal ?? Math.max(summary.pagesWithText, 1);
  const ratio = summary.verifiedPages / total;
  return (
    <>
      <PanelSection icon={FileText} label={t('transcription.summary.documentTitle')}>
        <dl className={STAT_LIST_CLASSNAME}>
          <StatRow label={t('transcription.summary.pagesWithText')} value={summary.pagesWithText.toLocaleString()} />
          <StatRow label={t('transcription.summary.words')} value={summary.words.toLocaleString()} />
          <StatRow label={t('transcription.summary.verifiedPages')} value={`${summary.verifiedPages} / ${total}`} />
        </dl>
      </PanelSection>
      <PanelSection icon={BarChart2} label={t('transcription.summary.progress')}>
        <div className="flex items-center gap-2 font-display text-lg italic text-editorial-ink">
          <CompletionBar
            ratio={ratio}
            label={`${Math.round(ratio * 100)}%`}
            ariaLabel={t('transcription.summary.verifiedPages')}
          />
        </div>
      </PanelSection>
      <PanelSection icon={Cpu} label={t('transcription.summary.ocr')}>
        <dl className={STAT_LIST_CLASSNAME}>
          <StatRow label={t('transcription.summary.runs')} value={summary.ocrRuns.toLocaleString()} />
          <StatRow label={t('header.tokenCount')} value={(summary.inputTokens + summary.outputTokens).toLocaleString()} />
          <StatRow label={t('header.estimatedCost')} value={formatUsd(summary.costUsd)} />
        </dl>
      </PanelSection>
    </>
  );
}
