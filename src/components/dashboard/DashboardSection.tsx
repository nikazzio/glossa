import { type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EASE_EDITORIAL, MOTION_DURATION } from '../layout/motion';
import { useUiStore } from '../../stores/uiStore';
import { IconButton, SectionLabel } from '../ui';
import { useSectionDragHandle } from './sectionDragHandle';

/** Un riquadro della Dashboard: stessa cornice per tutti, così le colonne non
 *  si leggono come un elenco spezzato. Aperto o chiuso si ricorda. */
export function DashboardSection({ id, label, icon, hint, children, initiallyOpen = true }: {
  id: string; label: string; icon: LucideIcon; hint?: string; children: ReactNode; initiallyOpen?: boolean;
}) {
  const { t } = useTranslation();
  const open = useUiStore((state) => state.dashboardSections[id] ?? initiallyOpen);
  const setSection = useUiStore((state) => state.setDashboardSection);
  const dragHandle = useSectionDragHandle();
  const reducedMotion = useReducedMotion();
  const panelId = `dashboard-section-${id}`;
  return <section className="flex min-w-0 flex-col rounded-lg border border-editorial-border bg-surface-panel">
    <header className="flex items-center gap-2 border-b border-editorial-border px-3 py-2">
      {dragHandle}
      <SectionLabel icon={icon} label={label} hint={hint} />
      <IconButton
        title={open ? t('dashboard.section.collapse', { section: label }) : t('dashboard.section.expand', { section: label })}
        aria-expanded={open} aria-controls={panelId} onClick={() => setSection(id, !open)} size="sm" className="ml-auto"
      >
        <ChevronDown size={16} className={open ? '' : '-rotate-90'} />
      </IconButton>
    </header>
    {/* Il riquadro si apre e si chiude in altezza: chiuso il contenuto non
        resta nella pagina, così non lo si raggiunge con il tabulatore. */}
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={panelId}
          initial={reducedMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: MOTION_DURATION, ease: EASE_EDITORIAL }}
          className="overflow-hidden"
        >
          <div className="space-y-2 px-3 py-2.5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </section>;
}
