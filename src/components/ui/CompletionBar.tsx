/**
 * Quanto di una cosa è fatto, dentro una riga di elenco: barra corta a
 * larghezza fissa e il conteggio accanto. Verde a completamento pieno, oro a
 * metà. È un dato fra gli altri, non si stende per tutta la riga.
 */
export function CompletionBar({ ratio, label, complete, ariaLabel }: {
  ratio: number;
  label: string;
  /** Chi conosce lo stato vero lo dice; altrimenti vale il rapporto pieno. */
  complete?: boolean;
  /** Cosa misura la barra, per chi legge con la voce (es. «Pagine verificate»). */
  ariaLabel: string;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const isComplete = complete ?? clamped >= 1;
  const percent = Math.round(clamped * 100);
  return (
    <>
      <span
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={label}
        aria-label={ariaLabel}
        className="h-[3px] w-10 shrink-0 overflow-hidden rounded-full bg-editorial-border"
      >
        <span
          className={`block h-full rounded-full ${isComplete ? 'bg-editorial-success' : 'bg-editorial-running'}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="shrink-0 tabular-nums" aria-hidden="true">{label}</span>
    </>
  );
}
