/**
 * Quanto di una cosa è fatto, dentro una riga di elenco: barra corta a
 * larghezza fissa e il conteggio accanto. Verde a completamento pieno, oro a
 * metà. È un dato fra gli altri, non si stende per tutta la riga.
 */
export function CompletionBar({ ratio, label, complete }: {
  ratio: number;
  label: string;
  /** Chi conosce lo stato vero lo dice; altrimenti vale il rapporto pieno. */
  complete?: boolean;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const isComplete = complete ?? clamped >= 1;
  return (
    <>
      <span className="h-[3px] w-10 shrink-0 overflow-hidden rounded-full bg-editorial-border" aria-hidden="true">
        <span
          className={`block h-full rounded-full ${isComplete ? 'bg-editorial-success' : 'bg-editorial-running'}`}
          style={{ width: `${Math.round(clamped * 100)}%` }}
        />
      </span>
      <span className="shrink-0 tabular-nums">{label}</span>
    </>
  );
}
