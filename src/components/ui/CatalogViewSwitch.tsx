import { LayoutGrid, List, Table2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton';

export type CatalogView = 'list' | 'grid' | 'table';

const VIEWS: { view: CatalogView; icon: LucideIcon; labelKey: string }[] = [
  { view: 'list', icon: List, labelKey: 'areas.library.viewList' },
  { view: 'grid', icon: LayoutGrid, labelKey: 'areas.library.viewGrid' },
  { view: 'table', icon: Table2, labelKey: 'areas.library.viewTable' },
];

/** Elenco, copertine o tabella: in fondo alla riga del titolo grande. */
export function CatalogViewSwitch({ view, onChange }: { view: CatalogView; onChange: (view: CatalogView) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1">
      {VIEWS.map(({ view: option, icon: Icon, labelKey }) => (
        <IconButton key={option} size="sm" tone={view === option ? 'accent' : 'default'} onClick={() => onChange(option)}
          title={t(labelKey)} ariaPressed={view === option}>
          <Icon size={13} />
        </IconButton>
      ))}
    </div>
  );
}
