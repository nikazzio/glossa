interface StatRowProps {
  label: string;
  value: string;
}

// Riga dato a due colonne: label (caption) a sinistra, valore allineato a destra.
// Contenuto volutamente più piccolo del titolo di sezione (gerarchia titolo > contenuto).
export function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{label}</dt>
      <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{value}</dd>
    </div>
  );
}
