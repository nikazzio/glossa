import { LibraryImagesSection } from './LibraryImagesSection';
import { LibraryLibrariesSection } from './LibraryLibrariesSection';
import { LibraryProfilesSection } from './LibraryProfilesSection';
import { useLibraryNetworkSettings, type NetworkProfileDraft } from '../../hooks/useLibraryNetworkSettings';

/**
 * Tutto quello che riguarda la Biblioteca in una scheda sola: prima le
 * biblioteche, poi le misure delle immagini, infine i ritmi di rete.
 *
 * Erano due schede — «Scaricamento» e «Biblioteche» — e la stessa domanda
 * («quanto grande arriva questa pagina?») si rispondeva in due posti diversi
 * senza che nessuno dei due lo dicesse.
 */
export function LibrarySettingsTab({
  draft,
  setDraft,
}: {
  draft: NetworkProfileDraft | null;
  setDraft: (draft: NetworkProfileDraft | null) => void;
}) {
  const { settings, activeId, setActiveId, saveProfile, removeProfile, chooseProfile, chooseSizePolicy } =
    useLibraryNetworkSettings();

  return (
    <div
      id="settings-panel-library"
      role="tabpanel"
      aria-labelledby="settings-tab-library"
      className="space-y-10"
    >
      <LibraryLibrariesSection
        settings={settings}
        onChooseProfile={(key, profileId) => void chooseProfile(key, profileId)}
        onChooseSizePolicy={(key, policy) => void chooseSizePolicy(key, policy)}
      />

      <LibraryImagesSection />

      <LibraryProfilesSection
        settings={settings}
        activeId={activeId}
        setActiveId={setActiveId}
        draft={draft}
        setDraft={setDraft}
        onSave={saveProfile}
        onRemove={(id) => void removeProfile(id)}
      />
    </div>
  );
}
