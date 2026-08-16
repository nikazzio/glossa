import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Gauge, Landmark, Plus, Trash2 } from 'lucide-react';
import { IconButton, Select } from '../ui';
import { NetworkProfileFields } from './NetworkProfileFields';
import {
  deleteNetworkProfile,
  listNetworkSettings,
  MAX_HOST_CONCURRENCY,
  saveNetworkProfile,
  setLibraryProfile,
  type NetworkSettings,
  type NetworkValues,
} from '../../services/downloadSettingsService';

/** I valori di un profilo nuovo: il ritmo prudente, che è quello di partenza. */
const NEW_PROFILE_VALUES: NetworkValues = {
  pauseMinMs: 600,
  pauseMaxMs: 1_600,
  burstRequests: 100,
  burstWindowSecs: 60,
  cooldown403Secs: 120,
  cooldown429Secs: 120,
  hostConcurrency: MAX_HOST_CONCURRENCY,
  maxAttempts: 5,
  backoffBaseSecs: 15,
  backoffCapSecs: 300,
  connectTimeoutSecs: 15,
  readTimeoutSecs: 30,
  needsViewerWarmup: false,
};

/**
 * I profili di rete e le biblioteche che li usano (#421, D18).
 *
 * Un profilo è **un ritmo**: quanto aspettare fra una richiesta e l'altra,
 * quante in un minuto, quanto fermarsi quando la biblioteca chiede di
 * rallentare. Ogni biblioteca ne sceglie uno; chi non sceglie segue quello
 * predefinito.
 */
export function LibrariesSettingsTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NetworkSettings>({ profiles: [], libraries: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await listNetworkSettings();
        setSettings(loaded);
        setActiveId((current) => current ?? loaded.profiles[0]?.id ?? null);
      } catch (error: unknown) {
        toast.error(t('settings.network.loadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
  }, [t]);

  const active = creating
    ? null
    : (settings.profiles.find((profile) => profile.id === activeId) ?? null);

  const save = async (name: string, values: NetworkValues) => {
    try {
      const saved = await saveNetworkProfile({ id: active?.id ?? null, name, values });
      setSettings(saved);
      if (creating) {
        setCreating(false);
        setActiveId(saved.profiles.find((profile) => profile.name === name)?.id ?? activeId);
      }
      toast.success(t('settings.network.saved'));
    } catch (error: unknown) {
      toast.error(t('settings.network.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const remove = async (id: string) => {
    try {
      const saved = await deleteNetworkProfile(id);
      setSettings(saved);
      setActiveId(saved.profiles[0]?.id ?? null);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(
        reason.includes('profile_in_use')
          ? t('settings.network.deleteInUse')
          : t('settings.network.saveFailed'),
      );
    }
  };

  const choose = async (libraryKey: string, profileId: string) => {
    try {
      setSettings(await setLibraryProfile(libraryKey, profileId));
    } catch (error: unknown) {
      toast.error(t('settings.network.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div
      id="settings-panel-libraries"
      role="tabpanel"
      aria-labelledby="settings-tab-libraries"
      className="space-y-10"
    >
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Gauge size={11} className="shrink-0 text-editorial-accent" />
            <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
              {t('settings.network.profiles')}
            </p>
          </div>
          <IconButton
            size="sm"
            tone={creating ? 'accent' : 'default'}
            onClick={() => setCreating(true)}
            title={t('settings.network.newProfile')}
          >
            <Plus size={13} />
          </IconButton>
        </div>

        <div
          role="radiogroup"
          aria-label={t('settings.network.profiles')}
          className="grid grid-cols-2 gap-x-6 border-y border-editorial-border/70"
        >
          {settings.profiles.map((profile) => {
            const isActive = !creating && profile.id === activeId;
            return (
              <button
                key={profile.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => {
                  setCreating(false);
                  setActiveId(profile.id);
                }}
                className={`flex items-center justify-between gap-2 border-l-4 py-3.5 pl-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                  isActive
                    ? 'border-l-editorial-accent text-editorial-accent'
                    : 'border-l-transparent text-editorial-ink hover:border-l-editorial-border hover:text-editorial-accent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-display text-lg italic">{profile.name}</span>
                  <span className="mt-0.5 block text-xs text-editorial-muted">
                    {t('settings.network.usedBy', { count: profile.usedBy })}
                  </span>
                </span>
                {isActive && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-editorial-accent"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        <NetworkProfileFields
          // Cambiando profilo i campi ripartono dai suoi valori, non da quelli
          // rimasti a schermo.
          key={active?.id ?? 'nuovo'}
          name={active?.name ?? t('settings.network.newProfileName')}
          values={active?.values ?? NEW_PROFILE_VALUES}
          onSave={save}
        />

        {active && !active.builtin && (
          <div className="flex justify-end">
            <IconButton
              size="sm"
              tone="danger"
              onClick={() => void remove(active.id)}
              disabled={active.usedBy > 0}
              title={active.usedBy > 0 ? t('settings.network.deleteInUse') : t('settings.network.delete')}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-1.5">
          <Landmark size={11} className="shrink-0 text-editorial-accent" />
          <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
            {t('settings.network.libraries')}
          </p>
        </div>
        <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
          {settings.libraries.map((library) => (
            <div key={library.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate text-sm text-editorial-ink">{library.label}</span>
              <Select
                value={library.profileId}
                onChange={(value) => void choose(library.key, value)}
                ariaLabel={library.label}
                options={settings.profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.name,
                }))}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
