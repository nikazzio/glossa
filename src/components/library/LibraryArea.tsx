import { BookOpen, Link, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLocation } from '../../navigation/appLocation';
import { libraryLocation } from '../../navigation/appLocation';
import { useUiStore } from '../../stores/uiStore';
import { TabStrip } from '../ui';
import { LibraryCatalogArea } from '../workspace/LibraryCatalogArea';
import { SourceDiscoveryPanel } from '../dashboard/SourceDiscoveryPanel';
import { FederatedSearchArea } from './FederatedSearchArea';

export function LibraryArea({ location }: { location: Extract<AppLocation, { area: 'library' }> }) {
  const { t } = useTranslation();
  const navigate = useUiStore((s) => s.navigate);
  const view = location.view ?? 'catalog';
  const tabs = [
    { id: 'catalog', label: t('federation.catalog'), icon: <BookOpen size={16} /> },
    { id: 'search', label: t('federation.title'), icon: <Search size={16} /> },
    { id: 'direct', label: t('federation.single'), icon: <Link size={16} /> },
  ];
  return <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center gap-3 border-b border-editorial-border px-5 py-2">
      <TabStrip tabs={tabs} activeId={view} ariaLabel={t('federation.catalog')} idPrefix="library-area"
        onChange={(id) => navigate(libraryLocation({ view: id === 'catalog' ? undefined : id as 'search' | 'direct', workspaceFilter: location.workspaceFilter }))} />
      <span className="font-display italic text-editorial-ink">{tabs.find((tab) => tab.id === view)?.label}</span>
    </div>
    <div role="tabpanel" id={`library-area-panel-${view}`} aria-labelledby={`library-area-tab-${view}`} className="flex min-h-0 min-w-0 flex-1">
      {view === 'catalog' ? <LibraryCatalogArea itemId={location.itemId} /> : view === 'search' ? <FederatedSearchArea searchId={location.searchId} /> : <div className="h-full p-5"><SourceDiscoveryPanel /></div>}
    </div>
  </div>;
}
