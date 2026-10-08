const WIDTH = 120;
const HEIGHT = 32;
const PAD = 4;

/**
 * Andamento in una riga: linea di due pixel in inchiostro, velatura sotto,
 * punto sull'ultimo valore. Senza assi: i numeri veri stanno accanto.
 */
export function Sparkline({ values, ariaLabel }: { values: number[]; ariaLabel: string }) {
  if (values.length < 2) return null;
  const maximum = Math.max(...values, 1);
  const step = (WIDTH - PAD * 2) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: PAD + index * step,
    y: HEIGHT - PAD - value / maximum * (HEIGHT - PAD * 2),
  }));
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${HEIGHT - PAD} L${PAD},${HEIGHT - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-8 w-[7.5rem] shrink-0 text-editorial-ink" role="img" aria-label={ariaLabel}>
      <path d={area} fill="currentColor" opacity={0.1} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={4} fill="currentColor" stroke="var(--color-surface-panel)" strokeWidth={2} />
    </svg>
  );
}
