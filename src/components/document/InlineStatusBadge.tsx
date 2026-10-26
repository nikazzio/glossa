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
      ? 'border-editorial-warning bg-editorial-textbox text-editorial-warning'
      : tone === 'emerald'
        ? 'border-editorial-success bg-editorial-textbox text-editorial-success'
        : 'border-editorial-border bg-editorial-textbox text-editorial-muted';

  return (
    <Tooltip label={label ?? ariaLabel}>
      <span
        aria-label={ariaLabel ?? label}
        className={`inline-flex items-center rounded-full border ${label ? 'gap-1.5 px-2.5 py-1' : 'p-1.5'} ${toneClasses}`}
      >
        {icon}
        {label && (
          <span className="text-caption font-bold uppercase tracking-section">{label}</span>
        )}
      </span>
    </Tooltip>
  );
}
