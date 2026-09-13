import { LayoutDashboard, Link, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dashboardLocation, type AppLocation } from '../../navigation/appLocation';
import { useUiStore } from '../../stores/uiStore';
import { TabStrip } from '../ui';
import { FederatedSearchArea } from '../library/FederatedSearchArea';
import { AppDashboard } from './AppDashboard';
import { SourceDiscoveryPanel } from './SourceDiscoveryPanel';

/** Only the visible tab mounts: hidden searches and summaries do not keep reading. */
export function DashboardArea({ location }: { location: Extract<AppLocation, {area:'dashboard'}> }) {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const view = location.view ?? 'overview';
  const tabs = [
    { id:'overview',label:t('overview.title'),icon:<LayoutDashboard size={16} /> },
    { id:'search',label:t('federation.title'),icon:<Search size={16} /> },
    { id:'direct',label:t('federation.single'),icon:<Link size={16} /> },
  ];
  return <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    {/* Il titolo dell'area sta qui, una volta sola: dentro una scheda restava
        solo l'etichetta piccola e l'area non si riconosceva più. */}
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-editorial-border px-5 pb-2 pt-4">
      <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">{t('dashboard.title')}</h1>
      <div className="flex items-center gap-3">
        <TabStrip tabs={tabs} activeId={view} ariaLabel={t('dashboard.title')} idPrefix="dashboard-area"
          onChange={(id) => navigate(dashboardLocation(id === 'overview' ? undefined : {view:id as 'search'|'direct'}))} />
        <span className="font-display italic text-editorial-ink">{tabs.find((tab) => tab.id === view)?.label}</span>
      </div>
    </div>
    {/* Le schede non montate hanno comunque il loro pannello: le linguette
        dichiarano di comandarlo, e un riferimento a vuoto non si legge. */}
    {tabs.filter((tab) => tab.id !== view).map((tab) => (
      <div key={tab.id} role="tabpanel" id={`dashboard-area-panel-${tab.id}`}
        aria-labelledby={`dashboard-area-tab-${tab.id}`} hidden />
    ))}
    <div role="tabpanel" id={`dashboard-area-panel-${view}`} aria-labelledby={`dashboard-area-tab-${view}`} className="flex min-h-0 min-w-0 flex-1">
      {view === 'overview' ? <AppDashboard /> : view === 'search' ? <FederatedSearchArea searchId={location.searchId} /> : <div className="h-full min-w-0 flex-1 overflow-y-auto p-5 custom-scrollbar"><SourceDiscoveryPanel /></div>}
    </div>
  </div>;
}
