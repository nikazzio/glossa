import { useLanguageNames } from '../../hooks/useLanguageLabel';

export interface LanguageSide {
  code: string;
  variety?: string | null;
}

/**
 * Coppia di lingue in una riga: «Italiano (Old Italian) → Inglese». Nomi in
 * inchiostro, varietà e freccia attenuate; tronca da sola, il testo intero va
 * nel suggerimento di chi la usa.
 */
export function LanguagePairLabel({ source, target, className = '' }: { source: LanguageSide; target: LanguageSide; className?: string }) {
  const names = useLanguageNames();
  const side = ({ code, variety }: LanguageSide) => {
    const varietyName = names.variety(variety);
    return (
      <>
        <span className="text-editorial-ink">{names.language(code)}</span>
        {varietyName && <span className="text-editorial-muted"> ({varietyName})</span>}
      </>
    );
  };
  return (
    <span className={`block min-w-0 truncate font-sans text-xs ${className}`}>
      {side(source)}
      <span className="px-1.5 text-editorial-muted">→</span>
      {side(target)}
    </span>
  );
}
