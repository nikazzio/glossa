import { describe, expect, it } from 'vitest';
import {
  bootstrapInterval,
  codePointLength,
  forecastCompletion,
  levenshtein,
  quantile,
  seededRandom,
  wilsonInterval,
} from './statistics';

describe('statistics', () => {
  it('computes type-7 quantiles like R and NumPy', () => {
    // R: quantile(c(1, 2, 3, 4, 10), c(0.5, 0.9)) → 3, 7.6
    expect(quantile([1, 2, 3, 4, 10], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 10], 0.9)).toBeCloseTo(7.6);
    expect(quantile([], 0.5)).toBeNull();
  });

  it('gives the Wilson 95% interval of reference tables', () => {
    // 8 successi su 10: [0,4902, 0,9433] (Newcombe 1998, metodo 3)
    const interval = wilsonInterval(8, 10);
    expect(interval?.low).toBeCloseTo(0.4902, 3);
    expect(interval?.high).toBeCloseTo(0.9433, 3);
    // Nessun successo: l'intervallo parte da zero e non è vuoto.
    expect(wilsonInterval(0, 5)?.low).toBe(0);
    expect(wilsonInterval(0, 5)?.high).toBeCloseTo(0.4345, 3);
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it('repeats the same random sequence for the same seed', () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it('builds a bootstrap interval that contains the sample mean', () => {
    const values = [2, 4, 4, 5, 6, 7, 9];
    const mean = (sample: number[]) => sample.reduce((a, b) => a + b, 0) / sample.length;
    const interval = bootstrapInterval(values, mean, { seed: 3 });
    expect(interval).not.toBeNull();
    expect(interval!.low).toBeLessThan(mean(values));
    expect(interval!.high).toBeGreaterThan(mean(values));
    expect(bootstrapInterval([1], mean)).toBeNull();
  });

  it('forecasts exactly when every working day produces the same amount', () => {
    // 2 al giorno, ne mancano 17: servono 9 giornate, sempre.
    const forecast = forecastCompletion([2, 2, 2, 2], 17);
    expect(forecast).toMatchObject({ median: 9, low: 9, high: 9, meanPerDay: 2, sampleDays: 4 });
  });

  it('widens the forecast range when the pace varies, around the expected value', () => {
    const forecast = forecastCompletion([1, 3, 1, 3, 1, 3], 40, { seed: 5 })!;
    // Media 2 al giorno: circa 20 giornate.
    expect(forecast.median).toBeGreaterThanOrEqual(19);
    expect(forecast.median).toBeLessThanOrEqual(21);
    expect(forecast.low).toBeLessThan(forecast.high);
  });

  it('refuses to forecast with fewer than three working days', () => {
    expect(forecastCompletion([5, 5], 10)).toBeNull();
    expect(forecastCompletion([0, 0, 4], 10)).toBeNull();
    expect(forecastCompletion([1, 1, 1], 0)).toBeNull();
  });

  it('counts edits on Unicode characters, not on code units', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    // «è» composta e scomposta è la stessa lettera dopo NFC.
    expect(levenshtein('perchè', 'perchè')).toBe(0);
    expect(codePointLength('è')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});
