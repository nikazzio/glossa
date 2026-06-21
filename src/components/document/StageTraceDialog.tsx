import { useTranslation } from 'react-i18next';
import { usePipelineStore } from '../../stores/pipelineStore';
import { Dialog, DialogCancelButton } from '../ui';
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
  const result = isJudge ? chunk.judgeResult : stage ? chunk.stageResults[stage.id] : null;
  const dialogTitle = isJudge ? t('pipeline.audit') : (stage?.name ?? t('errors.unknownError'));

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      eyebrow={t('document.stageTrace')}
      title={dialogTitle}
      description={result?.status ?? 'idle'}
      closeLabel={t('common.close')}
      widthClassName="max-w-4xl"
      footer={
        <div className="flex justify-end">
          <DialogCancelButton onClick={onClose}>{t('common.close')}</DialogCancelButton>
        </div>
      }
    >
      <div>
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
    </Dialog>
  );
}
