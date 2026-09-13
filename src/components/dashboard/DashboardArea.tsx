import { useTranslation } from 'react-i18next';
import { type AppLocation } from '../../navigation/appLocation';
import { FederatedSearchArea } from '../library/FederatedSearchArea';
import { AppDashboard } from './AppDashboard';
import { SourceDiscoveryPanel } from './SourceDiscoveryPanel';

/** Only the visible tab mounts: hidden searches and summaries do not keep reading. */
export function DashboardArea({ location }: { location: Extract<AppLocation, {area:'dashboard'}> }) {
  const { t } = useTranslation();
  const view = location.view ?? 'overview';
  const label = view === 'search' ? t('federation.title') : view === 'direct' ? t('federation.single') : t('overview.title');
  return <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    {/* Le tre viste stanno nella barra a sinistra, sotto la Dashboard: qui
        resta il titolo dell'area con il nome della vista aperta. */}
    <div className="flex shrink-0 flex-wrap items-baseline gap-3 border-b border-editorial-border px-5 pb-2 pt-4">
      <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{t('dashboard.title')}</h1>
      {view !== 'overview' && <span className="font-display text-xl italic text-editorial-muted">{label}</span>}
    </div>
    <div className="flex min-h-0 min-w-0 flex-1">
      {view === 'overview' ? <AppDashboard /> : view === 'search' ? <FederatedSearchArea searchId={location.searchId} /> : <div className="h-full min-w-0 flex-1 overflow-y-auto p-5 custom-scrollbar"><SourceDiscoveryPanel /></div>}
    </div>
  </div>;
}
