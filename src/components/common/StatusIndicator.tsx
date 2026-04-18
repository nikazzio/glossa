interface StatusIndicatorProps {
  status: string;
  label: string;
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  return (
    <div className="flex flex-col items-center gap-1" role="status" aria-label={`${label}: ${status}`}>
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'completed'
            ? 'bg-editorial-ink'
            : status === 'processing'
              ? 'bg-editorial-accent animate-pulse'
              : status === 'error'
                ? 'bg-editorial-accent'
                : 'bg-editorial-border'
        }`}
      />
      <span
        className={`text-[8px] font-bold uppercase tracking-widest ${
          status === 'completed'
            ? 'text-editorial-ink'
            : status === 'processing'
              ? 'text-editorial-accent'
              : status === 'error'
                ? 'text-editorial-accent'
                : 'text-editorial-muted opacity-40'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
