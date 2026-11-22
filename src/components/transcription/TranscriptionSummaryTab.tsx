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
import type { TranscriptionRevision } from '../../services/transcriptionService';
import { getTranscriptionSummary, type OcrUsage, type TranscriptionSummary } from '../../services/transcriptionSummaryService';
import { formatDurationMs, formatUsd } from '../../utils/operationLogStats';
import { parseStoredDate } from '../../utils/dashboardStats';
import { usePricingStore } from '../../stores/pricingStore';
import { onJobChanged, OCR_JOB_TYPE } from '../../services/jobsService';

interface Props {
  documentId: string | null;
  segmentId: string | null;
  displayIndex: number;
  pageLabel: string | null;
  pageTotal: number | null;
  verified: boolean;
  revisions: TranscriptionRevision[];
}

export function TranscriptionSummaryTab({ documentId, segmentId, displayIndex, pageLabel, pageTotal, verified, revisions }: Props) {
  const { t } = useTranslation();
  const pricing = usePricingStore((state) => state.overrides);
  const [summary, setSummary] = useState<TranscriptionSummary | null>(null);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const revisionCount = revisions.length;

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    getTranscriptionSummary(documentId, segmentId, pricing).then((value) => {
      if (!cancelled) { setSummary(value); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [documentId, segmentId, revisionCount, pricing, reloadToken]);

  // Una lettura può non cambiare le versioni della pagina aperta (testo
  // identico, errore, altra pagina): i totali si aggiornano a ogni cambio di
  // stato di un lavoro di lettura, come il log.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onJobChanged((job) => {
      if (job.jobType === OCR_JOB_TYPE) setReloadToken((token) => token + 1);
    }).then((fn) => { if (!cancelled) unlisten = fn; else fn(); });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const retry = () => {
    setError(false);
    setReloadToken((token) => token + 1);
  };

  return (
    <div className={PANEL_BODY_CLASSNAME}>
      <PageSummary
        displayIndex={displayIndex}
        pageLabel={pageLabel}
        pageTotal={pageTotal}
        verified={verified}
        revisions={revisions}
        usage={summary?.page ?? null}
      />

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
        <>
          <DocumentSummary summary={summary} pageTotal={pageTotal} />
          <OcrSummary usage={summary.ocr} />
        </>
      )}
    </div>
  );
}

function useNumber() {
  const { i18n } = useTranslation();
  return (value: number) => value.toLocaleString(i18n.language);
}

function PageSummary({ displayIndex, pageLabel, pageTotal, verified, revisions, usage }: {
  displayIndex: number;
  pageLabel: string | null;
  pageTotal: number | null;
  verified: boolean;
  revisions: TranscriptionRevision[];
  usage: OcrUsage | null;
}) {
  const { t, i18n } = useTranslation();
  const pageNumber = pageTotal ? `${displayIndex + 1} / ${pageTotal}` : String(displayIndex + 1);
  const byOcr = revisions.filter((revision) => revision.created_by === 'ocr').length;
  const imported = revisions.filter((revision) => revision.created_by === 'import').length;
  const byHand = revisions.length - byOcr - imported;
  const versions = revisions.length === 0
    ? '0'
    : t(imported > 0 ? 'transcription.summary.versionsSplitImported' : 'transcription.summary.versionsSplit', {
        total: revisions.length, ocr: byOcr, manual: byHand, imported,
      });
  const lastTime = usage?.lastAt
    ? parseStoredDate(usage.lastAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <PanelSection icon={BookOpen} label={t('transcription.summary.pageSection')}>
      <dl className={STAT_LIST_CLASSNAME}>
        <StatRow label={t('transcription.meta.page')} value={pageNumber} />
        {pageLabel && <StatRow label={t('transcription.meta.pageLabel')} value={pageLabel} />}
        <StatRow
          label={t('transcription.meta.status')}
          value={t(verified ? 'transcription.verifiedBadge' : 'transcription.draftBadge')}
        />
        <StatRow label={t('transcription.summary.pageVersions')} value={versions} />
        {usage && usage.runs > 0 && (
          <>
            <StatRow
              label={t('transcription.summary.pageReads')}
              value={lastTime
                ? t('transcription.summary.pageReadsLast', { count: usage.runs, time: lastTime })
                : String(usage.runs)}
            />
            <StatRow label={t('transcription.summary.pageCost')} value={`≈ ${formatUsd(usage.costUsd)}`} />
          </>
        )}
      </dl>
    </PanelSection>
  );
}

function DocumentSummary({ summary, pageTotal }: { summary: TranscriptionSummary; pageTotal: number | null }) {
  const { t } = useTranslation();
  const number = useNumber();
  const total = pageTotal ?? Math.max(summary.pagesWithText, 1);
  const ratio = summary.verifiedPages / total;
  return (
    <>
      <PanelSection icon={FileText} label={t('transcription.summary.documentTitle')}>
        <dl className={STAT_LIST_CLASSNAME}>
          <StatRow label={t('transcription.summary.pagesWithText')} value={`${number(summary.pagesWithText)} / ${number(total)}`} />
          <StatRow label={t('transcription.summary.verifiedPages')} value={`${number(summary.verifiedPages)} / ${number(total)}`} />
          <StatRow
            label={t('transcription.summary.wordsAndCharacters')}
            value={`${number(summary.words)} · ${number(summary.characters)}`}
          />
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
    </>
  );
}

function OcrSummary({ usage }: { usage: OcrUsage }) {
  const { t } = useTranslation();
  const number = useNumber();
  const cachedShare = usage.inputTokens > 0 ? Math.round((usage.cachedInputTokens / usage.inputTokens) * 100) : 0;
  const perPage = usage.costUsd !== null && usage.pagesRead > 0 ? usage.costUsd / usage.pagesRead : null;
  return (
    <PanelSection icon={Cpu} label={t('transcription.summary.ocr')}>
      <dl className={STAT_LIST_CLASSNAME}>
        <StatRow
          label={t('transcription.summary.runs')}
          value={t('transcription.summary.runsValue', { count: usage.errors, runs: number(usage.runs), errors: number(usage.errors) })}
        />
        {usage.runs > 0 && (
          <>
            <StatRow
              label={t('transcription.summary.pagesRead')}
              value={t('transcription.summary.pagesReadValue', { count: usage.rereads, pages: number(usage.pagesRead), rereads: number(usage.rereads) })}
            />
            <StatRow
              label={t('transcription.summary.tokensSent')}
              value={t('transcription.summary.tokensSentValue', { tokens: number(usage.inputTokens), share: cachedShare })}
            />
            <StatRow label={t('transcription.summary.tokensReceived')} value={number(usage.outputTokens)} />
            <StatRow
              label={t('header.estimatedCost')}
              value={perPage === null
                ? `≈ ${formatUsd(usage.costUsd)}`
                : t('transcription.summary.costValue', { total: formatUsd(usage.costUsd), perPage: formatUsd(perPage) })}
            />
            {usage.averageDurationMs !== null && (
              <StatRow
                label={t('transcription.summary.averageTime')}
                value={t('transcription.summary.averageTimeValue', { time: formatDurationMs(usage.averageDurationMs) })}
              />
            )}
            <StatRow label={t('transcription.summary.models')} value={usage.models.join(', ')} />
          </>
        )}
      </dl>
    </PanelSection>
  );
}
