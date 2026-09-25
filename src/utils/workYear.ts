/** Il primo anno scritto nella data di un'opera: «ca. 1542», «1542-1560», «[1542?]». */
export function firstYear(date: string | null): number | null {
  const match = /\d{3,4}/.exec(date ?? '');
  return match ? Number(match[0]) : null;
}

/** Il secolo di un anno: 1542 è il sedicesimo, 1500 ancora il quindicesimo. */
export function centuryOf(year: number): number {
  return Math.floor((year - 1) / 100) + 1;
}

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

/** I secoli si scrivono in numeri romani: XVI, non 16. */
export function romanNumeral(value: number): string {
  let rest = value;
  let text = '';
  for (const [amount, letters] of ROMAN) {
    while (rest >= amount) {
      text += letters;
      rest -= amount;
    }
  }
  return text;
}
