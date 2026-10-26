import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SectionLabel } from './SectionLabel';

/**
 * Una sezione della colonna a schede: titoletto con icona e filetto sotto, i
 * comandi della sezione a destra dello stesso filetto.
 */
export function PanelSection({ icon, label, hint, actions, children }: {
  icon?: LucideIcon;
  /** Senza etichetta la sezione non si intesta: resta la riga dei comandi,
   *  quando ce ne sono. Una sezione che raccoglie i dati dell'opera dentro la
   *  scheda dell'opera non ha bisogno di dichiarare che sono dati. */
  label?: string;
  /** La spiegazione della sezione, portata dal titoletto stesso. */
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const heading = label !== undefined && icon !== undefined;
  return (
    <section className="space-y-3">
      {(heading || actions) && (
        <div className={`flex items-center gap-2 border-b border-rule pb-1.5 ${
          heading ? 'justify-between' : 'justify-end'
        }`}>
          {heading && <SectionLabel icon={icon} label={label} hint={hint} />}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
