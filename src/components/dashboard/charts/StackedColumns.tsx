import { Tooltip } from '../../ui';

export interface ColumnSeries {
  key: string;
  label: string;
  /** Classe di fondo della serie, mai usata per il testo. */
  className: string;
}

export interface ColumnDatum {
  key: string;
  label: string;
  values: Record<string, number>;
}

/** Altezza dell'area delle colonne, in pixel. */
const PLOT_HEIGHT = 96;

/**
 * Colonne impilate su una sola base: una per periodo, una fascia per serie,
 * separate da due pixel di fondo. Il valore di ogni colonna sta nel
 * suggerimento; sotto, l'etichetta del periodo. La legenda la mette chi monta.
 */
export function StackedColumns({ data, series, format, ariaLabel }: {
  data: ColumnDatum[];
  series: ColumnSeries[];
  format: (value: number) => string;
  ariaLabel: string;
}) {
  const totals = data.map((datum) => series.reduce((sum, item) => sum + (datum.values[item.key] ?? 0), 0));
  const maximum = Math.max(...totals, 0);
  return (
    <div className="flex items-end gap-1.5" role="list" aria-label={ariaLabel}>
      {data.map((datum, index) => {
        const total = totals[index];
        const height = maximum > 0 ? total / maximum * PLOT_HEIGHT : 0;
        const detail = (
          <span className="block space-y-0.5">
            <span className="block font-semibold">{datum.label} · {format(total)}</span>
            {series.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${item.className}`} aria-hidden="true" />
                {item.label} {format(datum.values[item.key] ?? 0)}
              </span>
            ))}
          </span>
        );
        return (
          <div key={datum.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" role="listitem">
            <Tooltip label={detail} variant="panel" className="flex w-full justify-center">
              <span
                aria-label={`${datum.label}: ${format(total)}`}
                role="img"
                className="flex w-full max-w-6 flex-col-reverse justify-start gap-[2px]"
                style={{ height: PLOT_HEIGHT }}
              >
                {/* Fasce dal basso: la prima serie poggia sulla base. */}
                {total > 0 ? series.map((item, position) => {
                  const value = datum.values[item.key] ?? 0;
                  if (value <= 0) return null;
                  const isTop = series.slice(position + 1).every((next) => (datum.values[next.key] ?? 0) <= 0);
                  return (
                    <span
                      key={item.key}
                      className={`block w-full ${item.className} ${isTop ? 'rounded-t' : ''}`}
                      style={{ height: Math.max(2, value / total * height) }}
                    />
                  );
                }) : <span className="block h-[2px] w-full bg-rule" />}
              </span>
            </Tooltip>
            <span className="max-w-full truncate text-caption text-editorial-muted" aria-hidden="true">{datum.label}</span>
          </div>
        );
      })}
    </div>
  );
}
