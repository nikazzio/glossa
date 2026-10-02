import { useTranslation } from 'react-i18next';
import type { PipelineCostEstimate } from '../../utils/costEstimate';

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `~$${usd.toFixed(4)}`;
  return `~$${usd.toFixed(2)}`;
}

export function CostBreakdownPanel({ estimate }: { estimate: PipelineCostEstimate }) {
  const { t } = useTranslation();
  const allRows = [
    ...estimate.stages,
    ...(estimate.judge ? [estimate.judge] : []),
    ...(estimate.coherence ? [estimate.coherence] : []),
  ];

  if (allRows.length === 0) return null;

  return (
    <div className="rounded border border-editorial-border bg-editorial-bg shadow-lg">
      <div className="p-3 space-y-2">
        <p className="caption-label">
          {t('cost.breakdown')}
        </p>
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-editorial-muted">
              <th className="text-left pb-1">{t('cost.stage')}</th>
              <th className="text-right pb-1">{t('header.tokenCount')}</th>
              <th className="text-right pb-1">{t('header.estimatedCost')}</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row) => (
              <tr key={row.stageId} className="border-t border-rule-faint">
                <td className="py-1 pr-2 truncate max-w-[90px]">{row.stageName}</td>
                <td className="py-1 text-right text-editorial-muted">
                  {(row.inputTokens + row.outputTokens).toLocaleString()}
                </td>
                <td className="py-1 text-right">
                  {row.provider === 'ollama'
                    ? <span className="text-editorial-muted">{t('cost.free')}</span>
                    : row.costUsd === null
                      ? <span className="text-editorial-muted">{t('cost.unknown')}</span>
                      : formatCost(row.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
          {!estimate.isFree && (
            <tfoot>
              <tr className="border-t border-rule font-bold">
                <td className="pt-1" colSpan={2}>{t('cost.total')}</td>
                <td className="pt-1 text-right">
                  {estimate.totalUsd === null ? t('cost.unknown') : formatCost(estimate.totalUsd)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        <p className="text-xs italic text-editorial-muted">{t('cost.disclaimer')}</p>
      </div>
    </div>
  );
}
