import { useTranslation } from 'react-i18next';
import { Landmark } from 'lucide-react';
import { SectionLabel, Select, SettingRow } from '../ui';
import { SIZE_POLICIES, type NetworkSettings, type SizePolicy } from '../../services/downloadSettingsService';

/**
 * Una riga per biblioteca: il ritmo con cui la si interroga e il modo in cui le
 * si chiedono le immagini. Sono due scelte diverse di proposito — due
 * biblioteche possono meritare la stessa prudenza e servire misure diverse.
 */
export function LibraryLibrariesSection({
  settings,
  onChooseProfile,
  onChooseSizePolicy,
}: {
  settings: NetworkSettings;
  onChooseProfile: (libraryKey: string, profileId: string) => void;
  onChooseSizePolicy: (libraryKey: string, policy: SizePolicy) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <SectionLabel icon={Landmark} label={t('settings.network.libraries')} />
      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        {settings.libraries.map((library) => (
          <SettingRow
            key={library.key}
            label={library.label}
            hint={t(`settings.network.sizePolicyHint.${library.sizePolicy}`)}
          >
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={library.profileId}
                onChange={(value) => onChooseProfile(library.key, value)}
                ariaLabel={`${library.label} · ${t('settings.network.rhythm')}`}
                className="w-32"
                options={settings.profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.name,
                }))}
              />
              <Select
                value={library.sizePolicy}
                onChange={(value) => onChooseSizePolicy(library.key, value as SizePolicy)}
                ariaLabel={`${library.label} · ${t('settings.network.imageRequestMode')}`}
                className="w-48"
                options={SIZE_POLICIES.map((policy) => ({
                  value: policy,
                  label: t(`settings.network.sizePolicy.${policy}`),
                }))}
              />
            </div>
          </SettingRow>
        ))}
      </div>
    </section>
  );
}
