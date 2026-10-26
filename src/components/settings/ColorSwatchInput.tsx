/** Pastiglia del colore a destra di una riga: un clic apre il selettore di sistema. */
export function ColorSwatchInput({ color, value, label, onChange }: {
  /** Colore mostrato (anche con trasparenza). */
  color: string;
  /** Valore esadecimale per il selettore. */
  value: string;
  label: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border border-editorial-border">
      <span className="absolute inset-0" style={{ backgroundColor: color }} />
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      />
    </label>
  );
}
