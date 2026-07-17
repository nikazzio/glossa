import { contrastRatio } from '../../utils/contrastRatio';

export interface ContrastBadgeProps {
  fg: string;
  bg: string;
}

/** Badge compatto di contrasto WCAG (AA ≥4.5:1, AA large ≥3:1). */
export function ContrastBadge({ fg, bg }: ContrastBadgeProps) {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= 4.5;
  const large = ratio >= 3 && ratio < 4.5;
  return (
    <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${
      pass  ? 'bg-editorial-success/10 text-editorial-success border-editorial-success/30' :
      large ? 'bg-editorial-warning/10 text-editorial-warning border-editorial-warning/30' :
              'bg-editorial-danger/10 text-editorial-danger border-editorial-danger/30'
    }`}>
      {ratio.toFixed(1)}:1 {pass ? '✓' : large ? '△' : '✗'}
    </span>
  );
}
