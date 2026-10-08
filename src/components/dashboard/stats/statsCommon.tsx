import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../ui';

export interface ResourceState {
  loading: boolean;
  error: boolean;
}

/**
 * Stato di una sezione prima dei dati: in caricamento, non letta, o senza
 * abbastanza dati per dire qualcosa. Mai uno zero al posto di un dato che manca.
 */
export function SectionGate({ states, insufficient = false, children }: {
  states: ResourceState[];
  insufficient?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (states.some((state) => state.error)) {
    return <p role="alert" className="text-xs text-editorial-danger">{t('dashboard.loadFailed')}</p>;
  }
  if (states.some((state) => state.loading)) return <Spinner size={16} />;
  if (insufficient) return <p className="text-xs text-editorial-muted">{t('dashboardStats.insufficient')}</p>;
  return <>{children}</>;
}

/** Un numero di testa: valore grande in corsivo, etichetta piccola sotto. */
export function Figure({ value, label, note }: { value: ReactNode; label: string; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-display text-2xl italic leading-tight text-editorial-ink tabular-nums">{value}</p>
      <p className="caption-label truncate">{label}</p>
      {note && <p className="truncate text-xs text-editorial-muted">{note}</p>}
    </div>
  );
}

/** Legenda di due o più serie: un quadratino nel colore della serie, il nome
 *  nel colore del testo. */
export function SeriesLegend({ series }: { series: { key: string; label: string; className: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-editorial-muted">
      {series.map((item) => (
        <span key={item.key} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-sm ${item.className}`} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Nome leggibile di un modello: senza il prefisso del fornitore quando c'è. */
export function modelName(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}
