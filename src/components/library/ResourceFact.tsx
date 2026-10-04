import type { LucideIcon } from 'lucide-react';
import { Hint } from '../ui';

/** Short metadata without repeating a caption above every value. */
export function ResourceFact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-2 text-xs text-editorial-muted">
    <Hint label={label}><Icon size={13} className="mt-0.5 shrink-0" /></Hint>
    <span className="min-w-0 break-words">{value}</span>
  </div>;
}
