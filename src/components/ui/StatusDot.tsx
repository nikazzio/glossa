import type { LucideIcon } from 'lucide-react';

export type PipelineStatus = 'completed' | 'processing' | 'retrying' | 'error' | 'idle';

export const STATUS_TONE: Record<PipelineStatus, string> = {
  completed: 'border-editorial-success/40 bg-editorial-success/12 text-editorial-success',
  processing: 'border-editorial-running/45 bg-editorial-running/12 text-editorial-running animate-pulse',
  retrying:   'border-editorial-running/45 bg-editorial-running/12 text-editorial-running animate-pulse',
  error:      'border-editorial-accent/40 bg-editorial-accent/10 text-editorial-accent',
  idle:       'border-editorial-border bg-editorial-bg text-editorial-muted',
};

const SIZE_CLASS = { sm: 'h-7 w-7', md: 'h-9 w-9' } as const;
const ICON_SIZE  = { sm: 13,        md: 16          } as const;

interface StatusDotProps {
  status: PipelineStatus;
  icon?: LucideIcon;
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusDot({ status, icon: Icon, label, size = 'md' }: StatusDotProps) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.idle;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex ${SIZE_CLASS[size]} items-center justify-center rounded-full border transition-colors ${tone}`}
    >
      {Icon ? (
        <Icon size={ICON_SIZE[size]} strokeWidth={1.9} />
      ) : (
        <span className="font-display text-[11px] italic tracking-[0.02em]">{label}</span>
      )}
    </span>
  );
}
