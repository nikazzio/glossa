import { useEffect, useRef } from 'react';
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const visible = pending || Boolean(errorMessage);

  // Il velo ferma il puntatore ma non il tabulatore: finché copre, i fratelli
  // nel contenitore (l'editor, l'elenco delle versioni) diventano `inert`, così
  // nessun comando nascosto sotto resta raggiungibile da tastiera. Si toccano
  // solo gli elementi resi inerti qui, e alla chiusura si restituiscono.
  useEffect(() => {
    const overlay = overlayRef.current;
    const container = overlay?.parentElement;
    if (!visible || !overlay || !container) return;
    const covered = Array.from(container.children).filter(
      (element) => element !== overlay && !element.hasAttribute('inert'),
    );
    // Un velo di un istante mentre si scrive (la pagina riletta dopo una
    // lettura OCR) non deve lasciare il cursore fuori dal foglio: chi aveva il
    // fuoco lo ritrova quando il velo se ne va.
    const focused = document.activeElement;
    const restoreFocus = focused instanceof HTMLElement && covered.some((element) => element.contains(focused))
      ? focused
      : null;
    covered.forEach((element) => element.setAttribute('inert', ''));
    container.setAttribute('aria-busy', String(pending));
    return () => {
      covered.forEach((element) => element.removeAttribute('inert'));
      container.removeAttribute('aria-busy');
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (restoreFocus?.isConnected && lost) restoreFocus.focus({ preventScroll: true });
    };
  }, [visible, pending]);

  if (!visible) return null;
  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 z-10 flex items-center justify-center bg-editorial-bg/70 ${roundedClassName}`}
    >
      {pending ? (
        <span role="status" className="flex flex-col items-center gap-2 text-center text-xs text-editorial-muted">
          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
          {label ?? <span className="sr-only">{t('common.loading')}</span>}
        </span>
      ) : (
        <span role="alert" className="flex flex-col items-center gap-1.5 text-center text-xs text-editorial-danger">
          <AlertTriangle size={20} aria-hidden="true" />
          {errorMessage}
        </span>
      )}
    </div>
  );
}
