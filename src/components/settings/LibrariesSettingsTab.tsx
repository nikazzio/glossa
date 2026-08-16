import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Gauge, Landmark, Plus, Trash2 } from 'lucide-react';
import { IconButton, SegmentedControl, Select } from '../ui';
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

/** Il posto del profilo che si sta creando, prima che abbia un identificativo. */
const NEW_PROFILE = 'nuovo';

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
  const [draft, setDraft] = useState<{ name: string; values: NetworkValues } | null>(null);
  const [saving, setSaving] = useState(false);

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
  // Quello che si sta scrivendo. Finché non si tocca niente sono i valori del
  // profilo scelto, così cambiando profilo i campi lo seguono.
  const edited = draft ?? {
    name: active?.name ?? t('settings.network.newProfileName'),
    values: active?.values ?? NEW_PROFILE_VALUES,
  };

  const show = (id: string | null) => {
    setDraft(null);
    setCreating(id === null);
    if (id !== null) setActiveId(id);
  };

  const saveActive = async () => {
    const { name, values } = edited;
    if (name.trim() === '') return;
    setSaving(true);
    try {
      const known = new Set(settings.profiles.map((profile) => profile.id));
      const saved = await saveNetworkProfile({ id: active?.id ?? null, name: name.trim(), values });
      setSettings(saved);
      setDraft(null);
      if (creating) {
        setCreating(false);
        // Il profilo appena nato è quello con l'identificativo che prima non
        // c'era: cercarlo per nome sbaglierebbe fra due profili omonimi.
        setActiveId(saved.profiles.find((profile) => !known.has(profile.id))?.id ?? activeId);
      }
      toast.success(t('settings.network.saved'));
    } catch (error: unknown) {
      toast.error(t('settings.network.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const saved = await deleteNetworkProfile(id);
      setSettings(saved);
      setDraft(null);
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
          {/* I comandi stanno accanto ai profili, dove si sceglie: in fondo
              alla schermata erano lontani da quello su cui agiscono. */}
          <div className="flex items-center gap-1">
            <IconButton
              size="sm"
              tone={creating ? 'accent' : 'default'}
              onClick={() => show(null)}
              title={t('settings.network.newProfile')}
            >
              <Plus size={13} />
            </IconButton>
            <IconButton
              size="sm"
              onClick={() => void saveActive()}
              disabled={saving}
              title={t('settings.network.save')}
            >
              <Check size={13} />
            </IconButton>
            <IconButton
              size="sm"
              tone="danger"
              onClick={() => active && void remove(active.id)}
              disabled={!active || active.builtin || active.usedBy > 0}
              title={
                active && active.usedBy > 0
                  ? t('settings.network.deleteInUse')
                  : t('settings.network.delete')
              }
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        </div>

        <SegmentedControl
          ariaLabel={t('settings.network.profiles')}
          value={creating ? NEW_PROFILE : (active?.id ?? NEW_PROFILE)}
          onChange={(id) => show(id === NEW_PROFILE ? null : id)}
          options={[
            ...settings.profiles.map((profile) => ({
              value: profile.id,
              label: `${profile.name} · ${t('settings.network.usedBy', { count: profile.usedBy })}`,
            })),
            ...(creating ? [{ value: NEW_PROFILE, label: t('settings.network.newProfileName') }] : []),
          ]}
        />

        <NetworkProfileFields
          name={edited.name}
          values={edited.values}
          onChange={(name, values) => setDraft({ name, values })}
        />
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
