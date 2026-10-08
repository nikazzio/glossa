import { useTranslation } from 'react-i18next';
import type { QualityRating } from '../../../types';
import { QUALITY_ORDER } from '../../../utils/dashboardStats';
import { Tooltip } from '../../ui';

/** Scala a due poli con il centro neutro: critico e scarso verso il rosso,
 *  discreto grigio, buono e ottimo verso il verde dello stato positivo. */
export const RATING_CLASSNAME: Record<QualityRating, string> = {
  critical: 'bg-editorial-danger',
  poor: 'bg-editorial-danger/45',
  fair: 'bg-editorial-border',
  good: 'bg-editorial-success/55',
  excellent: 'bg-editorial-success',
};

/** Quanti frammenti per giudizio, come una barra divisa in fasce. */
export function RatingBar({ counts, total }: { counts: Record<QualityRating, number>; total: number }) {
  const { t } = useTranslation();
  const summary = QUALITY_ORDER.map((rating) => `${t(`dashboardStats.quality.rating.${rating}`)} ${counts[rating]}`).join(' · ');
  return (
    <Tooltip label={summary} variant="panel" className="block w-full">
      <span className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded" role="img" aria-label={summary}>
        {QUALITY_ORDER.filter((rating) => counts[rating] > 0).map((rating) => (
          <span key={rating} className={`block h-full ${RATING_CLASSNAME[rating]}`} style={{ width: `${counts[rating] / total * 100}%` }} />
        ))}
      </span>
    </Tooltip>
  );
}

/** Legenda dei giudizi, una volta per sezione. */
export function RatingLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-editorial-muted">
      {QUALITY_ORDER.map((rating) => (
        <span key={rating} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-sm ${RATING_CLASSNAME[rating]}`} aria-hidden="true" />
          {t(`dashboardStats.quality.rating.${rating}`)}
        </span>
      ))}
    </div>
  );
}
