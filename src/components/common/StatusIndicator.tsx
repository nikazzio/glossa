interface StatusIndicatorProps {
  status: string;
  label: string;
  retryInfo?: { attempt: number; total: number; delayMs: number };
}

const STATUS_TONE = {
  completed: {
    dot: 'bg-editorial-success ring-editorial-success/30',
    label: 'text-editorial-success',
  },
  processing: {
    dot: 'bg-editorial-warning ring-editorial-warning/30 animate-pulse',
    label: 'text-editorial-warning',
  },
  error: {
    dot: 'bg-editorial-accent ring-editorial-accent/30',
    label: 'text-editorial-accent',
  },
  retrying: {
    dot: 'bg-amber-500 ring-amber-500/30 animate-pulse',
    label: 'text-amber-600',
  },
  idle: {
    dot: 'bg-editorial-border ring-editorial-border/0',
    label: 'text-editorial-muted/60',
  },
} as const;

type StatusKey = keyof typeof STATUS_TONE;

function resolveTone(status: string): StatusKey {
  if (status === 'completed' || status === 'processing' || status === 'error' || status === 'retrying') {
    return status;
  }
  return 'idle';
}

export function StatusIndicator({ status, label, retryInfo }: StatusIndicatorProps) {
  const tone = STATUS_TONE[resolveTone(status)];
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-editorial-border bg-editorial-bg/70 px-3 py-1.5"
      role="status"
      aria-label={`${label}: ${status}`}
    >
      <span className={`h-2 w-2 rounded-full ring-2 ${tone.dot}`} />
      <span
        className={`text-[10px] font-bold uppercase tracking-[0.18em] ${tone.label}`}
      >
        {label}
      </span>
      {status === 'retrying' && retryInfo && (
        <span className={`text-[9px] ${tone.label}`}>
          Rate limit — retry in {Math.round(retryInfo.delayMs / 1000)}s ({retryInfo.attempt}/{retryInfo.total})
        </span>
      )}
    </div>
  );
}
