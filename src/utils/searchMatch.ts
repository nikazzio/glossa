import type { SearchCriteria } from '../services/federatedSearchService';
import type { IIIFDiscoveryResult } from '../types';

/** Dove sono state trovate le parole cercate, per la riga «Trovato in». */
export type MatchExplanation =
  /** La biblioteca ha detto la sezione, o la si è trovata nei dati della scheda. */
  | { kind: 'section'; section: string; localSection: boolean; text: string | null }
  /** Nessun dato della scheda contiene le parole: le ha trovate altrove. */
  | { kind: 'elsewhere' };

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Parole più corte non spiegano niente: «de», «la», «of» stanno ovunque. */
const MIN_TERM_LENGTH = 3;
/** Quanto testo si mostra intorno alla prima parola trovata. */
const SNIPPET_CONTEXT = 60;

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

/** Un tratto di testo lungo ridotto intorno alla prima parola trovata. */
export function snippetAround(text: string, terms: string[]): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const segments = highlightTerms(clean, terms);
  const firstMatch = segments.findIndex((segment) => segment.match);
  if (firstMatch < 0 || clean.length <= SNIPPET_CONTEXT * 2) return clean;
  const offset = segments.slice(0, firstMatch).reduce((sum, segment) => sum + segment.text.length, 0);
  const start = Math.max(0, offset - SNIPPET_CONTEXT);
  const end = Math.min(clean.length, offset + SNIPPET_CONTEXT * 2);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}

/**
 * Perché un risultato è uscito. Prima quello che dice la biblioteca (la
 * sezione e il testo in cui ha trovato le parole); dove non lo dice, il
 * confronto fra le parole e i dati della scheda, nell'ordine in cui chi cerca
 * riconosce un'opera. Se nessun dato le contiene, le ha trovate altrove —
 * su Gallica, nel testo trascritto delle pagine.
 */
export function explainMatch(card: IIIFDiscoveryResult, terms: string[]): MatchExplanation | null {
  if (terms.length === 0) return null;
  const hints = card.matchHints ?? [];
  const hint = hints.find((entry) => containsTerm(entry.text, terms)) ?? hints[0];
  if (hint) {
    return { kind: 'section', section: hint.section ?? 'record', localSection: hint.section === null, text: snippetAround(hint.text, terms) };
  }
  // Titolo, autore, anno e tipografo sono già in vista nella riga: basta dire
  // dove, senza ripeterli.
  const fields: Array<[string, string | null | undefined, boolean]> = [
    ['author', card.creator, false],
    ['title', card.title, false],
    ['publisher', card.publisher, false],
    ['contributors', card.contributors.join(' · '), true],
    ['subjects', card.subjects.join(' · '), true],
    ['description', card.description, true],
  ];
  const found = fields.find(([, value]) => value && containsTerm(value, terms));
  if (!found) return { kind: 'elsewhere' };
  const [section, value, showText] = found;
  return { kind: 'section', section, localSection: true, text: showText && value ? snippetAround(value, terms) : null };
}
