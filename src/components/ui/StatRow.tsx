import { Info } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface StatRowProps {
  label: string;
  value: string;
  info?: string;
}

export function StatRow({ label, value, info }: StatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
        {label}
        {info && (
          <Tooltip label={info} side="right">
            <span className="inline-flex cursor-help rounded-full p-0.5 text-editorial-muted/50 hover:text-editorial-muted">
              <Info size={10} />
            </span>
          </Tooltip>
        )}
      </dt>
      <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{value}</dd>
    </div>
  );
}
