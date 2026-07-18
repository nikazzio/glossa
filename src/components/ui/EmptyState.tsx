import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  message?: string;
  hint?: string;
  className?: string;
}

const DEFAULT_CLASS = 'flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center';

export function EmptyState({ icon, message, hint, className = DEFAULT_CLASS }: EmptyStateProps) {
  return (
    <div className={className}>
      <span className="text-editorial-border">{icon}</span>
      {message && <p className="text-sm font-medium text-editorial-muted">{message}</p>}
      {hint && <p className="text-xs text-editorial-muted/70">{hint}</p>}
    </div>
  );
}
