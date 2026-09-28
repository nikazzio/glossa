import type { SearchCriteria } from '../services/federatedSearchService';
import type { IIIFDiscoveryResult } from '../types';

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Parole più corte non spiegano niente: «de», «la», «of» stanno ovunque. */
const MIN_TERM_LENGTH = 3;

const DIACRITICS = /\p{Diacritic}/gu;

/** Un carattere come lo si confronta: minuscolo, senza accenti. */
const fold = (char: string) => char.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

/** Le parole di una ricerca da ritrovare nei risultati. */
export function matchTerms(criteria: SearchCriteria): string[] {
  const words = [criteria.query, criteria.title, criteria.author, criteria.publisher]
    .join(' ')
    .split(/[\s,.;:()"'«»]+/)
    .map((word) => [...word].map(fold).join(''))
    .filter((word) => word.length >= MIN_TERM_LENGTH || /^\d+$/.test(word));
  return [...new Set(words)];
}

/**
 * Il testo diviso in pezzi normali e pezzi che contengono una parola cercata.
 * Il confronto ignora maiuscole e accenti («Achille» trova «ACHILLE» e
 * «Achillè»), e ogni parola vale anche come inizio di una più lunga
 * («achille» evidenzia «Achilles»).
 */
export function highlightTerms(text: string, terms: string[]): TextSegment[] {
  if (terms.length === 0 || text === '') return [{ text, match: false }];
  // Composto prima di dividere: un accento scritto come segno a parte finirebbe
  // fuori dal grassetto della sua lettera.
  const chars = [...text.normalize('NFC')];
  const folded = chars.map(fold);
  const marked = chars.map(() => false);
  // L'indice di ogni carattere originale nella stringa confrontata: un
  // carattere può diventarne più di uno o nessuno togliendo gli accenti.
  const starts: number[] = [];
  let haystack = '';
  for (const piece of folded) {
    starts.push(haystack.length);
    haystack += piece;
  }
  for (const term of terms) {
    for (let at = haystack.indexOf(term); at >= 0; at = haystack.indexOf(term, at + 1)) {
      const end = at + term.length;
      chars.forEach((_, index) => {
        if (starts[index] >= at && starts[index] < end) marked[index] = true;
      });
    }
  }
  return chars.reduce<TextSegment[]>((segments, char, index) => {
    const last = segments.at(-1);
    if (last && last.match === marked[index]) {
      return [...segments.slice(0, -1), { text: last.text + char, match: last.match }];
    }
    return [...segments, { text: char, match: marked[index] }];
  }, []);
}

const containsTerm = (text: string, terms: string[]) => {
  const haystack = [...text].map(fold).join('');
  return terms.some((term) => haystack.includes(term));
};

/**
 * Se le parole non compaiono da nessuna parte nella scheda: né in quello che
 * la biblioteca dichiara di aver trovato, né nei dati che la scheda mostra.
 * Allora la biblioteca le ha trovate altrove — su Gallica, nel testo delle
 * pagine — e il risultato va segnato, perché non c'è niente da evidenziare.
 */
export function foundOutsideRecord(card: IIIFDiscoveryResult, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const texts = [
    ...(card.matchHints ?? []).map((hint) => hint.text),
    card.title,
    card.creator,
    card.date,
    card.publisher,
    card.description,
    card.language,
    card.holdingInstitution,
    card.physicalDescription,
    card.collection,
    ...card.contributors,
    ...card.subjects,
  ];
  return !texts.some((text) => text && containsTerm(text, terms));
}
