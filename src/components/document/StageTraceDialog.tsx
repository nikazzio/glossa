import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { ProcessingLine } from '../common';
import type { TranslationChunk } from '../../types';

interface StageTraceDialogProps {
  chunk: TranslationChunk;
  stage: ReturnType<typeof usePipelineStore.getState>['config']['stages'][number] | null;
  isJudge?: boolean;
  onClose: () => void;
}

export function StageTraceDialog({
  chunk,
  stage,
  isJudge = false,
  onClose,
}: StageTraceDialogProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onClose);
  const result = isJudge ? chunk.judgeResult : stage ? chunk.stageResults[stage.id] : null;
  const dialogTitle = isJudge ? t('pipeline.audit') : (stage?.name ?? t('errors.unknownError'));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-editorial-ink/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-trace-title"
      ref={trapRef}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[28px] border border-editorial-border bg-editorial-bg shadow-[0_24px_80px_rgba(26,26,26,0.2)]">
        <div className="shrink-0 border-b border-editorial-border px-6 py-5 md:px-8 md:py-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-editorial-muted">
            {t('document.stageTrace')}
          </div>
          <h3
            id="stage-trace-title"
            className="mt-2 font-display text-3xl italic tracking-tight text-editorial-ink"
          >
            {dialogTitle}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-editorial-muted">
            {result?.status ?? 'idle'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 custom-scrollbar">
          {result?.status === 'processing' || result?.status === 'retrying' ? (
            <div className="rounded-[22px] border border-editorial-border bg-editorial-textbox/35 p-5">
              <ProcessingLine />
            </div>
          ) : result?.status === 'error' ? (
            <div className="rounded-[22px] border border-editorial-accent/40 bg-editorial-textbox/40 p-5 text-sm leading-relaxed text-editorial-accent">
              {result.error || t('errors.unknownError')}
            </div>
          ) : result?.content ? (
            <pre className="whitespace-pre-wrap rounded-[22px] border border-editorial-border bg-editorial-bg p-5 text-sm leading-relaxed text-editorial-ink">
              {result.content}
            </pre>
          ) : (
            <div className="rounded-[22px] border border-editorial-border bg-editorial-bg p-5 text-sm text-editorial-muted">
              {t('document.noStageTrace')}
            </div>
          )}
        </div>
        <div className="flex justify-end border-t border-editorial-border px-6 py-4 md:px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-editorial-border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
