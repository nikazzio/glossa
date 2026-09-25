import { describe, expect, it } from 'vitest';
import { firstYear, orderResults } from './searchResultOrder';

const result = (title: string, creator: string | null, date: string | null) => ({ card: { title, creator, date } });

describe('firstYear', () => {
  it('legge il primo anno anche fra parentesi, approssimazioni e intervalli', () => {
    expect(firstYear('ca. 1542')).toBe(1542);
    expect(firstYear('[1542?]')).toBe(1542);
    expect(firstYear('1542-1560')).toBe(1542);
    expect(firstYear('sec. XV')).toBeNull();
    expect(firstYear(null)).toBeNull();
  });
});

describe('orderResults', () => {
  const results = [
    result('Rime', null, null),
    result('Convivio', 'Dante', '1490'),
    result('Arcadia', 'Sannazaro', '1504'),
  ];

  it('lascia l\'ordine di arrivo quando non si chiede altro', () => {
    expect(orderResults(results, 'arrival')).toBe(results);
  });

  it('ordina per anno e per autore, con i dati mancanti in fondo', () => {
    expect(orderResults(results, 'year').map((item) => item.card.title)).toEqual(['Convivio', 'Arcadia', 'Rime']);
    expect(orderResults(results, 'creator').map((item) => item.card.title)).toEqual(['Convivio', 'Arcadia', 'Rime']);
  });

  it('ordina per titolo', () => {
    expect(orderResults(results, 'title').map((item) => item.card.title)).toEqual(['Arcadia', 'Convivio', 'Rime']);
  });
});
