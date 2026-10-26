/** Formati dei numeri nelle Statistiche, nella lingua dell'interfaccia. */

export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

/** Un decimale al massimo: 1,7 pagine per giorno, non 1,714285. */
export function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** Numeri grandi in forma breve: 12.300 → «12,3 k», 3.100.000 → «3,1 Mln». */
export function formatCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(ratio: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(ratio);
}

export function formatSeconds(seconds: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds)} s`;
}

export function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** «2026-10» → «ott», con l'anno quando cambia rispetto al mese prima. */
export function formatMonth(month: string, locale: string, withYear = false): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString(locale, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' });
}
