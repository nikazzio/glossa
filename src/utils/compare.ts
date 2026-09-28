/** Confronto con i valori mancanti in fondo: un vuoto non viene prima di tutti. */
export function missingLast<T>(left: T | null, right: T | null, compare: (a: T, b: T) => number): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return compare(left, right);
}
