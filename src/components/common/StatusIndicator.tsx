interface StatusIndicatorProps {
  status: string;
  label: string;
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
  idle: {
    dot: 'bg-editorial-border ring-editorial-border/0',
    label: 'text-editorial-muted/60',
  },
} as const;

type StatusKey = keyof typeof STATUS_TONE;

function resolveTone(status: string): StatusKey {
  if (status === 'completed' || status === 'processing' || status === 'error') {
    return status;
  }
  return 'idle';
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
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
    </div>
  );
}
