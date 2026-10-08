/**
 * Strumenti statistici delle Statistiche della Dashboard. Metodi standard,
 * nessuna formula inventata:
 *
 * - quantili di tipo 7 (Hyndman e Fan 1996, il predefinito di R e NumPy);
 * - intervallo di Wilson per una proporzione (Wilson 1927), corretto anche con
 *   pochi casi, dove l'approssimazione normale esce da [0, 1];
 * - bootstrap a percentili (Efron 1979) per l'incertezza di una stima da un
 *   campione piccolo, senza supporre una distribuzione;
 * - previsione di completamento Monte Carlo: si ricampiona il lavoro fatto nei
 *   giorni lavorati finché basta a coprire quello che manca.
 *
 * Il generatore casuale ha un seme fisso: la stessa base di dati dà sempre gli
 * stessi numeri, fra un disegno e l'altro e nei test.
 */

/** z per un intervallo al 95% bilaterale. */
export const Z_95 = 1.959963984540054;

/** Generatore pseudo-casuale mulberry32: veloce, 32 bit, riproducibile. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Seme stabile da una stringa (FNV-1a), così ogni lavoro ha la sua sequenza. */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Quantile di tipo 7 su valori già ordinati in modo crescente; `q` fra 0 e 1. */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export interface Interval {
  low: number;
  high: number;
}

/** Intervallo di Wilson al 95% per `successes` su `trials`. */
export function wilsonInterval(successes: number, trials: number, z: number = Z_95): Interval | null {
  if (trials <= 0) return null;
  const p = successes / trials;
  const z2 = z * z;
  const centre = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const half = (z / (1 + z2 / trials)) * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/**
 * Intervallo bootstrap a percentili al 95% di una statistica: si ricampionano
 * gli elementi con reinserimento `iterations` volte e si prendono il 2,5° e il
 * 97,5° percentile delle statistiche ottenute.
 */
export function bootstrapInterval<T>(
  items: T[],
  statistic: (sample: T[]) => number,
  { iterations = 2000, seed = 1 }: { iterations?: number; seed?: number } = {},
): Interval | null {
  if (items.length < 2) return null;
  const random = seededRandom(seed);
  const values: number[] = [];
  for (let run = 0; run < iterations; run += 1) {
    const sample = Array.from({ length: items.length }, () => items[Math.floor(random() * items.length)]);
    const value = statistic(sample);
    if (Number.isFinite(value)) values.push(value);
  }
  values.sort((a, b) => a - b);
  const low = quantile(values, 0.025);
  const high = quantile(values, 0.975);
  return low === null || high === null ? null : { low, high };
}

/** Giorni lavorati minimi per una previsione: con meno, il ritmo non è stimabile. */
export const MIN_WORKED_DAYS = 3;
/** Giorni lavorati più recenti su cui si misura il ritmo attuale. */
export const RECENT_WORKED_DAYS = 20;
/** Tetto di sicurezza alle giornate simulate in una corsa. */
const MAX_SIMULATED_DAYS = 100_000;

export interface CompletionForecast {
  /** Giornate di lavoro che servono: mediana e intervallo dell'80% (10°–90°). */
  median: number;
  low: number;
  high: number;
  /** Unità per giorno lavorato, media del campione. */
  meanPerDay: number;
  /** Giorni lavorati usati per la stima. */
  sampleDays: number;
}

/**
 * Quante giornate di lavoro servono per finire. `dailyOutput` è quanto si è
 * fatto in ogni giorno lavorato (solo giorni con lavoro, dal più vecchio al più
 * recente). Monte Carlo: in ogni corsa si estraggono a caso giornate dal
 * campione recente finché la somma copre `remaining`; la distribuzione del
 * numero di giornate dà mediana e intervallo. `null` con meno di
 * `MIN_WORKED_DAYS` giorni o niente da fare.
 */
export function forecastCompletion(
  dailyOutput: number[],
  remaining: number,
  { iterations = 5000, seed = 1 }: { iterations?: number; seed?: number } = {},
): CompletionForecast | null {
  const sample = dailyOutput.filter((value) => value > 0).slice(-RECENT_WORKED_DAYS);
  if (remaining <= 0 || sample.length < MIN_WORKED_DAYS) return null;
  const random = seededRandom(seed);
  const runs: number[] = [];
  for (let run = 0; run < iterations; run += 1) {
    let done = 0;
    let days = 0;
    while (done < remaining && days < MAX_SIMULATED_DAYS) {
      done += sample[Math.floor(random() * sample.length)];
      days += 1;
    }
    runs.push(days);
  }
  runs.sort((a, b) => a - b);
  return {
    median: quantile(runs, 0.5) ?? 0,
    low: quantile(runs, 0.1) ?? 0,
    high: quantile(runs, 0.9) ?? 0,
    meanPerDay: sample.reduce((sum, value) => sum + value, 0) / sample.length,
    sampleDays: sample.length,
  };
}

/**
 * Distanza di Levenshtein fra due testi, su punti di codice Unicode dopo la
 * normalizzazione NFC: una lettera accentata conta come un carattere solo,
 * comunque sia stata scritta.
 */
export function levenshtein(left: string, right: string): number {
  const a = Array.from(left.normalize('NFC'));
  const b = Array.from(right.normalize('NFC'));
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    previous = current;
  }
  return previous[b.length];
}

/** Lunghezza in punti di codice dopo NFC, coerente con `levenshtein`. */
export function codePointLength(text: string): number {
  return Array.from(text.normalize('NFC')).length;
}
