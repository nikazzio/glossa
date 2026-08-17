import { useState, useEffect, type ReactNode } from 'react';
import { Plus, Trash2, CheckCircle2, Loader2, Wifi, Key, X, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import { confirm } from '../../stores/confirmStore';
import {
  saveCustomProviderProfile,
  deleteCustomProviderProfile,
  testCustomProviderConnection,
} from '../../services/customProviderService';
import { customProviderProfileSchema } from '../../schemas/externalData';
import { FieldLabel, FIELD_CLASSNAME, FIELD_MONO_CLASSNAME, IconButton, ToggleRow } from '../ui';
import type { CustomProviderProfile } from '../../types';

interface ProfileFormState {
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
  apiKey: string;
  testModel: string;
}

const EMPTY_FORM: ProfileFormState = {
  name: '',
  baseUrl: '',
  requiresApiKey: true,
  apiKey: '',
  testModel: '',
};

function generateId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function ProfileForm({
  initial,
  profileId,
  onSave,
  onCancel,
}: {
  initial: ProfileFormState;
  profileId: string;
  onSave: (profile: CustomProviderProfile) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const set = (patch: Partial<ProfileFormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setValidationError(null);
  };

  const validatedProfile = () => {
    const parsed = customProviderProfileSchema.safeParse({
      name: form.name,
      baseUrl: form.baseUrl,
      requiresApiKey: form.requiresApiKey,
    });
    if (!parsed.success) {
      setValidationError(t('settings.customProvider.invalidProfile'));
      return null;
    }
    return parsed.data;
  };

  const handleSave = async () => {
    const profile = validatedProfile();
    if (!profile) return;
    setSaving(true);
    try {
      await saveCustomProviderProfile(
        profileId,
        profile.name,
        profile.baseUrl,
        form.requiresApiKey && form.apiKey.trim() ? form.apiKey.trim() : null,
        profile.requiresApiKey
      );
      toast.success(t('settings.customProvider.saved', { name: profile.name }));
      onSave({ id: profileId, ...profile });
    } catch (err: unknown) {
      toast.error(t('settings.customProvider.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const profile = validatedProfile();
    if (!profile) return;
    if (!form.testModel.trim()) {
      toast.warning(t('settings.customProvider.testModelRequired'));
      return;
    }
    setTesting(true);
    try {
      await saveCustomProviderProfile(
        profileId,
        profile.name,
        profile.baseUrl,
        form.requiresApiKey && form.apiKey.trim() ? form.apiKey.trim() : null,
        profile.requiresApiKey
      );
      await testCustomProviderConnection(profileId, form.testModel.trim());
      toast.success(t('settings.customProvider.testOk'));
    } catch (err: unknown) {
      toast.error(t('settings.customProvider.testFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4 border-y border-editorial-border/70 py-4">
      <FormField label={t('settings.customProvider.name')}>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t('settings.customProvider.namePlaceholder')}
          className={FIELD_CLASSNAME}
        />
      </FormField>

      <FormField label={t('settings.customProvider.baseUrl')}>
        <input
          type="url"
          value={form.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder={t('settings.customProvider.baseUrlPlaceholder')}
          className={FIELD_MONO_CLASSNAME}
        />
      </FormField>
      {validationError && (
        <p role="alert" className="text-sm text-editorial-danger">
          {validationError}
        </p>
      )}

      <div className="border-y border-editorial-border/60 py-3">
        <ToggleRow
          icon={<Key size={12} />}
          label={t('settings.customProvider.requiresApiKey')}
          checked={form.requiresApiKey}
          onChange={() => set({ requiresApiKey: !form.requiresApiKey })}
        />
      </div>

      {form.requiresApiKey && (
        <FormField label={t('settings.customProvider.apiKey')}>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={t('settings.pasteApiKey')}
            className={FIELD_MONO_CLASSNAME}
          />
        </FormField>
      )}

      <FormField label={t('settings.customProvider.testModel')}>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.testModel}
            onChange={(e) => set({ testModel: e.target.value })}
            placeholder="llama3.2"
            className={`${FIELD_MONO_CLASSNAME} flex-1`}
          />
          <IconButton
            size="md"
            tone="default"
            onClick={handleTest}
            disabled={testing || !form.baseUrl.trim()}
            title={t('settings.customProvider.test')}
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
          </IconButton>
        </div>
      </FormField>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-editorial-border/40">
        <IconButton
          size="md"
          tone="default"
          onClick={onCancel}
          title={t('settings.cancel')}
        >
          <X size={13} />
        </IconButton>
        {/* Il verde è riservato a selezione e stato attivo: un comando resta
            neutro, anche quando è quello principale. */}
        <IconButton
          size="md"
          tone="default"
          onClick={handleSave}
          disabled={saving || !form.name.trim() || !form.baseUrl.trim()}
          title={t('settings.save')}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
        </IconButton>
      </div>
    </div>
  );
}

export function CustomProviderSection() {
  const { t } = useTranslation();
  const { profiles, loadProfiles } = useCustomProviderStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProfileId, setNewProfileId] = useState<string>(() => generateId());

  useEffect(() => {
    loadProfiles().catch((err: unknown) => {
      toast.error(t('settings.customProvider.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    });
  }, [loadProfiles, t]);

  const openAddForm = () => {
    setNewProfileId(generateId());
    setShowAddForm(true);
  };

  const handleDelete = async (profile: CustomProviderProfile) => {
    const ok = await confirm({
      title: t('settings.customProvider.confirmDeleteTitle'),
      message: t('settings.customProvider.confirmDeleteMessage', { name: profile.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCustomProviderProfile(profile.id);
      await loadProfiles();
      toast.success(t('settings.customProvider.deleted', { name: profile.name }));
    } catch (err: unknown) {
      toast.error(t('settings.customProvider.deleteFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Il comando per aggiungere sta in cima, con l'icona e il tooltip: la
          riga tratteggiata in fondo era l'unico comando testuale della
          sezione, e occupava una riga per stare lì. */}
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{t('settings.customProvider.add')}</FieldLabel>
        <IconButton
          size="sm"
          tone={showAddForm ? 'accent' : 'default'}
          onClick={showAddForm ? () => setShowAddForm(false) : openAddForm}
          title={t('settings.customProvider.add')}
          ariaPressed={showAddForm}
        >
          <Plus size={13} />
        </IconButton>
      </div>

      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="flex items-center justify-between gap-3 border-b border-editorial-border/70 py-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-editorial-ink">{profile.name}</span>
              {profile.requiresApiKey ? (
                <CheckCircle2 size={11} className="text-editorial-success shrink-0" />
              ) : (
                <span className="text-[11px] uppercase tracking-[0.1em] text-editorial-muted">
                  {t('settings.customProvider.noAuth')}
                </span>
              )}
            </div>
            <div className="truncate font-mono text-xs text-editorial-muted mt-0.5">
              {profile.baseUrl}
            </div>
          </div>
          <IconButton
            size="sm"
            tone="default"
            onClick={() => handleDelete(profile)}
            title={t('settings.customProvider.delete')}
            className="shrink-0"
          >
            <Trash2 size={13} />
          </IconButton>
        </div>
      ))}

      {showAddForm && (
        <ProfileForm
          initial={EMPTY_FORM}
          profileId={newProfileId}
          onSave={async () => {
            await loadProfiles();
            setShowAddForm(false);
          }}
          onCancel={() => { setShowAddForm(false); }}
        />
      )}
    </div>
  );
}
