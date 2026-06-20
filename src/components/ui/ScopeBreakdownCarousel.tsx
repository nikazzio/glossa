import { useState } from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScopeBreakdownEntry } from '../../utils/operationLogStats';
import { ScopeBreakdownCard } from './ScopeBreakdownCard';

interface Props {
  entries: ScopeBreakdownEntry[];
  title: string;
}

export function ScopeBreakdownCarousel({ entries, title }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, entries.length - 1));
  const entry = entries[safeIndex] ?? null;
  const multi = entries.length > 1;

  if (!entry) return null;

  return (
    <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
          <Layers size={11} className="text-editorial-accent shrink-0" />
          {title}
        </div>
        {multi && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0}
              aria-label={t('document.summaryPrevStep')}
              className="rounded-full border border-editorial-border p-1 text-editorial-muted transition-colors enabled:hover:border-editorial-accent/60 enabled:hover:text-editorial-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-display text-[12px] italic tabular-nums text-editorial-ink">
              {safeIndex + 1}/{entries.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex(Math.min(entries.length - 1, safeIndex + 1))}
              disabled={safeIndex === entries.length - 1}
              aria-label={t('document.summaryNextStep')}
              className="rounded-full border border-editorial-border p-1 text-editorial-muted transition-colors enabled:hover:border-editorial-accent/60 enabled:hover:text-editorial-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      <ScopeBreakdownCard entry={entry} />
    </section>
  );
}
