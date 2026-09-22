import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Blocca testo o storico mentre il visore sta aprendo una pagina diversa,
 *  o mentre un motore sta leggendo quella pagina (#220). Con `label` sotto il
 *  cerchietto compare una riga che dice cosa si sta aspettando: senza, resta
 *  il solo cerchietto di prima. */
export function PagePendingOverlay({
  pending,
  errorMessage,
  label,
  roundedClassName = 'rounded-2xl',
}: {
  pending: boolean;
  errorMessage: string | null;
  label?: string;
  roundedClassName?: string;
}) {
  const { t } = useTranslation();
  if (!pending && !errorMessage) return null;
  return (
    <div className={`absolute inset-0 z-10 flex items-center justify-center bg-editorial-bg/70 ${roundedClassName}`}>
      {pending ? (
        <span className="flex flex-col items-center gap-2 text-center text-xs text-editorial-muted">
          <Loader2 size={20} className="animate-spin" aria-label={label ?? t('common.loading')} />
          {label}
        </span>
      ) : (
        <span className="flex flex-col items-center gap-1.5 text-center text-xs text-editorial-danger">
          <AlertTriangle size={20} aria-hidden="true" />
          {errorMessage}
        </span>
      )}
    </div>
  );
}
