import { CheckCircle2, XCircle, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreflightStore } from '../../stores/preflightStore';
import { useUiStore } from '../../stores/uiStore';
import { Dialog, DialogConfirmButton, DialogCancelButton } from '../ui';

export function PreflightDialog() {
  const { t } = useTranslation();
  const { open, results, resolve } = usePreflightStore();
  const setShowSettings = useUiStore((state) => state.setShowSettings);

  const hasFailures = results.some((r) => !r.ok);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resolve(false);
      }}
      title={t('preflight.title')}
      closeLabel={t('common.close')}
      widthClassName="max-w-md"
      description={hasFailures ? t('preflight.subtitleFailures') : t('preflight.subtitleOk')}
      footer={
        hasFailures ? (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogCancelButton
              onClick={() => {
                resolve(false);
                setShowSettings(true);
              }}
            >
              <Settings size={14} aria-hidden="true" />
              {t('preflight.openSettings')}
            </DialogCancelButton>
            <DialogConfirmButton onClick={() => resolve(true)}>
              {t('preflight.proceedAnyway')}
            </DialogConfirmButton>
          </div>
        ) : null
      }
    >
      <ul className="divide-y divide-editorial-border/70 border-y border-editorial-border/70" aria-label={t('preflight.title')}>
                {results.map((result) => (
                  <li key={`${result.provider}:${result.model}`} className="flex items-start gap-3 py-3">
                    {result.ok ? (
                      <CheckCircle2
                        size={16}
                        className="text-editorial-success shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        size={16}
                        className="text-editorial-accent shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-editorial-ink">{result.label}</span>
                      {!result.ok && result.error && (
                        <p className="text-xs text-editorial-muted mt-0.5 break-words">{result.error}</p>
                      )}
                    </div>
                  </li>
                ))}
      </ul>
    </Dialog>
  );
}
