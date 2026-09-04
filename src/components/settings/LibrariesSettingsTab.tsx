import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Gauge, Landmark, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { IconButton, SectionLabel, SegmentedControl, Select, SettingRow } from '../ui';
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
  burstRequests: 240,
  burstWindowSecs: 60,
  cooldown403Secs: 120,
  cooldown429Secs: 120,
  hostConcurrency: MAX_HOST_CONCURRENCY,
  workersPerJob: 2,
  maxAttempts: 5,
  backoffBaseSecs: 15,
  backoffCapSecs: 300,
  connectTimeoutSecs: 15,
  readTimeoutSecs: 30,
  needsViewerWarmup: false,
};

/**
 * Quello che si sta scrivendo, con il profilo a cui appartiene (`id` nullo = un
 * profilo nuovo). Lo tiene la finestra, non questa scheda: cambiando scheda la
 * scheda si smonta, e un ritmo digitato a metà spariva senza dire niente.
 */
export interface NetworkProfileDraft {
  id: string | null;
  name: string;
  values: NetworkValues;
}

interface LibrariesSettingsTabProps {
  draft: NetworkProfileDraft | null;
  setDraft: (draft: NetworkProfileDraft | null) => void;
  embedded?: boolean;
}

/** Profili di rete e associazioni alle biblioteche. */
export function LibrariesSettingsTab({ draft, setDraft, embedded = false }: LibrariesSettingsTabProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NetworkSettings>({ profiles: [], libraries: [] });
  const [activeId, setActiveId] = useState<string | null>(draft?.id ?? null);
  const [creating, setCreating] = useState(draft !== null && draft.id === null);
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
  // Finché non si tocca niente sono i valori del profilo scelto, così cambiando
  // profilo i campi lo seguono.
  const edited = draft ?? {
    id: active?.id ?? null,
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
      id={embedded ? undefined : 'settings-panel-libraries'}
      role={embedded ? undefined : 'tabpanel'}
      aria-labelledby={embedded ? undefined : 'settings-tab-libraries'}
      className="space-y-10"
    >
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <SectionLabel icon={Gauge} label={t('settings.network.profiles')} />
            {/* Il salvataggio qui è esplicito: se non si vede che c'è qualcosa da
                salvare, si chiude la finestra credendo di aver salvato. */}
            {draft && (
              <span className="shrink-0 text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-warning">
                {t('settings.network.unsaved')}
              </span>
            )}
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
              disabled={saving || !draft}
              title={t('settings.network.save')}
            >
              <Check size={13} />
            </IconButton>
            <IconButton
              size="sm"
              onClick={() => show(creating ? null : activeId)}
              disabled={!draft}
              title={t('settings.network.discard')}
            >
              <RotateCcw size={13} />
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
          onChange={(name, values) => setDraft({ id: creating ? null : activeId, name, values })}
        />
      </section>

      <section className="space-y-4">
        <SectionLabel icon={Landmark} label={t('settings.network.libraries')} />
        <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
          {settings.libraries.map((library) => (
            <SettingRow key={library.key} label={library.label}>
              <Select
                value={library.profileId}
                onChange={(value) => void choose(library.key, value)}
                ariaLabel={library.label}
                options={settings.profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.name,
                }))}
              />
            </SettingRow>
          ))}
        </div>
      </section>
    </div>
  );
}
