import type { LucideIcon } from 'lucide-react';

interface SectionLabelProps {
  icon: LucideIcon;
  label: string;
}

export function SectionLabel({ icon: Icon, label }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={11} className="shrink-0 text-editorial-accent" />
      <p className="text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
        {label}
      </p>
    </div>
  );
}
