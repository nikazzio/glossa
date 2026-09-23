import { useEffect, useState } from 'react';
import { BarChart2, Cpu, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatRow } from '../ui';
import { getTranscriptionSummary, type TranscriptionSummary } from '../../services/transcriptionService';
import { formatUsd } from '../../utils/operationLogStats';
import { usePricingStore } from '../../stores/pricingStore';

interface Props {
  documentId: string | null;
  pageTotal: number | null;
  revisionCount: number;
}

export function TranscriptionSummaryTab({ documentId, pageTotal, revisionCount }: Props) {
  const { t } = useTranslation();
  const pricing = usePricingStore((state) => state.overrides);
  const [summary, setSummary] = useState<TranscriptionSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    getTranscriptionSummary(documentId, pricing).then((value) => {
      if (!cancelled) { setSummary(value); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [documentId, revisionCount, pricing]);

  if (error) return <p className="p-5 text-xs text-editorial-danger">{t('transcription.summary.loadFailed')}</p>;
  if (!summary) return <p className="p-5 text-xs text-editorial-muted">{t('common.loading')}</p>;

  const total = pageTotal ?? Math.max(summary.pagesWithText, 1);
  const progress = Math.round(summary.verifiedPages / total * 100);
  return (
    <div className="divide-y divide-editorial-border/55 px-5">
      <section className="py-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-editorial-muted">
          <FileText size={11} className="text-editorial-accent" />{t('transcription.summary.title')}
        </h3>
        <dl className="space-y-2">
          <StatRow label={t('transcription.summary.pagesWithText')} value={summary.pagesWithText.toLocaleString()} />
          <StatRow label={t('transcription.summary.words')} value={summary.words.toLocaleString()} />
          <StatRow label={t('transcription.summary.verifiedPages')} value={`${summary.verifiedPages} / ${total}`} />
        </dl>
      </section>
      <section className="py-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-editorial-muted">
          <BarChart2 size={11} className="text-editorial-accent" />{t('transcription.summary.progress')}
        </h3>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-editorial-border/40">
          <div className="h-full rounded-full bg-editorial-success" style={{ width: `${progress}%` }} />
        </div>
        <div className="font-display text-lg italic text-editorial-ink">{progress}%</div>
      </section>
      <section className="py-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-editorial-muted">
          <Cpu size={11} className="text-editorial-accent" />{t('transcription.summary.ocr')}
        </h3>
        <dl className="space-y-2">
          <StatRow label={t('transcription.summary.runs')} value={summary.ocrRuns.toLocaleString()} />
          <StatRow label={t('header.tokenCount')} value={(summary.inputTokens + summary.outputTokens).toLocaleString()} />
          <StatRow label={t('header.estimatedCost')} value={formatUsd(summary.costUsd)} />
        </dl>
      </section>
    </div>
  );
}
