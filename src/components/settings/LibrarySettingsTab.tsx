import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, Landmark, Ruler } from 'lucide-react';
import { TabStrip, type TabStripItem } from '../ui';
import { LibraryImagesSection } from './LibraryImagesSection';
import { LibraryLibrariesSection } from './LibraryLibrariesSection';
import { LibraryProfilesSection } from './LibraryProfilesSection';
import { useLibraryNetworkSettings, type NetworkProfileDraft } from '../../hooks/useLibraryNetworkSettings';

type LibrarySubTab = 'profiles' | 'libraries' | 'images';

const ID_PREFIX = 'settings-library';

/**
 * Tutto quello che riguarda la Biblioteca in una scheda sola, divisa in tre
 * linguette: i ritmi, le biblioteche, le misure delle immagini.
 *
 * Erano due schede diverse — «Scaricamento» e «Biblioteche» — e la stessa
 * domanda («quanto grande arriva questa pagina?») si rispondeva in due posti
 * senza che nessuno dei due lo dicesse. Tre linguette invece di un rotolo
 * unico perché le tre cose non si guardano nello stesso momento.
 */
export function LibrarySettingsTab({
  draft,
  setDraft,
}: {
  draft: NetworkProfileDraft | null;
  setDraft: (draft: NetworkProfileDraft | null) => void;
}) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<LibrarySubTab>('profiles');
  const { settings, activeId, setActiveId, saveProfile, removeProfile, chooseProfile, chooseSizePolicy } =
    useLibraryNetworkSettings(draft?.id ?? null);

  const tabs: TabStripItem[] = [
    { id: 'profiles', label: t('settings.network.subtab.profiles'), icon: <Gauge size={16} /> },
    { id: 'libraries', label: t('settings.network.subtab.libraries'), icon: <Landmark size={16} /> },
    { id: 'images', label: t('settings.network.subtab.images'), icon: <Ruler size={16} /> },
  ];

  return (
    <div
      id="settings-panel-library"
      role="tabpanel"
      aria-labelledby="settings-tab-library"
      className="space-y-6"
    >
      <div className="flex items-center gap-3 border-b border-editorial-border/70 pb-3">
        <TabStrip
          tabs={tabs}
          activeId={subTab}
          onChange={(id) => setSubTab(id as LibrarySubTab)}
          ariaLabel={t('areas.library.title')}
          idPrefix={ID_PREFIX}
        />
        <span className="font-display text-sm italic text-editorial-ink">
          {tabs.find((tab) => tab.id === subTab)?.label}
        </span>
      </div>

      <div
        id={`${ID_PREFIX}-panel-${subTab}`}
        role="tabpanel"
        aria-labelledby={`${ID_PREFIX}-tab-${subTab}`}
        className="space-y-10"
      >
        {subTab === 'profiles' && (
          <LibraryProfilesSection
            settings={settings}
            activeId={activeId}
            setActiveId={setActiveId}
            draft={draft}
            setDraft={setDraft}
            onSave={saveProfile}
            onRemove={(id) => void removeProfile(id)}
          />
        )}

        {subTab === 'libraries' && (
          <LibraryLibrariesSection
            settings={settings}
            onChooseProfile={(key, profileId) => void chooseProfile(key, profileId)}
            onChooseSizePolicy={(key, policy) => void chooseSizePolicy(key, policy)}
          />
        )}

        {subTab === 'images' && <LibraryImagesSection />}
      </div>
    </div>
  );
}
