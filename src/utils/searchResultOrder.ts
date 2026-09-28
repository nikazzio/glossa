import { firstYear } from './workYear';
import { missingLast } from './compare';

/**
 * Come si ordinano i risultati di una ricerca. `arrival` è l'ordine in cui le
 * biblioteche rispondono, cioè la loro pertinenza: è il punto di partenza.
 */
export const RESULT_ORDERS = ['arrival', 'year', 'creator', 'title'] as const;
export type ResultOrder = (typeof RESULT_ORDERS)[number];

interface OrderableCard {
  title: string;
  creator: string | null;
  date: string | null;
}

export function orderResults<T extends { card: OrderableCard }>(results: T[], order: ResultOrder): T[] {
  if (order === 'arrival') return results;
  const byText = (a: string, b: string) => a.localeCompare(b);
  const compare = {
    year: (a: T, b: T) => missingLast(firstYear(a.card.date), firstYear(b.card.date), (x, y) => x - y),
    creator: (a: T, b: T) => missingLast(a.card.creator || null, b.card.creator || null, byText),
    title: (a: T, b: T) => byText(a.card.title, b.card.title),
  }[order];
  return [...results].sort(compare);
}
