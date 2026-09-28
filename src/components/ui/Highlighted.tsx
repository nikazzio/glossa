import { highlightTerms } from '../../utils/searchMatch';

/**
 * Un testo con le parole cercate in grassetto e nel colore d'accento. Senza
 * parole da cercare è il testo e basta.
 */
export function Highlighted({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms || terms.length === 0) return <>{text}</>;
  return (
    <>
      {highlightTerms(text, terms).map((segment, index) =>
        segment.match
          ? <strong key={index} className="font-semibold text-editorial-accent">{segment.text}</strong>
          : <span key={index}>{segment.text}</span>)}
    </>
  );
}
