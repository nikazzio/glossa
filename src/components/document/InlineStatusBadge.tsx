import { Tooltip } from '../ui';

interface InlineStatusBadgeProps {
  tone: 'amber' | 'emerald' | 'muted';
  icon: React.ReactNode;
  label?: string;
  ariaLabel?: string;
}

export function InlineStatusBadge({ tone, icon, label, ariaLabel }: InlineStatusBadgeProps) {
  const toneClasses =
    tone === 'amber'
      ? 'border-editorial-warning/40 bg-editorial-textbox text-editorial-ink'
      : tone === 'emerald'
        ? 'border-editorial-success/50 bg-editorial-success/8 text-editorial-success'
        : 'border-editorial-border bg-editorial-textbox/60 text-editorial-muted';

  return (
    <Tooltip label={label ?? ariaLabel}>
      <span
        aria-label={ariaLabel ?? label}
        className={`inline-flex items-center rounded-full border ${label ? 'gap-1.5 px-2.5 py-1' : 'p-1.5'} ${toneClasses}`}
      >
        {icon}
        {label && (
          <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{label}</span>
        )}
      </span>
    </Tooltip>
  );
}
