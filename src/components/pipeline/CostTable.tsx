import { useTranslation } from 'react-i18next';
import type { PipelineCostEstimate } from '../../utils/costEstimate';
import { formatCacheHitRate, formatUsd, type ScopeBreakdownEntry } from '../../utils/operationLogStats';

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `~$${usd.toFixed(4)}`;
  return `~$${usd.toFixed(2)}`;
}

export interface CostTableRow {
  id: string;
  label: string;
  /** Provider e modello, sotto il nome della fase. */
  model?: string | null;
  /** Chiamate al modello: solo per il consumo reale, la stima non le conosce. */
  calls?: number;
  tokens: number;
  cacheRate?: number | null;
  cost: string;
}

/**
 * Una fase per riga, tutte in vista: la stessa tabella per la stima del
 * prossimo lancio e per il consumo reale, nel pannellino dei costi e nelle
 * Statistiche del documento.
 */
export function CostTable({ rows, total, showCalls = false }: {
  rows: CostTableRow[];
  total: { tokens: number; cost: string };
  showCalls?: boolean;
}) {
  const { t } = useTranslation();
  const numeric = 'py-1.5 pl-3 text-right tabular-nums';
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-rule text-left caption-label">
          <th className="py-1.5 font-normal">{t('cost.stage')}</th>
          {showCalls && <th className={`${numeric} font-normal`}>{t('cost.calls')}</th>}
          <th className={`${numeric} font-normal`}>{t('header.tokenCount')}</th>
          <th className={`${numeric} font-normal`}>{t('cost.cost')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {rows.map((row) => (
          <tr key={row.id} className="align-baseline text-editorial-ink">
            <td className="max-w-0 py-1.5">
              <span className="block truncate">{row.label}</span>
              {row.model && <span className="block truncate font-mono text-editorial-muted">{row.model}</span>}
            </td>
            {showCalls && <td className={numeric}>{row.calls ?? '—'}</td>}
            <td className={numeric}>
              {row.tokens.toLocaleString()}
              {row.cacheRate != null && (
                <span className="block text-editorial-muted">{t('cost.cacheShort', { rate: formatCacheHitRate(row.cacheRate) })}</span>
              )}
            </td>
            <td className={numeric}>{row.cost}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-rule font-semibold text-editorial-ink">
          <td className="py-1.5">{t('cost.total')}</td>
          {showCalls && <td />}
          <td className={numeric}>{total.tokens.toLocaleString()}</td>
          <td className={numeric}>{total.cost}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Righe della stima: una per fase attiva, poi audit e coerenza se inclusi. */
export function estimateRows(estimate: PipelineCostEstimate, freeLabel: string, unknownLabel: string): CostTableRow[] {
  return [...estimate.stages, ...(estimate.judge ? [estimate.judge] : []), ...(estimate.coherence ? [estimate.coherence] : [])]
    .map((row) => ({
      id: row.stageId,
      label: row.stageName,
      model: row.model ? `${row.provider} / ${row.model}` : row.provider,
      tokens: row.inputTokens + row.outputTokens,
      cost: row.provider === 'ollama' ? freeLabel : row.costUsd === null ? unknownLabel : formatCost(row.costUsd),
    }));
}

/** Righe del consumo reale, dal registro delle operazioni. */
export function usageRows(entries: ScopeBreakdownEntry[], translateLabel: (key: string) => string): CostTableRow[] {
  return entries.map((entry) => ({
    id: entry.stageId ?? entry.scope,
    label: entry.labelKey.startsWith('log.') ? translateLabel(entry.labelKey) : entry.labelKey,
    model: entry.model,
    calls: entry.calls,
    tokens: entry.stats.totalInput + entry.stats.totalOutput,
    cacheRate: entry.stats.cacheHitRate,
    cost: formatUsd(entry.stats.totalUsd),
  }));
}
