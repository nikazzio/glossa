import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Blocca testo o storico mentre il visore sta aprendo una pagina diversa. */
export function PagePendingOverlay({
  pending,
  errorMessage,
  roundedClassName = 'rounded-2xl',
}: {
  pending: boolean;
  errorMessage: string | null;
  roundedClassName?: string;
}) {
  const { t } = useTranslation();
  if (!pending && !errorMessage) return null;
  return (
    <div className={`absolute inset-0 z-10 flex items-center justify-center bg-editorial-bg/70 ${roundedClassName}`}>
      {pending ? (
        <Loader2 size={20} className="animate-spin text-editorial-muted" aria-label={t('common.loading')} />
      ) : (
        <span className="flex flex-col items-center gap-1.5 text-center text-xs text-editorial-danger">
          <AlertTriangle size={20} aria-hidden="true" />
          {errorMessage}
        </span>
      )}
    </div>
  );
}
