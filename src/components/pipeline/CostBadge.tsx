import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PipelineCostEstimate } from '../../utils/costEstimate';

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `~$${usd.toFixed(4)}`;
  return `~$${usd.toFixed(2)}`;
}

interface CostBadgeProps {
  estimate: PipelineCostEstimate;
}

export function CostBadge({ estimate }: CostBadgeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (estimate.stages.length === 0) return null;

  const label = estimate.isFree
    ? t('cost.free')
    : estimate.totalUsd === null
      ? t('cost.unknown')
      : formatCost(estimate.totalUsd);

  const allRows = estimate.judge ? [...estimate.stages, estimate.judge] : estimate.stages;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`${t('header.estimatedCost')}: ${label}`}
        className="inline-flex items-center gap-1 rounded-full border border-editorial-border/70 bg-editorial-textbox/40 px-2.5 py-1 text-[10px] font-mono text-editorial-muted transition-colors hover:border-editorial-ink hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      >
        {estimate.isFree && <Sparkles size={10} />}
        {label}
      </button>

      {open && allRows.length > 0 && (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded border border-editorial-border bg-editorial-bg shadow-lg"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="p-3 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted">
              {t('cost.breakdown')}
            </p>
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="text-editorial-muted/70">
                  <th className="text-left pb-1">{t('cost.stage')}</th>
                  <th className="text-right pb-1">{t('header.tokenCount')}</th>
                  <th className="text-right pb-1">{t('header.estimatedCost')}</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => (
                  <tr key={row.stageId} className="border-t border-editorial-border/40">
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
                  <tr className="border-t border-editorial-ink/20 font-bold">
                    <td className="pt-1" colSpan={2}>{t('cost.total')}</td>
                    <td className="pt-1 text-right">
                      {estimate.totalUsd === null ? t('cost.unknown') : formatCost(estimate.totalUsd)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            <p className="text-[9px] text-editorial-muted/60 italic">{t('cost.disclaimer')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
