import { CheckCircle2, XCircle, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreflightStore } from '../../stores/preflightStore';
import { useUiStore } from '../../stores/uiStore';
import { Dialog } from '../ui';

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
            <button
              type="button"
              onClick={() => {
                resolve(false);
                setShowSettings(true);
              }}
              className="flex items-center justify-center gap-2 rounded-full border border-editorial-border px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-muted transition-colors hover:text-editorial-ink hover:bg-editorial-textbox/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <Settings size={12} aria-hidden="true" />
              {t('preflight.openSettings')}
            </button>
            <button
              type="button"
              onClick={() => resolve(true)}
              className="rounded-full border border-editorial-accent px-5 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-editorial-accent transition-colors hover:bg-editorial-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              {t('preflight.proceedAnyway')}
            </button>
          </div>
        ) : null
      }
    >
      <ul className="space-y-3" aria-label={t('preflight.title')}>
                {results.map((result) => (
                  <li key={`${result.provider}:${result.model}`} className="flex items-start gap-3 rounded-[18px] border border-editorial-border/60 bg-editorial-textbox/15 px-4 py-3">
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
