import { useState, useEffect, type ReactNode } from 'react';
import { Plus, Trash2, CheckCircle2, Loader2, Wifi, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCustomProviderStore } from '../../stores/customProviderStore';
import {
  saveCustomProviderProfile,
  deleteCustomProviderProfile,
  testCustomProviderConnection,
} from '../../services/customProviderService';
import { IconButton, PillButton, ToggleRow } from '../ui';
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

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.1em] text-editorial-muted">{children}</p>
  );
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

  const inputCls = 'w-full rounded-[12px] border border-editorial-border bg-editorial-textbox px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent';

  return (
    <div className="space-y-4 rounded-[18px] border border-editorial-border bg-editorial-bg/60 p-4">
      <FormField label={t('settings.customProvider.name')}>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t('settings.customProvider.namePlaceholder')}
          className={inputCls}
        />
      </FormField>

      <FormField label={t('settings.customProvider.baseUrl')}>
        <input
          type="url"
          value={form.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder={t('settings.customProvider.baseUrlPlaceholder')}
          className={`${inputCls} font-mono`}
        />
      </FormField>

      <div className="rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/10 px-4 py-3">
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
            className={`${inputCls} font-mono`}
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
            className={`${inputCls} flex-1 font-mono`}
          />
          <PillButton
            onClick={handleTest}
            disabled={testing || !form.baseUrl.trim()}
            variant="secondary"
          >
            {testing ? (
              <Loader2 size={11} className="animate-spin inline mr-1.5" />
            ) : (
              <Wifi size={11} className="inline mr-1.5" />
            )}
            {t('settings.customProvider.test')}
          </PillButton>
        </div>
      </FormField>

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-editorial-border/40">
        <PillButton onClick={onCancel} variant="secondary">
          {t('settings.cancel')}
        </PillButton>
        <PillButton
          onClick={handleSave}
          disabled={saving || !form.name.trim() || !form.baseUrl.trim()}
          variant="accent"
        >
          {saving && <Loader2 size={11} className="animate-spin inline mr-1.5" />}
          {t('settings.save')}
        </PillButton>
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
          className="flex items-center justify-between gap-3 rounded-[16px] border border-editorial-border bg-editorial-bg/60 px-4 py-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-editorial-ink">{profile.name}</span>
              {profile.requiresApiKey ? (
                <CheckCircle2 size={11} className="text-editorial-success shrink-0" />
              ) : (
                <span className="text-[10px] uppercase tracking-[0.1em] text-editorial-muted">
                  {t('settings.customProvider.noAuth')}
                </span>
              )}
            </div>
            <div className="truncate font-mono text-[11px] text-editorial-muted mt-0.5">
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
          className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-editorial-border py-3 text-xs text-editorial-muted hover:border-editorial-accent hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Plus size={13} />
          {t('settings.customProvider.add')}
        </button>
      )}
    </div>
  );
}
