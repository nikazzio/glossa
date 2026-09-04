import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Gauge, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { IconButton, SectionLabel, Select, SettingRow } from '../ui';
import { NetworkProfileFields } from './NetworkProfileFields';
import type { NetworkSettings } from '../../services/downloadSettingsService';
import { NEW_PROFILE_VALUES, type NetworkProfileDraft } from '../../hooks/useLibraryNetworkSettings';

/** Il posto del profilo che si sta creando, prima che abbia un identificativo. */
const NEW_PROFILE = 'nuovo';

interface LibraryProfilesSectionProps {
  settings: NetworkSettings;
  activeId: string | null;
  setActiveId: (id: string) => void;
  draft: NetworkProfileDraft | null;
  setDraft: (draft: NetworkProfileDraft | null) => void;
  onSave: (draft: NetworkProfileDraft) => Promise<boolean>;
  onRemove: (id: string) => void;
}

/** Il ritmo condiviso: un profilo per volta, con salvataggio esplicito. */
export function LibraryProfilesSection({
  settings,
  activeId,
  setActiveId,
  draft,
  setDraft,
  onSave,
  onRemove,
}: LibraryProfilesSectionProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(draft !== null && draft.id === null);
  const [saving, setSaving] = useState(false);

  const active = creating
    ? null
    : (settings.profiles.find((profile) => profile.id === activeId) ?? null);
  // Finché non si tocca niente sono i valori del profilo scelto, così cambiando
  // profilo i campi lo seguono.
  const edited: NetworkProfileDraft = draft ?? {
    id: active?.id ?? null,
    name: active?.name ?? t('settings.network.newProfileName'),
    values: active?.values ?? NEW_PROFILE_VALUES,
  };

  const show = (id: string | null) => {
    setDraft(null);
    setCreating(id === null);
    if (id !== null) setActiveId(id);
  };

  const beginCreation = () => {
    setCreating(true);
    setDraft({
      id: null,
      name: t('settings.network.newProfileName'),
      values: NEW_PROFILE_VALUES,
    });
  };

  const save = async () => {
    setSaving(true);
    const saved = await onSave(edited);
    setSaving(false);
    if (!saved) return;
    setDraft(null);
    setCreating(false);
  };

  return (
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
            onClick={beginCreation}
            title={t('settings.network.newProfile')}
          >
            <Plus size={13} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => void save()}
            disabled={saving || !draft}
            title={t('settings.network.save')}
          >
            <Check size={13} />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => show(activeId)}
            disabled={!draft}
            title={t('settings.network.discard')}
          >
            <RotateCcw size={13} />
          </IconButton>
          <IconButton
            size="sm"
            tone="danger"
            onClick={() => active && onRemove(active.id)}
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

      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow
          label={t('settings.network.selectedProfile')}
          hint={t('settings.network.selectedProfileHint')}
        >
          <Select
            value={creating ? NEW_PROFILE : (active?.id ?? '')}
            onChange={(id) => show(id === NEW_PROFILE ? null : id)}
            ariaLabel={t('settings.network.selectedProfile')}
            className="w-64 max-w-[50vw]"
            options={[
              ...settings.profiles.map((profile) => ({
                value: profile.id,
                label: `${profile.name} · ${t('settings.network.usedBy', { count: profile.usedBy })}`,
              })),
              ...(creating ? [{ value: NEW_PROFILE, label: t('settings.network.newProfileName') }] : []),
            ]}
          />
        </SettingRow>
      </div>

      <NetworkProfileFields
        name={edited.name}
        values={edited.values}
        onChange={(name, values) => setDraft({ id: creating ? null : activeId, name, values })}
      />
    </section>
  );
}
