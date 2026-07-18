import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  label?: string;
  size?: number;
  className?: string;
}

const DEFAULT_CLASS = 'flex items-center gap-2 text-sm text-editorial-muted';

export function Spinner({ label, size = 14, className = DEFAULT_CLASS }: SpinnerProps) {
  return (
    <span className={className} role="status" aria-live="polite">
      <Loader2 size={size} className="animate-spin shrink-0" />
      {label && <span>{label}</span>}
    </span>
  );
}
