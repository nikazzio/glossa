interface StatBlockProps {
  label: string;
  value: string;
  /** Se presente, il valore si mostra come link cliccabile invece che testo. */
  href?: string;
}

/**
 * Etichetta sopra, valore sotto: per pannelli informativi stretti dove il
 * valore può essere lungo (titoli, descrizioni fisiche, fondi di
 * conservazione) e deve andare a capo, non troncare su una riga — a
 * differenza di `StatRow`, pensata per coppie label/valore corte affiancate.
 */
export function StatBlock({ label, value, href }: StatBlockProps) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 block break-words font-display text-sm italic text-editorial-accent underline underline-offset-2"
        >
          {value}
        </a>
      ) : (
        <p className="mt-0.5 break-words font-display text-sm italic text-editorial-ink">{value}</p>
      )}
    </div>
  );
}
