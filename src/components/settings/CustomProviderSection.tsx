import { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Loader2, Wifi, X, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import {
  saveCustomProviderProfile,
  deleteCustomProviderProfile,
  testCustomProviderConnection,
} from '../../services/customProviderService';
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

  const set = (patch: Partial<ProfileFormState>) => setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) return;
    setSaving(true);
    try {
      await saveCustomProviderProfile(
        profileId,
        form.name.trim(),
        form.baseUrl.trim(),
        form.requiresApiKey && form.apiKey.trim() ? form.apiKey.trim() : null,
        form.requiresApiKey
      );
      toast.success(t('settings.customProvider.saved', { name: form.name.trim() }));
      onSave({ id: profileId, name: form.name.trim(), baseUrl: form.baseUrl.trim(), requiresApiKey: form.requiresApiKey });
    } catch (err: unknown) {
      toast.error(t('settings.customProvider.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.testModel.trim()) {
      toast.warning(t('settings.customProvider.testModelRequired'));
      return;
    }
    setTesting(true);
    try {
      // Save first so the key is in the keystore
      await saveCustomProviderProfile(
        profileId,
        form.name.trim() || profileId,
        form.baseUrl.trim(),
        form.requiresApiKey && form.apiKey.trim() ? form.apiKey.trim() : null,
        form.requiresApiKey
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
    <div className="space-y-3 rounded-[12px] border border-editorial-border bg-editorial-bg/40 p-4">
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-editorial-muted">
          {t('settings.customProvider.name')}
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t('settings.customProvider.namePlaceholder')}
          className="w-full bg-editorial-textbox px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-editorial-muted">
          {t('settings.customProvider.baseUrl')}
        </label>
        <input
          type="url"
          value={form.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder="https://openrouter.ai/api/v1"
          className="w-full bg-editorial-textbox px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`req-key-${profileId}`}
          type="checkbox"
          checked={form.requiresApiKey}
          onChange={(e) => set({ requiresApiKey: e.target.checked })}
          className="accent-editorial-accent"
        />
        <label htmlFor={`req-key-${profileId}`} className="text-xs text-editorial-ink">
          {t('settings.customProvider.requiresApiKey')}
        </label>
      </div>

      {form.requiresApiKey && (
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wide text-editorial-muted">
            {t('settings.customProvider.apiKey')}
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={t('settings.pasteApiKey')}
            className="w-full bg-editorial-textbox px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-editorial-muted">
          {t('settings.customProvider.testModel')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={form.testModel}
            onChange={(e) => set({ testModel: e.target.value })}
            placeholder="gpt-4o-mini"
            className="flex-1 bg-editorial-textbox px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !form.baseUrl.trim()}
            title={t('settings.customProvider.test')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-editorial-border text-editorial-ink hover:border-editorial-accent hover:text-editorial-accent disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
            {t('settings.customProvider.test')}
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-editorial-muted hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <X size={12} />
          {t('settings.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !form.name.trim() || !form.baseUrl.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-editorial-accent text-editorial-accent hover:bg-editorial-accent hover:text-white disabled:opacity-40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {t('settings.save')}
        </button>
      </div>
    </div>
  );
}

export function CustomProviderSection() {
  const { t } = useTranslation();
  const { profiles, loadProfiles } = useCustomProviderStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProfileId] = useState(() => generateId());

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleDelete = async (profile: CustomProviderProfile) => {
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
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="flex items-center justify-between gap-3 rounded-[10px] border border-editorial-border bg-editorial-bg/40 px-4 py-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-editorial-ink">{profile.name}</span>
              {!profile.requiresApiKey && (
                <span className="text-[10px] uppercase tracking-wide text-editorial-muted">
                  {t('settings.customProvider.noAuth')}
                </span>
              )}
              {profile.requiresApiKey && (
                <CheckCircle2 size={11} className="text-editorial-accent" />
              )}
            </div>
            <div className="truncate font-mono text-[11px] text-editorial-muted">
              {profile.baseUrl}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleDelete(profile)}
            title={t('settings.customProvider.delete')}
            aria-label={t('settings.customProvider.delete')}
            className="shrink-0 p-1.5 text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {showAddForm ? (
        <ProfileForm
          initial={EMPTY_FORM}
          profileId={newProfileId}
          onSave={async () => {
            await loadProfiles();
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-editorial-border py-3 text-xs text-editorial-muted hover:border-editorial-accent hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Plus size={13} />
          {t('settings.customProvider.add')}
        </button>
      )}
    </div>
  );
}
