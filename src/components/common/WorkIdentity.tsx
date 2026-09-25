import type { ReactNode } from 'react';
import { Tooltip } from '../ui';

export interface WorkIdentityData {
  title: string;
  creator: string | null;
  date: string | null;
  place: string | null;
  publisher: string | null;
}

/**
 * Luogo e tipografo in una voce sola. Molte biblioteche scrivono il luogo già
 * dentro l'editore («Lyon : F. Juste»): ripeterlo darebbe «Lyon, Lyon : F. Juste».
 */
export function imprint(place: string | null, publisher: string | null): string | null {
  if (place && publisher) {
    return publisher.toLowerCase().includes(place.toLowerCase()) ? publisher : `${place}, ${publisher}`;
  }
  return place || publisher || null;
}

/**
 * Come si riconosce un'opera, uguale in ogni schermata: chi, quando e dove in
 * evidenza, poi il titolo — i libri antichi hanno titoli lunghissimi e si
 * identificano per autore, anno e tipografo. Il titolo si ferma a due righe
 * (una nelle intestazioni) e si legge intero al passaggio del puntatore.
 * `details` è la riga piccola in fondo: biblioteca, pagine, stato. È una riga
 * flessibile: chi la riempie tronca il proprio testo, così un segno a destra
 * (una barra, un avviso) resta visibile.
 */
export function WorkIdentity({ work, details, variant = 'row' }: {
  work: WorkIdentityData;
  details?: ReactNode;
  variant?: 'row' | 'header' | 'full';
}) {
  const whenWhere = [work.date, imprint(work.place, work.publisher)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  const hasIdentity = Boolean(work.creator || whenWhere);
  const titleClass = {
    row: 'line-clamp-2 text-base',
    header: 'truncate text-sm',
    full: 'text-lg',
  }[variant];

  return (
    <span className="block min-w-0">
      {hasIdentity && (
        <span className={`block truncate text-editorial-ink ${variant === 'header' ? 'text-xs' : 'text-sm'}`}>
          {work.creator && <strong className="font-semibold">{work.creator}</strong>}
          {work.creator && whenWhere && ' · '}
          {whenWhere}
        </span>
      )}
      <Tooltip label={variant === 'full' ? undefined : work.title} variant="panel" className="w-full min-w-0">
        <span className={`block font-display italic leading-snug text-editorial-ink ${titleClass}`}>
          {work.title}
        </span>
      </Tooltip>
      {details && (
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-editorial-muted">{details}</span>
      )}
    </span>
  );
}
