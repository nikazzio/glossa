import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FederatedSearchArea } from '../library/FederatedSearchArea';
import { AppDashboard } from './AppDashboard';

/** Titolo dell'area, con il nome della vista aperta quando ne ha più d'una, sopra il contenuto. */
export function AreaPage({ title, view, children }: { title: string; view?: string; children: ReactNode }) {
  return <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-baseline gap-3 border-b border-editorial-border px-5 pb-2 pt-4">
      <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{title}</h1>
      {view && <span className="font-display text-xl italic text-editorial-muted">{view}</span>}
    </div>
    <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
  </div>;
}

export function HomeArea() {
  const { t } = useTranslation();
  return <AreaPage title={t('dashboard.title')}><AppDashboard /></AreaPage>;
}

export function SearchArea({ searchId, query }: { searchId?: string; query?: string }) {
  const { t } = useTranslation();
  return <AreaPage title={t('federation.title')}><FederatedSearchArea searchId={searchId} query={query} /></AreaPage>;
}
