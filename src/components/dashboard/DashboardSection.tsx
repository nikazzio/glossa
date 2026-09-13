import { type ReactNode } from 'react';
import { ChevronDown, Info, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/uiStore';
import { IconButton, SectionLabel } from '../ui';

/** Un riquadro della Dashboard: stessa cornice per tutti, così le colonne non
 *  si leggono come un elenco spezzato. Aperto o chiuso si ricorda. */
export function DashboardSection({ id, label, icon, hint, children, initiallyOpen = true }: {
  id: string; label: string; icon: LucideIcon; hint?: string; children: ReactNode; initiallyOpen?: boolean;
}) {
  const { t } = useTranslation();
  const open = useUiStore((state) => state.dashboardSections[id] ?? initiallyOpen);
  const setSection = useUiStore((state) => state.setDashboardSection);
  const panelId = `dashboard-section-${id}`;
  return <section className="flex min-w-0 flex-col rounded-lg border border-editorial-border bg-surface-panel">
    <header className="flex items-center gap-2 border-b border-editorial-border px-3 py-2">
      <SectionLabel icon={icon} label={label} />
      {hint && <IconButton title={hint} size="xs"><Info size={13} /></IconButton>}
      <IconButton
        title={open ? t('dashboard.section.collapse', { section: label }) : t('dashboard.section.expand', { section: label })}
        aria-expanded={open} aria-controls={panelId} onClick={() => setSection(id, !open)} size="sm" className="ml-auto"
      >
        <ChevronDown size={16} className={open ? '' : '-rotate-90'} />
      </IconButton>
    </header>
    <div id={panelId} hidden={!open} className="space-y-2 px-3 py-2.5">{children}</div>
  </section>;
}
